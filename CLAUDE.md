# Voice Prompt — VS Code / Cursor Extension

## Product Goal

A VS Code/Cursor extension that captures microphone speech, transcribes it locally, rewrites the transcript into a clean prompt via LLM, and inserts it into the active editor or chat input. Everything runs locally by default.

**Flow:** Wake word (`openWakeWord`) or hotkey → whisper.cpp (local STT) → Ollama (local LLM rewrite) → Insert at cursor

**Platforms:** macOS, Linux, Windows — VS Code and Cursor

## Architecture

```
┌──────────┐    ┌──────────┐    ┌─────────────┐    ┌───────────┐    ┌─────────┐
│ Hotkey   │ →  │ Platform │ →  │ whisper-cpp │ →  │  Ollama   │ →  │ Editor  │
│ (Alt+V)  │    │ Recorder │    │ (local STT) │    │ (rewrite) │    │ Insert  │
└──────────┘    │ WAV file │    │ Raw text    │    │ Clean text│    │ @ cursor│
                └──────────┘    └─────────────┘    └───────────┘    └─────────┘
```

## Tech Stack

- **Runtime:** TypeScript + Node.js 20+, VS Code Extension API
- **Build:** esbuild (bundler), tsc (type checking)
- **Audio capture:** Platform-auto-detected — SoX (macOS/Linux), arecord (Linux ALSA), FFmpeg (Windows)
- **STT:** whisper.cpp CLI (`whisper-cli` binary) — no Python, no HTTP server
- **Model:** GGML format, auto-downloaded to `context.globalStorageUri` on first use
- **LLM rewrite:** Ollama HTTP API (local, default) or cloud API (opt-in)
- **Packaging:** `@vscode/vsce` for `.vsix` distribution

## Project Layout

```
src/
  extension.ts                  — command registration, provider wiring, activation
  audio/
    audioCaptureService.ts      — cross-platform mic capture (SoX/arecord/FFmpeg) + VAD
  stt/
    whisperCppSttProvider.ts    — shells out to whisper-cli binary (default STT)
    httpSttProvider.ts          — HTTP STT for custom servers (opt-in)
    modelManager.ts             — auto-downloads GGML models from HuggingFace
  wakeword/
    openWakeWordService.ts      — background wake-word listener process (openWakeWord)
  rewrite/
    ollamaRewriteProvider.ts    — local Ollama /api/chat with few-shot examples
    cloudRewriteProvider.ts     — OpenAI-compatible cloud rewrite
  inject/
    cursorInputInjector.ts      — inserts text at cursor, positions cursor at end
  config/
    settings.ts                 — reads VS Code configuration
    secrets.ts                  — API keys via SecretStorage
  types/
    contracts.ts                — ISttProvider, IRewriteProvider, IInputInjector interfaces
  orchestration/
    voicePromptOrchestrator.ts  — pipeline: record → transcribe → rewrite → inject
```

## Key Design Decisions

1. **Local-first:** No cloud required. whisper.cpp CLI for STT, Ollama for rewrite. Cloud is opt-in only.
2. **Minimal Python dependency for wake word:** STT is still whisper.cpp CLI; optional wake-word listener uses `openWakeWord` + `sounddevice`.
3. **Cross-platform audio:** Auto-detect recorder per platform instead of hardcoding SoX.
4. **WAV files over pipes:** Record to temp WAV file — simpler, whisper.cpp reads it directly.
5. **Provider abstraction:** `ISttProvider` and `IRewriteProvider` interfaces make engines swappable.
6. **Few-shot rewrite prompt:** Ollama uses `/api/chat` with few-shot examples to prevent LLM commentary in output.
7. **Cursor position:** After insertion, cursor moves to end of text with optional trailing space.

## Settings (key ones)

- `voicePrompt.stt.provider` — `whisper-cpp` (default) or `http`
- `voicePrompt.stt.model` — `tiny.en` (default), `base.en`, `small.en`
- `voicePrompt.rewrite.provider` — `ollama` (default), `cloud`, `none`
- `voicePrompt.rewrite.model` — `llama3.2:3b` (default)
- `voicePrompt.vad.silenceMs` — `1500` (default, range 600–3000)
- `voicePrompt.insertTrailingSpace` — `true` (default)
- `voicePrompt.noRewriteBehavior` — `stt_passthrough` (default) or `disable_plugin`

## Build & Dev

```bash
npm install          # install dependencies
npm run bundle:dev   # esbuild dev bundle (with source maps)
npm run bundle       # esbuild production bundle (minified)
npm run package      # create .vsix for distribution
```

Press **F5** in VS Code/Cursor to launch Extension Development Host.

## Security & Privacy

1. **Local-first processing** — STT and rewrite run on user's machine by default.
2. **No hardcoded credentials** — cloud API keys stored in VS Code `SecretStorage`.
3. **Explicit cloud opt-in** — user must configure cloud provider and set API key.
4. **No audio/transcript logging** — audio files are temp and cleaned up after use.

## Error Handling

- STT fails → retry button, keep last audio capture
- Rewrite fails → fallback to cloud (if enabled) or insert raw transcript (`stt_passthrough`)
- Injection fails → copy to clipboard with paste guidance
- No recorder found → platform-specific install instructions
- No whisper-cpp → install command for their platform
- No LLM backend → one-time warning, raw transcript passthrough

## Activation

- Plugin-owned command + keybinding (`Alt+V`) + status bar button
- Does not intercept or replace Cursor/VS Code built-in voice input
- Recording: press key → speak → VAD auto-stops on silence → transcribe → rewrite → inject
