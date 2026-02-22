import { execFile } from "node:child_process";
import * as path from "node:path";
import * as vscode from "vscode";
import { ToolResult } from "../types";
import { clampInt, escapeGlob } from "../utils";

export async function searchProjectFilesTool(args: Record<string, unknown>): Promise<ToolResult> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return { ok: false, handled: false, error: "query is required." };

  const requested = typeof args.maxResults === "number" ? Math.floor(args.maxResults) : 20;
  const maxResults = clampInt(requested, 1, 100);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return { ok: false, handled: false, error: "No workspace folder is open." };
  }

  const rgPaths = await listFilesFromRipgrep(workspaceRoot);
  const lower = query.toLowerCase();
  const matches = rgPaths.filter((p) => p.toLowerCase().includes(lower)).slice(0, maxResults);
  if (matches.length > 0) {
    return { ok: true, handled: false, data: { query, count: matches.length, files: matches } };
  }

  const escaped = escapeGlob(query);
  const fallback = await vscode.workspace.findFiles(`**/*${escaped}*`, undefined, maxResults);
  const fallbackPaths = fallback.map((u) => path.relative(workspaceRoot, u.fsPath));

  return { ok: true, handled: false, data: { query, count: fallbackPaths.length, files: fallbackPaths } };
}

async function listFilesFromRipgrep(workspaceRoot: string): Promise<string[]> {
  return new Promise((resolve) => {
    execFile("rg", ["--files"], { cwd: workspaceRoot, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error || !stdout) {
        resolve([]);
        return;
      }

      const files = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 10000);
      resolve(files);
    });
  });
}
