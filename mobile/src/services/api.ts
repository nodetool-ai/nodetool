import createClient, { type Middleware } from 'openapi-fetch';
import { paths, components } from '../api';
import { useAuthStore } from '../stores/AuthStore';
import { createMobileTRPCClient } from '../trpc/client';
import {
  getApiHost as getSharedApiHost,
  loadApiHost as loadSharedApiHost,
  saveApiHost as saveSharedApiHost,
  setCachedApiHost,
  DEFAULT_API_HOST,
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

class ApiService {
  private client: ReturnType<typeof createClient<paths>>;

  constructor() {
    this.client = createClient<paths>({
      baseUrl: DEFAULT_API_HOST,
    });
    this.setupMiddleware();
  }

  private setupMiddleware() {
    const authMiddleware: Middleware = {
      onRequest: async ({ request }) => {
        const session = useAuthStore.getState().session;
        if (session?.access_token) {
          request.headers.set('Authorization', `Bearer ${session.access_token}`);
        }
        console.log(`[API Request] ${request.method} ${request.url}`);
        return request;
      },
      onResponse: async ({ response, request }) => {
        console.log(`[API Response] ${response.status} ${request.url}`);
        return response;
      },
    };
    
    // Eject existing middleware if any - openapi-fetch < 0.8 doesn't support eject easily 
    // but in a class we can just recreate the client on host change. 
    // For now, just add.
    this.client.use(authMiddleware);
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
    // Update the shared cache so tRPC client picks it up too.
    setCachedApiHost(host);
    // Recreate the openapi-fetch client with the new base URL.
    this.client = createClient<paths>({
      baseUrl: host,
    });
    this.setupMiddleware();
  }

  async getWorkflows(limit: number = 100): Promise<paths["/api/workflows/"]["get"]["responses"][200]["content"]["application/json"] | undefined> {
    const { data, error } = await this.client.GET('/api/workflows/', {
      params: {
        query: { limit },
      },
    });
    if (error) {throw error;}
    return data;
  }

  async getWorkflow(id: string): Promise<paths["/api/workflows/{id}"]["get"]["responses"][200]["content"]["application/json"] | undefined> {
    const { data, error } = await this.client.GET('/api/workflows/{id}', {
      params: {
        path: { id },
      },
    });
    if (error) {throw error;}
    return data;
  }

  async runWorkflow(id: string, params: Record<string, unknown>): Promise<paths["/api/workflows/{id}/run"]["post"]["responses"][200]["content"]["application/json"]> {
    const { data, error } = await this.client.POST('/api/workflows/{id}/run', {
      params: {
        path: { id },
      },
      body: params as paths["/api/workflows/{id}/run"]["post"]["requestBody"]["content"]["application/json"],
    });
    if (error) {throw error;}
    return data as paths["/api/workflows/{id}/run"]["post"]["responses"][200]["content"]["application/json"];
  }

  async getProviders(): Promise<paths["/api/models/providers"]["get"]["responses"][200]["content"]["application/json"]> {
    const { data, error } = await this.client.GET('/api/models/providers');
    if (error) { throw error; }
    return data || [];
  }

  async getProvidersByCapability(capability: string): Promise<paths["/api/models/providers"]["get"]["responses"][200]["content"]["application/json"]> {
    const all = await this.getProviders();
    return all.filter((p) => p.capabilities?.includes(capability));
  }

  async getLanguageModelProviders(): Promise<paths["/api/models/providers"]["get"]["responses"][200]["content"]["application/json"]> {
    return this.getProvidersByCapability('generate_message');
  }

  async getLanguageModels(provider: string): Promise<paths["/api/models/llm/{provider}"]["get"]["responses"][200]["content"]["application/json"]> {
    const { data, error } = await this.client.GET('/api/models/llm/{provider}', {
      params: {
        path: { provider: provider as paths["/api/models/llm/{provider}"]["get"]["parameters"]["path"]["provider"] },
      },
    });
    if (error) { throw error; }
    return data || [];
  }

  async getImageModels(provider: string): Promise<paths["/api/models/image/{provider}"]["get"]["responses"][200]["content"]["application/json"]> {
    const { data, error } = await this.client.GET('/api/models/image/{provider}', {
      params: {
        path: { provider: provider as paths["/api/models/image/{provider}"]["get"]["parameters"]["path"]["provider"] },
      },
    });
    if (error) { throw error; }
    return data || [];
  }

  async getTTSModels(provider: string): Promise<paths["/api/models/tts/{provider}"]["get"]["responses"][200]["content"]["application/json"]> {
    const { data, error } = await this.client.GET('/api/models/tts/{provider}', {
      params: {
        path: { provider: provider as paths["/api/models/tts/{provider}"]["get"]["parameters"]["path"]["provider"] },
      },
    });
    if (error) { throw error; }
    return data || [];
  }

  async getASRModels(provider: string): Promise<paths["/api/models/asr/{provider}"]["get"]["responses"][200]["content"]["application/json"]> {
    const { data, error } = await this.client.GET('/api/models/asr/{provider}', {
      params: {
        path: { provider: provider as paths["/api/models/asr/{provider}"]["get"]["parameters"]["path"]["provider"] },
      },
    });
    if (error) { throw error; }
    return data || [];
  }

  async getVideoModels(provider: string): Promise<paths["/api/models/video/{provider}"]["get"]["responses"][200]["content"]["application/json"]> {
    const { data, error } = await this.client.GET('/api/models/video/{provider}', {
      params: {
        path: { provider: provider as paths["/api/models/video/{provider}"]["get"]["parameters"]["path"]["provider"] },
      },
    });
    if (error) { throw error; }
    return data || [];
  }

  async getNodeMetadata(): Promise<paths["/api/nodes/metadata"]["get"]["responses"][200]["content"]["application/json"]> {
    const { data, error } = await this.client.GET('/api/nodes/metadata');
    if (error) { throw error; }
    return data || [];
  }

  async saveWorkflow(workflow: {
    id: string;
    name: string;
    description: string;
    graph: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };
    access?: string;
  }): Promise<paths["/api/workflows/{id}"]["put"]["responses"][200]["content"]["application/json"]> {
    const { data, error } = await this.client.PUT('/api/workflows/{id}', {
      params: { path: { id: workflow.id } },
      body: workflow as unknown as paths["/api/workflows/{id}"]["put"]["requestBody"]["content"]["application/json"],
    });
    if (error) { throw error; }
    return data as paths["/api/workflows/{id}"]["put"]["responses"][200]["content"]["application/json"];
  }

  async createWorkflow(workflow: {
    name: string;
    description: string;
    graph: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };
    access?: string;
  }): Promise<paths["/api/workflows/"]["post"]["responses"][200]["content"]["application/json"]> {
    const { data, error } = await this.client.POST('/api/workflows/', {
      body: workflow as paths["/api/workflows/"]["post"]["requestBody"]["content"]["application/json"],
    });
    if (error) { throw error; }
    return data as paths["/api/workflows/"]["post"]["responses"][200]["content"]["application/json"];
  }

  async listAssets(params: {
    parent_id?: string | null;
    content_type?: string | null;
    cursor?: string | null;
    page_size?: number | null;
  } = {}): Promise<AssetList> {
    const { data, error } = await this.client.GET('/api/assets/', {
      params: { query: params },
    });
    if (error) { throw error; }
    return data as AssetList;
  }

  async getAsset(id: string): Promise<Asset> {
    const { data, error } = await this.client.GET('/api/assets/{id}', {
      params: { path: { id } },
    });
    if (error) { throw error; }
    return data as Asset;
  }

  async searchAssets(params: {
    query: string;
    content_type?: string | null;
    page_size?: number | null;
    cursor?: string | null;
  }): Promise<AssetSearchResult> {
    const { data, error } = await this.client.GET('/api/assets/search', {
      params: { query: params },
    });
    if (error) { throw error; }
    return data as AssetSearchResult;
  }

  async updateAsset(id: string, update: AssetUpdateRequest): Promise<Asset> {
    const { data, error } = await this.client.PUT('/api/assets/{id}', {
      params: { path: { id } },
      body: update,
    });
    if (error) { throw error; }
    return data as Asset;
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
    const { error } = await this.client.DELETE('/api/assets/{id}', {
      params: { path: { id } },
    });
    if (error) { throw error; }
  }

  resolveUrl(urlOrPath: string | null | undefined): string | null {
    if (!urlOrPath) return null;
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
    const { data, error } = await this.client.GET('/api/jobs/', {
      params: { query: params },
    });
    if (error) { throw error; }
    return (data || { jobs: [], next_start_key: null }) as JobListResponse;
  }

  async getJob(jobId: string): Promise<JobResponse> {
    const { data, error } = await this.client.GET('/api/jobs/{job_id}', {
      params: { path: { job_id: jobId } },
    });
    if (error) { throw error; }
    return data as JobResponse;
  }

  async cancelJob(jobId: string): Promise<void> {
    const { error } = await this.client.POST('/api/jobs/{job_id}/cancel', {
      params: { path: { job_id: jobId } },
    });
    if (error) { throw error; }
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
