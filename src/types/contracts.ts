export interface AudioChunk {
  wavPath: string;
  pcm16: Buffer;
  sampleRateHz: number;
  channels: number;
}

export interface RawTranscript {
  text: string;
  confidence?: number;
}

export interface ISttProvider {
  transcribe(audio: AudioChunk): Promise<RawTranscript>;
}

export interface IInputInjector {
  insert(text: string): Promise<void>;
}

export interface ICommandLayer {
  route(inputText: string): Promise<boolean>;
}
