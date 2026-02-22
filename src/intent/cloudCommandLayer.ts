import * as path from "node:path";
import * as vscode from "vscode";
import OpenAI from "openai";
import { ICommandLayer } from "../types/contracts";

interface CloudCommandLayerOptions {
  apiUrl: string;
  model: string;
  bearerToken: string;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
}

type ToolName =
  | "insert_terminal_command"
  | "execute_vscode_control"
  | "apply_editor_edit";

interface ToolCall {
  id: string;
  type: "function";
  function: { name: ToolName; arguments: string };
}

interface ResponsesApiFunctionCall {
  id?: string;
  call_id?: string;
  type?: string;
  name?: string;
  arguments?: string;
  status?: string;
}

interface ResponsesApiPayload {
  id?: string;
  output?: ResponsesApiFunctionCall[];
}

/**
 * Input items accepted by the ChatGPT Codex Responses endpoint for our routing flow.
 *
 * Note: tool continuations must be sent as `function_call` + `function_call_output`
 * items in the next request `input` (without `previous_response_id`).
 */
type ResponsesInputItem =
  | {
      type: "message";
      role: "system" | "developer" | "user" | "assistant";
      content: Array<{ type: "input_text"; text: string }>;
    }
  | {
      type: "function_call_output";
      call_id: string;
      output: string;
    }
  | {
      type: "reasoning";
      summary?: Array<{ type: "summary_text"; text: string }>;
      encrypted_content?: string;
    }
  | {
      type: "function_call";
      call_id?: string;
      name: string;
      arguments: string;
      id?: string;
      status?: string;
    };

const ROUTER_DEVELOPER_PROMPT = `You are an intent router for a VS Code voice workflow.
You must decide the best action for the user's transcribed request by calling tools.

Routing policy:
1) If the request is a shell/terminal command, call insert_terminal_command with the exact command text.
   If the request starts with "terminal", treat it as terminal intent and call insert_terminal_command.
2) If the request is about IDE control/navigation (focus file/editor/terminal, go to line, open file), call execute_vscode_control.
   If the request starts with "editor", treat it as editor intent and call execute_vscode_control with the appropriate action.
3) Otherwise treat it as a code-edit request and call apply_editor_edit with a concrete edit.
   Use the provided editor/terminal context from the user message.

Rules:
- Prefer one decisive action.
- For edits, only make changes to the user's code to make it syntactically valid, keep as close to the user intent as possible, don't add extra changes or refactors.
- Never invent files or commands that are not necessary.
- Keep tool args valid JSON.`;

// Some Codex backend deployments validate that "instructions" is present and non-empty.
// Keep it short, stable, and neutral; use developer message for the real routing policy.
const CODEX_STYLE_INSTRUCTIONS = "You are Codex, based on GPT-5.";
const MAX_TOOL_TURNS = 6;
const EDITOR_CONTEXT_LINES_BEFORE = 60;
const EDITOR_CONTEXT_LINES_AFTER = 60;
const TERMINAL_CONTEXT_MAX_LINES = 80;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "insert_terminal_command",
      description: "Insert command text into the active terminal input.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to insert." }
        },
        required: ["command"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_vscode_control",
      description: "Control VS Code UI/navigation actions.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["open_file_at_line", "goto_line", "focus_terminal", "focus_editor"]
          },
          filePath: { type: "string" },
          line: { type: "number" },
          column: { type: "number" }
        },
        required: ["action"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "apply_editor_edit",
      description: "Apply a concrete text replacement in the active editor.",
      parameters: {
        type: "object",
        properties: {
          startLine: { type: "number" },
          startCharacter: { type: "number" },
          endLine: { type: "number" },
          endCharacter: { type: "number" },
          newText: { type: "string" }
        },
        required: ["startLine", "startCharacter", "endLine", "endCharacter", "newText"],
        additionalProperties: false
      }
    }
  }
] as const;

const RESPONSES_TOOLS = TOOLS.map((t) => ({
  type: "function" as const,
  name: t.function.name,
  description: t.function.description,
  parameters: t.function.parameters
}));

export class CloudCommandLayer implements ICommandLayer {
  private readonly client: OpenAI;
  private readonly terminalContext = TerminalContextTracker.getInstance();

  constructor(private readonly options: CloudCommandLayerOptions) {
    this.client = new OpenAI({
      apiKey: options.bearerToken,
      baseURL: normalizeResponsesBaseUrl(options.apiUrl),
      defaultHeaders: options.extraHeaders,
      timeout: options.timeoutMs,
      maxRetries: 0
    });
    this.terminalContext.start();
  }

  async route(inputText: string): Promise<boolean> {
    return this.routeWithResponsesApi(inputText);
  }

  private async routeWithResponsesApi(inputText: string): Promise<boolean> {
    // Codex Responses expects explicit message items in `input` for the initial turn.
    let input: ResponsesInputItem[] = createInitialInput(
      inputText,
      buildAmbientContext({
        terminalTracker: this.terminalContext,
        editorLinesBefore: EDITOR_CONTEXT_LINES_BEFORE,
        editorLinesAfter: EDITOR_CONTEXT_LINES_AFTER,
        terminalLines: TERMINAL_CONTEXT_MAX_LINES
      })
    );

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const reply = await this.completeResponses(input);

      const calls = extractFunctionCalls(reply);
      if (calls.length === 0) return false;

      const nextInput: ResponsesInputItem[] = [];

      for (const call of calls) {
        const result = await this.handleToolCall({
          id: call.call_id || call.id || `call_${turn}`,
          type: "function",
          function: {
            name: call.name as ToolName,
            arguments: call.arguments
          }
        });

        const callId = call.call_id || call.id;
        if (callId) {
          // Codex continuation contract:
          // send the original function_call item alongside function_call_output
          // in the next request `input`.
          nextInput.push({
            type: "function_call",
            id: call.id,
            call_id: callId,
            name: call.name,
            arguments: call.arguments,
            status: call.status ?? "completed"
          });
          nextInput.push({
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(result)
          });
        }

        if (result.ok && result.handled) return true;
      }

      input = nextInput;
    }

    return false;
  }

  private async completeResponses(input: ResponsesInputItem[]): Promise<ResponsesApiPayload> {
    try {
      const payload: Record<string, unknown> = {
        model: this.options.model,
        // Required by this endpoint.
        instructions: CODEX_STYLE_INSTRUCTIONS,
        // Required by this endpoint.
        store: false,
        // Required by this endpoint.
        stream: true,
        input,
        tools: RESPONSES_TOOLS,
        tool_choice: "auto",
        parallel_tool_calls: false
      };

      const responseOrStream = await this.client.responses.create(payload as never);
      if (isAsyncIterable(responseOrStream)) {
        return collectFunctionCallsFromStream(responseOrStream);
      }
      return normalizeResponsesPayload(responseOrStream);
    } catch (error) {
      throw CloudRoutingError.fromApiError(this.options.apiUrl, this.options.model, error);
    }
  }

  private async handleToolCall(call: ToolCall): Promise<{
    ok: boolean;
    handled: boolean;
    data?: unknown;
    error?: string;
  }> {
    const args = safeParseJson(call.function.arguments);
    if (!args || typeof args !== "object") {
      return { ok: false, handled: false, error: "Invalid tool arguments JSON." };
    }

    const parsed = args as Record<string, unknown>;

    switch (call.function.name) {
      case "insert_terminal_command":
        return this.insertTerminalCommand(parsed);
      case "execute_vscode_control":
        return this.executeVsCodeControl(parsed);
      case "apply_editor_edit":
        return this.applyEditorEdit(parsed);
      default:
        return { ok: false, handled: false, error: "Unsupported tool call." };
    }
  }

  private async insertTerminalCommand(args: Record<string, unknown>) {
    const command = typeof args.command === "string" ? args.command.trim() : "";
    if (!command) return { ok: false, handled: false, error: "command is required." };

    const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal();
    terminal.show(true);
    terminal.sendText(command, false);
    this.terminalContext.recordInsertedCommand(terminal, command);

    return { ok: true, handled: true, data: { inserted: command } };
  }

  private async executeVsCodeControl(args: Record<string, unknown>) {
    const action = typeof args.action === "string" ? args.action : "";

    switch (action) {
      case "focus_terminal":
        await vscode.commands.executeCommand("workbench.action.terminal.focus");
        return { ok: true, handled: true, data: { action } };

      case "focus_editor":
        await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
        return { ok: true, handled: true, data: { action } };

      case "goto_line": {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return { ok: false, handled: false, error: "No active editor." };

        const line = normalizeLine(args.line, editor.document.lineCount);
        const column = normalizeColumn(args.column);
        const pos = new vscode.Position(line, column);

        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);

        return { ok: true, handled: true, data: { action, line, column } };
      }

      case "open_file_at_line": {
        const filePath = typeof args.filePath === "string" ? args.filePath.trim() : "";
        if (!filePath) return { ok: false, handled: false, error: "filePath is required." };

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : workspaceRoot
            ? path.join(workspaceRoot, filePath)
            : filePath;

        const doc = await vscode.workspace.openTextDocument(resolvedPath);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });

        const line = normalizeLine(args.line, doc.lineCount);
        const column = normalizeColumn(args.column);
        const pos = new vscode.Position(line, column);

        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);

        return {
          ok: true,
          handled: true,
          data: { action, filePath: resolvedPath, line, column }
        };
      }

      default:
        return { ok: false, handled: false, error: "Unsupported execute_vscode_control action." };
    }
  }

  private async applyEditorEdit(args: Record<string, unknown>) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return { ok: false, handled: false, error: "No active editor." };

    const doc = editor.document;
    const startLine = normalizeLine(args.startLine, doc.lineCount);
    const endLine = normalizeLine(args.endLine, doc.lineCount);
    const startCharacter = normalizeColumn(args.startCharacter);
    const endCharacter = normalizeColumn(args.endCharacter);
    const newText = typeof args.newText === "string" ? args.newText : "";

    if (endLine < startLine) {
      return { ok: false, handled: false, error: "Invalid range: end before start." };
    }

    const start = new vscode.Position(startLine, startCharacter);
    const end = new vscode.Position(endLine, endCharacter);

    const success = await editor.edit((b) => b.replace(new vscode.Range(start, end), newText));
    if (!success) return { ok: false, handled: false, error: "Failed to apply editor edit." };

    const endPos = positionAfterInsert(start, newText);
    editor.selection = new vscode.Selection(endPos, endPos);
    editor.revealRange(new vscode.Range(endPos, endPos), vscode.TextEditorRevealType.InCenter);

    return { ok: true, handled: true, data: { applied: true } };
  }
}

/** -------- Responses helpers -------- */

function createInitialInput(inputText: string, ambientContext: string): ResponsesInputItem[] {
  return [
    {
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: ROUTER_DEVELOPER_PROMPT }]
    },
    {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Transcribed request:\n${inputText}\n\nAmbient context:\n${ambientContext}`
        }
      ]
    }
  ];
}

function extractFunctionCalls(payload: ResponsesApiPayload): Array<{
  id?: string;
  call_id?: string;
  name: string;
  arguments: string;
  status?: string;
}> {
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .filter((item) => item?.type === "function_call")
    .map((item) => ({
      id: item.id,
      call_id: item.call_id,
      name: typeof item.name === "string" ? item.name : "",
      arguments: typeof item.arguments === "string" ? item.arguments : "{}",
      status: typeof item.status === "string" ? item.status : undefined
    }))
    .filter((c) => c.name.length > 0);
}

function normalizeResponsesPayload(response: unknown): ResponsesApiPayload {
  if (!response || typeof response !== "object") return { output: [] };

  const obj = response as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id : undefined;

  const rawOutput = obj.output;
  if (!Array.isArray(rawOutput)) return { id, output: [] };

  const calls: ResponsesApiFunctionCall[] = [];
  for (const entry of rawOutput) {
    if (!entry || typeof entry !== "object") continue;
    const call = asFunctionCall(entry as Record<string, unknown>);
    if (call) calls.push(call);
  }

  return { id, output: dedupeCalls(calls) };
}

function asFunctionCall(entry: Record<string, unknown>): ResponsesApiFunctionCall | undefined {
  if (entry.type !== "function_call") return undefined;
  return {
    id: typeof entry.id === "string" ? entry.id : undefined,
    call_id: typeof entry.call_id === "string" ? entry.call_id : undefined,
    type: "function_call",
    name: typeof entry.name === "string" ? entry.name : undefined,
    arguments: typeof entry.arguments === "string" ? entry.arguments : undefined,
    status: typeof entry.status === "string" ? entry.status : undefined
  };
}

function dedupeCalls(calls: ResponsesApiFunctionCall[]): ResponsesApiFunctionCall[] {
  const seen = new Set<string>();
  const out: ResponsesApiFunctionCall[] = [];

  for (const c of calls) {
    const key = `${c.call_id ?? ""}|${c.id ?? ""}|${c.name ?? ""}|${c.arguments ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }

  return out;
}

async function collectFunctionCallsFromStream(
  stream: AsyncIterable<unknown>
): Promise<ResponsesApiPayload> {
  const calls: ResponsesApiFunctionCall[] = [];
  let responseId: string | undefined;

  for await (const event of stream) {
    if (!event || typeof event !== "object") continue;
    const obj = event as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type : "";

    if (type === "response.output_item.done") {
      const item = obj.item;
      if (item && typeof item === "object") {
        const call = asFunctionCall(item as Record<string, unknown>);
        if (call) calls.push(call);
      }
      continue;
    }

    if (type === "response.completed") {
      const response = obj.response;
      if (response && typeof response === "object") {
        const responseObj = response as Record<string, unknown>;
        if (typeof responseObj.id === "string") responseId = responseObj.id;
        const output = responseObj.output;
        if (Array.isArray(output)) {
          for (const entry of output) {
            if (!entry || typeof entry !== "object") continue;
            const call = asFunctionCall(entry as Record<string, unknown>);
            if (call) calls.push(call);
          }
        }
      }
    }
  }

  return { id: responseId, output: dedupeCalls(calls) };
}

/** -------- Error + logging -------- */

class CloudRoutingError extends Error {
  constructor(message: string, readonly statusCode: number, readonly body: string) {
    super(message);
  }

  static fromApiError(apiUrl: string, model: string, error: unknown): CloudRoutingError {
    const statusCode = extractStatusCode(error) ?? 500;
    const body = sanitizeForLog(extractErrorBody(error));
    const excerpt = body.slice(0, 700);

    logRouting(`Upstream ${statusCode} (chatgpt_responses) url=${apiUrl} model=${model}`, excerpt);

    return new CloudRoutingError(
      `Cloud command routing failed (${statusCode}): ${excerpt || "no response body"}`,
      statusCode,
      body
    );
  }
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  const anyErr = error as Record<string, unknown>;
  if (typeof anyErr.status === "number") return anyErr.status;

  const resp = anyErr.response;
  if (resp && typeof resp === "object" && typeof (resp as Record<string, unknown>).status === "number") {
    return (resp as Record<string, unknown>).status as number;
  }

  return undefined;
}

function extractErrorBody(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);

  const anyErr = error as Record<string, unknown>;

  if (typeof anyErr.message === "string" && anyErr.message.trim()) return anyErr.message;

  for (const key of ["error", "data", "response", "cause"]) {
    const v = anyErr[key];
    if (!v) continue;
    try {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      if (s && s !== "{}") return s;
    } catch {
      // ignore
    }
  }

  try {
    return JSON.stringify(anyErr);
  } catch {
    return String(error);
  }
}

let outputChannel: vscode.OutputChannel | undefined;

function logRouting(message: string, detail?: string): void {
  outputChannel ??= vscode.window.createOutputChannel("Voice Prompt");
  outputChannel.appendLine(`[cloud-routing] ${message}`);
  if (detail) outputChannel.appendLine(detail);
}

/** -------- Small utilities -------- */

function sanitizeForLog(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      Symbol.asyncIterator in (value as Record<PropertyKey, unknown>)
  );
}

function normalizeResponsesBaseUrl(apiUrl: string): string {
  // If user passes .../responses, OpenAI SDK will append /responses again unless we strip it.
  return apiUrl.replace(/\/responses\/?$/, "");
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function normalizeLine(value: unknown, lineCount: number): number {
  const n = typeof value === "number" ? Math.floor(value) : 0;
  return clampInt(n, 0, Math.max(0, lineCount - 1));
}

function normalizeColumn(value: unknown): number {
  const n = typeof value === "number" ? Math.floor(value) : 0;
  return Math.max(0, n);
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function positionAfterInsert(start: vscode.Position, text: string): vscode.Position {
  const lines = text.split("\n");
  if (lines.length === 1) return new vscode.Position(start.line, start.character + text.length);
  return new vscode.Position(start.line + lines.length - 1, lines.at(-1)?.length ?? 0);
}

interface AmbientContextOptions {
  terminalTracker: TerminalContextTracker;
  editorLinesBefore: number;
  editorLinesAfter: number;
  terminalLines: number;
}

function buildAmbientContext(options: AmbientContextOptions): string {
  const editorContext = getEditorContextSnapshot(options.editorLinesBefore, options.editorLinesAfter);
  const terminalContext = options.terminalTracker.getActiveTerminalSnapshot(options.terminalLines);
  return JSON.stringify({ editor: editorContext, terminal: terminalContext }, null, 2);
}

function getEditorContextSnapshot(linesBefore: number, linesAfter: number): Record<string, unknown> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return { available: false, reason: "No active editor." };
  }

  const doc = editor.document;
  const cursor = editor.selection.active;
  const startLine = Math.max(0, cursor.line - linesBefore);
  const endLine = Math.min(doc.lineCount - 1, cursor.line + linesAfter);
  const startPos = new vscode.Position(startLine, 0);
  const endPos = doc.lineAt(endLine).range.end;

  return {
    available: true,
    fileName: doc.fileName,
    languageId: doc.languageId,
    cursorLine: cursor.line,
    cursorCharacter: cursor.character,
    selectionStartLine: editor.selection.start.line,
    selectionStartCharacter: editor.selection.start.character,
    selectionEndLine: editor.selection.end.line,
    selectionEndCharacter: editor.selection.end.character,
    startLine,
    endLine,
    text: doc.getText(new vscode.Range(startPos, endPos))
  };
}

class TerminalContextTracker {
  private static instance: TerminalContextTracker | undefined;
  private readonly buffers = new Map<vscode.Terminal, string[]>();
  private started = false;

  static getInstance(): TerminalContextTracker {
    TerminalContextTracker.instance ??= new TerminalContextTracker();
    return TerminalContextTracker.instance;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    const shellExecEvent = (
      vscode.window as unknown as {
        onDidStartTerminalShellExecution?: (
          listener: (event: vscode.TerminalShellExecutionStartEvent) => unknown
        ) => vscode.Disposable;
      }
    ).onDidStartTerminalShellExecution;
    if (typeof shellExecEvent === "function") {
      shellExecEvent((event) => {
        this.appendLine(event.terminal, `$ ${event.execution.commandLine.value}`);
        void this.captureExecutionOutput(event.terminal, event.execution);
      });
    }

    const closeTerminalEvent = (
      vscode.window as unknown as {
        onDidCloseTerminal?: (listener: (terminal: vscode.Terminal) => unknown) => vscode.Disposable;
      }
    ).onDidCloseTerminal;
    if (typeof closeTerminalEvent === "function") {
      closeTerminalEvent((terminal) => {
        this.buffers.delete(terminal);
      });
    }
  }

  recordInsertedCommand(terminal: vscode.Terminal, command: string): void {
    this.appendLine(terminal, `$ ${command}`);
  }

  getActiveTerminalSnapshot(maxLines: number): Record<string, unknown> {
    const terminal = vscode.window.activeTerminal;
    if (!terminal) {
      return { available: false, reason: "No active terminal." };
    }

    const lines = this.buffers.get(terminal) ?? [];
    return {
      available: true,
      name: terminal.name,
      lineCount: lines.length,
      lines: lines.slice(-maxLines),
      source:
        lines.length > 0
          ? "shell_integration_stream"
          : "none"
    };
  }

  private async captureExecutionOutput(
    terminal: vscode.Terminal,
    execution: vscode.TerminalShellExecution
  ): Promise<void> {
    try {
      for await (const chunk of execution.read()) {
        const normalized = normalizeTerminalChunk(chunk);
        if (!normalized) continue;
        for (const line of normalized.split("\n")) {
          if (!line) continue;
          this.appendLine(terminal, line);
        }
      }
    } catch {
      // Best-effort only; shell integration can fail depending on terminal shell setup.
    }
  }

  private appendLine(terminal: vscode.Terminal, line: string): void {
    const current = this.buffers.get(terminal) ?? [];
    current.push(line);
    if (current.length > 800) {
      current.splice(0, current.length - 800);
    }
    this.buffers.set(terminal, current);
  }
}

function normalizeTerminalChunk(chunk: string): string {
  return chunk
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}
