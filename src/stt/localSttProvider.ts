import { AudioChunk, ISttProvider, RawTranscript } from "../types/contracts";

export class LocalSttProvider implements ISttProvider {
  async transcribe(_audio: AudioChunk): Promise<RawTranscript> {
    // Stub implementation. Will be replaced by local STT sidecar integration.
    return { text: "" };
  }
}

