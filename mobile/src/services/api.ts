import { components } from "../api";
import type {
  ApplicationListItem,
  ApplicationReleaseResponse,
  ApplicationResponse
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import type { Workflow as AppWorkflow } from "../types/ApiTypes";
import { useAuthStore } from "../stores/AuthStore";
import { createMobileTRPCClient } from "../trpc/client";
import {
  getApiHost as getSharedApiHost,
  loadApiHost as loadSharedApiHost,
  saveApiHost as saveSharedApiHost,
  setCachedApiHost
} from "./apiHost";
import { DEFAULT_FETCH_TIMEOUT_MS, fetchWithTimeout } from "./fetchWithTimeout";

const DEFAULT_TIMEOUT_MS = DEFAULT_FETCH_TIMEOUT_MS;
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

function isRetriableMethod(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m === "GET" || m === "HEAD";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type Asset = components["schemas"]["Asset"];
export type JobResponse = components["schemas"]["JobResponse"];
export type {
  ApplicationListItem,
  ApplicationReleaseResponse,
  ApplicationResponse
};

// ── Types for tRPC-migrated domains ───────────────────────────────────────────
// These shapes match the tRPC output schemas exactly and replace the openapi-
// generated equivalents that were removed from the REST API.

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
  // SAFETY: the wire row carries no `type` guarantee and `provider` is a bare
  // string, while callers pick `T`s that require a non-null `type` and a
  // `ProviderId`. Narrowing this honestly means widening those two types.
  return models.map((model) => ({
    ...model,
    provider,
    type: model.type ?? null
  })) as unknown as T[];
}

/** The file descriptor React Native's `FormData` accepts in place of a Blob. */
interface ReactNativeFile {
  uri: string;
  name: string;
  type: string;
}

/** React Native's `FormData.append`, which also takes {@link ReactNativeFile}. */
interface ReactNativeFormData {
  append(name: string, value: string | Blob | ReactNativeFile): void;
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
    let refreshed = false;
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
        // A 401 usually means the access token lapsed. Refresh it once and
        // resend; `refreshSession` signs out when the refresh itself fails.
        // The server rejected the request before acting on it, so resending
        // is safe for any method. A 403 is a permission error on this one
        // resource, not a dead session, so it fails like any other 4xx.
        if (status === 401) {
          if (refreshed || !(await useAuthStore.getState().refreshSession())) {
            throw error;
          }
          refreshed = true;
          const token = useAuthStore.getState().session?.access_token;
          if (token) {
            headers.set("Authorization", `Bearer ${token}`);
          }
          attempt--;
          continue;
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

  async uploadAsset(params: {
    uri: string;
    name: string;
    contentType: string;
    parentId: string;
  }): Promise<Asset> {
    const formData = new FormData();
    // React Native's FormData accepts a file descriptor object that the DOM
    // `Blob` parameter type cannot express.
    const form: ReactNativeFormData = formData;
    form.append("file", {
      uri: params.uri,
      name: params.name,
      type: params.contentType
    });
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
