import createClient, { type Middleware } from 'openapi-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { paths, components } from '../api';
import { useAuthStore } from '../stores/AuthStore';

export type Asset = components["schemas"]["Asset"];
export type AssetList = components["schemas"]["AssetList"];
export type AssetUpdateRequest = components["schemas"]["AssetUpdateRequest"];
export type AssetSearchResult = components["schemas"]["AssetSearchResult"];
export type AssetWithPath = components["schemas"]["AssetWithPath"];
export type SecretResponse = components["schemas"]["SecretResponse"];
export type SecretsListResponse = components["schemas"]["SecretsListResponse"];
export type SecretUpdateRequest = components["schemas"]["SecretUpdateRequest"];
export type CollectionResponse = components["schemas"]["CollectionResponse"];
export type CollectionList = components["schemas"]["CollectionList"];
export type CollectionCreate = components["schemas"]["CollectionCreate"];
export type CollectionModify = components["schemas"]["CollectionModify"];
export type JobResponse = components["schemas"]["JobResponse"];
export type JobListResponse = components["schemas"]["JobListResponse"];
export type Thread = components["schemas"]["Thread"];
export type ThreadList = components["schemas"]["ThreadList"];
export type ThreadUpdateRequest = components["schemas"]["ThreadUpdateRequest"];

const API_HOST_KEY = '@nodetool_api_host';
const DEFAULT_API_HOST = 'http://localhost:7777';

class ApiService {
  private client: ReturnType<typeof createClient<paths>>;
  private apiHost: string = DEFAULT_API_HOST;

  constructor() {
    this.client = createClient<paths>({
      baseUrl: this.apiHost,
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
      const savedHost = await AsyncStorage.getItem(API_HOST_KEY);
      if (savedHost) {
        this.apiHost = savedHost;
        this.updateBaseURL(savedHost);
      }
    } catch (error) {
      console.error('Failed to load API host:', error);
    }
    return this.apiHost;
  }

  async saveApiHost(host: string): Promise<void> {
    try {
      this.apiHost = host;
      await AsyncStorage.setItem(API_HOST_KEY, host);
      this.updateBaseURL(host);
    } catch (error) {
      console.error('Failed to save API host:', error);
      throw error;
    }
  }

  getApiHost(): string {
    return this.apiHost;
  }

  private updateBaseURL(host: string): void {
    // Recreate client to update base URL
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
      body: workflow as paths["/api/workflows/{id}"]["put"]["requestBody"]["content"]["application/json"],
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

    const response = await fetch(`${this.apiHost}/api/assets`, {
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

  getWebSocketUrl(path: string): string {
    const wsProtocol = this.apiHost.startsWith('https') ? 'wss:' : 'ws:';
    const url = this.apiHost.replace(/^https?:/, wsProtocol);
    return `${url}${path}`;
  }

  // ---------------------- Secrets ----------------------

  async listSecrets(): Promise<SecretsListResponse> {
    const { data, error } = await this.client.GET('/api/settings/secrets');
    if (error) { throw error; }
    return (data || { secrets: [], next_key: null }) as SecretsListResponse;
  }

  async getSecret(key: string, decrypt = false): Promise<SecretResponse> {
    const { data, error } = await this.client.GET('/api/settings/secrets/{key}', {
      params: {
        path: { key },
        query: { decrypt },
      },
    });
    if (error) { throw error; }
    return data as SecretResponse;
  }

  async updateSecret(key: string, update: SecretUpdateRequest): Promise<SecretResponse> {
    const { data, error } = await this.client.PUT('/api/settings/secrets/{key}', {
      params: { path: { key } },
      body: update,
    });
    if (error) { throw error; }
    return data as SecretResponse;
  }

  async deleteSecret(key: string): Promise<void> {
    const { error } = await this.client.DELETE('/api/settings/secrets/{key}', {
      params: { path: { key } },
    });
    if (error) { throw error; }
  }

  // ---------------------- Collections ----------------------

  async listCollections(): Promise<CollectionList> {
    const { data, error } = await this.client.GET('/api/collections/');
    if (error) { throw error; }
    return (data || { collections: [], count: 0 }) as CollectionList;
  }

  async getCollection(name: string): Promise<CollectionResponse> {
    const { data, error } = await this.client.GET('/api/collections/{name}', {
      params: { path: { name } },
    });
    if (error) { throw error; }
    return data as CollectionResponse;
  }

  async createCollection(body: CollectionCreate): Promise<CollectionResponse> {
    const { data, error } = await this.client.POST('/api/collections/', {
      body,
    });
    if (error) { throw error; }
    return data as CollectionResponse;
  }

  async updateCollection(name: string, body: CollectionModify): Promise<CollectionResponse> {
    const { data, error } = await this.client.PUT('/api/collections/{name}', {
      params: { path: { name } },
      body,
    });
    if (error) { throw error; }
    return data as CollectionResponse;
  }

  async deleteCollection(name: string): Promise<void> {
    const { error } = await this.client.DELETE('/api/collections/{name}', {
      params: { path: { name } },
    });
    if (error) { throw error; }
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

  // ---------------------- Threads ----------------------

  async listThreads(params: {
    cursor?: string | null;
    limit?: number;
    reverse?: boolean;
  } = {}): Promise<ThreadList> {
    const { data, error } = await this.client.GET('/api/threads/', {
      params: { query: params },
    });
    if (error) { throw error; }
    return (data || { threads: [], next: null }) as ThreadList;
  }

  async getThread(threadId: string): Promise<Thread> {
    const { data, error } = await this.client.GET('/api/threads/{thread_id}', {
      params: { path: { thread_id: threadId } },
    });
    if (error) { throw error; }
    return data as Thread;
  }

  async updateThread(threadId: string, update: ThreadUpdateRequest): Promise<Thread> {
    const { data, error } = await this.client.PUT('/api/threads/{thread_id}', {
      params: { path: { thread_id: threadId } },
      body: update,
    });
    if (error) { throw error; }
    return data as Thread;
  }

  async deleteThread(threadId: string): Promise<void> {
    const { error } = await this.client.DELETE('/api/threads/{thread_id}', {
      params: { path: { thread_id: threadId } },
    });
    if (error) { throw error; }
  }
}

export const apiService = new ApiService();
