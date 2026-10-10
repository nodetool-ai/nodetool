import { createLogger } from "@nodetool-ai/config";
import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { LanguageModel } from "./types.js";
import { classifyListedModel } from "./custom-model-kinds.js";

const log = createLogger("nodetool.runtime.providers.api-route");
const API_ROUTE_BASE_URL = "https://global.api-route.com/v1";

/** API Route chat models use the shared OpenAI-compatible transport. */
export class APIRouteProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["API_ROUTE_API_KEY"];
  }

  constructor(
    secrets: { API_ROUTE_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.API_ROUTE_API_KEY;
    if (!apiKey) throw new Error("API_ROUTE_API_KEY is required");
    super(
      { providerId: "api_route", apiKey, baseURL: API_ROUTE_BASE_URL },
      options
    );
  }

  override getContainerEnv(): Record<string, string> {
    return { API_ROUTE_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  /** Keep chat routes, using the shared classifier to exclude image/video IDs. */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    try {
      const rows = await this.fetchCompatModelRows();
      const seen = new Set<string>();
      const models: LanguageModel[] = [];
      for (const row of rows) {
        const endpoints = row.supported_endpoint_types;
        if (Array.isArray(endpoints) && !endpoints.includes("openai")) continue;
        if (classifyListedModel(row).kind !== "language") continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        models.push({ id: row.id, name: row.id, provider: this.provider });
      }
      return models;
    } catch {
      log.warn("API Route model discovery failed");
      return [];
    }
  }
}
