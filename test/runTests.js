const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");

// Provide a minimal vscode mock so dist modules can be required outside VS Code
const vscodeMock = {
  window: {
    showInputBox: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    setStatusBarMessage: () => ({ dispose() {} }),
    createStatusBarItem: () => ({
      show() {},
      dispose() {},
      text: "",
      tooltip: "",
      command: "",
      name: "",
      backgroundColor: undefined
    }),
    activeTextEditor: undefined
  },
  workspace: {
    getConfiguration: () => ({
      get: (_key, defaultVal) => defaultVal
    })
  },
  commands: {
    executeCommand: async () => undefined,
    registerCommand: () => ({ dispose() {} })
  },
  env: {
    clipboard: { writeText: async () => undefined }
  },
  StatusBarAlignment: { Right: 2 },
  ThemeColor: class ThemeColor { constructor() {} },
  SecretStorage: class SecretStorage {}
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "vscode") {
    return "vscode";
  }
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache["vscode"] = {
  id: "vscode",
  filename: "vscode",
  loaded: true,
  exports: vscodeMock
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  PASS  ${name}\n`);
  } catch (err) {
    failed++;
    process.stderr.write(`  FAIL  ${name}\n    ${err.message}\n`);
  }
}

function loadPackageJson() {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
  );
}

function loadDistModule(relativePath) {
  return require(path.join(__dirname, "..", "dist", relativePath));
}

function run() {
  process.stdout.write("\n=== Voice Prompt Extension Tests ===\n\n");

  const pkg = loadPackageJson();
  const props = pkg.contributes?.configuration?.properties ?? {};
  const commands = pkg.contributes?.commands ?? [];

  // --- Package.json manifest tests ---

  test("has startRecording command", () => {
    assert.ok(commands.some((c) => c.command === "voicePrompt.startRecording"));
  });

  test("does not expose setCloudApiKey command", () => {
    assert.ok(!commands.some((c) => c.command === "voicePrompt.setCloudApiKey"));
  });

  test("has keybinding for startRecording", () => {
    const kb = pkg.contributes?.keybindings ?? [];
    assert.ok(kb.some((k) => k.command === "voicePrompt.startRecording"));
  });

  test("vad.enabled defaults to true", () => {
    assert.equal(props["voicePrompt.vad.enabled"]?.default, true);
  });

  test("vad.silenceMs defaults to 1500", () => {
    assert.equal(props["voicePrompt.vad.silenceMs"]?.default, 1500);
  });

  test("vad.minSpeechMs defaults to 300", () => {
    assert.equal(props["voicePrompt.vad.minSpeechMs"]?.default, 300);
  });

  test("showStatusBarButton defaults to true", () => {
    assert.equal(props["voicePrompt.showStatusBarButton"]?.default, true);
  });

  test("previewBeforeInsert defaults to false", () => {
    assert.equal(props["voicePrompt.previewBeforeInsert"]?.default, false);
  });

  test("command.provider default is none", () => {
    assert.equal(props["voicePrompt.command.provider"]?.default, "none");
  });

  test("command.provider supports chatgpt mode", () => {
    const enumValues = props["voicePrompt.command.provider"]?.enum ?? [];
    assert.ok(enumValues.includes("chatgpt"));
    assert.ok(!enumValues.includes("cloud"));
  });

  test("stt.provider default is whisper-cpp", () => {
    assert.equal(props["voicePrompt.stt.provider"]?.default, "whisper-cpp");
  });

  test("command.chatgptModel default is gpt-5-codex-mini", () => {
    assert.equal(props["voicePrompt.command.chatgptModel"]?.default, "gpt-5-codex-mini");
  });

  test("command.timeoutMs defaults to 20000", () => {
    assert.equal(props["voicePrompt.command.timeoutMs"]?.default, 20000);
  });

  test("command.chatgptBaseUrl default is codex endpoint", () => {
    assert.equal(
      props["voicePrompt.command.chatgptBaseUrl"]?.default,
      "https://chatgpt.com/backend-api/codex/responses"
    );
  });

  // --- Source module structure tests ---

  test("dist/extension.js exists and exports activate", () => {
    const ext = loadDistModule("extension");
    assert.equal(typeof ext.activate, "function");
    assert.equal(typeof ext.deactivate, "function");
  });

  test("dist/types/contracts.js exists", () => {
    const contracts = loadDistModule("types/contracts");
    assert.ok(contracts);
  });

  test("dist/config/settings.js exports readSettings", () => {
    const settings = loadDistModule("config/settings");
    assert.equal(typeof settings.readSettings, "function");
  });

  test("dist/audio/audioCaptureService.js exports AudioCaptureService", () => {
    const audio = loadDistModule("audio/audioCaptureService");
    assert.equal(typeof audio.AudioCaptureService, "function");
  });

  test("dist/stt/whisperCppSttProvider.js exports WhisperCppSttProvider", () => {
    const stt = loadDistModule("stt/whisperCppSttProvider");
    assert.equal(typeof stt.WhisperCppSttProvider, "function");
  });

  test("dist/intent/cloudCommandLayer.js exports CloudCommandLayer", () => {
    const layer = loadDistModule("intent/cloudCommandLayer");
    assert.equal(typeof layer.CloudCommandLayer, "function");
  });

  test("dist/inject/cursorInputInjector.js exports CursorInputInjector", () => {
    const inject = loadDistModule("inject/cursorInputInjector");
    assert.equal(typeof inject.CursorInputInjector, "function");
  });

  test("dist/orchestration/voicePromptOrchestrator.js exports VoicePromptOrchestrator", () => {
    const orch = loadDistModule("orchestration/voicePromptOrchestrator");
    assert.equal(typeof orch.VoicePromptOrchestrator, "function");
  });

  // --- Provider contract interface tests ---

  test("WhisperCppSttProvider implements transcribe method", () => {
    const { WhisperCppSttProvider } = loadDistModule("stt/whisperCppSttProvider");
    const provider = new WhisperCppSttProvider({
      binaryPath: "whisper-cpp",
      modelPath: "/tmp/model.ggml",
      language: "en",
      timeoutMs: 1000
    });
    assert.equal(typeof provider.transcribe, "function");
  });

  test("HttpSttProvider implements transcribe method", () => {
    const { HttpSttProvider } = loadDistModule("stt/httpSttProvider");
    const provider = new HttpSttProvider({
      endpoint: "http://127.0.0.1:0/test",
      timeoutMs: 1000
    });
    assert.equal(typeof provider.transcribe, "function");
  });

  test("CloudCommandLayer implements route method", () => {
    const { CloudCommandLayer } = loadDistModule("intent/cloudCommandLayer");
    const layer = new CloudCommandLayer({
      apiUrl: "http://127.0.0.1:0",
      model: "test",
      bearerToken: "test-key",
      timeoutMs: 1000
    });
    assert.equal(typeof layer.route, "function");
  });

  // --- Summary ---

  process.stdout.write(`\n${passed} passed, ${failed} failed\n\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

run();
