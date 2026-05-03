/**
 * Voyage AI Provider — exposes Voyage's `/v1/embeddings` API through the
 * standard {@link BaseProvider} interface. The wire format mirrors OpenAI's
 * embedding response shape.
 *
 * API docs: https://docs.voyageai.com/reference/embeddings-api
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
import type {
  EmbeddingModel,
  Message,
  ProviderStreamItem
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.voyage");

const VOYAGE_API_BASE_URL = "https://api.voyageai.com/v1";

const VOYAGE_EMBEDDING_MODELS: EmbeddingModel[] = [
  {
    id: "voyage-3-large",
    name: "Voyage 3 Large",
    provider: "voyage",
    dimensions: 1024
  },
  {
    id: "voyage-3.5",
    name: "Voyage 3.5",
    provider: "voyage",
    dimensions: 1024
  },
  {
    id: "voyage-3.5-lite",
    name: "Voyage 3.5 Lite",
    provider: "voyage",
    dimensions: 1024
  },
  {
    id: "voyage-code-3",
    name: "Voyage Code 3",
    provider: "voyage",
    dimensions: 1024
  },
  {
    id: "voyage-finance-2",
    name: "Voyage Finance 2",
    provider: "voyage",
    dimensions: 1024
  },
  {
    id: "voyage-law-2",
    name: "Voyage Law 2",
    provider: "voyage",
    dimensions: 1024
  },
  {
    id: "voyage-multilingual-2",
    name: "Voyage Multilingual 2",
    provider: "voyage",
    dimensions: 1024
  }
];

export interface VoyageProviderOptions {
  fetchFn?: typeof fetch;
  /**
   * Voyage `input_type` hint. Use `"document"` when embedding content for a
   * vector store; switch to `"query"` for retrieval queries against an index.
   * Defaults to `"document"`.
   */
  inputType?: "document" | "query" | null;
}

export class VoyageProvider extends BaseProvider {
  static override requiredSecrets(): string[] {
    return ["VOYAGE_API_KEY"];
  }

  private readonly apiKey: string;
  private readonly _fetch: typeof fetch;
  private readonly inputType: string | null;

  constructor(
    secrets: { VOYAGE_API_KEY?: string } = {},
    options: VoyageProviderOptions = {}
  ) {
    super("voyage");
    this.apiKey = secrets.VOYAGE_API_KEY ?? "";
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.inputType = options.inputType ?? "document";
    if (!this.apiKey) {
      log.warn("Voyage API key not configured");
    }
  }

  override getContainerEnv(): Record<string, string> {
    return { VOYAGE_API_KEY: this.apiKey };
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("voyage provider does not support chat generation");
  }

  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("voyage provider does not support chat generation");
    yield* [];
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return VOYAGE_EMBEDDING_MODELS;
  }

  override async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error("VOYAGE_API_KEY is not configured");
    }
    const texts = Array.isArray(args.text) ? args.text : [args.text];
    if (
      texts.length === 0 ||
      texts.some((v) => typeof v !== "string" || v.length === 0)
    ) {
      throw new Error("text must not be empty");
    }

    const body: Record<string, unknown> = {
      model: args.model || "voyage-3.5",
      input: texts
    };
    if (this.inputType) {
      body.input_type = this.inputType;
    }
    if (args.dimensions) {
      body.output_dimension = args.dimensions;
    }

    const response = await this._fetch(`${VOYAGE_API_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Voyage embedding error ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding: number[]; index?: number }>;
    };

    const rows = data.data ?? [];
    return rows
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((row) => row.embedding);
  }
}
