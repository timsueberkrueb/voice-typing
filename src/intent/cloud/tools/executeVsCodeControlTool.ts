import * as path from "node:path";
import * as vscode from "vscode";
import { ToolResult } from "../types";
import { normalizeColumn, normalizeLine } from "../toolUtils";

export async function executeVsCodeControlTool(args: Record<string, unknown>): Promise<ToolResult> {
  const action = typeof args.action === "string" ? args.action : "";

  switch (action) {
    case "focus_terminal":
      await vscode.commands.executeCommand("workbench.action.terminal.focus");
      return { ok: true, handled: true, data: { action } };

    case "focus_editor":
      await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
      return { ok: true, handled: true, data: { action } };

    case "goto_line": {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return { ok: false, handled: false, error: "No active editor." };

      const line = normalizeLine(args.line, editor.document.lineCount);
      const column = normalizeColumn(args.column);
      const pos = new vscode.Position(line, column);

      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);

      return { ok: true, handled: true, data: { action, line, column } };
    }

    case "open_file_at_line": {
      const filePath = typeof args.filePath === "string" ? args.filePath.trim() : "";
      if (!filePath) return { ok: false, handled: false, error: "filePath is required." };

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : workspaceRoot
          ? path.join(workspaceRoot, filePath)
          : filePath;

      let doc: vscode.TextDocument;
      try {
        doc = await vscode.workspace.openTextDocument(resolvedPath);
      } catch {
        return {
          ok: false,
          handled: false,
          error: `File not found: ${resolvedPath}. Call search_project_files with a partial path and retry with the matched file.`
        };
      }

      const editor = await vscode.window.showTextDocument(doc, { preview: false });
      const line = normalizeLine(args.line, doc.lineCount);
      const column = normalizeColumn(args.column);
      const pos = new vscode.Position(line, column);

      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);

      return { ok: true, handled: true, data: { action, filePath: resolvedPath, line, column } };
    }

    default:
      return { ok: false, handled: false, error: "Unsupported execute_vscode_control action." };
  }
}
