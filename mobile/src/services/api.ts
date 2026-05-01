import { components } from '../api';
import type {
  ASRModel as AppASRModel,
  ImageModel as AppImageModel,
  LanguageModel as AppLanguageModel,
  ProviderInfo as AppProviderInfo,
  TTSModel as AppTTSModel,
  VideoModel as AppVideoModel,
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

export interface CollectionModify {
  rename?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface Thread {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  etag?: string;
}

export interface ThreadList {
  threads: Thread[];
  next: string | null;
}

export interface ThreadUpdateRequest {
  title: string;
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

function normalizeWorkflow(workflow: Record<string, unknown>): AppWorkflow {
  return {
    ...workflow,
    description: (workflow.description as string | null | undefined) ?? '',
  } as AppWorkflow;
}

function normalizeModels<T extends { id: string; name: string }>(
  models: Array<Record<string, unknown>>,
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

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const authHeaders = await this.authHeaders();
    Object.entries(authHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });

    const response = await fetch(`${getSharedApiHost()}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed (${response.status}): ${text}`);
    }

    return await response.json() as T;
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

  async getWorkflow(id: string) {
    const trpc = createMobileTRPCClient();
    const workflow = await trpc.workflows.get.query({ id });
    return normalizeWorkflow(workflow as unknown as Record<string, unknown>);
  }

  async runWorkflow(id: string, params: Record<string, unknown>) {
    const trpc = createMobileTRPCClient();
    return trpc.workflows.run.mutate({ id, params });
  }

  async getProviders(): Promise<AppProviderInfo[]> {
    const trpc = createMobileTRPCClient();
    return trpc.models.providers.query() as Promise<AppProviderInfo[]>;
  }

  async getProvidersByCapability(capability: string) {
    const all = await this.getProviders();
    return all.filter((p) => p.capabilities?.includes(capability));
  }

  async getLanguageModelProviders() {
    return this.getProvidersByCapability('generate_message');
  }

  async getLanguageModels(provider: string): Promise<AppLanguageModel[]> {
    const trpc = createMobileTRPCClient();
    const models = await trpc.models.llmByProvider.query({ provider });
    return normalizeModels<AppLanguageModel>(
      models as unknown as Array<Record<string, unknown>>,
      provider
    );
  }

  async getImageModels(provider: string): Promise<AppImageModel[]> {
    const trpc = createMobileTRPCClient();
    const models = await trpc.models.imageByProvider.query({ provider });
    return normalizeModels<AppImageModel>(
      models as unknown as Array<Record<string, unknown>>,
      provider
    );
  }

  async getTTSModels(provider: string): Promise<AppTTSModel[]> {
    const trpc = createMobileTRPCClient();
    const models = await trpc.models.ttsByProvider.query({ provider });
    return normalizeModels<AppTTSModel>(
      models as unknown as Array<Record<string, unknown>>,
      provider
    );
  }

  async getASRModels(provider: string): Promise<AppASRModel[]> {
    const trpc = createMobileTRPCClient();
    const models = await trpc.models.asrByProvider.query({ provider });
    return normalizeModels<AppASRModel>(
      models as unknown as Array<Record<string, unknown>>,
      provider
    );
  }

  async getVideoModels(provider: string): Promise<AppVideoModel[]> {
    const trpc = createMobileTRPCClient();
    const models = await trpc.models.videoByProvider.query({ provider });
    return normalizeModels<AppVideoModel>(
      models as unknown as Array<Record<string, unknown>>,
      provider
    );
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

  async listAssets(params: {
    parent_id?: string | null;
    content_type?: string | null;
    cursor?: string | null;
    page_size?: number | null;
  } = {}): Promise<AssetList> {
    const trpc = createMobileTRPCClient();
    return trpc.assets.list.query({
      ...(params.parent_id != null ? { parent_id: params.parent_id } : {}),
      ...(params.content_type != null ? { content_type: params.content_type } : {}),
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.page_size !== undefined && params.page_size !== null
        ? { page_size: params.page_size }
        : {}),
    }) as Promise<AssetList>;
  }

  async getAsset(id: string): Promise<Asset> {
    const trpc = createMobileTRPCClient();
    return trpc.assets.get.query({ id }) as Promise<Asset>;
  }

  async searchAssets(params: {
    query: string;
    content_type?: string | null;
    page_size?: number | null;
    cursor?: string | null;
  }): Promise<AssetSearchResult> {
    const trpc = createMobileTRPCClient();
    return trpc.assets.search.query({
      query: params.query,
      ...(params.content_type != null ? { content_type: params.content_type } : {}),
      ...(params.page_size !== undefined && params.page_size !== null
        ? { page_size: params.page_size }
        : {}),
      ...(params.cursor ? { cursor: params.cursor } : {}),
    }) as unknown as Promise<AssetSearchResult>;
  }

  async updateAsset(id: string, update: AssetUpdateRequest): Promise<Asset> {
    const trpc = createMobileTRPCClient();
    return trpc.assets.update.mutate({
      id,
      ...(update.name != null ? { name: update.name } : {}),
      ...(update.parent_id != null ? { parent_id: update.parent_id } : {}),
      ...(update.content_type != null ? { content_type: update.content_type } : {}),
      ...(update.data !== undefined ? { data: update.data } : {}),
      ...(update.metadata != null ? { metadata: update.metadata } : {}),
      ...(update.size != null ? { size: update.size } : {}),
    }) as Promise<Asset>;
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

    const session = (await import('../stores/AuthStore')).useAuthStore.getState().session;
    const headers: Record<string, string> = {
      'Content-Type': 'multipart/form-data',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${getSharedApiHost()}/api/assets`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed (${response.status}): ${text}`);
    }
    return await response.json() as Asset;
  }

  async deleteAsset(id: string): Promise<void> {
    const trpc = createMobileTRPCClient();
    await trpc.assets.delete.mutate({ id });
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

  // ---------------------- Secrets (tRPC) ----------------------

  async listSecrets(): Promise<SecretsListResponse> {
    const trpc = createMobileTRPCClient();
    return trpc.settings.secrets.list.query();
  }

  async getSecret(key: string, decrypt = false): Promise<SecretResponse> {
    const trpc = createMobileTRPCClient();
    return trpc.settings.secrets.get.query({ key, decrypt });
  }

  async updateSecret(key: string, update: SecretUpdateRequest): Promise<SecretResponse> {
    const trpc = createMobileTRPCClient();
    return trpc.settings.secrets.upsert.mutate({
      key,
      value: update.value,
      ...(update.description !== undefined ? { description: update.description ?? undefined } : {}),
    });
  }

  async deleteSecret(key: string): Promise<void> {
    const trpc = createMobileTRPCClient();
    await trpc.settings.secrets.delete.mutate({ key });
  }

  // ---------------------- Collections (tRPC) ----------------------

  async listCollections(): Promise<CollectionList> {
    const trpc = createMobileTRPCClient();
    return trpc.collections.list.query();
  }

  async getCollection(name: string): Promise<CollectionResponse> {
    const trpc = createMobileTRPCClient();
    return trpc.collections.get.query({ name });
  }

  async createCollection(body: CollectionCreate): Promise<CollectionResponse> {
    const trpc = createMobileTRPCClient();
    return trpc.collections.create.mutate({
      name: body.name,
      ...(body.embedding_model ? { embedding_model: body.embedding_model } : {}),
      ...(body.embedding_provider ? { embedding_provider: body.embedding_provider } : {}),
    });
  }

  async updateCollection(name: string, body: CollectionModify): Promise<CollectionResponse> {
    const trpc = createMobileTRPCClient();
    return trpc.collections.update.mutate({
      name,
      ...(body.rename ? { rename: body.rename } : {}),
      ...(body.metadata ? { metadata: body.metadata } : {}),
    });
  }

  async deleteCollection(name: string): Promise<void> {
    const trpc = createMobileTRPCClient();
    await trpc.collections.delete.mutate({ name });
  }

  // ---------------------- Jobs ----------------------

  async listJobs(params: {
    workflow_id?: string | null;
    limit?: number;
    start_key?: string | null;
  } = {}): Promise<JobListResponse> {
    const trpc = createMobileTRPCClient();
    return trpc.jobs.list.query({
      ...(params.workflow_id ? { workflow_id: params.workflow_id } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
      ...(params.start_key ? { start_key: params.start_key } : {}),
    }) as Promise<JobListResponse>;
  }

  async getJob(jobId: string): Promise<JobResponse> {
    const trpc = createMobileTRPCClient();
    return trpc.jobs.get.query({ id: jobId }) as Promise<JobResponse>;
  }

  async cancelJob(jobId: string): Promise<void> {
    const trpc = createMobileTRPCClient();
    await trpc.jobs.cancel.mutate({ id: jobId });
  }

  // ---------------------- Threads (tRPC) ----------------------

  async listThreads(params: {
    cursor?: string | null;
    limit?: number;
    reverse?: boolean;
  } = {}): Promise<ThreadList> {
    const trpc = createMobileTRPCClient();
    return trpc.threads.list.query({
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
      ...(params.reverse !== undefined ? { reverse: params.reverse } : {}),
    });
  }

  async getThread(threadId: string): Promise<Thread> {
    const trpc = createMobileTRPCClient();
    return trpc.threads.get.query({ id: threadId });
  }

  async updateThread(threadId: string, update: ThreadUpdateRequest): Promise<Thread> {
    const trpc = createMobileTRPCClient();
    return trpc.threads.update.mutate({ id: threadId, title: update.title });
  }

  async deleteThread(threadId: string): Promise<void> {
    const trpc = createMobileTRPCClient();
    await trpc.threads.delete.mutate({ id: threadId });
  }
}

export const apiService = new ApiService();
