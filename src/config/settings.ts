import * as vscode from "vscode";

export type NoRewriteBehavior = "stt_passthrough" | "disable_plugin";
export type RewriteProvider = "ollama" | "cloud" | "none";
export type SttProvider = "whisper-cpp" | "http";

export interface VoicePromptSettings {
  sttProvider: SttProvider;
  sttModel: string;
  sttWhisperCppPath: string;
  sttModelPath: string;
  sttHttpEndpoint: string;
  sttTimeoutMs: number;
  sttLanguage: string;
  rewriteProvider: RewriteProvider;
  rewriteModel: string;
  rewriteCloudBaseUrl: string;
  rewriteOllamaBaseUrl: string;
  rewriteTimeoutMs: number;
  rewriteStyle: "concise" | "detailed" | "engineering" | "debugging";
  previewBeforeInsert: boolean;
  autoFallbackToCloud: boolean;
  noRewriteBehavior: NoRewriteBehavior;
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
    sttModel: cfg.get<string>("stt.model", "tiny.en"),
    sttWhisperCppPath: cfg.get<string>("stt.whisperCppPath", ""),
    sttModelPath: cfg.get<string>("stt.modelPath", ""),
    sttHttpEndpoint: cfg.get<string>(
      "stt.httpEndpoint",
      "http://127.0.0.1:8765/transcribe"
    ),
    sttTimeoutMs: cfg.get<number>("stt.timeoutMs", 30000),
    sttLanguage: cfg.get<string>("stt.language", "en"),
    rewriteProvider: cfg.get<RewriteProvider>("rewrite.provider", "ollama"),
    rewriteModel: cfg.get<string>("rewrite.model", "llama3.2:3b"),
    rewriteCloudBaseUrl: cfg.get<string>(
      "rewrite.cloudBaseUrl",
      "https://api.openai.com/v1/chat/completions"
    ),
    rewriteOllamaBaseUrl: cfg.get<string>(
      "rewrite.ollamaBaseUrl",
      "http://127.0.0.1:11434"
    ),
    rewriteTimeoutMs: cfg.get<number>("rewrite.timeoutMs", 20000),
    rewriteStyle: cfg.get<"concise" | "detailed" | "engineering" | "debugging">(
      "rewrite.style",
      "engineering"
    ),
    previewBeforeInsert: cfg.get<boolean>("previewBeforeInsert", false),
    autoFallbackToCloud: cfg.get<boolean>("autoFallbackToCloud", false),
    noRewriteBehavior: cfg.get<NoRewriteBehavior>(
      "noRewriteBehavior",
      "stt_passthrough"
    ),
    showStatusBarButton: cfg.get<boolean>("showStatusBarButton", true),
    insertTrailingSpace: cfg.get<boolean>("insertTrailingSpace", true),
    vadEnabled: cfg.get<boolean>("vad.enabled", true),
    vadSilenceMs: cfg.get<number>("vad.silenceMs", 1500),
    vadMinSpeechMs: cfg.get<number>("vad.minSpeechMs", 300),
  };
}
