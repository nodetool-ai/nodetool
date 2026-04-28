/**
 * Jina AI Provider — exposes Jina's `/v1/embeddings` API through the standard
 * {@link BaseProvider} interface. The wire format is OpenAI-compatible.
 *
 * API docs: https://api.jina.ai/redoc
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool/config";
import type {
  EmbeddingModel,
  Message,
  ProviderStreamItem
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.jina");

const JINA_API_BASE_URL = "https://api.jina.ai/v1";

const JINA_EMBEDDING_MODELS: EmbeddingModel[] = [
  {
    id: "jina-embeddings-v3",
    name: "Jina Embeddings v3",
    provider: "jina",
    dimensions: 1024
  },
  {
    id: "jina-clip-v2",
    name: "Jina CLIP v2",
    provider: "jina",
    dimensions: 1024
  },
  {
    id: "jina-embeddings-v2-base-en",
    name: "Jina Embeddings v2 Base (English)",
    provider: "jina",
    dimensions: 768
  },
  {
    id: "jina-embeddings-v2-base-de",
    name: "Jina Embeddings v2 Base (German)",
    provider: "jina",
    dimensions: 768
  },
  {
    id: "jina-embeddings-v2-base-zh",
    name: "Jina Embeddings v2 Base (Chinese)",
    provider: "jina",
    dimensions: 768
  },
  {
    id: "jina-embeddings-v2-base-code",
    name: "Jina Embeddings v2 Base (Code)",
    provider: "jina",
    dimensions: 768
  }
];

export interface JinaProviderOptions {
  fetchFn?: typeof fetch;
  /**
   * Jina-specific task hint. v3 supports `retrieval.passage` (default for
   * indexing) and `retrieval.query` for query embeddings, plus
   * `text-matching`, `classification`, and `separation`. Older v2 models
   * ignore this field.
   */
  task?: string | null;
}

export class JinaProvider extends BaseProvider {
  static override requiredSecrets(): string[] {
    return ["JINA_API_KEY"];
  }

  private readonly apiKey: string;
  private readonly _fetch: typeof fetch;
  private readonly task: string | null;

  constructor(
    secrets: { JINA_API_KEY?: string } = {},
    options: JinaProviderOptions = {}
  ) {
    super("jina");
    this.apiKey = secrets.JINA_API_KEY ?? "";
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.task = options.task ?? "retrieval.passage";
    if (!this.apiKey) {
      log.warn("Jina API key not configured");
    }
  }

  override getContainerEnv(): Record<string, string> {
    return { JINA_API_KEY: this.apiKey };
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("jina provider does not support chat generation");
  }

  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("jina provider does not support chat generation");
    yield* [];
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return JINA_EMBEDDING_MODELS;
  }

  override async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error("JINA_API_KEY is not configured");
    }
    const texts = Array.isArray(args.text) ? args.text : [args.text];
    if (
      texts.length === 0 ||
      texts.some((v) => typeof v !== "string" || v.length === 0)
    ) {
      throw new Error("text must not be empty");
    }

    const model = args.model || "jina-embeddings-v3";
    const body: Record<string, unknown> = {
      model,
      input: texts
    };
    if (this.task && model.startsWith("jina-embeddings-v3")) {
      body.task = this.task;
    }
    if (args.dimensions) {
      body.dimensions = args.dimensions;
    }

    const response = await this._fetch(`${JINA_API_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Jina embedding error ${response.status}: ${errText}`);
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
