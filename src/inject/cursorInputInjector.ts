import * as vscode from "vscode";
import { IInputInjector } from "../types/contracts";

export class CursorInputInjector implements IInputInjector {
  constructor(private readonly trailingSpace: boolean) {}

  async insert(text: string): Promise<void> {
    const textToInsert = this.trailingSpace ? text + " " : text;

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const selection = editor.selection;
      const success = await editor.edit((editBuilder) => {
        editBuilder.replace(selection, textToInsert);
      });
      if (success) {
        const insertStart = selection.start;
        const lines = textToInsert.split("\n");
        let endLine: number;
        let endChar: number;
        if (lines.length === 1) {
          endLine = insertStart.line;
          endChar = insertStart.character + textToInsert.length;
        } else {
          endLine = insertStart.line + lines.length - 1;
          endChar = lines.at(-1)!.length;
        }
        const endPos = new vscode.Position(endLine, endChar);
        editor.selection = new vscode.Selection(endPos, endPos);
        return;
      }
    }

    await vscode.env.clipboard.writeText(textToInsert);

    try {
      await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
    } catch {
      throw new Error(
        "No active editor and paste command unavailable."
      );
    }
  }
}
