import OpenAI from "openai";
import { ICommandLayer } from "../types/contracts";
import {
  CODEX_STYLE_INSTRUCTIONS,
  EDITOR_CONTEXT_LINES_AFTER,
  EDITOR_CONTEXT_LINES_BEFORE,
  MAX_TOOL_TURNS,
  RESPONSES_TOOLS,
  ROUTER_DEVELOPER_PROMPT,
  TERMINAL_CONTEXT_MAX_LINES
} from "./cloud/constants";
import { buildAmbientContext } from "./cloud/ambientContext";
import { CloudRoutingError } from "./cloud/cloudRoutingError";
import {
  collectFunctionCallsFromStream,
  createInitialInput,
  extractFunctionCalls,
  normalizeResponsesPayload
} from "./cloud/responsesApi";
import { TerminalContextTracker } from "./cloud/terminalContextTracker";
import { applyEditorEditTool } from "./cloud/tools/applyEditorEditTool";
import { executeVsCodeCommandTool } from "./cloud/tools/executeVsCodeCommandTool";
import { executeVsCodeControlTool } from "./cloud/tools/executeVsCodeControlTool";
import { executeKeypressTool } from "./cloud/tools/executeKeypressTool";
import { executeCodexAgentTool } from "./cloud/tools/executeCodexAgentTool";
import { insertTerminalCommandTool } from "./cloud/tools/insertTerminalCommandTool";
import { searchVsCodeCommandsTool } from "./cloud/tools/searchVsCodeCommandsTool";
import { searchProjectFilesTool } from "./cloud/tools/searchProjectFilesTool";
import {
  CloudCommandLayerOptions,
  ResponsesApiPayload,
  ResponsesInputItem,
  ToolCall,
  ToolName,
  ToolResult
} from "./cloud/types";
import { isAsyncIterable, normalizeResponsesBaseUrl, safeParseJson } from "./cloud/utils";

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
    let input: ResponsesInputItem[] = createInitialInput(
      inputText,
      buildAmbientContext({
        terminalTracker: this.terminalContext,
        editorLinesBefore: EDITOR_CONTEXT_LINES_BEFORE,
        editorLinesAfter: EDITOR_CONTEXT_LINES_AFTER,
        terminalLines: TERMINAL_CONTEXT_MAX_LINES
      }),
      ROUTER_DEVELOPER_PROMPT
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
        instructions: CODEX_STYLE_INSTRUCTIONS,
        store: false,
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

  private async handleToolCall(call: ToolCall): Promise<ToolResult> {
    const args = safeParseJson(call.function.arguments);
    if (!args || typeof args !== "object") {
      return { ok: false, handled: false, error: "Invalid tool arguments JSON." };
    }

    const parsed = args as Record<string, unknown>;

    try {
      switch (call.function.name) {
        case "insert_terminal_command":
          return insertTerminalCommandTool(parsed, this.terminalContext);
        case "execute_vscode_control":
          return executeVsCodeControlTool(parsed);
        case "apply_editor_edit":
          return applyEditorEditTool(parsed);
        case "search_project_files":
          return searchProjectFilesTool(parsed);
        case "search_vscode_commands":
          return searchVsCodeCommandsTool(parsed);
        case "execute_vscode_command":
          return executeVsCodeCommandTool(parsed);
        case "execute_codex_agent":
          return executeCodexAgentTool(parsed);
        case "execute_keypress":
          return executeKeypressTool(parsed);
        default:
          return { ok: false, handled: false, error: "Unsupported tool call." };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, handled: false, error: message || "Tool execution failed." };
    }
  }
}
