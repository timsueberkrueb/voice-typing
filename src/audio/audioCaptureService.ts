import { AudioChunk } from "../types/contracts";

export class AudioCaptureService {
  async captureOnce(): Promise<AudioChunk> {
    // Placeholder for real microphone capture + VAD pipeline.
    return {
      pcm16: Buffer.alloc(0),
      sampleRateHz: 16000,
      channels: 1,
      startedAtIso: new Date().toISOString()
    };
  }
}

