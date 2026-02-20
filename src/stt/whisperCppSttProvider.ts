import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { cpus } from "node:os";
import { AudioChunk, ISttProvider, RawTranscript } from "../types/contracts";

interface WhisperCppOptions {
  binaryPath: string;
  modelPath: string;
  language: string;
  timeoutMs: number;
}

export class WhisperCppSttProvider implements ISttProvider {
  constructor(private readonly options: WhisperCppOptions) {}

  async transcribe(audio: AudioChunk): Promise<RawTranscript> {
    if (audio.pcm16.length === 0) {
      return { text: "" };
    }

    const outputBase = audio.wavPath.replace(/\.wav$/, "");
    const txtPath = outputBase + ".txt";

    const args = [
      "-m", this.options.modelPath,
      "-l", this.options.language,
      "--output-txt",
      "--no-timestamps",
      "--no-prints",
      "-of", outputBase,
      "-t", String(Math.min(cpus().length, 4)),
      "-bs", "1",
      audio.wavPath,
    ];

    await this.runWhisperCli(args);

    let text = "";
    try {
      text = (await readFile(txtPath, "utf-8")).trim();
    } catch {
      // txt file might not exist if no speech detected
    }

    try {
      await unlink(txtPath);
    } catch {
      // best effort
    }

    return { text };
  }

  private runWhisperCli(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(
        this.options.binaryPath,
        args,
        { timeout: this.options.timeoutMs },
        (error, _stdout, stderr) => {
          if (error) {
            const msg = stderr?.slice(0, 300) || error.message;
            reject(new Error(`whisper-cli failed: ${msg}`));
            return;
          }
          resolve();
        }
      );
    });
  }
}

export async function findWhisperCppBinary(
  settingPath?: string
): Promise<string | undefined> {
  if (settingPath) {
    if (await fileExists(settingPath)) {
      return settingPath;
    }
  }

  const names = getWhisperCliNames();
  for (const name of names) {
    if (await whichBinary(name)) {
      return name;
    }
  }

  return undefined;
}

function getWhisperCliNames(): string[] {
  if (process.platform === "win32") {
    return ["whisper-cli.exe", "whisper-cpp.exe", "whisper.exe"];
  }
  return ["whisper-cli", "whisper-cpp", "whisper"];
}

function whichBinary(name: string): Promise<boolean> {
  const cmd = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    execFile(cmd, [name], (err) => resolve(!err));
  });
}

function fileExists(path: string): Promise<boolean> {
  return import("node:fs/promises")
    .then((fs) => fs.access(path))
    .then(() => true)
    .catch(() => false);
}
