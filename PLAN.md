# Voice Prompt Plugin Implementation Plan

This plan is derived from `CLAUDE.md` and is organized into commit-sized milestones.

## Milestone 1 - Project bootstrap and extension skeleton

- [x] Create TypeScript VS Code/Cursor extension scaffold
- [x] Add required folder layout:
  - `src/extension.ts`
  - `src/audio/`
  - `src/stt/`
  - `src/rewrite/`
  - `src/inject/`
  - `src/config/`
  - `src/types/`
  - `test/`
- [x] Register command `Voice Prompt: Start Recording`
- [x] Add keybinding and status bar entry point

## Milestone 2 - Core contracts, config, and orchestration path

- [x] Define provider contracts:
  - `ISttProvider.transcribe(audio)`
  - `IRewriteProvider.rewrite(input)`
  - `IInputInjector.insert(text)`
- [x] Implement config defaults from requirements:
  - `voicePrompt.vad.enabled=true`
  - `voicePrompt.vad.silenceMs=900`
  - `voicePrompt.vad.minSpeechMs=300`
  - `voicePrompt.showStatusBarButton=true`
  - `voicePrompt.noRewriteBehavior=stt_passthrough`
  - `voicePrompt.previewBeforeInsert=false`
- [x] Wire command flow:
  - capture -> STT -> rewrite -> optional preview -> inject

## Milestone 3 - Local providers (MVP path)

- [x] Implement `AudioCaptureService` with SoX-based mic capture and VAD auto-end
- [x] Implement local STT adapter (HTTP POST to faster-whisper sidecar)
- [x] Implement `OllamaRewriteProvider` using required rewrite instruction
- [x] Implement `CursorInputInjector` with editor insert + clipboard fallback
- [x] Ensure fallback behavior to STT passthrough when rewrite fails

## Milestone 4 - Reliability, cloud fallback, and UX rules

- [x] Add cloud rewrite adapter and secret-backed API key retrieval
- [x] Add timeout handling for STT/rewrite
- [x] Add no-backend handling and one-time warning behavior
- [x] Add injection-failure fallback (clipboard + notification)
- [x] Keep logging minimal and avoid transcript/audio persistence by default

## Milestone 5 - STT sidecar and packaging

- [x] Add faster-whisper Python STT server (`stt-server/`)
- [x] Add esbuild production bundler
- [x] Add VSIX packaging support (`npm run package`)

## Milestone 6 - Tests and docs

- [x] Add 28 comprehensive tests (config, modules, provider contracts, sidecar)
- [x] Add README with install, setup, and usage instructions for Cursor
- [x] Validate against MVP acceptance criteria

## MVP Acceptance Criteria (from CLAUDE.md)

- [x] User can trigger mic capture from command palette or keybinding
- [x] Spoken input is transcribed locally into raw text
- [x] Raw transcript is rewritten by local Ollama into a cleaner prompt
- [x] Final prompt is inserted into active Cursor input/editor target
- [x] If rewrite provider fails, user still gets usable raw transcript output
- [x] Cloud provider can be configured with API key and used as fallback

## Commit history

1. `chore: initialize repository with project requirements`
2. `docs: add implementation plan from requirements`
3. `feat: scaffold cursor voice prompt extension`
4. `feat: add core contracts config and orchestrator`
5. `feat: implement local stt rewrite and injection pipeline`
6. `feat: add cloud fallback timeout and reliability handling`
7. `test: add baseline verification tests and usage docs`
8. `feat: implement real audio capture, STT sidecar, and esbuild packaging`
9. `docs: finalize README with Cursor install and usage instructions`
