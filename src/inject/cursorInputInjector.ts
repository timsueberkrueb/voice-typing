import * as vscode from "vscode";
import { IInputInjector } from "../types/contracts";

export class CursorInputInjector implements IInputInjector {
  async insert(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("No active editor to insert prompt into.");
    }

    await editor.edit((editBuilder) => {
      const selection = editor.selection;
      editBuilder.replace(selection, text);
    });
  }
}

