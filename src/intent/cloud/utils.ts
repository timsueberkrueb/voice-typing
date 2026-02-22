export function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function clampInt(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function normalizeResponsesBaseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/responses\/?$/, "");
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      Symbol.asyncIterator in (value as Record<PropertyKey, unknown>)
  );
}

export function sanitizeForLog(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function escapeGlob(value: string): string {
  return value.replace(/[[\]{}()*?!\\]/g, "\\$&");
}
