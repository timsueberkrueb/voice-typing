import * as vscode from "vscode";

const CLOUD_API_KEY_SECRET = "voicePrompt.cloudApiKey";

export class SecretsManager {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getCloudApiKey(): Promise<string | undefined> {
    return this.secrets.get(CLOUD_API_KEY_SECRET);
  }

  async setCloudApiKey(apiKey: string): Promise<void> {
    await this.secrets.store(CLOUD_API_KEY_SECRET, apiKey);
  }
}

