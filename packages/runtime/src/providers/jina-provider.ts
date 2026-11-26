/**
 * Jina AI Provider — exposes Jina's `/v1/embeddings` API through the standard
 * {@link BaseProvider} interface. The wire format is OpenAI-compatible.
 *
 * API docs: https://api.jina.ai/redoc
 */

import { BaseProvider, type EmbeddingImage, type ProviderCapability } from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
import type { EmbeddingModel, Message, ProviderStreamItem } from "./types.js";
import {
  normalizeEmbeddingImages,
  normalizeEmbeddingTexts,
  postEmbeddingRequest,
  sortEmbeddingsByIndex
} from "./embedding-http.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.jina");

const JINA_API_BASE_URL = "https://api.jina.ai/v1";

/** Jina models that embed images and text into one space. */
function isJinaClipModel(model: string): boolean {
  return model.startsWith("jina-clip-");
}

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

interface JinaProviderOptions {
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
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["generate_embedding"];
  }

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
    // Stryker disable next-line ConditionalExpression,BlockStatement,BooleanLiteral,StringLiteral: diagnostic warn; missing-key is enforced at call time.
    if (!this.apiKey) {
      // Stryker disable next-line StringLiteral
      log.warn("Jina API key not configured");
    }
  }

  override getContainerEnv() {
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
    yield* [];
    throw new Error("jina provider does not support chat generation");
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
    const texts = normalizeEmbeddingTexts(args.text);

    const model = args.model || "jina-embeddings-v3";
    const body: Record<string, unknown> = {
      model,
      // The CLIP models take typed inputs, so text and images share one request shape.
      input: isJinaClipModel(model) ? texts.map((text) => ({ text })) : texts
    };
    if (this.task && model.startsWith("jina-embeddings-v3")) {
      body.task = this.task;
    }
    // Stryker disable next-line ConditionalExpression: true-branch is equivalent (JSON.stringify drops the undefined value); request shapes asserted in tests.
    if (args.dimensions) {
      body.dimensions = args.dimensions;
    }

    const data = await postEmbeddingRequest<{
      data?: Array<{ embedding: number[]; index?: number }>;
    }>({
      fetchFn: this._fetch,
      url: `${JINA_API_BASE_URL}/embeddings`,
      apiKey: this.apiKey,
      body,
      label: "Jina"
    });

    return sortEmbeddingsByIndex(data.data ?? []);
  }

  /** Embed images with a Jina CLIP model, in the space of its text embeddings. */
  override async generateImageEmbedding(args: {
    images: EmbeddingImage[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error("JINA_API_KEY is not configured");
    }
    const model = args.model || "jina-clip-v2";
    if (!isJinaClipModel(model)) {
      throw new Error(`Jina model ${model} does not embed images. Use jina-clip-v2.`);
    }
    const body: Record<string, unknown> = {
      model,
      input: normalizeEmbeddingImages(args.images).map((image) => ({
        image: Buffer.from(image.data).toString("base64")
      }))
    };
    if (args.dimensions) {
      body.dimensions = args.dimensions;
    }
    const data = await postEmbeddingRequest<{
      data?: Array<{ embedding: number[]; index?: number }>;
    }>({
      fetchFn: this._fetch,
      url: `${JINA_API_BASE_URL}/embeddings`,
      apiKey: this.apiKey,
      body,
      label: "Jina"
    });
    return sortEmbeddingsByIndex(data.data ?? []);
  }
}
