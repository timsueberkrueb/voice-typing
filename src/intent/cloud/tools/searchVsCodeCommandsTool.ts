import * as vscode from "vscode";
import Fuse, { IFuseOptions } from "fuse.js";
import { ToolResult } from "../types";
import { clampInt } from "../utils";

interface CommandSearchResult {
  commandId: string;
  title?: string;
  category?: string;
}

interface CommandMetadata {
  title?: string;
  category?: string;
}

interface IndexedCommand extends CommandSearchResult {
  haystack: string;
}

let cachedCommandMetadata: Map<string, CommandMetadata> | undefined;
let cachedCommandSignature = "";
let cachedCommandIndex: IndexedCommand[] = [];
let cachedCommandFuse: Fuse<IndexedCommand> | undefined;

const COMMAND_FUSE_OPTIONS: IFuseOptions<IndexedCommand> = {
  threshold: 0.4,
  ignoreLocation: true,
  keys: [
    { name: "commandId", weight: 0.7 },
    { name: "title", weight: 0.2 },
    { name: "category", weight: 0.1 },
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
  const available = await vscode.commands.getCommands(true);
  const { index, fuse } = getOrCreateCommandSearchIndex(available, metadataById);

  const candidates = includeInternal
    ? index
    : index.filter((entry) => !entry.commandId.startsWith("_"));
  const searcher = includeInternal ? fuse : new Fuse(candidates, COMMAND_FUSE_OPTIONS);

  const ranked = searcher
    .search(query)
    .map((result) => result.item)
    .slice(0, maxResults)
    .map(({ haystack: _haystack, ...item }) => item);

  return {
    ok: true,
    handled: false,
    data: {
      query,
      count: ranked.length,
      commands: ranked as CommandSearchResult[]
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

function getOrCreateCommandSearchIndex(
  commandIds: string[],
  metadataById: Map<string, CommandMetadata>
): { index: IndexedCommand[]; fuse: Fuse<IndexedCommand> } {
  const signature = commandIds.slice().sort().join("\n");
  if (cachedCommandFuse && cachedCommandSignature === signature) {
    return { index: cachedCommandIndex, fuse: cachedCommandFuse };
  }

  const nextIndex: IndexedCommand[] = commandIds.map((commandId) => {
    const metadata = metadataById.get(commandId);
    const title = metadata?.title;
    const category = metadata?.category;
    return {
      commandId,
      title,
      category,
      haystack: `${commandId} ${title ?? ""} ${category ?? ""}`.trim()
    };
  });

  cachedCommandSignature = signature;
  cachedCommandIndex = nextIndex;
  cachedCommandFuse = new Fuse(nextIndex, COMMAND_FUSE_OPTIONS);

  return { index: cachedCommandIndex, fuse: cachedCommandFuse };
}
