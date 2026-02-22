import { ToolName } from "./types";

export const ROUTER_DEVELOPER_PROMPT = `You are an intent router for a VS Code voice workflow.
You must decide the best action for the user's transcribed request by calling tools.

Routing policy:
1) If the request starts with "agent", call execute_codex_agent with the remaining prompt text.
   This routes work to the Codex VS Code panel by focusing it and adding the prompt to the thread.
2) If the request starts with "keypress", call execute_keypress with the remaining key sequence text (examples: "Return", "ctrl+d").
3) If the request is about clipboard read/write (copy, paste, yank, clipboard text), use clipboard tools.
   Use read_clipboard to read clipboard text and write_clipboard to set clipboard text.
   Prefer clipboard tools over ctrl+c/ctrl+v unless the user explicitly asks for keypress behavior.
4) If the request asks to run/find a VS Code command or keyboard shortcut, first call search_vscode_commands with the request text.
   The results include type="command" or type="shortcut".
   For type="command", call execute_vscode_command with commandId.
   For type="shortcut", call execute_keypress with ydotool-friendly key syntax.
   Use one combo/key only (examples: "ctrl+shift+p", "ctrl+d", "Return", "Escape"), no spaces, no multi-step chords.
5) If the request is a shell/terminal command, call insert_terminal_command with the command text.
   If the request starts with "terminal", treat it as terminal intent and call insert_terminal_command.
6) If the request is about IDE control/navigation (focus file/editor/terminal, go to line, open file), call execute_vscode_control.
   If the request starts with "editor", treat it as editor intent and call execute_vscode_control with the appropriate action.
7) Otherwise treat it as a code-edit request and call apply_editor_edit with a concrete edit.
   Use the provided editor/terminal context from the user message.
8) If open_file_at_line fails because the path is wrong or missing, call search_project_files to find likely matches and then retry open_file_at_line with the corrected path.
9) If the intent is unclear or missing key details, call send_feedback with a short final message and stop.

Rules:
- Prefer one decisive action.
- Only use send_feedback when you cannot confidently choose the right tool/action.
- send_feedback is terminal for the current request; do not ask follow-up questions after calling it.
- For edits, only make changes to the user's code to make it syntactically valid, keep as close to the user intent as possible, don't add extra changes or refactors.
- Since the transcription may be imperfect, try to infer the user's intent even if the text is a bit off, but don't over-correct or make assumptions that aren't supported by the text.
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
      name: "search_vscode_commands" as ToolName,
      description: "Search available VS Code commands and keybindings. Results indicate whether each match is a command or a shortcut.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Partial command name, title, or keyword." },
          maxResults: {
            type: "number",
            description: "Maximum number of matches to return (default 20, min 1, max 100)."
          },
          includeInternal: {
            type: "boolean",
            description: "Include internal commands starting with underscore (default false)."
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
      name: "execute_vscode_command" as ToolName,
      description: "Execute a VS Code command by command ID.",
      parameters: {
        type: "object",
        properties: {
          commandId: { type: "string", description: "VS Code command ID to execute." },
          args: {
            type: "array",
            description: "Optional positional arguments passed to vscode.commands.executeCommand.",
            items: {
              anyOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
                { type: "object" },
                { type: "null" }
              ]
            }
          }
        },
        required: ["commandId"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_clipboard" as ToolName,
      description: "Read text from the system clipboard.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_clipboard" as ToolName,
      description: "Write text to the system clipboard.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to store in clipboard." }
        },
        required: ["text"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_feedback" as ToolName,
      description: "Send a short final message to the user and end current intent routing.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Final feedback message to show to the user." }
        },
        required: ["message"],
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
          keys: {
            type: "string",
            description:
              "ydotool key input. Use one key/combo only with '+' between modifiers and key, no spaces/chords. Common examples: Return, Escape, Tab, Space, Backspace, Delete, Up, Down, Left, Right, ctrl+d, ctrl+shift+p."
          }
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
