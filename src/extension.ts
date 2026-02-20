import * as vscode from "vscode";
import { AudioCaptureService } from "./audio/audioCaptureService";
import { readSettings } from "./config/settings";
import { CursorInputInjector } from "./inject/cursorInputInjector";
import { OllamaRewriteProvider } from "./rewrite/ollamaRewriteProvider";
import { LocalSttProvider } from "./stt/localSttProvider";

const START_RECORDING_COMMAND = "voicePrompt.startRecording";

export function activate(context: vscode.ExtensionContext): void {
  const settings = readSettings();
  const audioCapture = new AudioCaptureService();
  const stt = new LocalSttProvider();
  const rewrite = new OllamaRewriteProvider();
  const injector = new CursorInputInjector();

  const startRecordingDisposable = vscode.commands.registerCommand(
    START_RECORDING_COMMAND,
    async () => {
      const audio = await audioCapture.captureOnce();
      const transcript = await stt.transcribe(audio);
      const rewritten = await rewrite.rewrite({ transcript: transcript.text });

      if (!rewritten.text) {
        void vscode.window.showWarningMessage(
          "No speech detected. Try speaking more clearly and again."
        );
        return;
      }

      await injector.insert(rewritten.text);
      void vscode.window.setStatusBarMessage("Voice Prompt inserted", 1500);
    }
  );
  context.subscriptions.push(startRecordingDisposable);

  if (settings.showStatusBarButton) {
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    item.name = "Voice Prompt";
    item.text = "$(mic) Voice Prompt";
    item.tooltip = "Start voice prompt recording";
    item.command = START_RECORDING_COMMAND;
    item.show();
    context.subscriptions.push(item);
  }
}

export function deactivate(): void {
  // No-op.
}

