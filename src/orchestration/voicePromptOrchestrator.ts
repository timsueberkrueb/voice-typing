import * as vscode from "vscode";
import { VoicePromptSettings } from "../config/settings";
import {
  AudioChunk,
  IInputInjector,
  IRewriteProvider,
  ISttProvider,
  RewriteInput
} from "../types/contracts";
import { AudioCaptureService, cleanupWavFile } from "../audio/audioCaptureService";

interface Dependencies {
  settings: VoicePromptSettings;
  audioCapture: AudioCaptureService;
  sttProvider: ISttProvider;
  rewriteProvider: IRewriteProvider | undefined;
  cloudRewriteProvider?: IRewriteProvider;
  inputInjector: IInputInjector;
}

export class VoicePromptOrchestrator {
  private warnedNoBackend = false;
  private lastCapturedAudio?: AudioChunk;

  constructor(private readonly deps: Dependencies) {}

  setRewriteProviders(
    rewriteProvider: IRewriteProvider | undefined,
    cloudRewriteProvider: IRewriteProvider | undefined
  ): void {
    this.deps.rewriteProvider = rewriteProvider;
    this.deps.cloudRewriteProvider = cloudRewriteProvider;
  }

  async runOnce(): Promise<void> {
    let statusDisposable: vscode.Disposable | undefined;
    const setStatus = (msg: string) => {
      statusDisposable?.dispose();
      statusDisposable = vscode.window.setStatusBarMessage(msg);
    };
    const clearStatus = () => {
      statusDisposable?.dispose();
      statusDisposable = undefined;
    };

    try {
      setStatus("$(mic) Listening...");

      const t0 = Date.now();
      const audio = await this.deps.audioCapture.captureOnce();
      this.lastCapturedAudio = audio;
      const recordMs = Date.now() - t0;

      if (audio.pcm16.length === 0) {
        clearStatus();
        void cleanupWavFile(audio.wavPath);
        void vscode.window.showWarningMessage(
          "No audio captured. Check your microphone permissions."
        );
        return;
      }

      setStatus("$(sync~spin) Transcribing...");

      const t1 = Date.now();
      const raw = await this.transcribeWithRetry(audio);
      const sttMs = Date.now() - t1;
      void cleanupWavFile(audio.wavPath);
      const sourceText = raw.text.trim();

      if (!sourceText) {
        clearStatus();
        void vscode.window.showWarningMessage(
          "No speech detected. Try speaking more clearly."
        );
        return;
      }

      setStatus("$(sync~spin) Rewriting...");

      const t2 = Date.now();
      const finalText = await this.resolveFinalText(sourceText);
      const rewriteMs = Date.now() - t2;
      if (!finalText) {
        clearStatus();
        return;
      }

      const maybeEdited = await this.previewIfEnabled(finalText);
      if (maybeEdited === undefined) {
        clearStatus();
        return;
      }

      try {
        await this.deps.inputInjector.insert(maybeEdited);
        clearStatus();
        const totalMs = Date.now() - t0;
        void vscode.window.setStatusBarMessage(
          `$(check) Done (rec ${(recordMs / 1000).toFixed(1)}s + stt ${(sttMs / 1000).toFixed(1)}s + rewrite ${(rewriteMs / 1000).toFixed(1)}s = ${(totalMs / 1000).toFixed(1)}s)`,
          5000
        );
      } catch {
        clearStatus();
        await vscode.env.clipboard.writeText(maybeEdited);
        void vscode.window.showErrorMessage(
          "Insertion failed. Copied rewritten prompt to clipboard — paste with Cmd+V."
        );
      }
    } finally {
      clearStatus();
    }
  }

  private async resolveFinalText(sourceText: string): Promise<string | undefined> {
    const { noRewriteBehavior } = this.deps.settings;

    if (!this.deps.rewriteProvider || this.deps.settings.rewriteProvider === "none") {
      if (!this.warnedNoBackend) {
        this.warnedNoBackend = true;
        void vscode.window.showWarningMessage(
          "No rewrite backend configured. Raw transcript will be used. Configure Ollama or cloud rewrite in settings."
        );
      }

      if (noRewriteBehavior === "disable_plugin") {
        void vscode.window.showWarningMessage(
          "Rewrite backend unavailable. Voice Prompt is disabled by policy."
        );
        return undefined;
      }
      return sourceText;
    }

    const rewriteInput: RewriteInput = {
      transcript: sourceText,
      style: this.deps.settings.rewriteStyle
    };

    try {
      const rewritten = await this.deps.rewriteProvider.rewrite(rewriteInput);
      return rewritten.text.trim() || sourceText;
    } catch {
      if (this.deps.settings.autoFallbackToCloud && this.deps.cloudRewriteProvider) {
        try {
          const cloudRewritten = await this.deps.cloudRewriteProvider.rewrite(
            rewriteInput
          );
          return cloudRewritten.text.trim() || sourceText;
        } catch {
          // Fall through to policy.
        }
      }

      if (noRewriteBehavior === "disable_plugin") {
        void vscode.window.showErrorMessage(
          "Rewrite failed and plugin is configured to disable when rewrite is unavailable."
        );
        return undefined;
      }
      return sourceText;
    }
  }

  private async previewIfEnabled(text: string): Promise<string | undefined> {
    if (!this.deps.settings.previewBeforeInsert) {
      return text;
    }

    return vscode.window.showInputBox({
      title: "Voice Prompt Preview",
      value: text,
      ignoreFocusOut: true,
      prompt: "Edit before insert. Press Enter to confirm, Escape to cancel."
    });
  }

  private async transcribeWithRetry(audio: AudioChunk) {
    try {
      return await this.deps.sttProvider.transcribe(audio);
    } catch {
      const retrySelection = await vscode.window.showErrorMessage(
        "Transcription failed. Is the STT service running?",
        "Retry"
      );
      if (retrySelection === "Retry" && this.lastCapturedAudio) {
        return this.deps.sttProvider.transcribe(this.lastCapturedAudio);
      }
      throw new Error("Transcription failed.");
    }
  }
}
