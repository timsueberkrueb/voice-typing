# Voice Typing — VS Code / Cursor Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/qingy-wu.voice-prompt?label=Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=qingy-wu.voice-prompt)
[![GitHub Release](https://img.shields.io/github/v/release/bread22/voice-typing)](https://github.com/bread22/voice-typing/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Speak into your microphone, get a clean coding prompt inserted into your editor. Everything runs locally — no cloud services required.

**Flow:** Mic → whisper.cpp (local STT) → Ollama (local LLM rewrite) → Insert into editor

**Platforms:** macOS · Linux · Windows — works in both **VS Code** and **Cursor**

## Install

**From Marketplace:** [Voice Typing on VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qingy-wu.voice-prompt)

**Or from VSIX:** Download the latest `.vsix` from [GitHub Releases](https://github.com/bread22/voice-typing/releases), then in VS Code/Cursor: `Cmd+Shift+P` → "Install from VSIX"

---

## Quick Start (macOS)

```bash
brew install whisper-cpp sox       # STT engine + audio recorder
brew install ollama                # optional: LLM rewrite
ollama pull llama3.2:3b            # optional: pull rewrite model
```

Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qingy-wu.voice-prompt), or build from source:

```bash
git clone https://github.com/bread22/voice-typing.git
cd voice-typing && npm install && npm run package
# Then: Cmd+Shift+P → "Install from VSIX" → select voice-prompt-*.vsix
```

Press **Option+V** to start recording. The whisper model (~75 MB) downloads automatically on first use.

---

## Cross-Platform Installation

### Step 1: Install whisper-cpp (speech-to-text engine)

<details>
<summary><strong>macOS</strong></summary>

```bash
brew install whisper-cpp
```

Installs the `whisper-cli` binary to your PATH. Verify with:

```bash
whisper-cli --help
```

</details>

<details>
<summary><strong>Linux (Ubuntu / Debian)</strong></summary>

**Option A — Build from source (recommended):**

```bash
sudo apt install build-essential libsdl2-dev
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build --config Release
sudo cp build/bin/whisper-cli /usr/local/bin/
```

**Option B — Download pre-built binary:**

Download from [whisper.cpp releases](https://github.com/ggerganov/whisper.cpp/releases), extract, and place `whisper-cli` somewhere in your PATH.

Verify with:

```bash
whisper-cli --help
```

</details>

<details>
<summary><strong>Windows</strong></summary>

**Option A — Build with CMake + Visual Studio:**

```powershell
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build --config Release
```

The binary will be at `build\bin\Release\whisper-cli.exe`. Add it to your PATH or set `voicePrompt.stt.whisperCppPath` in settings.

**Option B — Download pre-built binary:**

Download from [whisper.cpp releases](https://github.com/ggerganov/whisper.cpp/releases). Place `whisper-cli.exe` in a directory on your PATH.

Verify with:

```powershell
whisper-cli.exe --help
```

</details>

### Step 2: Install an audio recorder

The extension auto-detects the best available recorder for your platform:

| Platform | Recommended                     | Install                                            |
| -------- | ------------------------------- | -------------------------------------------------- |
| macOS    | **SoX** (auto-detected first)  | `brew install sox`                                 |
| Linux    | **arecord** (usually built-in) | `sudo apt install alsa-utils` (if not present)     |
| Windows  | **FFmpeg**                      | `winget install ffmpeg` or [ffmpeg.org](https://ffmpeg.org/download.html) |

**Detection priority:**

| Platform | Tries in order              |
| -------- | --------------------------- |
| macOS    | SoX → FFmpeg               |
| Linux    | arecord → SoX → FFmpeg    |
| Windows  | FFmpeg → SoX              |

If no recorder is found, the extension shows the appropriate install command.

### Step 3: Install Ollama (optional — LLM rewrite)

Ollama rewrites your raw voice transcript into a clean, structured prompt. Without it, the raw transcript is inserted directly (still useful!).

<details>
<summary><strong>macOS</strong></summary>

```bash
brew install ollama
ollama pull llama3.2:3b
```

Ollama starts automatically via Homebrew services. Verify: `curl http://127.0.0.1:11434`

</details>

<details>
<summary><strong>Linux</strong></summary>

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:3b
```

Start the server: `ollama serve` (or configure as a systemd service).

</details>

<details>
<summary><strong>Windows</strong></summary>

Download from [ollama.com](https://ollama.com/download/windows) and install. Then:

```powershell
ollama pull llama3.2:3b
```

</details>

### Step 4: Install the extension

```bash
git clone https://github.com/bread22/voice-typing.git
cd voice-typing
npm install
npm run package
```

This creates a `voice-prompt-*.vsix` file. Install it:

- **VS Code:** `Ctrl+Shift+P` → **"Extensions: Install from VSIX..."** → select the file
- **Cursor:** `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Win/Linux) → **"Extensions: Install from VSIX..."** → select the file

Reload the editor when prompted.

### Step 5: First run

1. Press **Alt+V** (or **Option+V** on Mac)
2. On first use, the whisper model (`ggml-tiny.en.bin`, ~75 MB) downloads automatically
3. Grant microphone access if prompted by your OS
4. Speak naturally — the extension auto-stops when you pause

---

## Usage

### Start recording

| Method               | Shortcut / Action                                         |
| -------------------- | --------------------------------------------------------- |
| **Keyboard**         | `Alt+V` (Windows/Linux) · `Option+V` (Mac)              |
| **Command palette**  | `Ctrl+Shift+P` → **Voice Prompt: Start Recording**      |
| **Status bar**       | Click the **$(mic) Voice Prompt** button (bottom bar)    |

### Recording flow

1. **Press shortcut** → status bar shows "Recording..."
2. **Speak naturally** — e.g. *"add a function that validates email addresses using regex"*
3. **Pause speaking** → silence detection (VAD) auto-stops recording
4. **Status bar progress:** Listening → Transcribing → Rewriting → Done
5. **Result inserted** at your cursor position (cursor moves to end, space appended)

### Example

**You say:**

> "um so I need a function that uh validates email addresses and it should use regex and return true or false"

**Gets inserted as:**

> Add a function that validates email addresses using regex. It should return true for valid emails and false otherwise.

### Without Ollama (no rewrite)

If Ollama isn't running, the raw transcript is inserted directly. You can also disable rewrite explicitly by setting `voicePrompt.rewrite.provider` to `none`.

---

## Settings Reference

Open settings (`Ctrl+,`) and search for `voicePrompt`.

### Speech-to-Text

| Setting                          | Default                            | Description                                        |
| -------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `voicePrompt.stt.provider`       | `whisper-cpp`                      | `whisper-cpp` (local CLI) or `http` (custom server)|
| `voicePrompt.stt.model`          | `tiny.en`                          | Model size: `tiny.en`, `base.en`, `small.en`, etc. |
| `voicePrompt.stt.whisperCppPath` | *(auto-detect)*                    | Custom path to `whisper-cli` binary                |
| `voicePrompt.stt.modelPath`      | *(auto-download)*                  | Custom path to GGML model file                     |
| `voicePrompt.stt.httpEndpoint`   | `http://127.0.0.1:8765/transcribe`| HTTP endpoint (when provider is `http`)            |
| `voicePrompt.stt.timeoutMs`      | `30000`                            | STT timeout in milliseconds                        |
| `voicePrompt.stt.language`       | `en`                               | Language code for speech recognition               |

**Model sizes (auto-downloaded):**

| Model      | Size   | Speed   | Accuracy |
| ---------- | ------ | ------- | -------- |
| `tiny.en`  | ~75 MB | Fastest | Good for commands and short prompts |
| `base.en`  | ~142 MB| Fast    | Better accuracy                     |
| `small.en` | ~466 MB| Moderate| Best accuracy for English           |

### Rewrite (LLM)

| Setting                             | Default                                      | Description                                    |
| ----------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `voicePrompt.rewrite.provider`      | `ollama`                                     | `ollama`, `cloud`, or `none`                   |
| `voicePrompt.rewrite.model`         | `llama3.2:3b`                                | LLM model for rewriting                        |
| `voicePrompt.rewrite.ollamaBaseUrl` | `http://127.0.0.1:11434`                     | Ollama server URL                              |
| `voicePrompt.rewrite.cloudBaseUrl`  | `https://api.openai.com/v1/chat/completions` | Cloud API endpoint (OpenAI-compatible)         |
| `voicePrompt.rewrite.timeoutMs`     | `20000`                                      | Rewrite timeout in milliseconds                |
| `voicePrompt.rewrite.style`         | `engineering`                                | `concise`, `detailed`, `engineering`, `debugging` |

### Behavior

| Setting                             | Default           | Description                                                              |
| ----------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| `voicePrompt.previewBeforeInsert`   | `false`           | Show editable preview before inserting                                   |
| `voicePrompt.autoFallbackToCloud`   | `false`           | Auto-fallback to cloud if local rewrite fails                            |
| `voicePrompt.noRewriteBehavior`     | `stt_passthrough` | `stt_passthrough` = insert raw text · `disable_plugin` = block insertion |
| `voicePrompt.showStatusBarButton`   | `true`            | Show mic button in status bar                                            |
| `voicePrompt.insertTrailingSpace`   | `true`            | Append space after each insertion for easier consecutive inputs          |

### Voice Activity Detection (VAD)

| Setting                       | Default | Range       | Description                            |
| ----------------------------- | ------- | ----------- | -------------------------------------- |
| `voicePrompt.vad.enabled`     | `true`  | —           | Auto-stop recording after silence      |
| `voicePrompt.vad.silenceMs`   | `1500`  | 600–3000 ms | Silence window before auto-stop        |
| `voicePrompt.vad.minSpeechMs` | `300`   | 100–1000 ms | Minimum speech duration to accept      |

**VAD tuning tips:**

- **Getting cut off mid-sentence?** Increase `silenceMs` by 100–200 ms
- **Feels slow to respond?** Decrease `silenceMs` by 100 ms
- **Ambient noise triggering?** Increase `minSpeechMs` to 400–500 ms

---

## Cloud Rewrite (Optional)

Use OpenAI or another cloud LLM instead of (or as fallback to) local Ollama:

1. **Set API key:** `Ctrl+Shift+P` → **Voice Prompt: Set Cloud API Key** (stored securely in VS Code SecretStorage)
2. **Switch provider:** Set `voicePrompt.rewrite.provider` to `cloud`
3. **Or use as fallback:** Keep `ollama` as provider, enable `voicePrompt.autoFallbackToCloud`

---

## Troubleshooting

| Problem                                  | Solution                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| **"whisper-cpp not found"**              | Install whisper-cpp (see platform instructions above)                    |
| **"No audio recorder found"**            | Install SoX, arecord, or FFmpeg (see Step 2 above)                      |
| **"Transcription failed"**               | Check that `whisper-cli` works: `whisper-cli -m <model> -f test.wav`    |
| **Model download fails**                 | Set `voicePrompt.stt.modelPath` to a manually downloaded `.bin` file     |
| **Ollama not rewriting**                 | Check `ollama ps` — model should be loaded. Try `ollama run llama3.2:3b`|
| **Cursor position jumps on insert**      | Ensure `voicePrompt.insertTrailingSpace` is `true` (default)            |
| **VAD cuts off too early**               | Increase `voicePrompt.vad.silenceMs` (try 2000–2500)                    |
| **Extension not responding to hotkey**   | Reload window: `Ctrl+Shift+P` → "Developer: Reload Window"             |
| **Microphone permission denied (macOS)** | System Preferences → Privacy & Security → Microphone → allow VS Code/Cursor |

---

## Architecture

```
┌─────────────┐    ┌──────────┐    ┌─────────────┐    ┌───────────┐    ┌─────────┐
│  Microphone  │ →  │ Platform │ →  │ whisper-cpp │ →  │  Ollama   │ →  │ Editor  │
│  (Alt+V)     │    │ Recorder │    │ (local STT) │    │ (rewrite) │    │ Insert  │
└─────────────┘    │ WAV file │    │ Raw text    │    │ Clean text│    │ @ cursor│
                   └──────────┘    └─────────────┘    └───────────┘    └─────────┘
```

All processing happens locally on your machine. No audio or text is sent to any cloud service unless you explicitly configure a cloud rewrite provider.

### Project Structure

```
src/
  extension.ts           — command registration and activation
  audio/
    audioCaptureService  — cross-platform mic capture (SoX / arecord / FFmpeg) + VAD
  stt/
    whisperCppSttProvider — shells out to whisper-cli binary
    httpSttProvider        — HTTP STT for custom servers (opt-in)
    modelManager           — auto-downloads GGML models from HuggingFace
  rewrite/
    ollamaRewriteProvider  — local Ollama LLM rewrite
    cloudRewriteProvider   — cloud LLM rewrite (OpenAI-compatible)
  inject/
    cursorInputInjector    — inserts text at cursor, manages position
  config/
    settings               — reads VS Code configuration
    secrets                — manages API keys via SecretStorage
  types/
    contracts              — shared TypeScript interfaces
  orchestration/
    voicePromptOrchestrator — pipeline: record → transcribe → rewrite → inject
```

---

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript
npm run bundle:dev   # esbuild development bundle (with source maps)
npm run bundle       # esbuild production bundle (minified)
npm run package      # create .vsix for distribution
npm run dev          # build + package dev vsix
npm run watch        # watch mode for development
```

Press **F5** in VS Code/Cursor to launch the Extension Development Host with the debugger attached.

---

## License

MIT
