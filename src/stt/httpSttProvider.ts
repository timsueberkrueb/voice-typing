import { AudioChunk, ISttProvider, RawTranscript } from "../types/contracts";
import { request } from "undici";

interface HttpSttProviderOptions {
  endpoint: string;
  timeoutMs: number;
}

export class HttpSttProvider implements ISttProvider {
  constructor(private readonly options: HttpSttProviderOptions) {}

  async transcribe(audio: AudioChunk): Promise<RawTranscript> {
    if (audio.pcm16.length === 0) {
      return { text: "" };
    }

    const body = {
      audioBase64: audio.pcm16.toString("base64"),
      sampleRateHz: audio.sampleRateHz,
      channels: audio.channels
    };

    const res = await request(this.options.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      headersTimeout: this.options.timeoutMs,
      bodyTimeout: this.options.timeoutMs
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`HTTP STT failed (${res.statusCode})`);
    }

    const payload = (await res.body.json()) as { text?: string; confidence?: number };
    return { text: payload.text ?? "", confidence: payload.confidence };
  }
}
