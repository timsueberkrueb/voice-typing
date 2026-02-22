import * as vscode from "vscode";
import { VoicePromptSettings } from "../config/settings";
import {
  AudioChunk,
  ICommandLayer,
  IInputInjector,
  ISttProvider
} from "../types/contracts";
import { AudioCaptureService, cleanupWavFile } from "../audio/audioCaptureService";

interface Dependencies {
  settings: VoicePromptSettings;
  audioCapture: AudioCaptureService;
  sttProvider: ISttProvider;
  cloudCommandLayer?: ICommandLayer;
  inputInjector: IInputInjector;
}

export class VoicePromptOrchestrator {
  private lastCapturedAudio?: AudioChunk;

  constructor(private readonly deps: Dependencies) {}

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

      let finalText = sourceText;
      let routeMs = 0;
      const t2 = Date.now();
      if (this.deps.settings.commandProvider === "chatgpt") {
        if (!this.deps.cloudCommandLayer) {
          clearStatus();
          void vscode.window.showErrorMessage(
            "Cloud command layer is unavailable."
          );
          return;
        }

        setStatus("$(sync~spin) Routing intent...");
        const handled = await this.deps.cloudCommandLayer.route(sourceText);
        routeMs = Date.now() - t2;

        if (handled) {
          clearStatus();
          const totalMs = Date.now() - t0;
          void vscode.window.setStatusBarMessage(
            `$(check) Done (rec ${(recordMs / 1000).toFixed(1)}s + stt ${(sttMs / 1000).toFixed(1)}s + route ${(routeMs / 1000).toFixed(1)}s = ${(totalMs / 1000).toFixed(1)}s)`,
            5000
          );
          return;
        }
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
          `$(check) Done (rec ${(recordMs / 1000).toFixed(1)}s + stt ${(sttMs / 1000).toFixed(1)}s + route ${(routeMs / 1000).toFixed(1)}s = ${(totalMs / 1000).toFixed(1)}s)`,
          5000
        );
      } catch {
        clearStatus();
        await vscode.env.clipboard.writeText(maybeEdited);
        void vscode.window.showErrorMessage(
          "Insertion failed. Copied transcript to clipboard — paste with Cmd+V."
        );
      }
    } finally {
      clearStatus();
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
