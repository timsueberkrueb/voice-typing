# Voice Prompt Plugin Implementation Plan

This plan is derived from `CLAUDE.md` and is organized into commit-sized milestones.

## Milestone 1 - Project bootstrap and extension skeleton

- [ ] Create TypeScript VS Code/Cursor extension scaffold
- [ ] Add required folder layout:
  - `src/extension.ts`
  - `src/audio/`
  - `src/stt/`
  - `src/rewrite/`
  - `src/inject/`
  - `src/config/`
  - `src/types/`
  - `test/`
- [ ] Register command `Voice Prompt: Start Recording`
- [ ] Add keybinding and status bar entry point

## Milestone 2 - Core contracts, config, and orchestration path

- [ ] Define provider contracts:
  - `ISttProvider.transcribe(audio)`
  - `IRewriteProvider.rewrite(input)`
  - `IInputInjector.insert(text)`
- [ ] Implement config defaults from requirements:
  - `voicePrompt.vad.enabled=true`
  - `voicePrompt.vad.silenceMs=900`
  - `voicePrompt.vad.minSpeechMs=300`
  - `voicePrompt.showStatusBarButton=true`
  - `voicePrompt.noRewriteBehavior=stt_passthrough`
  - `voicePrompt.previewBeforeInsert=false`
- [ ] Wire command flow:
  - capture -> STT -> rewrite -> optional preview -> inject

## Milestone 3 - Local providers (MVP path)

- [ ] Implement `AudioCaptureService` with press-to-start flow
- [ ] Implement local STT adapter interface with pluggable backend hook
- [ ] Implement `OllamaRewriteProvider` using required rewrite instruction
- [ ] Implement `CursorInputInjector` with extension command based insert
- [ ] Ensure fallback behavior to STT passthrough when rewrite fails

## Milestone 4 - Reliability, cloud fallback, and UX rules

- [ ] Add cloud rewrite adapter and secret-backed API key retrieval
- [ ] Add timeout handling for STT/rewrite
- [ ] Add no-backend handling and one-time warning behavior
- [ ] Add injection-failure fallback (clipboard + notification)
- [ ] Keep logging minimal and avoid transcript/audio persistence by default

## Milestone 5 - Tests and docs

- [ ] Add unit tests for orchestration and fallback policies
- [ ] Add provider tests (local/cloud rewrite routing)
- [ ] Add README usage and setup notes
- [ ] Validate against MVP acceptance criteria checklist

## Commit strategy

1. `docs: add implementation plan from requirements`
2. `feat: scaffold cursor voice prompt extension`
3. `feat: add core contracts config and orchestrator`
4. `feat: implement local stt rewrite and injection pipeline`
5. `feat: add cloud fallback timeout and reliability handling`
6. `test: add orchestration and provider tests`

