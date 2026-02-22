export interface CloudCommandLayerOptions {
  apiUrl: string;
  model: string;
  bearerToken: string;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
}

export type ToolName =
  | "insert_terminal_command"
  | "execute_vscode_control"
  | "apply_editor_edit"
  | "search_project_files"
  | "search_vscode_commands"
  | "execute_vscode_command"
  | "execute_codex_agent"
  | "execute_keypress";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: ToolName; arguments: string };
}

export interface ToolResult {
  ok: boolean;
  handled: boolean;
  data?: unknown;
  error?: string;
}

export interface ResponsesApiFunctionCall {
  id?: string;
  call_id?: string;
  type?: string;
  name?: string;
  arguments?: string;
  status?: string;
}

export interface ResponsesApiPayload {
  id?: string;
  output?: ResponsesApiFunctionCall[];
}

export type ResponsesInputItem =
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

export interface ExtractedFunctionCall {
  id?: string;
  call_id?: string;
  name: string;
  arguments: string;
  status?: string;
}
