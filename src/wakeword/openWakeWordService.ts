import * as vscode from "vscode";
import { ChildProcess, spawn } from "node:child_process";
import * as readline from "node:readline";

interface OpenWakeWordOptions {
  pythonPath: string;
  model: string;
  threshold: number;
  cooldownMs: number;
}

interface WakeEvent {
  event: string;
  score?: number;
  model?: string;
  message?: string;
  count?: number;
}

interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

const PYTHON_LISTENER_CODE = String.raw`
import json
import os
import sys
import time


def emit(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


try:
    import sounddevice as sd
except Exception:
    emit({"event": "error", "message": "Missing dependency: sounddevice (pip install sounddevice)"})
    raise

try:
    from openwakeword.model import Model
except Exception:
    emit({"event": "error", "message": "Missing dependency: openwakeword (pip install openwakeword)"})
    raise


target_model = os.environ.get("OWW_MODEL", "alexa")
threshold = float(os.environ.get("OWW_THRESHOLD", "0.5"))
cooldown_ms = max(0, int(os.environ.get("OWW_COOLDOWN_MS", "4000")))

sample_rate = 16000
chunk_size = 1280

try:
    model = Model()
except Exception as e:
    emit({"event": "error", "message": f"Failed to load wakeword model '{target_model}': {e}"})
    raise

last_trigger_at = 0
emit({"event": "ready", "model": target_model, "threshold": threshold})

try:
    devices = sd.query_devices()
    emit({"event": "devices", "count": len(devices)})
except Exception as e:
    emit({"event": "warn", "message": f"Failed to query devices: {e}"})

try:
    with sd.InputStream(channels=1, samplerate=sample_rate, dtype="int16", blocksize=chunk_size) as stream:
        emit({"event": "stream_opened"})
        while True:
            audio_chunk, overflowed = stream.read(chunk_size)
            if overflowed:
                continue

            pcm16 = audio_chunk.reshape(-1)
            scores = model.predict(pcm16)
            if not isinstance(scores, dict) or not scores:
                continue

            best_key = None
            best_score = -1.0
            for key, score in scores.items():
                score_val = float(score)
                if score_val > best_score:
                    best_key = key
                    best_score = score_val

            target_key = None
            target_score = -1.0
            target_lower = target_model.lower()
            for key, score in scores.items():
                key_lower = key.lower()
                if key_lower == target_lower or key_lower.startswith(target_lower):
                    score_val = float(score)
                    if score_val > target_score:
                        target_key = key
                        target_score = score_val

            trigger_key = target_key or best_key
            trigger_score = target_score if target_key else best_score

            if trigger_key is None:
                continue

            now_ms = int(time.time() * 1000)
            if trigger_score >= threshold and (now_ms - last_trigger_at) >= cooldown_ms:
                last_trigger_at = now_ms
                emit({"event": "wake", "model": trigger_key, "score": trigger_score})
except Exception as e:
    emit({"event": "error", "message": f"Audio stream failed: {e}"})
    raise
`;

export class OpenWakeWordService implements vscode.Disposable {
  private proc: ChildProcess | undefined;
  private isDisposed = false;
  private restartTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly options: OpenWakeWordOptions,
    private readonly onWakeDetected: () => void,
    private readonly logger?: Logger
  ) {}

  start(): void {
    if (this.isDisposed || this.proc) {
      return;
    }

    const env = {
      ...process.env,
      OWW_MODEL: this.options.model,
      OWW_THRESHOLD: String(this.options.threshold),
      OWW_COOLDOWN_MS: String(this.options.cooldownMs)
    };

    this.proc = spawn(this.options.pythonPath, ["-u", "-c", PYTHON_LISTENER_CODE], {
      stdio: ["ignore", "pipe", "pipe"],
      env
    });
    this.logger?.info(
      `wake listener started (python=${this.options.pythonPath}, model=${this.options.model}, threshold=${this.options.threshold}, cooldownMs=${this.options.cooldownMs})`
    );

    const stdout = this.proc.stdout;
    const stderr = this.proc.stderr;

    if (stdout) {
      const rl = readline.createInterface({ input: stdout });
      rl.on("line", (line) => this.handleLine(line));
      this.proc.once("exit", () => rl.close());
    }

    if (stderr) {
      const rlErr = readline.createInterface({ input: stderr });
      rlErr.on("line", (line) => {
        const text = line.trim();
        if (!text) return;
        this.logger?.warn(`wake stderr: ${text}`);
        console.warn(`[voicePrompt] openWakeWord stderr: ${text}`);
      });
      this.proc.once("exit", () => rlErr.close());
    }

    this.proc.once("error", (error) => {
      void vscode.window.showWarningMessage(
        `Wake word disabled: failed to start ${this.options.pythonPath} (${error.message})`
      );
      this.logger?.warn(`wake listener failed to start: ${error.message}`);
      this.proc = undefined;
    });

    this.proc.once("exit", (code, signal) => {
      if (!this.isDisposed && code !== 0) {
        void vscode.window.showWarningMessage(
          "Wake word listener stopped unexpectedly. Check Python/openWakeWord installation."
        );
        this.logger?.warn(
          `wake listener exited unexpectedly (code=${code}, signal=${signal ?? "none"}), scheduling restart in 3s`
        );
        console.warn(`[voicePrompt] openWakeWord exited (code=${code}, signal=${signal ?? "none"})`);
        this.scheduleRestart();
      } else if (!this.isDisposed) {
        this.logger?.warn(
          `wake listener exited (code=${code}, signal=${signal ?? "none"}), scheduling restart in 3s`
        );
        this.scheduleRestart();
      }
      this.proc = undefined;
    });
  }

  dispose(): void {
    this.isDisposed = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    if (this.proc && !this.proc.killed) {
      this.proc.kill();
    }
    this.proc = undefined;
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event: WakeEvent;
    try {
      event = JSON.parse(trimmed) as WakeEvent;
    } catch {
      this.logger?.warn(`wake non-json output: ${trimmed}`);
      console.warn(`[voicePrompt] openWakeWord output: ${trimmed}`);
      return;
    }

    switch (event.event) {
      case "error": {
        const msg = event.message ?? "unknown error";
        void vscode.window.showWarningMessage(`Wake word disabled: ${msg}`);
        this.logger?.warn(`wake listener error: ${msg}`);
        this.dispose();
        return;
      }
      case "ready":
        this.logger?.info(
          `wake listener ready (model=${event.model ?? this.options.model}, threshold=${this.options.threshold})`
        );
        return;
      case "wake":
        this.logger?.info(
          `wake detected (model=${event.model ?? "unknown"}, score=${event.score ?? 0})`
        );
        this.onWakeDetected();
        return;
      case "devices":
        this.logger?.info(
          `audio devices reported by wake listener: ${event.count ?? "unknown"}`
        );
        return;
      case "stream_opened":
        this.logger?.info("wake audio stream opened");
        return;
      case "warn":
        this.logger?.warn(`wake listener warning: ${event.message ?? "unknown warning"}`);
        return;
      default:
        return;
    }
  }

  private scheduleRestart(): void {
    if (this.isDisposed || this.restartTimer) {
      return;
    }

    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      if (!this.isDisposed) {
        this.start();
      }
    }, 3000);
  }
}
