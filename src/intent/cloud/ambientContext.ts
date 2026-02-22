import * as vscode from "vscode";
import { TerminalContextTracker } from "./terminalContextTracker";

export interface AmbientContextOptions {
  terminalTracker: TerminalContextTracker;
  editorLinesBefore: number;
  editorLinesAfter: number;
  terminalLines: number;
}

export function buildAmbientContext(options: AmbientContextOptions): string {
  const editorContext = getEditorContextSnapshot(options.editorLinesBefore, options.editorLinesAfter);
  const terminalContext = options.terminalTracker.getActiveTerminalSnapshot(options.terminalLines);
  return JSON.stringify({ editor: editorContext, terminal: terminalContext }, null, 2);
}

function getEditorContextSnapshot(linesBefore: number, linesAfter: number): Record<string, unknown> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return { available: false, reason: "No active editor." };
  }

  const doc = editor.document;
  const cursor = editor.selection.active;
  const startLine = Math.max(0, cursor.line - linesBefore);
  const endLine = Math.min(doc.lineCount - 1, cursor.line + linesAfter);
  const startPos = new vscode.Position(startLine, 0);
  const endPos = doc.lineAt(endLine).range.end;

  return {
    available: true,
    fileName: doc.fileName,
    languageId: doc.languageId,
    cursorLine: cursor.line,
    cursorCharacter: cursor.character,
    selectionStartLine: editor.selection.start.line,
    selectionStartCharacter: editor.selection.start.character,
    selectionEndLine: editor.selection.end.line,
    selectionEndCharacter: editor.selection.end.character,
    startLine,
    endLine,
    text: doc.getText(new vscode.Range(startPos, endPos))
  };
}
