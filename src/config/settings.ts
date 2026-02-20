import * as vscode from "vscode";

export type NoRewriteBehavior = "stt_passthrough" | "disable_plugin";
export type RewriteProvider = "ollama" | "cloud" | "none";
export type SttProvider = "local" | "cloud";

export interface VoicePromptSettings {
  sttProvider: SttProvider;
  sttModel: string;
  rewriteProvider: RewriteProvider;
  rewriteModel: string;
  previewBeforeInsert: boolean;
  autoFallbackToCloud: boolean;
  noRewriteBehavior: NoRewriteBehavior;
  showStatusBarButton: boolean;
  vadEnabled: boolean;
  vadSilenceMs: number;
  vadMinSpeechMs: number;
}

const SECTION = "voicePrompt";

export function readSettings(): VoicePromptSettings {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    sttProvider: cfg.get<SttProvider>("stt.provider", "local"),
    sttModel: cfg.get<string>("stt.model", "faster-whisper-base"),
    rewriteProvider: cfg.get<RewriteProvider>("rewrite.provider", "ollama"),
    rewriteModel: cfg.get<string>("rewrite.model", "llama3.1:8b"),
    previewBeforeInsert: cfg.get<boolean>("previewBeforeInsert", false),
    autoFallbackToCloud: cfg.get<boolean>("autoFallbackToCloud", false),
    noRewriteBehavior: cfg.get<NoRewriteBehavior>(
      "noRewriteBehavior",
      "stt_passthrough"
    ),
    showStatusBarButton: cfg.get<boolean>("showStatusBarButton", true),
    vadEnabled: cfg.get<boolean>("vad.enabled", true),
    vadSilenceMs: cfg.get<number>("vad.silenceMs", 900),
    vadMinSpeechMs: cfg.get<number>("vad.minSpeechMs", 300)
  };
}

