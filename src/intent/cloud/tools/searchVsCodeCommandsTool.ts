import * as vscode from "vscode";
import Fuse, { IFuseOptions } from "fuse.js";
import { ToolResult } from "../types";
import { clampInt } from "../utils";

interface BaseSearchResult {
  type: "command" | "shortcut";
  commandId: string;
  title?: string;
  category?: string;
}

interface CommandSearchResult extends BaseSearchResult {
  type: "command";
}

interface ShortcutSearchResult extends BaseSearchResult {
  type: "shortcut";
  keys: string;
  when?: string;
  source?: string;
}

interface CommandMetadata {
  title?: string;
  category?: string;
}

type SearchResult = CommandSearchResult | ShortcutSearchResult;

type IndexedSearchResult = SearchResult & { haystack: string };

let cachedCommandMetadata: Map<string, CommandMetadata> | undefined;
let cachedShortcutEntries: ShortcutSearchResult[] | undefined;
let cachedCommandSignature = "";
let cachedSearchIndex: IndexedSearchResult[] = [];
let cachedSearchFuse: Fuse<IndexedSearchResult> | undefined;

const SEARCH_FUSE_OPTIONS: IFuseOptions<IndexedSearchResult> = {
  threshold: 0.4,
  ignoreLocation: true,
  keys: [
    { name: "type", weight: 0.05 },
    { name: "keys", weight: 0.65 },
    { name: "commandId", weight: 0.55 },
    { name: "title", weight: 0.2 },
    { name: "category", weight: 0.1 },
    { name: "when", weight: 0.08 },
    { name: "source", weight: 0.05 },
    { name: "haystack", weight: 0.05 }
  ]
};

export async function searchVsCodeCommandsTool(args: Record<string, unknown>): Promise<ToolResult> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return { ok: false, handled: false, error: "query is required." };

  const requested = typeof args.maxResults === "number" ? Math.floor(args.maxResults) : 20;
  const maxResults = clampInt(requested, 1, 100);
  const includeInternal = args.includeInternal === true;
  const metadataById = getCachedCommandMetadata();
  const shortcuts = getCachedShortcutEntries(metadataById);
  const available = await vscode.commands.getCommands(true);
  const { index, fuse } = getOrCreateSearchIndex(available, shortcuts, metadataById);

  const candidates = includeInternal
    ? index
    : index.filter((entry) => !entry.commandId.startsWith("_"));
  const searcher = includeInternal ? fuse : new Fuse(candidates, SEARCH_FUSE_OPTIONS);

  const ranked: SearchResult[] = searcher
    .search(query)
    .map((result) => result.item)
    .slice(0, maxResults)
    .map(toSearchResult);

  return {
    ok: true,
    handled: false,
    data: {
      query,
      count: ranked.length,
      results: ranked
    }
  };
}

function getCachedCommandMetadata(): Map<string, CommandMetadata> {
  if (cachedCommandMetadata) return cachedCommandMetadata;

  const byId = new Map<string, CommandMetadata>();

  for (const ext of vscode.extensions.all) {
    const contributes = (ext.packageJSON as { contributes?: { commands?: unknown } }).contributes;
    const commands = Array.isArray(contributes?.commands) ? contributes.commands : [];

    for (const item of commands) {
      if (!item || typeof item !== "object") continue;
      const commandId = (item as { command?: unknown }).command;
      if (typeof commandId !== "string" || !commandId) continue;

      const rawTitle = (item as { title?: unknown }).title;
      const rawCategory = (item as { category?: unknown }).category;
      const title = typeof rawTitle === "string" ? rawTitle : undefined;
      const category = typeof rawCategory === "string" ? rawCategory : undefined;

      const existing = byId.get(commandId);
      byId.set(commandId, {
        title: existing?.title ?? title,
        category: existing?.category ?? category
      });
    }
  }

  cachedCommandMetadata = byId;
  return byId;
}

function getCachedShortcutEntries(metadataById: Map<string, CommandMetadata>): ShortcutSearchResult[] {
  if (cachedShortcutEntries) return cachedShortcutEntries;

  const entries: ShortcutSearchResult[] = [];

  for (const ext of vscode.extensions.all) {
    const contributes = (ext.packageJSON as { contributes?: { keybindings?: unknown } }).contributes;
    const keybindings = Array.isArray(contributes?.keybindings) ? contributes.keybindings : [];

    for (const item of keybindings) {
      if (!item || typeof item !== "object") continue;
      const rawCommand = (item as { command?: unknown }).command;
      if (typeof rawCommand !== "string" || !rawCommand || rawCommand.startsWith("-")) continue;

      const keys = resolvePlatformKeybinding(item);
      if (!keys) continue;

      const metadata = metadataById.get(rawCommand);
      const rawWhen = (item as { when?: unknown }).when;
      const when = typeof rawWhen === "string" ? rawWhen : undefined;

      entries.push({
        type: "shortcut",
        commandId: rawCommand,
        title: metadata?.title,
        category: metadata?.category,
        keys,
        when,
        source: ext.id
      });
    }
  }

  cachedShortcutEntries = entries;
  return entries;
}

function resolvePlatformKeybinding(item: unknown): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  const binding = item as Record<string, unknown>;
  const platformKey =
    process.platform === "linux"
      ? binding.linux
      : process.platform === "darwin"
        ? binding.mac
        : process.platform === "win32"
          ? binding.win
          : undefined;

  if (typeof platformKey === "string" && platformKey.trim()) return platformKey.trim();
  const baseKey = binding.key;
  return typeof baseKey === "string" && baseKey.trim() ? baseKey.trim() : undefined;
}

function toSearchResult(entry: IndexedSearchResult): SearchResult {
  if (entry.type === "shortcut") {
    return {
      type: "shortcut",
      commandId: entry.commandId,
      title: entry.title,
      category: entry.category,
      keys: entry.keys,
      when: entry.when,
      source: entry.source
    };
  }

  return {
    type: "command",
    commandId: entry.commandId,
    title: entry.title,
    category: entry.category
  };
}

function getOrCreateSearchIndex(
  commandIds: string[],
  shortcuts: ShortcutSearchResult[],
  metadataById: Map<string, CommandMetadata>
): { index: IndexedSearchResult[]; fuse: Fuse<IndexedSearchResult> } {
  const commandSignature = commandIds.slice().sort().join("\n");
  const shortcutSignature = shortcuts
    .map((s) => `${s.commandId}|${s.keys}|${s.when ?? ""}|${s.source ?? ""}`)
    .sort()
    .join("\n");
  const signature = `${commandSignature}\n---\n${shortcutSignature}`;
  if (cachedSearchFuse && cachedCommandSignature === signature) {
    return { index: cachedSearchIndex, fuse: cachedSearchFuse };
  }

  const commandEntries: IndexedSearchResult[] = commandIds.map((commandId) => {
    const metadata = metadataById.get(commandId);
    const title = metadata?.title;
    const category = metadata?.category;
    return {
      type: "command",
      commandId,
      title,
      category,
      haystack: `command ${commandId} ${title ?? ""} ${category ?? ""}`.trim()
    };
  });

  const shortcutEntries: IndexedSearchResult[] = shortcuts.map((shortcut) => ({
    ...shortcut,
    haystack:
      `shortcut ${shortcut.keys} ${shortcut.commandId} ${shortcut.title ?? ""} ` +
      `${shortcut.category ?? ""} ${shortcut.when ?? ""}`.trim()
  }));

  const nextIndex = [...commandEntries, ...shortcutEntries];

  cachedCommandSignature = signature;
  cachedSearchIndex = nextIndex;
  cachedSearchFuse = new Fuse(nextIndex, SEARCH_FUSE_OPTIONS);

  return { index: cachedSearchIndex, fuse: cachedSearchFuse };
}
