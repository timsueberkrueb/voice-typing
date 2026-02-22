import {
  ExtractedFunctionCall,
  ResponsesApiFunctionCall,
  ResponsesApiPayload,
  ResponsesInputItem
} from "./types";

export function createInitialInput(inputText: string, ambientContext: string, developerPrompt: string): ResponsesInputItem[] {
  return [
    {
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: developerPrompt }]
    },
    {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Transcribed request:\n${inputText}\n\nAmbient context:\n${ambientContext}`
        }
      ]
    }
  ];
}

export function extractFunctionCalls(payload: ResponsesApiPayload): ExtractedFunctionCall[] {
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .filter((item) => item?.type === "function_call")
    .map((item) => ({
      id: item.id,
      call_id: item.call_id,
      name: typeof item.name === "string" ? item.name : "",
      arguments: typeof item.arguments === "string" ? item.arguments : "{}",
      status: typeof item.status === "string" ? item.status : undefined
    }))
    .filter((c) => c.name.length > 0);
}

export function normalizeResponsesPayload(response: unknown): ResponsesApiPayload {
  if (!response || typeof response !== "object") return { output: [] };

  const obj = response as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id : undefined;

  const rawOutput = obj.output;
  if (!Array.isArray(rawOutput)) return { id, output: [] };

  const calls: ResponsesApiFunctionCall[] = [];
  for (const entry of rawOutput) {
    if (!entry || typeof entry !== "object") continue;
    const call = asFunctionCall(entry as Record<string, unknown>);
    if (call) calls.push(call);
  }

  return { id, output: dedupeCalls(calls) };
}

export async function collectFunctionCallsFromStream(
  stream: AsyncIterable<unknown>
): Promise<ResponsesApiPayload> {
  const calls: ResponsesApiFunctionCall[] = [];
  let responseId: string | undefined;

  for await (const event of stream) {
    if (!event || typeof event !== "object") continue;
    const obj = event as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type : "";

    if (type === "response.output_item.done") {
      const item = obj.item;
      if (item && typeof item === "object") {
        const call = asFunctionCall(item as Record<string, unknown>);
        if (call) calls.push(call);
      }
      continue;
    }

    if (type === "response.completed") {
      const response = obj.response;
      if (response && typeof response === "object") {
        const responseObj = response as Record<string, unknown>;
        if (typeof responseObj.id === "string") responseId = responseObj.id;
        const output = responseObj.output;
        if (Array.isArray(output)) {
          for (const entry of output) {
            if (!entry || typeof entry !== "object") continue;
            const call = asFunctionCall(entry as Record<string, unknown>);
            if (call) calls.push(call);
          }
        }
      }
    }
  }

  return { id: responseId, output: dedupeCalls(calls) };
}

function asFunctionCall(entry: Record<string, unknown>): ResponsesApiFunctionCall | undefined {
  if (entry.type !== "function_call") return undefined;
  return {
    id: typeof entry.id === "string" ? entry.id : undefined,
    call_id: typeof entry.call_id === "string" ? entry.call_id : undefined,
    type: "function_call",
    name: typeof entry.name === "string" ? entry.name : undefined,
    arguments: typeof entry.arguments === "string" ? entry.arguments : undefined,
    status: typeof entry.status === "string" ? entry.status : undefined
  };
}

function dedupeCalls(calls: ResponsesApiFunctionCall[]): ResponsesApiFunctionCall[] {
  const seen = new Set<string>();
  const out: ResponsesApiFunctionCall[] = [];

  for (const c of calls) {
    const key = `${c.call_id ?? ""}|${c.id ?? ""}|${c.name ?? ""}|${c.arguments ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }

  return out;
}
