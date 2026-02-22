import * as vscode from "vscode";
import { clampInt } from "./utils";

export function normalizeLine(value: unknown, lineCount: number): number {
  const n = typeof value === "number" ? Math.floor(value) : 0;
  return clampInt(n, 0, Math.max(0, lineCount - 1));
}

export function normalizeColumn(value: unknown): number {
  const n = typeof value === "number" ? Math.floor(value) : 0;
  return Math.max(0, n);
}

export function positionAfterInsert(start: vscode.Position, text: string): vscode.Position {
  const lines = text.split("\n");
  if (lines.length === 1) return new vscode.Position(start.line, start.character + text.length);
  return new vscode.Position(start.line + lines.length - 1, lines.at(-1)?.length ?? 0);
}
