import { components } from "../api";
import type {
  ApplicationListItem,
  ApplicationReleaseResponse,
  ApplicationResponse
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import type { Workflow as AppWorkflow } from "../types/ApiTypes";
import type { JsScriptRunOutcome } from "../documents/jsScriptTypes";
import { useAuthStore } from "../stores/AuthStore";
import { createMobileTRPCClient } from "../trpc/client";
import {
  getApiHost as getSharedApiHost,
  loadApiHost as loadSharedApiHost,
  saveApiHost as saveSharedApiHost,
  setCachedApiHost
} from "./apiHost";

const DEFAULT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

/** Error carrying the HTTP status so callers can branch on it (e.g. 401 → re-auth). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Request failed (${status})${body ? `: ${body}` : ""}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** `fetch` with an abort-based timeout so requests can't hang forever on a flaky network. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isRetriableMethod(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m === "GET" || m === "HEAD";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type Asset = components["schemas"]["Asset"];
export type AssetList = components["schemas"]["AssetList"];
export type AssetUpdateRequest = components["schemas"]["AssetUpdateRequest"];
export type AssetSearchResult = components["schemas"]["AssetSearchResult"];
export type AssetWithPath = components["schemas"]["AssetWithPath"];
export type JobResponse = components["schemas"]["JobResponse"];
export type JobListResponse = components["schemas"]["JobListResponse"];
export type {
  ApplicationListItem,
  ApplicationReleaseResponse,
  ApplicationResponse
};

// ── Types for tRPC-migrated domains ───────────────────────────────────────────
// These shapes match the tRPC output schemas exactly and replace the openapi-
// generated equivalents that were removed from the REST API.

export interface SecretResponse {
  id?: string;
  user_id?: string;
  key: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  is_configured: boolean;
  is_unreadable?: boolean;
  value?: string;
}

export interface CollectionResponse {
  name: string;
  count: number;
  metadata?: Record<string, string | number | boolean>;
  workflow_name?: string | null;
}

export interface Thread {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  etag?: string | null;
}

export interface WorkflowGraphInput {
  nodes: Array<{
    id: string;
    type: string;
    [key: string]: unknown;
  }>;
  edges: Array<{
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
    id?: string | null;
    [key: string]: unknown;
  }>;
}

// The tRPC `workflowResponse` shape is looser than `Workflow` (nullable/optional
// `description`, `graph`, and `*_schema` fields), so callers pass that wire shape
// here. Accept it structurally and coerce `description` to the non-null string the
// app's `Workflow` type guarantees.
interface TRPCWorkflowResponse {
  id: string;
  name: string;
  description?: string | null;
  [key: string]: unknown;
}

export function normalizeWorkflow(workflow: TRPCWorkflowResponse): AppWorkflow {
  return {
    ...workflow,
    description: workflow.description ?? ""
  } as AppWorkflow;
}

interface TRPCModelResponse {
  id: string;
  name: string;
  type?: string | null;
  [key: string]: unknown;
}

export function normalizeModels<T extends { id: string; name: string }>(
  models: ReadonlyArray<TRPCModelResponse>,
  provider: string
): T[] {
  return models.map((model) => ({
    ...model,
    provider,
    type: model.type ?? null
  })) as unknown as T[];
}

class ApiService {
  private async authHeaders(): Promise<Record<string, string>> {
    const session = useAuthStore.getState().session;
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<T> {
    const headers = new Headers(init.headers);
    const authHeaders = await this.authHeaders();
    Object.entries(authHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });

    const url = `${getSharedApiHost()}${path}`;
    const retriable = isRetriableMethod(init.method);
    const maxAttempts = retriable ? MAX_RETRIES + 1 : 1;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetchWithTimeout(
          url,
          { ...init, headers },
          timeoutMs
        );
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new ApiError(response.status, text);
        }
        return (await response.json()) as T;
      } catch (error) {
        lastError = error;
        const status = error instanceof ApiError ? error.status : undefined;
        // An expired/invalid session won't recover by retrying — drop it and
        // route back to login.
        if (status === 401 || status === 403) {
          useAuthStore.getState().handleSessionExpired();
          throw error;
        }
        // Retry network errors / aborts (no status) and 5xx; never other 4xx.
        const transient = status === undefined || status >= 500;
        if (!retriable || !transient || attempt === maxAttempts) {
          throw error;
        }
        await delay(Math.min(1000 * 2 ** (attempt - 1), 8000));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Request failed");
  }

  async loadApiHost(): Promise<string> {
    try {
      const host = await loadSharedApiHost();
      this.updateBaseURL(host);
    } catch (error) {
      console.error("Failed to load API host:", error);
    }
    return getSharedApiHost();
  }

  async saveApiHost(host: string): Promise<void> {
    try {
      await saveSharedApiHost(host);
      this.updateBaseURL(host);
    } catch (error) {
      console.error("Failed to save API host:", error);
      throw error;
    }
  }

  getApiHost(): string {
    return getSharedApiHost();
  }

  private updateBaseURL(host: string): void {
    setCachedApiHost(host);
  }

  async getWorkflows(limit: number = 100) {
    const trpc = createMobileTRPCClient();
    const result = await trpc.workflows.list.query({ limit });
    return {
      ...result,
      workflows: result.workflows.map((workflow) => normalizeWorkflow(workflow))
    };
  }

  async getNodeMetadata() {
    // `fields` defaults to "summary" server-side, which omits properties and
    // outputs. The chain editor needs both, so ask for the full records.
    return this.request<components["schemas"]["NodeMetadata"][]>(
      "/api/nodes/metadata?fields=full"
    );
  }

  /**
   * Applications — mini apps as their own resource.
   *
   * The web client reaches these through tRPC; mobile has no applications
   * router, so it uses the REST door onto the same service. Both serialize
   * identically, so the protocol response types describe either one.
   */
  async listApplications(projectId?: string): Promise<ApplicationListItem[]> {
    const query = projectId
      ? `?project_id=${encodeURIComponent(projectId)}`
      : "";
    return this.request<ApplicationListItem[]>(`/api/applications${query}`);
  }

  async getApplication(id: string): Promise<ApplicationResponse> {
    return this.request<ApplicationResponse>(
      `/api/applications/${encodeURIComponent(id)}`
    );
  }

  /**
   * The released snapshot of an app, or null when nothing is published yet.
   * It carries the graph each operation was pinned to at publish time, which
   * is what lets a published app run without fetching its workflows.
   */
  async getReleasedApplicationDocument(
    id: string
  ): Promise<ApplicationReleaseResponse | null> {
    return this.request<ApplicationReleaseResponse | null>(
      `/api/applications/${encodeURIComponent(id)}/released-document`
    );
  }

  /**
   * Execute a saved JS script in the server's QuickJS sandbox —
   * `POST /api/js-scripts/:id/run`, the one non-tRPC door onto a script, shared
   * with the web run console and the CLI harness. Nothing runs on the phone,
   * and the endpoint runs the *saved* document, so callers save first.
   *
   * The timeout leaves room for the document's own ceiling
   * (`JS_SCRIPT_MAX_TIMEOUT_SECONDS`, 120s) plus the round trip; the 30s
   * default would abort a long run the server was still honoring.
   */
  async runJsScript(
    scriptId: string,
    inputs: Record<string, unknown>,
    inputStreams?: Record<string, unknown[]>
  ): Promise<JsScriptRunOutcome> {
    try {
      return await this.request<JsScriptRunOutcome>(
        `/api/js-scripts/${encodeURIComponent(scriptId)}/run`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            inputs,
            ...(inputStreams ? { input_streams: inputStreams } : {})
          })
        },
        130_000
      );
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error;
      }
      // The endpoint answers failures as `{detail}`; `ApiError.message` is the
      // raw body. Unwrap it so the user (and the agent) reads the reason
      // instead of a JSON blob.
      let detail: unknown;
      try {
        detail = (JSON.parse(error.message) as { detail?: unknown }).detail;
      } catch {
        // Not JSON — fall through to the status message below.
      }
      throw new Error(
        typeof detail === "string" && detail.length > 0
          ? detail
          : `The script run failed (HTTP ${error.status}).`
      );
    }
  }

  async saveWorkflow(workflow: {
    id: string;
    name: string;
    description: string;
    graph: WorkflowGraphInput;
    access?: string;
  }) {
    const trpc = createMobileTRPCClient();
    return trpc.workflows.update.mutate({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      graph: workflow.graph,
      ...(workflow.access ? { access: workflow.access } : {})
    });
  }

  async createWorkflow(workflow: {
    name: string;
    description: string;
    graph: WorkflowGraphInput;
    access?: string;
  }) {
    const trpc = createMobileTRPCClient();
    return trpc.workflows.create.mutate({
      name: workflow.name,
      description: workflow.description,
      graph: workflow.graph,
      ...(workflow.access ? { access: workflow.access } : {})
    });
  }

  async uploadAsset(params: {
    uri: string;
    name: string;
    contentType: string;
    parentId: string;
  }): Promise<Asset> {
    const formData = new FormData();
    formData.append("file", {
      uri: params.uri,
      name: params.name,
      type: params.contentType
    } as unknown as Blob);
    formData.append(
      "json",
      JSON.stringify({
        name: params.name,
        content_type: params.contentType,
        parent_id: params.parentId
      })
    );

    // Do NOT set Content-Type here: React Native derives the multipart boundary
    // from the FormData body, and setting the header manually drops it so the
    // server can't parse the upload.
    const headers = new Headers(await this.authHeaders());

    const response = await fetchWithTimeout(
      `${getSharedApiHost()}/api/assets`,
      { method: "POST", headers, body: formData },
      UPLOAD_TIMEOUT_MS
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new ApiError(response.status, text);
    }
    return (await response.json()) as Asset;
  }

  resolveUrl(urlOrPath: string | null | undefined): string | null {
    if (!urlOrPath) {
      return null;
    }
    // An `asset://` URN is an identifier, not a path: the bytes live under
    // `<user_id>/<asset_id>.<ext>` behind a signed URL, so `/api/storage/<id>`
    // 404s on any cloud deploy. Resolving it needs an `assets.get` lookup —
    // callers use `useResolvedMediaUri`, and get null here.
    if (urlOrPath.startsWith("asset://")) {
      return null;
    }
    // Anything else already carrying a scheme (http, https, file, data,
    // content, blob) is fetchable as-is; only bare paths get the API host.
    if (/^[a-z][a-z0-9+.-]*:/i.test(urlOrPath)) {
      return urlOrPath;
    }
    return `${getSharedApiHost()}${urlOrPath.startsWith("/") ? "" : "/"}${urlOrPath}`;
  }

  getWebSocketUrl(path: string): string {
    const wsProtocol = getSharedApiHost().startsWith("https") ? "wss:" : "ws:";
    const url = getSharedApiHost().replace(/^https?:/, wsProtocol);
    return `${url}${path}`;
  }

  async getThread(threadId: string): Promise<Thread> {
    const trpc = createMobileTRPCClient();
    return trpc.threads.get.query({ id: threadId });
  }
}

export const apiService = new ApiService();
