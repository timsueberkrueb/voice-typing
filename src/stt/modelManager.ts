import * as vscode from "vscode";
import { join } from "node:path";
import { access, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { request } from "undici";

const MODEL_BASE_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

const MODELS: Record<string, { filename: string; sizeMB: number }> = {
  "tiny.en": { filename: "ggml-tiny.en.bin", sizeMB: 75 },
  tiny: { filename: "ggml-tiny.bin", sizeMB: 75 },
  "base.en": { filename: "ggml-base.en.bin", sizeMB: 142 },
  base: { filename: "ggml-base.bin", sizeMB: 142 },
  "small.en": { filename: "ggml-small.en.bin", sizeMB: 466 },
  small: { filename: "ggml-small.bin", sizeMB: 466 },
};

export class ModelManager {
  private readonly storageDir: string;

  constructor(globalStorageUri: vscode.Uri) {
    this.storageDir = globalStorageUri.fsPath;
  }

  async ensureModel(modelName: string): Promise<string> {
    const info = MODELS[modelName];
    if (!info) {
      throw new Error(
        `Unknown model "${modelName}". Available: ${Object.keys(MODELS).join(", ")}`
      );
    }

    const modelPath = join(this.storageDir, info.filename);

    if (await fileExists(modelPath)) {
      return modelPath;
    }

    await mkdir(this.storageDir, { recursive: true });

    const url = `${MODEL_BASE_URL}/${info.filename}`;
    await this.downloadWithProgress(url, modelPath, info.filename, info.sizeMB);

    return modelPath;
  }

  getModelPath(modelName: string): string {
    const info = MODELS[modelName] ?? { filename: `ggml-${modelName}.bin` };
    return join(this.storageDir, info.filename);
  }

  private async downloadWithProgress(
    url: string,
    destPath: string,
    filename: string,
    sizeMB: number
  ): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Downloading ${filename} (~${sizeMB}MB)...`,
        cancellable: true,
      },
      async (progress, token) => {
        const res = await request(url, {
          method: "GET",
          maxRedirections: 5,
        } as any);

        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new Error(`Download failed: HTTP ${res.statusCode}`);
        }

        const totalBytes = Number(res.headers["content-length"] || 0);
        let downloaded = 0;

        const writer = createWriteStream(destPath);
        const body = res.body;

        if (token.isCancellationRequested) {
          body.destroy();
          throw new Error("Download cancelled.");
        }

        token.onCancellationRequested(() => {
          body.destroy();
          writer.destroy();
        });

        for await (const chunk of body) {
          if (token.isCancellationRequested) {
            writer.destroy();
            throw new Error("Download cancelled.");
          }
          writer.write(chunk);
          downloaded += chunk.length;
          if (totalBytes > 0) {
            const pct = Math.round((downloaded / totalBytes) * 100);
            progress.report({
              increment: (chunk.length / totalBytes) * 100,
              message: `${pct}%`,
            });
          }
        }

        await new Promise<void>((resolve, reject) => {
          writer.end(() => resolve());
          writer.on("error", reject);
        });
      }
    );
  }
}

function fileExists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false);
}
