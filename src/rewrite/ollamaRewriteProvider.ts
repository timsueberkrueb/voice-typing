import {
  IRewriteProvider,
  RewriteInput,
  RewrittenPrompt
} from "../types/contracts";
import { request } from "undici";

interface OllamaRewriteProviderOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

const SYSTEM_MSG = "Clean up the voice transcription. Output only the cleaned text. No commentary.";

const FEW_SHOT: Array<{ role: string; content: string }> = [
  { role: "user", content: "um so like I want to uh refactor the the database layer" },
  { role: "assistant", content: "I want to refactor the database layer" },
  { role: "user", content: "hey can you uh help me fix this this bug in the in the login page" },
  { role: "assistant", content: "Can you help me fix this bug in the login page?" },
  { role: "user", content: "what is going on" },
  { role: "assistant", content: "What is going on?" },
  { role: "user", content: "this time seems working" },
  { role: "assistant", content: "This time seems to be working." },
];

export class OllamaRewriteProvider implements IRewriteProvider {
  constructor(private readonly options: OllamaRewriteProviderOptions) {}

  async rewrite(input: RewriteInput): Promise<RewrittenPrompt> {
    const inputWordCount = input.transcript.split(/\s+/).length;
    const maxTokens = Math.max(inputWordCount * 3, 50);

    const messages = [
      { role: "system", content: SYSTEM_MSG },
      ...FEW_SHOT,
      { role: "user", content: input.transcript }
    ];

    const res = await request(`${this.options.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model,
        messages,
        stream: false,
        options: {
          num_predict: maxTokens,
          temperature: 0.1,
          stop: ["\n\n"]
        }
      }),
      headersTimeout: this.options.timeoutMs,
      bodyTimeout: this.options.timeoutMs
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Ollama rewrite failed (${res.statusCode})`);
    }

    const payload = (await res.body.json()) as {
      message?: { content?: string };
    };
    const raw = (payload.message?.content ?? "").trim();
    const cleaned = extractFirstLine(raw);

    if (cleaned.length > input.transcript.length * 3) {
      return { text: input.transcript, provider: "ollama" };
    }

    return {
      text: cleaned || input.transcript,
      provider: "ollama"
    };
  }
}

function extractFirstLine(text: string): string {
  let cleaned = text.split("\n")[0].trim();
  cleaned = cleaned.replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "");
  return cleaned.trim();
}
