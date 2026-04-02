/**
 * OpenAPI schema fetcher for FAL endpoints.
 *
 * Handles fetching and caching OpenAPI schemas from FAL.ai endpoints.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export class SchemaFetcher {
  private readonly cacheDir: string;

  /**
   * Initialize the schema fetcher.
   *
   * @param cacheDir - Directory for caching schemas. Defaults to `.codegen-cache/` relative to cwd.
   */
  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? join(process.cwd(), ".codegen-cache");
  }

  /**
   * Generate a 16-hex-char SHA-256 cache key for an endpoint ID.
   */
  cacheKey(endpointId: string): string {
    return createHash("sha256").update(endpointId).digest("hex").slice(0, 16);
  }

  private cachePath(endpointId: string): string {
    return join(this.cacheDir, `${this.cacheKey(endpointId)}.json`);
  }

  /**
   * Fetch the OpenAPI schema for a FAL endpoint, optionally using cache.
   *
   * @param endpointId - FAL endpoint ID (e.g. `fal-ai/flux/dev`)
   * @param useCache   - Whether to return cached schema when available (default: `true`)
   * @returns OpenAPI schema as a plain object
   */
  async fetchSchema(
    endpointId: string,
    useCache: boolean = true
  ): Promise<Record<string, unknown>> {
    const path = this.cachePath(endpointId);

    if (useCache) {
      try {
        const raw = await readFile(path, "utf-8");
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Cache miss — fall through to fetch
      }
    }

    const url = `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${endpointId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      throw new Error(
        `Failed to fetch schema for ${endpointId}: ${response.status} ${response.statusText}`
      );
    }

    const schema = (await response.json()) as Record<string, unknown>;

    // Persist to cache
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(path, JSON.stringify(schema, null, 2), "utf-8");

    return schema;
  }

  /**
   * Return the cached schema for an endpoint, or `null` if not cached.
   */
  async getCachedSchema(
    endpointId: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const raw = await readFile(this.cachePath(endpointId), "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
