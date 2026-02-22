import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

interface CodexAuthFile {
  tokens?: {
    access_token?: string | null;
    account_id?: string | null;
  };
}

export interface CodexAuth {
  accessToken: string;
  accountId?: string;
}

export async function loadCodexAuthFromDisk(): Promise<CodexAuth | undefined> {
  const authPath = path.join(os.homedir(), ".codex", "auth.json");
  let raw: string;
  try {
    raw = await fs.readFile(authPath, "utf8");
  } catch {
    return undefined;
  }

  let parsed: CodexAuthFile;
  try {
    parsed = JSON.parse(raw) as CodexAuthFile;
  } catch {
    return undefined;
  }

  const accessToken = parsed.tokens?.access_token?.trim();
  if (!accessToken) {
    return undefined;
  }

  const accountId = parsed.tokens?.account_id?.trim();
  return accountId ? { accessToken, accountId } : { accessToken };
}
