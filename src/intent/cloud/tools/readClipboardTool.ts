import * as vscode from "vscode";
import { ToolResult } from "../types";

export async function readClipboardTool(): Promise<ToolResult> {
  try {
    const text = await vscode.env.clipboard.readText();
    return { ok: true, handled: false, data: { text, length: text.length } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, handled: false, error: message || "Failed to read clipboard." };
  }
}
