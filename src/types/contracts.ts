export interface AudioChunk {
  pcm16: Buffer;
  sampleRateHz: number;
  channels: number;
  startedAtIso: string;
}

export interface RawTranscript {
  text: string;
  confidence?: number;
}

export interface RewriteInput {
  transcript: string;
  style?: "concise" | "detailed" | "engineering" | "debugging";
}

export interface RewrittenPrompt {
  text: string;
  provider: string;
}

export interface ISttProvider {
  transcribe(audio: AudioChunk): Promise<RawTranscript>;
}

export interface IRewriteProvider {
  rewrite(input: RewriteInput): Promise<RewrittenPrompt>;
}

export interface IInputInjector {
  insert(text: string): Promise<void>;
}

