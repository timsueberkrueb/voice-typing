# Voice Prompt — VS Code / Cursor Extension

Speak into your microphone, get a clean coding prompt inserted into your editor. The extension captures voice, transcribes it locally via whisper.cpp, rewrites the raw transcript into a polished prompt via LLM, and inserts it at your cursor position.

**Flow:** Mic → whisper.cpp (local STT) → Ollama (local LLM rewrite) → Insert into editor

**Platforms:** macOS, Linux, Windows — VS Code and Cursor

---

## Quick Start

```bash
# 1. Install whisper-cpp (speech-to-text)
brew install whisper-cpp          # macOS
# sudo apt install whisper-cpp    # Linux (or build from source)
# winget install whisper-cpp      # Windows (or download from GitHub releases)

# 2. Install Ollama (optional, for LLM rewrite)
brew install ollama               # macOS (or see ollama.com)
ollama pull llama3.2:3b

# 3. Install the extension
cd voice-typing
npm install
npm run package
# Then in VS Code/Cursor: Cmd+Shift+P → "Install from VSIX" → select the .vsix file
```

The whisper model (`ggml-tiny.en.bin`, ~75MB) is auto-downloaded on first use — no manual setup needed.

---

## Prerequisites

| Dependency            | Purpose                  | Install                                                                                    |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| **whisper-cpp**       | Local speech-to-text     | `brew install whisper-cpp` (macOS) / build from [source](https://github.com/ggerganov/whisper.cpp) |
| **Audio recorder**    | Microphone capture       | SoX (`brew install sox`), arecord (Linux, usually pre-installed), or FFmpeg                |
| **Ollama** (optional) | Local LLM rewrite        | [ollama.com](https://ollama.com/) — then `ollama pull llama3.2:3b`                        |

### Audio recorder auto-detection

The extension automatically finds the best available audio recorder:

| Platform | Priority order                        |
| -------- | ------------------------------------- |
| macOS    | SoX → FFmpeg                         |
| Linux    | arecord (ALSA) → SoX → FFmpeg       |
| Windows  | FFmpeg → SoX                         |

If none is found, you'll get a message with the install command for your platform.

---

## Installation

### Option A — Install from VSIX (recommended)

```bash
git clone https://github.com/bread22/voice-typing.git
cd voice-typing
npm install
npm run package
```

Then in VS Code or Cursor: `Cmd+Shift+P` → **"Install from VSIX"** → select the generated `.vsix` file.

### Option B — Development mode

```bash
git clone https://github.com/bread22/voice-typing.git
cd voice-typing
npm install
npm run bundle:dev
```

Open in VS Code/Cursor and press **F5** to launch the Extension Development Host.

---

## Usage

### Start recording

- **Keyboard shortcut:** `Alt+V` (Option+V on Mac)
- **Command palette:** `Cmd+Shift+P` → **Voice Prompt: Start Recording**
- **Status bar button:** Click the microphone button in the bottom bar

### Recording flow

1. Press the shortcut or button — recording starts immediately
2. Speak your prompt naturally
3. Stop speaking — silence detection (VAD) auto-stops recording
4. Status bar shows: **Listening...** → **Transcribing...** → **Rewriting...**
5. The final prompt is inserted at your cursor position (cursor stays at the end)

### What gets inserted

Your spoken input:

> "um so I need a function that uh validates email addresses and it should use regex and return true or false"

Gets rewritten to:

> Add a function that validates email addresses using regex. It should return true for valid emails and false otherwise.

---

## Settings Reference

Open settings and search for `voicePrompt` to see all options.

### Speech-to-Text

| Setting                           | Default                            | Description                                    |
| --------------------------------- | ---------------------------------- | ---------------------------------------------- |
| `voicePrompt.stt.provider`        | `whisper-cpp`                      | `whisper-cpp` (local) or `http` (custom server)|
| `voicePrompt.stt.model`           | `tiny.en`                          | Whisper model size (auto-downloaded)           |
| `voicePrompt.stt.whisperCppPath`  | (auto-detect)                      | Path to whisper-cli binary                     |
| `voicePrompt.stt.modelPath`       | (auto-download)                    | Path to GGML model file                        |
| `voicePrompt.stt.httpEndpoint`    | `http://127.0.0.1:8765/transcribe` | HTTP endpoint (when provider is `http`)       |
| `voicePrompt.stt.timeoutMs`       | `30000`                            | STT timeout (ms)                               |
| `voicePrompt.stt.language`        | `en`                               | Speech recognition language                    |

### Rewrite

| Setting                             | Default                                      | Description                                                     |
| ----------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `voicePrompt.rewrite.provider`      | `ollama`                                     | `ollama`, `cloud`, or `none`                                    |
| `voicePrompt.rewrite.model`         | `llama3.2:3b`                                | LLM model for rewriting                                        |
| `voicePrompt.rewrite.ollamaBaseUrl` | `http://127.0.0.1:11434`                     | Ollama server URL                                               |
| `voicePrompt.rewrite.cloudBaseUrl`  | `https://api.openai.com/v1/chat/completions` | Cloud API endpoint                                              |
| `voicePrompt.rewrite.timeoutMs`     | `20000`                                      | Rewrite timeout (ms)                                            |
| `voicePrompt.rewrite.style`         | `engineering`                                | `concise`, `detailed`, `engineering`, `debugging`               |

### Behavior

| Setting                             | Default           | Description                                                              |
| ----------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| `voicePrompt.previewBeforeInsert`   | `false`           | Show editable preview before inserting                                   |
| `voicePrompt.autoFallbackToCloud`   | `false`           | Auto-fallback to cloud if local rewrite fails                            |
| `voicePrompt.noRewriteBehavior`     | `stt_passthrough` | `stt_passthrough` inserts raw text, `disable_plugin` blocks insertion    |
| `voicePrompt.showStatusBarButton`   | `true`            | Show mic button in status bar                                            |
| `voicePrompt.insertTrailingSpace`   | `true`            | Append space after insertion for easier consecutive inputs               |

### Voice Activity Detection (VAD)

| Setting                       | Default | Description                                         |
| ----------------------------- | ------- | --------------------------------------------------- |
| `voicePrompt.vad.enabled`     | `true`  | Auto-stop recording after silence                   |
| `voicePrompt.vad.silenceMs`   | `1500`  | Silence duration to trigger auto-stop (600–3000 ms) |
| `voicePrompt.vad.minSpeechMs` | `300`   | Minimum speech duration to accept (100–1000 ms)     |

**VAD tuning tips:**

- Getting cut off mid-sentence? Increase `silenceMs` by 100 ms
- Feels slow to respond? Decrease `silenceMs` by 100 ms
- Ambient noise triggering recordings? Increase `minSpeechMs` to 500 ms

---

## Cloud Rewrite (Optional)

If you prefer using OpenAI or another cloud LLM instead of local Ollama:

1. **Set your API key:** `Cmd+Shift+P` → **Voice Prompt: Set Cloud API Key**
2. **Switch provider:** Set `voicePrompt.rewrite.provider` to `cloud`
3. **Or use as automatic fallback:** Keep provider as `ollama`, enable `voicePrompt.autoFallbackToCloud`

---

## HTTP STT Server (Optional)

If you prefer running your own STT server instead of whisper-cpp CLI:

1. Set `voicePrompt.stt.provider` to `http`
2. Start your server (the included `stt-server/` uses faster-whisper):

```bash
cd stt-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

The server starts on `http://127.0.0.1:8765`.

---

## Error Handling

| Scenario                       | Behavior                                              |
| ------------------------------ | ----------------------------------------------------- |
| **whisper-cpp not found**      | Error with platform-specific install instructions     |
| **No audio recorder**          | Error with install instructions for your platform     |
| **Transcription failed**       | "Transcription failed" with Retry button              |
| **Ollama not running**         | Falls back to raw transcript (or cloud if configured) |
| **No active editor**           | Copies prompt to clipboard with paste guidance        |

---

## Architecture

```
Mic (platform recorder) → WAV file → whisper-cpp (local STT) → Raw text
  → Ollama/Cloud LLM → Clean prompt → Insert into editor
```

### Project Structure

```
src/
  extension.ts         — command registration and activation
  audio/               — cross-platform microphone capture with VAD
  stt/                 — STT providers (whisper-cpp CLI, HTTP)
  rewrite/             — LLM rewrite providers (Ollama, Cloud)
  inject/              — text insertion into editor
  config/              — settings and secret management
  types/               — shared TypeScript interfaces
  orchestration/       — pipeline controller
stt-server/            — optional Python STT server (faster-whisper)
```

---

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript
npm run bundle:dev   # esbuild development bundle
npm run bundle       # esbuild production bundle
npm run package      # create .vsix for distribution
npm run dev          # build + package dev vsix
npm run watch        # watch mode for development
```

Press **F5** in VS Code/Cursor to launch the Extension Development Host.

---

## License

MIT
