import * as vscode from "vscode";
import { ToolResult } from "../types";

export async function sendFeedbackTool(args: Record<string, unknown>): Promise<ToolResult> {
  const message = typeof args.message === "string" ? args.message.trim() : "";
  if (!message) return { ok: false, handled: false, error: "message is required." };

  void vscode.window.showInformationMessage(message);
  return { ok: true, handled: true, data: { message } };
}
