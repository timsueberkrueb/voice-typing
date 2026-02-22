import * as os from "node:os";
import * as path from "node:path";
import { writeFile } from "node:fs/promises";
import * as vscode from "vscode";
import { ToolResult } from "../types";

const CMD_ADD_FILE_TO_THREAD = "chatgpt.addFileToThread";
const CMD_FOCUS_SIDEBAR = "chatgpt.sidebarView.focus";

export async function executeCodexAgentTool(args: Record<string, unknown>): Promise<ToolResult> {
  const rawPrompt = typeof args.prompt === "string" ? args.prompt : "";
  const prompt = stripAgentPrefix(rawPrompt).trim();
  if (!prompt) return { ok: false, handled: false, error: "prompt is required." };

  const available = new Set(await vscode.commands.getCommands(true));

  try {
    if (available.has(CMD_FOCUS_SIDEBAR)) {
      await vscode.commands.executeCommand(CMD_FOCUS_SIDEBAR);
    }

    await addPromptToCodexThreadViaTmpFile(prompt);
    return { ok: true, handled: true, data: { prompt, via: "chatgpt.addFileToThread" } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, handled: false, error: message || "Failed to add prompt to Codex thread." };
  }
}

export async function addPromptToCodexThreadViaTmpFile(prompt: string): Promise<void> {
  const tmpPath = path.join(os.tmpdir(), `voice-prompt-codex-${Date.now()}.md`);

  await writeFile(tmpPath, prompt, "utf8");

  const uri = vscode.Uri.file(tmpPath);

  // Try passing the file (common variants)
  const attempts: unknown[] = [
    uri,
    { uri },
    { resource: uri },
    { fileUri: uri },
    tmpPath,
    { path: tmpPath },
  ];

  let lastError: unknown;
  for (const payload of attempts) {
    try {
      await vscode.commands.executeCommand(CMD_ADD_FILE_TO_THREAD, payload);
      return;
    } catch (e) {
      lastError = e;
    }
  }

  // Fallback: open it and invoke with no args (some implementations read active editor)
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });

    await vscode.commands.executeCommand(CMD_ADD_FILE_TO_THREAD);
    return;
  } catch (e) {
    const msg1 = lastError instanceof Error ? lastError.message : String(lastError);
    const msg2 = e instanceof Error ? e.message : String(e);
    throw new Error(`chatgpt.addFileToThread failed. Last errors: [payload] ${msg1} | [fallback] ${msg2}`);
  }
}

function stripAgentPrefix(value: string): string {
  return value.replace(/^\s*agent\b\s*:?\s*/i, "");
}
