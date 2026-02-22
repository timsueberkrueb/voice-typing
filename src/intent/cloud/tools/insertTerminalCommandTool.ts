import * as vscode from "vscode";
import { ToolResult } from "../types";
import { TerminalContextTracker } from "../terminalContextTracker";

export async function insertTerminalCommandTool(
  args: Record<string, unknown>,
  terminalContext: TerminalContextTracker
): Promise<ToolResult> {
  const command = typeof args.command === "string" ? args.command.trim() : "";
  if (!command) return { ok: false, handled: false, error: "command is required." };

  const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal();
  terminal.show(false);
  terminal.sendText(command, false);
  terminalContext.recordInsertedCommand(terminal, command);

  return { ok: true, handled: true, data: { inserted: command } };
}
