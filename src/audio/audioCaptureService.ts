import * as vscode from "vscode";
import { spawn, ChildProcess, execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export interface CaptureOptions {
  vadEnabled: boolean;
  vadSilenceMs: number;
  vadMinSpeechMs: number;
}

export interface CaptureResult {
  wavPath: string;
  pcm16: Buffer;
  sampleRateHz: number;
  channels: number;
}

type RecorderBackend = "sox" | "arecord" | "ffmpeg";

interface RecorderInfo {
  backend: RecorderBackend;
  binaryPath: string;
}

export class AudioCaptureService {
  private recording = false;
  private statusBarItem?: vscode.StatusBarItem;
  private detectedRecorder?: RecorderInfo;
  private detectionDone = false;

  constructor(private readonly options: CaptureOptions) { }

  setStatusBarItem(item: vscode.StatusBarItem): void {
    this.statusBarItem = item;
  }

  async captureOnce(): Promise<CaptureResult> {
    if (this.recording) {
      throw new Error("Already recording.");
    }

    this.recording = true;
    this.setRecordingIndicator(true);

    try {
      if (!this.detectionDone) {
        this.detectedRecorder = await detectRecorder();
        this.detectionDone = true;
      }

      if (!this.detectedRecorder) {
        throw new Error(getInstallInstructions());
      }

      const wavPath = getTempWavPath();
      await this.recordToWav(this.detectedRecorder, wavPath);

      const wavData = await readFile(wavPath);
      const pcm16 = extractPcm16FromWav(wavData);

      return { wavPath, pcm16, sampleRateHz: 16000, channels: 1 };
    } finally {
      this.recording = false;
      this.setRecordingIndicator(false);
    }
  }

  private setRecordingIndicator(active: boolean): void {
    if (!this.statusBarItem) {
      return;
    }
    if (active) {
      this.statusBarItem.text = "$(debug-stop) Recording...";
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    } else {
      this.statusBarItem.text = "$(mic) Voice Prompt";
      this.statusBarItem.backgroundColor = undefined;
    }
  }

  private recordToWav(recorder: RecorderInfo, wavPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const { args, usesStdout } = buildRecorderArgs(recorder, wavPath);
      const proc = spawn(recorder.binaryPath, args, {
        stdio: usesStdout ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "pipe"]
      });
      let stopRequested = false;
      const stopRecording = (): void => {
        stopRequested = true;
        killProc(proc);
      };

      const chunks: Buffer[] = [];
      let stderrData = "";

      proc.on("error", (err) => {
        reject(new Error(`Recording failed to start: ${err.message}`));
      });

      if (usesStdout && proc.stdout) {
        proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      }

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderrData += chunk.toString();
      });

      proc.on("close", async (code, signal) => {
        if (usesStdout && chunks.length > 0) {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(wavPath, Buffer.concat(chunks));
        }
        if (!isExpectedExit(recorder.backend, stopRequested, code, signal)) {
          const msg = stderrData.slice(0, 300).trim();
          reject(new Error(`Recording exited with code ${code}: ${msg}`));
          return;
        }
        resolve();
      });

      if (this.options.vadEnabled) {
        this.runVadAutoStop(proc, wavPath, stopRecording);
      } else {
        this.runTimedStop(30_000, stopRecording);
      }
    });
  }

  private runVadAutoStop(
    proc: ChildProcess,
    wavPath: string,
    stopRecording: () => void
  ): void {
    const { vadSilenceMs, vadMinSpeechMs } = this.options;
    const SAMPLE_RATE = 16000;
    const BYTES_PER_SAMPLE = 2;
    const CHECK_INTERVAL_MS = 100;
    const SILENCE_THRESHOLD = 150;
    const MIN_RECORDING_MS = 1500;

    const msToBytes = (ms: number) =>
      Math.floor((ms / 1000) * SAMPLE_RATE * BYTES_PER_SAMPLE);

    const silenceWindowBytes = msToBytes(vadSilenceMs);

    let speechDetected = false;
    let speechDetectedAt = 0;

    const timer = setInterval(async () => {
      if (proc.killed) {
        clearInterval(timer);
        return;
      }

      let pcmData: Buffer;
      try {
        const { readFile: rf } = await import("node:fs/promises");
        const wavData = await rf(wavPath);
        pcmData = extractPcm16FromWav(wavData);
      } catch {
        return;
      }

      const totalBytes = pcmData.length;

      if (!speechDetected) {
        if (totalBytes >= msToBytes(vadMinSpeechMs)) {
          const recent = getRecentSamples(pcmData, msToBytes(vadMinSpeechMs));
          if (rmsAmplitude(recent) > SILENCE_THRESHOLD) {
            speechDetected = true;
            speechDetectedAt = Date.now();
          }
        }
        if (totalBytes > msToBytes(10000)) {
          stopRecording();
          clearInterval(timer);
        }
        return;
      }

      const elapsed = Date.now() - speechDetectedAt;
      if (elapsed < MIN_RECORDING_MS) {
        return;
      }

      if (totalBytes < silenceWindowBytes) {
        return;
      }

      const tail = getRecentSamples(pcmData, silenceWindowBytes);
      if (rmsAmplitude(tail) < SILENCE_THRESHOLD) {
        stopRecording();
        clearInterval(timer);
      }
    }, CHECK_INTERVAL_MS);

    setTimeout(() => {
      clearInterval(timer);
      stopRecording();
    }, 60_000);
  }

  private runTimedStop(durationMs: number, stopRecording: () => void): void {
    setTimeout(() => stopRecording(), durationMs);
  }
}

function killProc(proc: ChildProcess): void {
  if (!proc.killed) {
    proc.kill("SIGTERM");
  }
}

function isExpectedExit(
  backend: RecorderBackend,
  stopRequested: boolean,
  code: number | null,
  signal: NodeJS.Signals | null
): boolean {
  if (code === 0 || code === null) {
    return true;
  }
  if (!stopRequested) {
    return false;
  }

  switch (backend) {
    case "arecord":
      return signal === "SIGINT" || signal === "SIGTERM" || code === 1;
    case "ffmpeg":
      return signal === "SIGINT" || signal === "SIGTERM" || code === 255;
    case "sox":
      return signal === "SIGINT" || signal === "SIGTERM";
  }
}

function getTempWavPath(): string {
  const id = randomBytes(8).toString("hex");
  return join(tmpdir(), `voice-prompt-${id}.wav`);
}

function buildRecorderArgs(
  recorder: RecorderInfo,
  wavPath: string
): { args: string[]; usesStdout: boolean } {
  switch (recorder.backend) {
    case "sox":
      return {
        args: ["-d", "-t", "wav", "-r", "16000", "-c", "1", "-b", "16", wavPath],
        usesStdout: false
      };
    case "arecord":
      return {
        args: ["-f", "S16_LE", "-r", "16000", "-c", "1", "-t", "wav", wavPath],
        usesStdout: false
      };
    case "ffmpeg":
      return {
        args: [
          "-y", "-f", getFFmpegInputFormat(), "-i", getFFmpegInputDevice(),
          "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
          "-t", "60", wavPath
        ],
        usesStdout: false
      };
  }
}

function getFFmpegInputFormat(): string {
  switch (process.platform) {
    case "win32": return "dshow";
    case "darwin": return "avfoundation";
    default: return "pulse";
  }
}

function getFFmpegInputDevice(): string {
  switch (process.platform) {
    case "win32": return "audio=default";
    case "darwin": return ":default";
    default: return "default";
  }
}

async function detectRecorder(): Promise<RecorderInfo | undefined> {
  const candidates = getCandidates();

  for (const c of candidates) {
    if (await binaryExists(c.binary)) {
      return { backend: c.backend, binaryPath: c.binary };
    }
  }
  return undefined;
}

function getCandidates(): Array<{ backend: RecorderBackend; binary: string }> {
  switch (process.platform) {
    case "darwin":
      return [
        { backend: "sox", binary: "sox" },
        { backend: "ffmpeg", binary: "ffmpeg" },
      ];
    case "linux":
      return [
        { backend: "arecord", binary: "arecord" },
        { backend: "sox", binary: "sox" },
        { backend: "ffmpeg", binary: "ffmpeg" },
      ];
    case "win32":
      return [
        { backend: "ffmpeg", binary: "ffmpeg" },
        { backend: "sox", binary: "sox" },
      ];
    default:
      return [
        { backend: "sox", binary: "sox" },
        { backend: "ffmpeg", binary: "ffmpeg" },
      ];
  }
}

function binaryExists(name: string): Promise<boolean> {
  const cmd = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    execFile(cmd, [name], (err) => resolve(!err));
  });
}

function getInstallInstructions(): string {
  switch (process.platform) {
    case "darwin":
      return "No audio recorder found. Install SoX: brew install sox";
    case "linux":
      return "No audio recorder found. Install arecord (alsa-utils) or SoX: sudo apt install alsa-utils";
    case "win32":
      return "No audio recorder found. Install FFmpeg: winget install ffmpeg";
    default:
      return "No audio recorder found. Install SoX or FFmpeg.";
  }
}

function extractPcm16FromWav(wavData: Buffer): Buffer {
  if (wavData.length < 44) {
    return Buffer.alloc(0);
  }
  const riff = wavData.toString("ascii", 0, 4);
  if (riff !== "RIFF") {
    return Buffer.alloc(0);
  }
  let offset = 12;
  while (offset + 8 < wavData.length) {
    const chunkId = wavData.toString("ascii", offset, offset + 4);
    const chunkSize = wavData.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      return wavData.subarray(offset + 8, offset + 8 + chunkSize);
    }
    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) {
      offset++;
    }
  }
  return Buffer.alloc(0);
}

function getRecentSamples(pcm: Buffer, byteCount: number): Buffer {
  if (pcm.length <= byteCount) {
    return pcm;
  }
  return pcm.subarray(pcm.length - byteCount);
}

function rmsAmplitude(pcm16: Buffer): number {
  const sampleCount = Math.floor(pcm16.length / 2);
  if (sampleCount === 0) {
    return 0;
  }
  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i++) {
    const sample = pcm16.readInt16LE(i * 2);
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount);
}

export async function cleanupWavFile(wavPath: string): Promise<void> {
  try {
    await unlink(wavPath);
  } catch {
    // Best effort cleanup
  }
}
