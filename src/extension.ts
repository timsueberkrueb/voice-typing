import * as vscode from "vscode";
import { AudioCaptureService } from "./audio/audioCaptureService";
import { SecretsManager } from "./config/secrets";
import { readSettings } from "./config/settings";
import { CursorInputInjector } from "./inject/cursorInputInjector";
import { VoicePromptOrchestrator } from "./orchestration/voicePromptOrchestrator";
import { CloudRewriteProvider } from "./rewrite/cloudRewriteProvider";
import { OllamaRewriteProvider } from "./rewrite/ollamaRewriteProvider";
import { WhisperCppSttProvider, findWhisperCppBinary } from "./stt/whisperCppSttProvider";
import { HttpSttProvider } from "./stt/httpSttProvider";
import { ModelManager } from "./stt/modelManager";
import { ISttProvider } from "./types/contracts";

const START_RECORDING_COMMAND = "voicePrompt.startRecording";

export function activate(context: vscode.ExtensionContext): void {
  const settings = readSettings();
  const secrets = new SecretsManager(context.secrets);
  const modelManager = new ModelManager(context.globalStorageUri);

  const audioCapture = new AudioCaptureService({
    vadEnabled: settings.vadEnabled,
    vadSilenceMs: settings.vadSilenceMs,
    vadMinSpeechMs: settings.vadMinSpeechMs,
  });

  const baseOllamaProvider =
    settings.rewriteProvider === "none"
      ? undefined
      : new OllamaRewriteProvider({
          baseUrl: settings.rewriteOllamaBaseUrl,
          model: settings.rewriteModel,
          timeoutMs: settings.rewriteTimeoutMs,
        });

  const cloudRewriteProviderFactory = async (): Promise<
    CloudRewriteProvider | undefined
  > => {
    const key = await secrets.getCloudApiKey();
    if (!key) {
      return undefined;
    }
    return new CloudRewriteProvider({
      apiUrl: settings.rewriteCloudBaseUrl,
      model: settings.rewriteModel,
      apiKey: key,
      timeoutMs: settings.rewriteTimeoutMs,
    });
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

        const cloudProvider = await cloudRewriteProviderFactory();
        const primaryRewriteProvider =
          settings.rewriteProvider === "cloud" ? cloudProvider : baseOllamaProvider;
        const fallbackCloudProvider =
          settings.rewriteProvider === "cloud" ? undefined : cloudProvider;

        if (settings.rewriteProvider === "cloud" && !cloudProvider) {
          void vscode.window.showWarningMessage(
            "Cloud API key missing. Run 'Voice Prompt: Set Cloud API Key'."
          );
        }

        const orchestrator = new VoicePromptOrchestrator({
          settings,
          audioCapture,
          sttProvider: currentStt,
          rewriteProvider: primaryRewriteProvider,
          cloudRewriteProvider: fallbackCloudProvider,
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

  const setCloudApiKeyDisposable = vscode.commands.registerCommand(
    "voicePrompt.setCloudApiKey",
    async () => {
      const apiKey = await vscode.window.showInputBox({
        title: "Voice Prompt Cloud API Key",
        prompt: "Paste API key for cloud rewrite provider",
        password: true,
        ignoreFocusOut: true,
      });
      if (!apiKey) {
        return;
      }
      await secrets.setCloudApiKey(apiKey);
      void vscode.window.showInformationMessage("Cloud API key saved securely.");
    }
  );
  context.subscriptions.push(setCloudApiKeyDisposable);

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
