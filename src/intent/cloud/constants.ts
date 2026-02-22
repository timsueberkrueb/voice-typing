import { ToolName } from "./types";

export const ROUTER_DEVELOPER_PROMPT = `You are an intent router for a VS Code voice workflow.
You must decide the best action for the user's transcribed request by calling tools.

Routing policy:
1) If the request starts with "agent", call execute_codex_agent with the remaining prompt text.
   This routes work to the Codex VS Code panel by focusing it and adding the prompt to the thread.
2) If the request starts with "keypress", call execute_keypress with the remaining key sequence text (examples: "Return", "ctrl+d").
3) If the request is a shell/terminal command, call insert_terminal_command with the exact command text.
   If the request starts with "terminal", treat it as terminal intent and call insert_terminal_command.
4) If the request is about IDE control/navigation (focus file/editor/terminal, go to line, open file), call execute_vscode_control.
   If the request starts with "editor", treat it as editor intent and call execute_vscode_control with the appropriate action.
5) Otherwise treat it as a code-edit request and call apply_editor_edit with a concrete edit.
   Use the provided editor/terminal context from the user message.
6) If open_file_at_line fails because the path is wrong or missing, call search_project_files to find likely matches and then retry open_file_at_line with the corrected path.

Rules:
- Prefer one decisive action.
- For edits, only make changes to the user's code to make it syntactically valid, keep as close to the user intent as possible, don't add extra changes or refactors.
- Never invent files or commands that are not necessary.
- Keep tool args valid JSON.`;

export const CODEX_STYLE_INSTRUCTIONS = "You are Codex, based on GPT-5.";
export const MAX_TOOL_TURNS = 6;
export const EDITOR_CONTEXT_LINES_BEFORE = 60;
export const EDITOR_CONTEXT_LINES_AFTER = 60;
export const TERMINAL_CONTEXT_MAX_LINES = 80;

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "insert_terminal_command" as ToolName,
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
      name: "execute_vscode_control" as ToolName,
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
      name: "apply_editor_edit" as ToolName,
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
  },
  {
    type: "function",
    function: {
      name: "search_project_files" as ToolName,
      description: "Search files/directories in the current workspace by partial name/path.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Partial filename/path or keyword to search for." },
          maxResults: {
            type: "number",
            description: "Maximum number of matches to return (default 20, min 1, max 100)."
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_codex_agent" as ToolName,
      description:
        "Use Codex integration in VS Code for agent-prefixed requests by focusing Codex panel and adding prompt text as a temporary file to the thread.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Prompt text to send to Codex." }
        },
        required: ["prompt"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_keypress" as ToolName,
      description: "Send a keypress to the currently focused Linux application using ydotool.",
      parameters: {
        type: "object",
        properties: {
          keys: { type: "string", description: "Key sequence, e.g. Return, ctrl+d" }
        },
        required: ["keys"],
        additionalProperties: false
      }
    }
  }
] as const;

export const RESPONSES_TOOLS = TOOLS.map((t) => ({
  type: "function" as const,
  name: t.function.name,
  description: t.function.description,
  parameters: t.function.parameters
}));
