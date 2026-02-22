import * as vscode from "vscode";
import { ToolResult } from "../types";
import { normalizeColumn, normalizeLine, positionAfterInsert } from "../toolUtils";

export async function applyEditorEditTool(args: Record<string, unknown>): Promise<ToolResult> {
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
