/**
 * HTTP Client for NodeTool Admin API endpoints.
 *
 * This module provides an HTTP client for interacting with NodeTool
 * admin endpoints, including support for Server-Sent Events (SSE) streaming.
 */

export interface AdminHTTPClientOptions {
  baseUrl: string;
  authToken?: string;
}

/**
 * Parse an SSE stream from a fetch Response, yielding parsed JSON objects
 * for each `data:` line. Terminates on `data: [DONE]`.
 */
async function* parseSSEStream(
  response: Response
): AsyncGenerator<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (buffer.includes("\n")) {
        const newlineIndex = buffer.indexOf("\n");
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6);
          if (dataStr === "[DONE]") {
            return;
          }
          try {
            yield JSON.parse(dataStr) as Record<string, unknown>;
          } catch {
            // Skip malformed JSON
            continue;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * HTTP client for NodeTool admin API endpoints.
 */
export class AdminHTTPClient {
  readonly baseUrl: string;
  readonly headers: Record<string, string>;

  constructor(options: AdminHTTPClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream"
    };
    if (options.authToken) {
      this.headers["Authorization"] = `Bearer ${options.authToken}`;
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  private async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string>;
      rawBody?: Uint8Array | ArrayBuffer;
    }
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (options?.params) {
      const searchParams = new URLSearchParams(options.params);
      url += `?${searchParams.toString()}`;
    }

    const headers = { ...this.headers };
    let body: BodyInit | undefined;

    if (options?.rawBody !== undefined) {
      body =
        options.rawBody instanceof ArrayBuffer
          ? options.rawBody
          : (options.rawBody.buffer as ArrayBuffer);
      delete headers["Content-Type"];
    } else if (options?.body !== undefined) {
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, { method, headers, body });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
    }

    return (await response.json()) as T;
  }

  private async requestVoid(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      rawBody?: Uint8Array | ArrayBuffer;
    }
  ): Promise<void> {
    const headers = { ...this.headers };
    let body: BodyInit | undefined;

    if (options?.rawBody !== undefined) {
      body =
        options.rawBody instanceof ArrayBuffer
          ? options.rawBody
          : (options.rawBody.buffer as ArrayBuffer);
      delete headers["Content-Type"];
    } else if (options?.body !== undefined) {
      body = JSON.stringify(options.body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
    }
  }

  private async requestBytes(
    method: string,
    path: string
  ): Promise<Uint8Array> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  private async requestSSE(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
    }
    return response;
  }

  // ── Health ───────────────────────────────────────────────

  async healthCheck(): Promise<Record<string, unknown>> {
    return this.request("GET", "/admin/health");
  }

  // ── Workflows ────────────────────────────────────────────

  async listWorkflows(): Promise<Record<string, unknown>> {
    return this.request("GET", "/api/workflows/");
  }

  async updateWorkflow(
    workflowId: string,
    workflow: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.request("PUT", `/api/workflows/${workflowId}`, {
      body: workflow
    });
  }

  async deleteWorkflow(workflowId: string): Promise<Record<string, unknown>> {
    return this.request("DELETE", `/api/workflows/${workflowId}`);
  }

  async runWorkflow(
    workflowId: string,
    params?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.request("POST", `/api/workflows/${workflowId}/run`, {
      body: { params: params ?? {} }
    });
  }

  // ── Assets ───────────────────────────────────────────────

  async getAsset(
    assetId: string,
    userId: string = "1"
  ): Promise<Record<string, unknown>> {
    return this.request("GET", `/admin/assets/${assetId}`, {
      params: { user_id: userId }
    });
  }

  async createAsset(options: {
    id?: string;
    userId?: string;
    name?: string;
    contentType?: string;
    parentId?: string;
    workflowId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {
      user_id: options.userId ?? "1",
      name: options.name ?? "",
      content_type: options.contentType ?? ""
    };
    if (options.id) data["id"] = options.id;
    if (options.parentId) data["parent_id"] = options.parentId;
    if (options.workflowId) data["workflow_id"] = options.workflowId;
    if (options.metadata) data["metadata"] = options.metadata;

    return this.request("POST", "/admin/assets", { body: data });
  }

  async uploadAssetFile(
    fileName: string,
    data: Uint8Array | ArrayBuffer
  ): Promise<void> {
    return this.requestVoid("PUT", `/admin/storage/assets/${fileName}`, {
      rawBody: data
    });
  }

  async downloadAssetFile(fileName: string): Promise<Uint8Array> {
    return this.requestBytes("GET", `/storage/assets/${fileName}`);
  }

  // ── Database ─────────────────────────────────────────────

  async dbGet(table: string, key: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/admin/db/${table}/${key}`);
  }

  async dbSave(
    table: string,
    item: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.request("POST", `/admin/db/${table}/save`, { body: item });
  }

  async dbDelete(table: string, key: string): Promise<void> {
    return this.requestVoid("DELETE", `/admin/db/${table}/${key}`);
  }

  // ── Secrets ──────────────────────────────────────────────

  async importSecrets(
    secrets: Record<string, unknown>[]
  ): Promise<Record<string, unknown>> {
    return this.request("POST", "/admin/secrets/import", { body: secrets });
  }

  // ── Model Downloads (SSE streaming) ──────────────────────

  async *downloadHuggingfaceModel(options: {
    repoId: string;
    cacheDir?: string;
    filePath?: string;
    ignorePatterns?: string[];
    allowPatterns?: string[];
  }): AsyncGenerator<Record<string, unknown>> {
    const data: Record<string, unknown> = {
      repo_id: options.repoId,
      cache_dir: options.cacheDir ?? "/app/.cache/huggingface/hub",
      stream: true
    };
    if (options.filePath) data["file_path"] = options.filePath;
    if (options.ignorePatterns)
      data["ignore_patterns"] = options.ignorePatterns;
    if (options.allowPatterns) data["allow_patterns"] = options.allowPatterns;

    const response = await this.requestSSE(
      "POST",
      "/admin/models/huggingface/download",
      data
    );

    yield* parseSSEStream(response);
  }

  async *downloadOllamaModel(
    modelName: string
  ): AsyncGenerator<Record<string, unknown>> {
    const data = { model_name: modelName, stream: true };

    const response = await this.requestSSE(
      "POST",
      "/admin/models/ollama/download",
      data
    );

    yield* parseSSEStream(response);
  }

  // ── Cache ────────────────────────────────────────────────

  async scanCache(): Promise<Record<string, unknown>> {
    return this.request("GET", "/admin/cache/scan");
  }

  async getCacheSize(
    cacheDir: string = "/app/.cache/huggingface/hub"
  ): Promise<Record<string, unknown>> {
    return this.request("GET", `/admin/cache/size`, {
      params: { cache_dir: cacheDir }
    });
  }

  async deleteHuggingfaceModel(
    repoId: string
  ): Promise<Record<string, unknown>> {
    const encodedRepoId = encodeURIComponent(repoId);
    return this.request("DELETE", `/admin/models/huggingface/${encodedRepoId}`);
  }

  // ── Collections ──────────────────────────────────────────

  async createCollection(
    name: string,
    embeddingModel: string
  ): Promise<Record<string, unknown>> {
    return this.request("POST", "/admin/collections", {
      body: { name, embedding_model: embeddingModel }
    });
  }

  async addToCollection(
    collectionName: string,
    documents: string[],
    ids: string[],
    metadatas: Record<string, string>[],
    embeddings: number[][]
  ): Promise<Record<string, unknown>> {
    return this.request("POST", `/admin/collections/${collectionName}/add`, {
      body: { documents, ids, metadatas, embeddings }
    });
  }

  // ── Legacy admin operation endpoint ──────────────────────

  async *adminOperation(
    operation: string,
    params?: Record<string, unknown>
  ): AsyncGenerator<Record<string, unknown>> {
    const body = { operation, params: params ?? {} };

    const response = await fetch(`${this.baseUrl}/admin/operation`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Admin operation failed: ${response.status} ${text}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      yield* parseSSEStream(response);
    } else {
      const result = (await response.json()) as Record<string, unknown>;
      if (Array.isArray(result["results"])) {
        for (const item of result["results"] as Record<string, unknown>[]) {
          yield item;
        }
      } else {
        yield result;
      }
    }
  }
}
