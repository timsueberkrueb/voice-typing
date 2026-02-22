import * as vscode from "vscode";
import { AudioCaptureService } from "./audio/audioCaptureService";
import { loadCodexAuthFromDisk } from "./config/codexAuth";
import { readSettings } from "./config/settings";
import { CursorInputInjector } from "./inject/cursorInputInjector";
import { CloudCommandLayer } from "./intent/cloudCommandLayer";
import { VoicePromptOrchestrator } from "./orchestration/voicePromptOrchestrator";
import { WhisperCppSttProvider, findWhisperCppBinary } from "./stt/whisperCppSttProvider";
import { HttpSttProvider } from "./stt/httpSttProvider";
import { ModelManager } from "./stt/modelManager";
import { ISttProvider } from "./types/contracts";

const START_RECORDING_COMMAND = "voicePrompt.startRecording";

export function activate(context: vscode.ExtensionContext): void {
  const settings = readSettings();
  const modelManager = new ModelManager(context.globalStorageUri);

  const audioCapture = new AudioCaptureService({
    vadEnabled: settings.vadEnabled,
    vadSilenceMs: settings.vadSilenceMs,
    vadMinSpeechMs: settings.vadMinSpeechMs,
  });

  const cloudCommandLayerFactory = async (): Promise<CloudCommandLayer | undefined> => {
    if (settings.commandProvider === "chatgpt") {
      const auth = await loadCodexAuthFromDisk();
      if (!auth) {
        return undefined;
      }

      const extraHeaders = auth.accountId
        ? { "ChatGPT-Account-ID": auth.accountId }
        : undefined;

      return new CloudCommandLayer({
        apiUrl: settings.commandChatgptBaseUrl,
        model: settings.commandChatgptModel,
        bearerToken: auth.accessToken,
        timeoutMs: settings.commandTimeoutMs,
        extraHeaders
      });
    }

    return undefined;
  };

  let sttProvider: ISttProvider | undefined;

  const resolveSttProvider = async (): Promise<ISttProvider> => {
    if (sttProvider) {
      return sttProvider;
    }

    if (settings.sttProvider === "http") {
      sttProvider = new HttpSttProvider({
        endpoint: settings.sttHttpEndpoint,
        timeoutMs: settings.sttTimeoutMs,
      });
      return sttProvider;
    }

    const binaryPath = await findWhisperCppBinary(
      settings.sttWhisperCppPath || undefined
    );
    if (!binaryPath) {
      let installCmd: string;
      if (process.platform === "darwin") {
        installCmd = "brew install whisper-cpp";
      } else if (process.platform === "linux") {
        installCmd = "sudo apt install whisper-cpp  (or download from github.com/ggerganov/whisper.cpp/releases)";
      } else {
        installCmd = "Download from github.com/ggerganov/whisper.cpp/releases";
      }

      void vscode.window.showErrorMessage(
        `whisper-cpp not found. Install it: ${installCmd}`
      );
      throw new Error("whisper-cpp binary not found.");
    }

    let modelPath = settings.sttModelPath;
    if (!modelPath) {
      modelPath = await modelManager.ensureModel(settings.sttModel);
    }

    sttProvider = new WhisperCppSttProvider({
      binaryPath,
      modelPath,
      language: settings.sttLanguage,
      timeoutMs: settings.sttTimeoutMs,
    });
    return sttProvider;
  };

  const startRecordingDisposable = vscode.commands.registerCommand(
    START_RECORDING_COMMAND,
    async () => {
      try {
        const currentStt = await resolveSttProvider();

        const cloudCommandLayer =
          settings.commandProvider === "chatgpt"
            ? await cloudCommandLayerFactory()
            : undefined;

        if (settings.commandProvider === "chatgpt" && !cloudCommandLayer) {
          void vscode.window.showWarningMessage(
            "ChatGPT auth missing. Ensure ~/.codex/auth.json exists and has tokens.access_token."
          );
        }

        const orchestrator = new VoicePromptOrchestrator({
          settings,
          audioCapture,
          sttProvider: currentStt,
          cloudCommandLayer,
          inputInjector: new CursorInputInjector(settings.insertTrailingSpace),
        });

        await orchestrator.runOnce();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Voice Prompt failed: ${message}`);
      }
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
    item.tooltip = "Start voice prompt recording (Option+V)";
    item.command = START_RECORDING_COMMAND;
    item.show();
    context.subscriptions.push(item);

    audioCapture.setStatusBarItem(item);
  }
}

export function deactivate(): void {
  // No-op.
}
