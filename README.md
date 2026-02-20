# Voice Prompt — Cursor Extension

Speak into your microphone, get a clean coding prompt inserted into Cursor. The extension captures voice, transcribes it locally, rewrites the raw transcript into a polished prompt via LLM, and inserts it into the active editor or chat input.

**Flow:** Mic → Speech-to-Text → LLM Rewrite → Insert into Cursor

---

## Prerequisites

| Dependency | Purpose | Install |
|---|---|---|
| **SoX** | Microphone audio capture | `brew install sox` (macOS) / `apt install sox` (Linux) |
| **Python 3.10+** | Runs the local STT server | [python.org](https://www.python.org/) |
| **Ollama** (optional) | Local LLM rewrite | [ollama.com](https://ollama.com/) — then `ollama pull llama3.1:8b` |

---

## Installation in Cursor

### Option A — Install from VSIX (recommended)

1. **Build the VSIX package:**

```bash
git clone https://github.com/bread22/voice-typing.git
cd voice-typing
npm install
npm run package
```

This creates `voice-prompt-0.0.1.vsix` in the project root.

2. **Install in Cursor:**

   - Open Cursor
   - Press `Cmd+Shift+P` → type **"Install from VSIX"**
   - Select the generated `.vsix` file
   - Reload Cursor when prompted

### Option B — Development mode

1. **Clone and build:**

```bash
git clone https://github.com/bread22/voice-typing.git
cd voice-typing
npm install
npm run build
```

2. **Open in Cursor and press `F5`** to launch the Extension Development Host.

---

## Setting Up the STT Server

The extension sends audio to a local HTTP server for transcription. A ready-to-use faster-whisper server is included.

### Quick start

```bash
cd stt-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

The server starts on `http://127.0.0.1:8765`. On first run it downloads the Whisper `base` model (~140 MB).

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `WHISPER_MODEL` | `base` | Whisper model size (`tiny`, `base`, `small`, `medium`, `large-v3`) |
| `WHISPER_DEVICE` | `auto` | Compute device (`cpu`, `cuda`, `auto`) |

Example with a larger model:

```bash
WHISPER_MODEL=small python server.py
```

### Health check

```bash
curl http://127.0.0.1:8765/health
# {"status": "ok"}
```

---

## Setting Up Ollama (Rewrite Backend)

The extension uses Ollama by default to rewrite messy voice transcripts into clean prompts.

```bash
# Install Ollama
brew install ollama   # or see ollama.com

# Pull a model
ollama pull llama3.1:8b

# Start the server (if not already running)
ollama serve
```

Ollama runs on `http://127.0.0.1:11434` by default, which matches the extension's default setting.

---

## Usage

### Start recording

Use any of these methods:

- **Keyboard shortcut:** `Cmd+Shift+V`
- **Command palette:** `Cmd+Shift+P` → **Voice Prompt: Start Recording**
- **Status bar button:** Click the `$(mic) Voice Prompt` button in the bottom bar

### Recording flow

1. Press the shortcut or button — recording starts immediately
2. Speak your prompt naturally (e.g., *"add a function that validates email addresses using regex"*)
3. Stop speaking — the extension auto-detects silence and stops recording (VAD)
4. The status bar shows progress: **Listening...** → **Transcribing...** → **Rewriting...**
5. The final prompt is inserted at your cursor position

### What gets inserted

Your spoken input like:

> "um so I need a function that uh validates email addresses and it should use regex and return true or false"

Gets rewritten to:

> Add a function that validates email addresses using regex. It should return true for valid emails and false otherwise.

### Preview mode

To review/edit the prompt before insertion, enable preview:

- Open Settings → search `voicePrompt.previewBeforeInsert` → set to `true`

An editable input box will appear before the prompt is inserted.

---

## Cloud Rewrite (Optional)

If you prefer using OpenAI or another cloud LLM instead of local Ollama:

1. **Set your API key securely:**
   - `Cmd+Shift+P` → **Voice Prompt: Set Cloud API Key**
   - Paste your API key (stored in Cursor's SecretStorage, never in plaintext)

2. **Switch provider in settings:**
   - Set `voicePrompt.rewrite.provider` to `cloud`

3. **Or use cloud as automatic fallback:**
   - Keep `voicePrompt.rewrite.provider` as `ollama`
   - Set `voicePrompt.autoFallbackToCloud` to `true`
   - If Ollama is unavailable, the extension automatically uses the cloud API

---

## Settings Reference

Open Cursor settings and search for `voicePrompt` to see all options.

### Speech-to-Text

| Setting | Default | Description |
|---|---|---|
| `voicePrompt.stt.provider` | `local` | STT provider (`local` or `cloud`) |
| `voicePrompt.stt.model` | `faster-whisper-base` | STT model identifier |
| `voicePrompt.stt.localEndpoint` | `http://127.0.0.1:8765/transcribe` | Local STT server URL |
| `voicePrompt.stt.timeoutMs` | `15000` | STT request timeout (ms) |

### Rewrite

| Setting | Default | Description |
|---|---|---|
| `voicePrompt.rewrite.provider` | `ollama` | Rewrite engine: `ollama`, `cloud`, or `none` |
| `voicePrompt.rewrite.model` | `llama3.1:8b` | LLM model to use for rewriting |
| `voicePrompt.rewrite.ollamaBaseUrl` | `http://127.0.0.1:11434` | Ollama server URL |
| `voicePrompt.rewrite.cloudBaseUrl` | `https://api.openai.com/v1/chat/completions` | Cloud API endpoint |
| `voicePrompt.rewrite.timeoutMs` | `20000` | Rewrite request timeout (ms) |
| `voicePrompt.rewrite.style` | `engineering` | Style preset: `concise`, `detailed`, `engineering`, `debugging` |

### Behavior

| Setting | Default | Description |
|---|---|---|
| `voicePrompt.previewBeforeInsert` | `false` | Show editable preview before inserting |
| `voicePrompt.autoFallbackToCloud` | `false` | Auto-fallback to cloud if local rewrite fails |
| `voicePrompt.noRewriteBehavior` | `stt_passthrough` | When no rewrite is available: `stt_passthrough` inserts raw text, `disable_plugin` blocks insertion |
| `voicePrompt.showStatusBarButton` | `true` | Show the mic button in the status bar |

### Voice Activity Detection (VAD)

| Setting | Default | Description |
|---|---|---|
| `voicePrompt.vad.enabled` | `true` | Auto-stop recording after silence |
| `voicePrompt.vad.silenceMs` | `900` | Silence duration to trigger auto-stop (600–1500 ms) |
| `voicePrompt.vad.minSpeechMs` | `300` | Minimum speech duration to accept (100–1000 ms) |

**VAD tuning tips:**
- Getting cut off mid-sentence? Increase `silenceMs` by 100 ms
- Feels slow to respond? Decrease `silenceMs` by 100 ms
- Ambient noise triggering recordings? Increase `minSpeechMs` to 500 ms

---

## Error Handling

| Scenario | Behavior |
|---|---|
| **SoX not installed** | Error message with install instructions |
| **STT server not running** | "Transcription failed" with Retry button |
| **Ollama not running** | Falls back to raw transcript (or cloud if configured) |
| **No active editor** | Copies prompt to clipboard with paste guidance |
| **Cloud API key missing** | Warning to run "Set Cloud API Key" command |

---

## Architecture

```
Mic (SoX) → PCM audio → STT Server (faster-whisper) → Raw text
  → Ollama/Cloud LLM → Clean prompt → Insert into Cursor
```

### Project Structure

```
src/
  extension.ts         — command registration and orchestration
  audio/               — microphone capture with VAD
  stt/                 — speech-to-text provider adapters
  rewrite/             — LLM rewrite provider adapters (Ollama + Cloud)
  inject/              — prompt insertion into Cursor
  config/              — settings and secret management
  types/               — shared TypeScript interfaces
  orchestration/       — pipeline controller
stt-server/
  server.py            — local faster-whisper HTTP server
  requirements.txt     — Python dependencies
test/
  runTests.js          — test suite (28 tests)
```

---

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript
npm test             # build + run tests
npm run bundle       # esbuild production bundle
npm run package      # create .vsix for distribution
npm run watch        # watch mode for development
```

---

## License

MIT
