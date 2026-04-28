/**
 * Cohere Provider — exposes Cohere's `/v2/embed` text embedding API through
 * the standard {@link BaseProvider} interface.
 *
 * API docs: https://docs.cohere.com/reference/embed
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
import type {
  EmbeddingModel,
  Message,
  ProviderStreamItem
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.cohere");

const COHERE_API_BASE_URL = "https://api.cohere.com/v2";

const COHERE_EMBEDDING_MODELS: EmbeddingModel[] = [
  {
    id: "embed-v4.0",
    name: "Embed v4.0",
    provider: "cohere",
    dimensions: 1536
  },
  {
    id: "embed-english-v3.0",
    name: "Embed English v3.0",
    provider: "cohere",
    dimensions: 1024
  },
  {
    id: "embed-english-light-v3.0",
    name: "Embed English Light v3.0",
    provider: "cohere",
    dimensions: 384
  },
  {
    id: "embed-multilingual-v3.0",
    name: "Embed Multilingual v3.0",
    provider: "cohere",
    dimensions: 1024
  },
  {
    id: "embed-multilingual-light-v3.0",
    name: "Embed Multilingual Light v3.0",
    provider: "cohere",
    dimensions: 384
  }
];

export interface CohereProviderOptions {
  fetchFn?: typeof fetch;
  /**
   * The Cohere `input_type` parameter. Defaults to `"search_document"` which
   * is appropriate for indexing content into a vector store. Use
   * `"search_query"` when embedding user queries against a document index.
   */
  inputType?: "search_document" | "search_query" | "classification" | "clustering";
}

export class CohereProvider extends BaseProvider {
  static override requiredSecrets(): string[] {
    return ["COHERE_API_KEY"];
  }

  private readonly apiKey: string;
  private readonly _fetch: typeof fetch;
  private readonly inputType: string;

  constructor(
    secrets: { COHERE_API_KEY?: string } = {},
    options: CohereProviderOptions = {}
  ) {
    super("cohere");
    this.apiKey = secrets.COHERE_API_KEY ?? "";
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.inputType = options.inputType ?? "search_document";
    if (!this.apiKey) {
      log.warn("Cohere API key not configured");
    }
  }

  override getContainerEnv(): Record<string, string> {
    return { COHERE_API_KEY: this.apiKey };
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("cohere provider does not support chat generation");
  }

  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("cohere provider does not support chat generation");
    yield* [];
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return COHERE_EMBEDDING_MODELS;
  }

  override async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error("COHERE_API_KEY is not configured");
    }
    const texts = Array.isArray(args.text) ? args.text : [args.text];
    if (
      texts.length === 0 ||
      texts.some((v) => typeof v !== "string" || v.length === 0)
    ) {
      throw new Error("text must not be empty");
    }

    const body: Record<string, unknown> = {
      model: args.model || "embed-v4.0",
      texts,
      input_type: this.inputType,
      embedding_types: ["float"]
    };
    if (args.dimensions) {
      body.output_dimension = args.dimensions;
    }

    const response = await this._fetch(`${COHERE_API_BASE_URL}/embed`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Cohere embedding error ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as {
      embeddings?: { float?: number[][] } | number[][];
    };

    // v2 API returns `{ embeddings: { float: [[...]] } }` when
    // `embedding_types: ["float"]` is requested. Older payloads return a bare
    // `number[][]` — handle both for safety.
    if (Array.isArray(data.embeddings)) {
      return data.embeddings;
    }
    const floats = data.embeddings?.float;
    if (!Array.isArray(floats)) {
      throw new Error("Cohere embedding response missing float embeddings");
    }
    return floats;
  }
}
