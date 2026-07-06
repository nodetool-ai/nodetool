import { components } from '../api';
import type {
  Workflow as AppWorkflow,
} from '../types/ApiTypes';
import { useAuthStore } from '../stores/AuthStore';
import { createMobileTRPCClient } from '../trpc/client';
import {
  getApiHost as getSharedApiHost,
  loadApiHost as loadSharedApiHost,
  saveApiHost as saveSharedApiHost,
  setCachedApiHost,
} from './apiHost';

const DEFAULT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

/** Error carrying the HTTP status so callers can branch on it (e.g. 401 → re-auth). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Request failed (${status})${body ? `: ${body}` : ''}`);
    this.name = 'ApiError';
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
  const m = (method ?? 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD';
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

export interface SecretsListResponse {
  secrets: SecretResponse[];
  next_key: string | null;
}

export interface SecretUpdateRequest {
  value: string;
  description?: string | null;
}

export interface CollectionResponse {
  name: string;
  count: number;
  metadata?: Record<string, string | number | boolean>;
  workflow_name?: string | null;
}

export interface CollectionList {
  collections: CollectionResponse[];
  count: number;
}

export interface CollectionCreate {
  name: string;
  embedding_model?: string;
  embedding_provider?: string;
}


export interface Thread {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  etag?: string | null;
}

export interface ThreadList {
  threads: Thread[];
  next: string | null;
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
export function normalizeWorkflow(workflow: Record<string, unknown>): AppWorkflow {
  return {
    ...workflow,
    description: (workflow.description as string | null | undefined) ?? '',
  } as AppWorkflow;
}

export function normalizeModels<T extends { id: string; name: string }>(
  models: ReadonlyArray<Record<string, unknown>>,
  provider: string
): T[] {
  return models.map((model) => ({
    ...model,
    provider,
    type: (model.type as string | null | undefined) ?? null,
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
        const response = await fetchWithTimeout(url, { ...init, headers }, timeoutMs);
        if (!response.ok) {
          const text = await response.text().catch(() => '');
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
    throw lastError instanceof Error ? lastError : new Error('Request failed');
  }

  async loadApiHost(): Promise<string> {
    try {
      const host = await loadSharedApiHost();
      this.updateBaseURL(host);
    } catch (error) {
      console.error('Failed to load API host:', error);
    }
    return getSharedApiHost();
  }

  async saveApiHost(host: string): Promise<void> {
    try {
      await saveSharedApiHost(host);
      this.updateBaseURL(host);
    } catch (error) {
      console.error('Failed to save API host:', error);
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
      workflows: result.workflows.map((workflow) =>
        normalizeWorkflow(workflow as unknown as Record<string, unknown>)
      ),
    };
  }

  async getNodeMetadata() {
    return this.request<components["schemas"]["NodeMetadata"][]>('/api/nodes/metadata');
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
      ...(workflow.access ? { access: workflow.access } : {}),
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
      ...(workflow.access ? { access: workflow.access } : {}),
    });
  }

  async uploadAsset(params: {
    uri: string;
    name: string;
    contentType: string;
    parentId: string;
  }): Promise<Asset> {
    const formData = new FormData();
    formData.append('file', {
      uri: params.uri,
      name: params.name,
      type: params.contentType,
    } as unknown as Blob);
    formData.append('json', JSON.stringify({
      name: params.name,
      content_type: params.contentType,
      parent_id: params.parentId,
    }));

    // Do NOT set Content-Type here: React Native derives the multipart boundary
    // from the FormData body, and setting the header manually drops it so the
    // server can't parse the upload.
    const headers = new Headers(await this.authHeaders());

    const response = await fetchWithTimeout(
      `${getSharedApiHost()}/api/assets`,
      { method: 'POST', headers, body: formData },
      UPLOAD_TIMEOUT_MS
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ApiError(response.status, text);
    }
    return (await response.json()) as Asset;
  }

  resolveUrl(urlOrPath: string | null | undefined): string | null {
    if (!urlOrPath) {return null;}
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      return urlOrPath;
    }
    return `${getSharedApiHost()}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
  }

  getWebSocketUrl(path: string): string {
    const wsProtocol = getSharedApiHost().startsWith('https') ? 'wss:' : 'ws:';
    const url = getSharedApiHost().replace(/^https?:/, wsProtocol);
    return `${url}${path}`;
  }

  async getThread(threadId: string): Promise<Thread> {
    const trpc = createMobileTRPCClient();
    return trpc.threads.get.query({ id: threadId });
  }
}

export const apiService = new ApiService();
