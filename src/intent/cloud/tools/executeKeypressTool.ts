import { execFile } from "node:child_process";
import { ToolResult } from "../types";

const LETTER_KEYCODES: Record<string, number> = {
  a: 30, b: 48, c: 46, d: 32, e: 18, f: 33, g: 34, h: 35, i: 23, j: 36, k: 37,
  l: 38, m: 50, n: 49, o: 24, p: 25, q: 16, r: 19, s: 31, t: 20, u: 22, v: 47,
  w: 17, x: 45, y: 21, z: 44
};

const DIGIT_KEYCODES: Record<string, number> = {
  "1": 2, "2": 3, "3": 4, "4": 5, "5": 6, "6": 7, "7": 8, "8": 9, "9": 10, "0": 11
};

const PUNCTUATION_KEYCODES: Record<string, number> = {
  "-": 12, "=": 13, "[": 26, "]": 27, "\\": 43, ";": 39, "'": 40, "`": 41, ",": 51, ".": 52, "/": 53,
  minus: 12, equal: 13, lbracket: 26, rbracket: 27, backslash: 43, semicolon: 39, apostrophe: 40, grave: 41,
  comma: 51, dot: 52, period: 52, slash: 53
};

export async function executeKeypressTool(args: Record<string, unknown>): Promise<ToolResult> {
  const raw = typeof args.keys === "string" ? args.keys : "";
  const keys = stripKeypressPrefix(raw);
  if (!keys) return { ok: false, handled: false, error: "keys is required." };

  if (process.platform !== "linux") {
    return { ok: false, handled: false, error: "execute_keypress is Linux-only in this build." };
  }

  const parsed = parseKeypress(keys);

  try {
    if (parsed.kind === "combo") {
      await execFileAsync("ydotool", ["key", ...parsed.sequence]);
    } else if (parsed.kind === "key") {
      await execFileAsync("ydotool", ["key", `${parsed.keycode}:1`, `${parsed.keycode}:0`]);
    } else {
      await execFileAsync("ydotool", ["type", parsed.text]);
    }

    return { ok: true, handled: true, data: { keys, runner: "ydotool" } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      handled: false,
      error:
        `Failed to send keypress via ydotool. Ensure ydotoold is running and ` +
        `YDOTOOL_SOCKET is set correctly. Details: ${message}`
    };
  }
}

function stripKeypressPrefix(value: string): string {
  return value.replace(/^\s*keypress\b\s*:?\s*/i, "").trim();
}

function parseKeypress(value: string):
  | { kind: "key"; keycode: number }
  | { kind: "combo"; sequence: string[] }
  | { kind: "text"; text: string } {
  const normalized = value.trim();

  const mText = normalized.match(/^text\s*:\s*(.*)$/i);
  if (mText) return { kind: "text", text: mText[1] ?? "" };

  const keyOnly = keycodeForKey(normalized);
  if (keyOnly !== undefined) return { kind: "key", keycode: keyOnly };

  const compact = normalized.replace(/\s+/g, "");
  const parts = compact.split("+").filter(Boolean);
  if (parts.length >= 2) {
    const keyPart = keycodeForKey(parts.at(-1) ?? "");
    const mods = parts
      .slice(0, -1)
      .map(keycodeForModifier)
      .filter((m): m is number => m !== undefined);

    if (keyPart !== undefined && mods.length > 0) {
      const down = mods.map((m) => `${m}:1`);
      const keyDownUp = [`${keyPart}:1`, `${keyPart}:0`];
      const up = [...mods].reverse().map((m) => `${m}:0`);
      return { kind: "combo", sequence: [...down, ...keyDownUp, ...up] };
    }
  }

  return { kind: "text", text: normalized };
}

function keycodeForKey(value: string): number | undefined {
  const lower = value.toLowerCase();

  if (lower === "enter" || lower === "return") return 96;
  if (lower === "mainenter") return 28;
  if (lower === "esc" || lower === "escape") return 1;
  if (lower === "tab") return 15;
  if (lower === "space") return 57;
  if (lower === "backspace") return 14;
  if (lower === "delete" || lower === "del") return 111;
  if (lower === "insert" || lower === "ins") return 110;
  if (lower === "home") return 102;
  if (lower === "end") return 107;
  if (lower === "pageup" || lower === "pgup") return 104;
  if (lower === "pagedown" || lower === "pgdn") return 109;
  if (lower === "up") return 103;
  if (lower === "down") return 108;
  if (lower === "left") return 105;
  if (lower === "right") return 106;

  if (lower === "f1") return 59;
  if (lower === "f2") return 60;
  if (lower === "f3") return 61;
  if (lower === "f4") return 62;
  if (lower === "f5") return 63;
  if (lower === "f6") return 64;
  if (lower === "f7") return 65;
  if (lower === "f8") return 66;
  if (lower === "f9") return 67;
  if (lower === "f10") return 68;
  if (lower === "f11") return 87;
  if (lower === "f12") return 88;

  if (lower.length === 1) {
    const letterCode = LETTER_KEYCODES[lower];
    if (letterCode !== undefined) return letterCode;

    const digitCode = DIGIT_KEYCODES[lower];
    if (digitCode !== undefined) return digitCode;
  }

  return PUNCTUATION_KEYCODES[lower];
}

function keycodeForModifier(value: string): number | undefined {
  const lower = value.toLowerCase();
  if (lower === "ctrl" || lower === "control") return 29;
  if (lower === "shift") return 42;
  if (lower === "alt") return 56;
  if (lower === "super" || lower === "meta" || lower === "win") return 125;
  return undefined;
}

function execFileAsync(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, _stdout, stderr) => {
      if (error) {
        const detail = stderr?.trim();
        reject(new Error(detail ? `${error.message}: ${detail}` : error.message));
        return;
      }
      resolve();
    });
  });
}
