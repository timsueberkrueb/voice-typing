import * as vscode from "vscode";

export type CommandProvider = "chatgpt" | "none";
export type SttProvider = "whisper-cpp" | "http";

export interface VoicePromptSettings {
  sttProvider: SttProvider;
  sttModel: string;
  sttWhisperCppPath: string;
  sttModelPath: string;
  sttHttpEndpoint: string;
  sttTimeoutMs: number;
  sttLanguage: string;
  commandProvider: CommandProvider;
  commandChatgptModel: string;
  commandChatgptBaseUrl: string;
  commandTimeoutMs: number;
  previewBeforeInsert: boolean;
  showStatusBarButton: boolean;
  insertTrailingSpace: boolean;
  vadEnabled: boolean;
  vadSilenceMs: number;
  vadMinSpeechMs: number;
}

const SECTION = "voicePrompt";

export function readSettings(): VoicePromptSettings {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    sttProvider: cfg.get<SttProvider>("stt.provider", "whisper-cpp"),
    sttModel: cfg.get<string>("stt.model", "base"),
    sttWhisperCppPath: cfg.get<string>("stt.whisperCppPath", ""),
    sttModelPath: cfg.get<string>("stt.modelPath", ""),
    sttHttpEndpoint: cfg.get<string>(
      "stt.httpEndpoint",
      "http://127.0.0.1:8765/transcribe"
    ),
    sttTimeoutMs: cfg.get<number>("stt.timeoutMs", 30000),
    sttLanguage: cfg.get<string>("stt.language", "auto"),
    commandProvider: cfg.get<CommandProvider>("command.provider", "none"),
    commandChatgptModel: cfg.get<string>("command.chatgptModel", "gpt-5-codex-mini"),
    commandChatgptBaseUrl: cfg.get<string>(
      "command.chatgptBaseUrl",
      "https://chatgpt.com/backend-api/codex/responses"
    ),
    commandTimeoutMs: cfg.get<number>("command.timeoutMs", 20000),
    previewBeforeInsert: cfg.get<boolean>("previewBeforeInsert", false),
    showStatusBarButton: cfg.get<boolean>("showStatusBarButton", true),
    insertTrailingSpace: cfg.get<boolean>("insertTrailingSpace", true),
    vadEnabled: cfg.get<boolean>("vad.enabled", true),
    vadSilenceMs: cfg.get<number>("vad.silenceMs", 1500),
    vadMinSpeechMs: cfg.get<number>("vad.minSpeechMs", 300),
  };
}
