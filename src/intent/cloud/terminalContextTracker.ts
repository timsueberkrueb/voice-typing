import * as vscode from "vscode";

export class TerminalContextTracker {
  private static instance: TerminalContextTracker | undefined;
  private readonly buffers = new Map<vscode.Terminal, string[]>();
  private started = false;

  static getInstance(): TerminalContextTracker {
    TerminalContextTracker.instance ??= new TerminalContextTracker();
    return TerminalContextTracker.instance;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    const shellExecEvent = (
      vscode.window as unknown as {
        onDidStartTerminalShellExecution?: (
          listener: (event: vscode.TerminalShellExecutionStartEvent) => unknown
        ) => vscode.Disposable;
      }
    ).onDidStartTerminalShellExecution;
    if (typeof shellExecEvent === "function") {
      shellExecEvent((event) => {
        this.appendLine(event.terminal, `$ ${event.execution.commandLine.value}`);
        void this.captureExecutionOutput(event.terminal, event.execution);
      });
    }

    const closeTerminalEvent = (
      vscode.window as unknown as {
        onDidCloseTerminal?: (listener: (terminal: vscode.Terminal) => unknown) => vscode.Disposable;
      }
    ).onDidCloseTerminal;
    if (typeof closeTerminalEvent === "function") {
      closeTerminalEvent((terminal) => {
        this.buffers.delete(terminal);
      });
    }
  }

  recordInsertedCommand(terminal: vscode.Terminal, command: string): void {
    this.appendLine(terminal, `$ ${command}`);
  }

  getActiveTerminalSnapshot(maxLines: number): Record<string, unknown> {
    const terminal = vscode.window.activeTerminal;
    if (!terminal) {
      return { available: false, reason: "No active terminal." };
    }

    const lines = this.buffers.get(terminal) ?? [];
    return {
      available: true,
      name: terminal.name,
      lineCount: lines.length,
      lines: lines.slice(-maxLines),
      source: lines.length > 0 ? "shell_integration_stream" : "none"
    };
  }

  private async captureExecutionOutput(
    terminal: vscode.Terminal,
    execution: vscode.TerminalShellExecution
  ): Promise<void> {
    try {
      for await (const chunk of execution.read()) {
        const normalized = normalizeTerminalChunk(chunk);
        if (!normalized) continue;
        for (const line of normalized.split("\n")) {
          if (!line) continue;
          this.appendLine(terminal, line);
        }
      }
    } catch {
      // Best-effort only.
    }
  }

  private appendLine(terminal: vscode.Terminal, line: string): void {
    const current = this.buffers.get(terminal) ?? [];
    current.push(line);
    if (current.length > 800) {
      current.splice(0, current.length - 800);
    }
    this.buffers.set(terminal, current);
  }
}

function normalizeTerminalChunk(chunk: string): string {
  return chunk
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}
