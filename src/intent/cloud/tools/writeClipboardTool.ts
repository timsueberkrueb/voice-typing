import * as vscode from "vscode";
import { ToolResult } from "../types";

export async function writeClipboardTool(args: Record<string, unknown>): Promise<ToolResult> {
  const text = typeof args.text === "string" ? args.text : "";
  if (!text) return { ok: false, handled: false, error: "text is required." };

  try {
    await vscode.env.clipboard.writeText(text);
    return { ok: true, handled: true, data: { length: text.length } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, handled: false, error: message || "Failed to write clipboard." };
  }
}
