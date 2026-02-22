import * as vscode from "vscode";
import { sanitizeForLog } from "./utils";

let outputChannel: vscode.OutputChannel | undefined;

export class CloudRoutingError extends Error {
  constructor(message: string, readonly statusCode: number, readonly body: string) {
    super(message);
  }

  static fromApiError(apiUrl: string, model: string, error: unknown): CloudRoutingError {
    const statusCode = extractStatusCode(error) ?? 500;
    const body = sanitizeForLog(extractErrorBody(error));
    const excerpt = body.slice(0, 700);

    logRouting(`Upstream ${statusCode} (chatgpt_responses) url=${apiUrl} model=${model}`, excerpt);

    return new CloudRoutingError(
      `Cloud command routing failed (${statusCode}): ${excerpt || "no response body"}`,
      statusCode,
      body
    );
  }
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  const anyErr = error as Record<string, unknown>;
  if (typeof anyErr.status === "number") return anyErr.status;

  const resp = anyErr.response;
  if (resp && typeof resp === "object" && typeof (resp as Record<string, unknown>).status === "number") {
    return (resp as Record<string, unknown>).status as number;
  }

  return undefined;
}

function extractErrorBody(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);

  const anyErr = error as Record<string, unknown>;

  if (typeof anyErr.message === "string" && anyErr.message.trim()) return anyErr.message;

  for (const key of ["error", "data", "response", "cause"]) {
    const v = anyErr[key];
    if (!v) continue;
    try {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      if (s && s !== "{}") return s;
    } catch {
      // ignore
    }
  }

  try {
    return JSON.stringify(anyErr);
  } catch {
    return String(error);
  }
}

function logRouting(message: string, detail?: string): void {
  outputChannel ??= vscode.window.createOutputChannel("Voice Prompt");
  outputChannel.appendLine(`[cloud-routing] ${message}`);
  if (detail) outputChannel.appendLine(detail);
}
