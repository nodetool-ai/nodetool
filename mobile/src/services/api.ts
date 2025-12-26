// API client service - adapted from web/src/stores/ApiClient.ts
import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_HOST_KEY = '@nodetool_api_host';
const DEFAULT_API_HOST = 'http://localhost:8000';

class ApiService {
  private client: AxiosInstance;
  private apiHost: string = DEFAULT_API_HOST;

  constructor() {
    this.client = axios.create({
      baseURL: this.apiHost,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
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
    this.client = axios.create({
      baseURL: host,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async getWorkflows(limit: number = 100): Promise<any> {
    const response = await this.client.get('/api/workflows/', {
      params: { limit },
    });
    return response.data;
  }

  async getWorkflow(id: string): Promise<any> {
    const response = await this.client.get(`/api/workflows/${id}`);
    return response.data;
  }

  async runWorkflow(id: string, params: Record<string, unknown>): Promise<any> {
    const response = await this.client.post(`/api/workflows/${id}/run`, params);
    return response.data;
  }

  getWebSocketUrl(path: string): string {
    const wsProtocol = this.apiHost.startsWith('https') ? 'wss:' : 'ws:';
    const url = this.apiHost.replace(/^https?:/, wsProtocol);
    return `${url}${path}`;
  }
}

export const apiService = new ApiService();
