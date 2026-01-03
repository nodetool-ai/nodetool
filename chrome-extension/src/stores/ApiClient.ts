/**
 * API Client for the Chrome extension.
 * Uses fetch for HTTP requests to the Nodetool server.
 */
import log from "loglevel";
import {
  Thread,
  ThreadList,
  MessageList,
  ThreadUpdateRequest,
  ThreadSummarizeRequest,
  LanguageModel,
  ProviderInfo,
  WorkflowTool
} from "./ApiTypes";

export interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;
}

export class ApiClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  setApiKey(apiKey: string | undefined): void {
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ data?: T; error?: { detail?: { msg: string }[] } }> {
    const url = `${this.baseUrl}${path}`;
    const headers: HeadersInit = {
      "Content-Type": "application/json"
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        return {
          error: {
            detail: [{ msg: errorData?.detail || `HTTP ${response.status}` }]
          }
        };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      log.error(`API request failed: ${method} ${path}`, error);
      return {
        error: {
          detail: [
            { msg: error instanceof Error ? error.message : "Request failed" }
          ]
        }
      };
    }
  }

  async GET<T>(path: string): Promise<{ data?: T; error?: { detail?: { msg: string }[] } }> {
    return this.request<T>("GET", path);
  }

  async POST<T>(
    path: string,
    body?: unknown
  ): Promise<{ data?: T; error?: { detail?: { msg: string }[] } }> {
    return this.request<T>("POST", path, body);
  }

  async PUT<T>(
    path: string,
    body?: unknown
  ): Promise<{ data?: T; error?: { detail?: { msg: string }[] } }> {
    return this.request<T>("PUT", path, body);
  }

  async DELETE<T>(path: string): Promise<{ data?: T; error?: { detail?: { msg: string }[] } }> {
    return this.request<T>("DELETE", path);
  }

  // Thread API methods
  async getThreads(limit = 100): Promise<{ data?: ThreadList; error?: { detail?: { msg: string }[] } }> {
    return this.GET<ThreadList>(`/api/threads/?limit=${limit}`);
  }

  async getThread(
    threadId: string
  ): Promise<{ data?: Thread; error?: { detail?: { msg: string }[] } }> {
    return this.GET<Thread>(`/api/threads/${threadId}`);
  }

  async createThread(
    title?: string
  ): Promise<{ data?: Thread; error?: { detail?: { msg: string }[] } }> {
    return this.POST<Thread>("/api/threads/", { title });
  }

  async updateThread(
    threadId: string,
    request: ThreadUpdateRequest
  ): Promise<{ data?: Thread; error?: { detail?: { msg: string }[] } }> {
    return this.PUT<Thread>(`/api/threads/${threadId}`, request);
  }

  async deleteThread(
    threadId: string
  ): Promise<{ data?: void; error?: { detail?: { msg: string }[] } }> {
    return this.DELETE<void>(`/api/threads/${threadId}`);
  }

  async summarizeThread(
    threadId: string,
    request: ThreadSummarizeRequest
  ): Promise<{ data?: Thread; error?: { detail?: { msg: string }[] } }> {
    return this.POST<Thread>(`/api/threads/${threadId}/summarize`, request);
  }

  // Message API methods
  async getMessages(
    threadId: string,
    cursor?: string,
    limit = 100
  ): Promise<{ data?: MessageList; error?: { detail?: { msg: string }[] } }> {
    const params = new URLSearchParams({ thread_id: threadId, limit: String(limit) });
    if (cursor) {
      params.set("cursor", cursor);
    }
    return this.GET<MessageList>(`/api/messages/?${params.toString()}`);
  }

  // Provider and Model API methods
  async getProviders(): Promise<{ data?: ProviderInfo[]; error?: { detail?: { msg: string }[] } }> {
    return this.GET<ProviderInfo[]>("/api/models/providers");
  }

  async getLanguageModels(
    provider: string
  ): Promise<{ data?: LanguageModel[]; error?: { detail?: { msg: string }[] } }> {
    return this.GET<LanguageModel[]>(`/api/models/llm/${provider}`);
  }

  // Workflow Tools API
  async getWorkflowTools(): Promise<{ data?: WorkflowTool[]; error?: { detail?: { msg: string }[] } }> {
    return this.GET<WorkflowTool[]>("/api/workflows/tools");
  }
}

// Default client instance
export const apiClient = new ApiClient({
  baseUrl: "http://localhost:7777"
});

// Export isLocalhost for compatibility
export const isLocalhost = true;
