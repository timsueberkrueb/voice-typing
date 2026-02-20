import {
  IRewriteProvider,
  RewriteInput,
  RewrittenPrompt
} from "../types/contracts";

export class OllamaRewriteProvider implements IRewriteProvider {
  async rewrite(input: RewriteInput): Promise<RewrittenPrompt> {
    // Stub implementation. Will be replaced by Ollama HTTP API call.
    return {
      text: input.transcript.trim(),
      provider: "ollama"
    };
  }
}

