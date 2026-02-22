import * as vscode from "vscode";
import { ToolResult } from "../types";

export async function executeVsCodeCommandTool(args: Record<string, unknown>): Promise<ToolResult> {
  const commandId = typeof args.commandId === "string" ? args.commandId.trim() : "";
  if (!commandId) return { ok: false, handled: false, error: "commandId is required." };

  const available = new Set(await vscode.commands.getCommands(true));
  if (!available.has(commandId)) {
    return { ok: false, handled: false, error: `Unknown VS Code command: ${commandId}` };
  }

  const commandArgs = normalizeCommandArgs(args.args);

  try {
    const result = await vscode.commands.executeCommand(commandId, ...commandArgs);
    return {
      ok: true,
      handled: true,
      data: { commandId, argsCount: commandArgs.length, result: simplifyResult(result) }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      handled: false,
      error: `Failed to execute VS Code command '${commandId}': ${message}`
    };
  }
}

function normalizeCommandArgs(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined) return [];
  return [value];
}

function simplifyResult(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (typeof value === "object") return "[object]";
  return String(value);
}
