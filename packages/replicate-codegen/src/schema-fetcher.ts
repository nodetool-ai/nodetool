/**
 * Replicate API schema fetcher.
 *
 * Fetches model metadata and OpenAPI schemas from the Replicate API,
 * with local file-system caching.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplicateSchema {
  modelId: string; // "owner/name"
  owner: string;
  name: string;
  version: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export class SchemaFetcher {
  private readonly cacheDir: string;
  private readonly apiToken: string;

  /**
   * @param apiToken - Replicate API token. Falls back to REPLICATE_API_TOKEN env var.
   * @param cacheDir - Directory for caching schemas. Defaults to `.schema-cache/replicate/` relative to cwd.
   */
  constructor(apiToken?: string, cacheDir?: string) {
    this.apiToken = apiToken ?? process.env.REPLICATE_API_TOKEN ?? "";
    this.cacheDir =
      cacheDir ?? join(process.cwd(), ".schema-cache", "replicate");
  }

  /**
   * Generate a 16-hex-char SHA-256 cache key for a model ID.
   */
  cacheKey(modelId: string): string {
    return createHash("sha256").update(modelId).digest("hex").slice(0, 16);
  }

  private cachePath(modelId: string): string {
    return join(this.cacheDir, `${this.cacheKey(modelId)}.json`);
  }

  private authHeaders(): Record<string, string> {
    if (!this.apiToken) {
      throw new Error(
        "REPLICATE_API_TOKEN is not set. Pass it to the constructor or set the environment variable."
      );
    }
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json"
    };
  }

  /**
   * Fetch the schema for a Replicate model, optionally using cache.
   *
   * @param modelId  - Model identifier: "owner/name" (e.g. "stability-ai/sdxl")
   * @param useCache - Whether to return cached schema when available (default: `true`)
   */
  async fetchSchema(
    modelId: string,
    useCache: boolean = true
  ): Promise<ReplicateSchema> {
    const path = this.cachePath(modelId);

    if (useCache) {
      try {
        const raw = await readFile(path, "utf-8");
        return JSON.parse(raw) as ReplicateSchema;
      } catch {
        // Cache miss — fall through to fetch
      }
    }

    const schema = await this._fetchFromApi(modelId);

    // Persist to cache
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(path, JSON.stringify(schema, null, 2), "utf-8");

    return schema;
  }

  /**
   * Return the cached schema for a model, or `null` if not cached.
   */
  async getCachedSchema(modelId: string): Promise<ReplicateSchema | null> {
    try {
      const raw = await readFile(this.cachePath(modelId), "utf-8");
      return JSON.parse(raw) as ReplicateSchema;
    } catch {
      return null;
    }
  }

  /**
   * Fetch model metadata + latest version schema from Replicate API.
   */
  private async _fetchFromApi(modelId: string): Promise<ReplicateSchema> {
    const [owner, name] = modelId.split("/");
    if (!owner || !name) {
      throw new Error(`Invalid model ID "${modelId}": expected "owner/name"`);
    }

    // Step 1: Get model info (includes latest_version)
    const modelUrl = `${REPLICATE_API_BASE}/models/${owner}/${name}`;
    const modelRes = await this._fetch(modelUrl);
    const modelData = modelRes as Record<string, unknown>;

    const latestVersion = modelData.latest_version as
      | Record<string, unknown>
      | undefined;
    if (!latestVersion?.id) {
      throw new Error(`Model "${modelId}" has no latest version`);
    }

    const versionId = latestVersion.id as string;
    const description = (modelData.description as string | undefined) ?? "";

    // Step 2: Get version details (contains openapi_schema)
    const versionUrl = `${REPLICATE_API_BASE}/models/${owner}/${name}/versions/${versionId}`;
    const versionData = (await this._fetch(versionUrl)) as Record<
      string,
      unknown
    >;

    const openapiSchema =
      (versionData.openapi_schema as Record<string, unknown>) ?? {};
    const components =
      (openapiSchema.components as Record<string, unknown>) ?? {};
    const schemas = (components.schemas as Record<string, unknown>) ?? {};
    const inputSchema = (schemas.Input as Record<string, unknown>) ?? {};
    const outputSchema = (schemas.Output as Record<string, unknown>) ?? {};

    return {
      modelId,
      owner,
      name,
      version: versionId,
      description,
      inputSchema,
      outputSchema
    };
  }

  private async _fetch(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: this.authHeaders(),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Replicate API error fetching ${url}: ${response.status} ${response.statusText} — ${body}`
      );
    }

    return response.json();
  }
}
