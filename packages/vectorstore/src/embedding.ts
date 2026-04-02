/**
 * Provider-based embedding functions.
 *
 * Implements the EmbeddingFunction interface using provider APIs
 * (OpenAI, Ollama, Gemini, Mistral).
 */

import { createLogger } from "@nodetool/config";
import { getSecret } from "@nodetool/security";
import type { EmbeddingFunction } from "./sqlite-vec-store.js";

const log = createLogger("nodetool.vectorstore.embedding");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmbeddingProvider = "openai" | "ollama" | "gemini" | "mistral";

export interface ProviderEmbeddingOptions {
  provider: EmbeddingProvider;
  model: string;
  dimensions?: number;
}

// ---------------------------------------------------------------------------
// Provider embedding function
// ---------------------------------------------------------------------------

/**
 * Embedding function that calls a remote provider API.
 *
 * Lazily resolves API keys from secrets / environment on first call.
 */
export class ProviderEmbeddingFunction implements EmbeddingFunction {
  readonly name: string;
  private provider: EmbeddingProvider;
  private model: string;
  private dimensions?: number;
  private _apiKey: string | null = null;
  private _keyResolved = false;

  constructor(opts: ProviderEmbeddingOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.dimensions = opts.dimensions;
    this.name = `${opts.provider}/${opts.model}`;
  }

  private async resolveApiKey(): Promise<string | null> {
    if (this._keyResolved) return this._apiKey;
    this._keyResolved = true;

    const envKeyMap: Record<EmbeddingProvider, string> = {
      openai: "OPENAI_API_KEY",
      ollama: "OLLAMA_API_URL",
      gemini: "GEMINI_API_KEY",
      mistral: "MISTRAL_API_KEY"
    };

    const envKey = envKeyMap[this.provider];
    this._apiKey =
      (await getSecret(envKey, "1").catch(() => null)) ??
      process.env[envKey] ??
      null;
    return this._apiKey;
  }

  async generate(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    switch (this.provider) {
      case "openai":
        return this._generateOpenAI(texts);
      case "ollama":
        return this._generateOllama(texts);
      case "gemini":
        return this._generateGemini(texts);
      case "mistral":
        return this._generateMistral(texts);
      default:
        throw new Error(`Unsupported embedding provider: ${this.provider}`);
    }
  }

  // ── OpenAI ───────────────────────────────────────────────────────────

  private async _generateOpenAI(texts: string[]): Promise<number[][]> {
    const apiKey = await this.resolveApiKey();
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const body: Record<string, unknown> = {
      model: this.model,
      input: texts
    };
    if (this.dimensions) body.dimensions = this.dimensions;

    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`OpenAI embedding failed (${resp.status}): ${err}`);
    }

    const data = (await resp.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    // Sort by index to guarantee order
    return data.data
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
      .map((d) => d.embedding);
  }

  // ── Ollama ───────────────────────────────────────────────────────────

  private async _generateOllama(texts: string[]): Promise<number[][]> {
    const baseUrl = (await this.resolveApiKey()) || "http://127.0.0.1:11434";

    const resp = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: texts })
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`Ollama embedding failed (${resp.status}): ${err}`);
    }

    const data = (await resp.json()) as { embeddings: number[][] };
    return data.embeddings;
  }

  // ── Gemini ───────────────────────────────────────────────────────────

  private async _generateGemini(texts: string[]): Promise<number[][]> {
    const apiKey = await this.resolveApiKey();
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    // Gemini embedContent only handles one text at a time
    const embeddings: number[][] = [];
    for (const text of texts) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] }
        })
      });

      if (!resp.ok) {
        const err = await resp.text().catch(() => "");
        throw new Error(`Gemini embedding failed (${resp.status}): ${err}`);
      }

      const data = (await resp.json()) as {
        embedding?: { values?: number[] };
      };
      embeddings.push(data.embedding?.values ?? []);
    }
    return embeddings;
  }

  // ── Mistral ──────────────────────────────────────────────────────────

  private async _generateMistral(texts: string[]): Promise<number[][]> {
    const apiKey = await this.resolveApiKey();
    if (!apiKey) throw new Error("MISTRAL_API_KEY not configured");

    const resp = await fetch("https://api.mistral.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: texts
      })
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`Mistral embedding failed (${resp.status}): ${err}`);
    }

    const data = (await resp.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
      .map((d) => d.embedding);
  }
}

// ---------------------------------------------------------------------------
// Convenience classes
// ---------------------------------------------------------------------------

/**
 * OpenAI embedding function.
 *
 * @param model      Defaults to `text-embedding-3-small`.
 * @param dimensions Optional output dimensions for text-embedding-3-* models.
 */
export class OpenAIEmbeddingFunction extends ProviderEmbeddingFunction {
  constructor(model = "text-embedding-3-small", dimensions?: number) {
    super({ provider: "openai", model, dimensions });
  }
}

/**
 * Ollama embedding function.
 *
 * @param model Defaults to `nomic-embed-text`.
 */
export class OllamaEmbeddingFunction extends ProviderEmbeddingFunction {
  constructor(model = "nomic-embed-text") {
    super({ provider: "ollama", model });
  }
}

/**
 * Gemini embedding function.
 *
 * @param model Defaults to `text-embedding-004`.
 */
export class GeminiEmbeddingFunction extends ProviderEmbeddingFunction {
  constructor(model = "text-embedding-004") {
    super({ provider: "gemini", model });
  }
}

/**
 * Mistral embedding function.
 *
 * @param model Defaults to `mistral-embed`.
 */
export class MistralEmbeddingFunction extends ProviderEmbeddingFunction {
  constructor(model = "mistral-embed") {
    super({ provider: "mistral", model });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Resolve an embedding function from a model name and optional provider.
 *
 * When provider is omitted, the model name is used to infer the provider:
 * - `text-embedding-*` → OpenAI
 * - Otherwise → Ollama (if OLLAMA_API_URL is set)
 * - Fallback → null (caller should handle)
 *
 * @param embeddingModel  Model identifier.
 * @param provider        Optional explicit provider name.
 */
export function getProviderEmbeddingFunction(
  embeddingModel: string,
  provider?: string | null
): EmbeddingFunction | null {
  if (provider) {
    return new ProviderEmbeddingFunction({
      provider: provider as EmbeddingProvider,
      model: embeddingModel
    });
  }

  // Auto-detect from model name — check Gemini-specific patterns before generic OpenAI prefix
  if (
    embeddingModel.startsWith("text-embedding-004") ||
    embeddingModel.startsWith("gemini-embedding-")
  ) {
    return new GeminiEmbeddingFunction(embeddingModel);
  }

  if (embeddingModel.startsWith("text-embedding-")) {
    return new OpenAIEmbeddingFunction(embeddingModel);
  }

  if (embeddingModel.startsWith("mistral-embed")) {
    return new MistralEmbeddingFunction(embeddingModel);
  }

  // Default to Ollama for local models (nomic-embed-text, all-minilm, mxbai-embed-large, etc.)
  const ollamaUrl = process.env.OLLAMA_API_URL;
  if (ollamaUrl) {
    return new OllamaEmbeddingFunction(embeddingModel);
  }

  log.warn(
    `Could not determine provider for embedding model '${embeddingModel}'. ` +
      `Set OLLAMA_API_URL or pass an explicit provider.`
  );
  return null;
}
