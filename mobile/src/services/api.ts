import createClient, { type Middleware } from 'openapi-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { paths } from '../api';

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
    const loggerMiddleware: Middleware = {
      onRequest: async ({ request }) => {
        console.log(`[API Request] ${request.method} ${request.url}`);
        return request;
      },
      onResponse: async ({ response, request }) => { // Add request to arg destructuring
        console.log(`[API Response] ${response.status} ${request.url}`);
        // Clone response to log body if needed, but be careful with streams
        return response;
      },
    };
    
    // Eject existing middleware if any - openapi-fetch < 0.8 doesn't support eject easily 
    // but in a class we can just recreate the client on host change. 
    // For now, just add.
    this.client.use(loggerMiddleware);
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

  async getWorkflows(limit: number = 100): Promise<any> {
    const { data, error } = await this.client.GET('/api/workflows/', {
      params: {
        query: { limit },
      },
    });
    if (error) {throw error;}
    return data;
  }

  async getWorkflow(id: string): Promise<any> {
    const { data, error } = await this.client.GET('/api/workflows/{id}', {
      params: {
        path: { id } as any, // Generated types might use different param names, check paths
      },
    });
    if (error) {throw error;}
    return data;
  }

  async runWorkflow(id: string, params: Record<string, unknown>): Promise<any> {
    const { data, error } = await this.client.POST('/api/workflows/{id}/run', {
      params: {
        path: { id } as any,
      },
      body: params as any, // Check generated body type
    });
    if (error) {throw error;}
    return data;
  }

  async getLanguageModelProviders(): Promise<any[]> {
    const { data, error } = await this.client.GET('/api/models/providers');
    if (error) {throw error;}
    
    // Filter for providers that support 'generate_message'
    return (data || []).filter((p: any) => 
      p.capabilities && p.capabilities.includes('generate_message')
    );
  }

  async getLanguageModels(provider: string): Promise<any[]> {
    // Cast provider to correct enum type or string as needed by generated types
    const { data, error } = await this.client.GET('/api/models/llm/{provider}', {
      params: {
        path: { provider: provider as any },
      },
    });
    if (error) {throw error;}
    return data || [];
  }

  getWebSocketUrl(path: string): string {
    const wsProtocol = this.apiHost.startsWith('https') ? 'wss:' : 'ws:';
    const url = this.apiHost.replace(/^https?:/, wsProtocol);
    return `${url}${path}`;
  }
}

export const apiService = new ApiService();
