/**
 * ComfyUIService
 * 
 * Service for communicating with ComfyUI backend.
 * Fetches node definitions, submits workflows, and streams execution results.
 */

import log from "loglevel";

const COMFY_DEV_PROXY_BASE_URL = "/comfy-api";
const COMFY_DIRECT_DEFAULT_BASE_URL = "http://localhost:8000/api";

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");
const isAbsoluteHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);
const hasLocalhostProxyBridge = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.api?.localhostProxy?.request === "function";

interface ProcessLike {
  env?: Record<string, string | undefined>;
}

const getProcessEnvVar = (name: string): string | undefined => {
  const processLike = (globalThis as { process?: ProcessLike }).process;
  return processLike?.env?.[name];
};

const isDevEnvironment = getProcessEnvVar("NODE_ENV") === "development";

const isLocalComfyApiUrl = (value: string): boolean => {
  const normalized = trimTrailingSlash(value);
  return (
    normalized === "http://localhost:8000/api" ||
    normalized === "http://127.0.0.1:8000/api"
  );
};

export const getDefaultComfyBaseUrl = (): string => {
  const configured = getProcessEnvVar("VITE_COMFYUI_BASE_URL");
  if (configured && configured.trim().length > 0) {
    return trimTrailingSlash(configured.trim());
  }
  // In Electron renderer, prefer direct localhost URL so requests can use
  // the main-process localhost proxy bridge.
  if (hasLocalhostProxyBridge()) {
    return COMFY_DIRECT_DEFAULT_BASE_URL;
  }
  return isDevEnvironment ? COMFY_DEV_PROXY_BASE_URL : COMFY_DIRECT_DEFAULT_BASE_URL;
};

export const normalizeComfyBaseUrl = (url: string): string => {
  const trimmed = trimTrailingSlash(url.trim());
  if (!trimmed) {
    return getDefaultComfyBaseUrl();
  }

  // In Electron renderer, recover persisted dev proxy URLs to a direct URL.
  if (hasLocalhostProxyBridge() && trimmed === COMFY_DEV_PROXY_BASE_URL) {
    return COMFY_DIRECT_DEFAULT_BASE_URL;
  }

  // If a dev-only proxy URL is persisted in localStorage, recover to direct URL
  // in non-dev environments (e.g. Electron packaged app).
  if (!isDevEnvironment && trimmed === COMFY_DEV_PROXY_BASE_URL) {
    return COMFY_DIRECT_DEFAULT_BASE_URL;
  }

  // In local web dev, route default local Comfy URLs through Vite proxy to avoid CORS.
  if (isDevEnvironment && isLocalComfyApiUrl(trimmed)) {
    return COMFY_DEV_PROXY_BASE_URL;
  }

  return trimmed;
};

const buildComfyUrl = (baseUrl: string, path: string): string => {
  const normalizedBase = trimTrailingSlash(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const getComfyWsBaseUrl = (baseUrl: string): string => {
  if (isAbsoluteHttpUrl(baseUrl)) {
    return baseUrl.replace(/^http/i, "ws");
  }

  if (baseUrl.startsWith("/") && typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${baseUrl}`;
  }

  return baseUrl;
};

const isLocalhostAbsoluteUrl = (urlValue: string): boolean => {
  try {
    const parsed = new URL(urlValue);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
};

interface ComfyWebSocketConnection {
  readyState: number;
  close: (code?: number, reason?: string) => void;
}

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

// ComfyUI WebSocket message types
export type ComfyUIWSMessageData = {
  type: string;
  data?: unknown;
  [key: string]: unknown;
};

// ComfyUI node schema types based on /object_info response
export type ComfyUIInputDefaultValue = string | number | boolean | null;

export interface ComfyUIInputSpec {
  type: string;
  default?: ComfyUIInputDefaultValue;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  multiline?: boolean;
  tooltip?: string;
}

export type ComfyUIInputParameter = [string, Record<string, unknown>?];

export interface ComfyUINodeSchema {
  input: {
    required?: Record<string, ComfyUIInputParameter>;
    optional?: Record<string, ComfyUIInputParameter>;
  };
  output: string[];
  output_is_list: boolean[];
  output_name: string[];
  name: string;
  display_name: string;
  description: string;
  category: string;
  output_node: boolean;
}

export interface ComfyUIObjectInfo {
  [nodeName: string]: ComfyUINodeSchema;
}

// ComfyUI workflow format
export interface ComfyUINodeInput {
  name: string;
  type: string;
  link: number | null;
}

export interface ComfyUINodeOutput {
  name: string;
  type: string;
  links: number[];
}

export interface ComfyUINode {
  id: number;
  type: string;
  pos: [number, number];
  size: [number, number];
  flags: Record<string, unknown>;
  order: number;
  mode: number;
  inputs?: ComfyUINodeInput[];
  outputs?: ComfyUINodeOutput[];
  properties: Record<string, unknown>;
  widgets_values?: unknown[];
}

export interface ComfyUILink {
  id: number;
  origin_id: number;
  origin_slot: number;
  target_id: number;
  target_slot: number;
  type: string;
}

export interface ComfyUIGroup {
  id?: number;
  title: string;
  bounding: [number, number, number, number];
  color: string;
  font_size: number;
  locked?: boolean;
}

export interface ComfyUIWorkflow {
  last_node_id: number;
  last_link_id: number;
  nodes: ComfyUINode[];
  links: ComfyUILink[];
  groups: ComfyUIGroup[];
  config: Record<string, unknown>;
  extra: Record<string, unknown>;
  version: number;
}

// ComfyUI prompt format (for execution)
export interface ComfyUIPromptNode {
  inputs: Record<string, unknown>;
  class_type: string;
}

export interface ComfyUIPrompt {
  [nodeId: string]: ComfyUIPromptNode;
}

export interface ComfyUIPromptRequest {
  prompt: ComfyUIPrompt;
  client_id?: string;
  extra_data?: Record<string, unknown>;
}

export interface ComfyUIPromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

export interface ComfyUIQueueItem {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

export interface ComfyUIQueueResponse {
  queue_running: ComfyUIQueueItem[];
  queue_pending: Array<[number, ComfyUIQueueItem]>;
}

export interface ComfyUIHistoryItem {
  prompt: ComfyUIPrompt;
  outputs: Record<string, unknown>;
}

export interface ComfyUIHistoryResponse {
  [promptId: string]: ComfyUIHistoryItem;
}

export class ComfyUIService {
  private baseUrl: string;
  private clientId: string;
  private wsConnection: ComfyWebSocketConnection | null = null;
  private wsProxyConnectionId: string | null = null;
  private wsProxyUnsubscribe: (() => void) | null = null;
  private wsProxyPendingOpen = false;
  private objectInfoCache: ComfyUIObjectInfo | null = null;
  private objectInfoPromise: Promise<ComfyUIObjectInfo> | null = null;

  constructor(baseUrl: string = getDefaultComfyBaseUrl()) {
    this.baseUrl = normalizeComfyBaseUrl(baseUrl);
    this.clientId = this.generateClientId();
  }

  private generateClientId(): string {
    return `nodetool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async comfyRequest<T = unknown>(
    path: string,
    options?: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
      body?: string;
      responseType?: "json" | "text";
    }
  ): Promise<{ ok: boolean; status: number; data: T; statusText: string }> {
    const method = options?.method || "GET";
    const responseType = options?.responseType || "json";
    const requestBaseUrl =
      hasLocalhostProxyBridge() && this.baseUrl === COMFY_DEV_PROXY_BASE_URL
        ? COMFY_DIRECT_DEFAULT_BASE_URL
        : this.baseUrl;
    const url = buildComfyUrl(requestBaseUrl, path);

    if (
      typeof window !== "undefined" &&
      window.api?.localhostProxy?.request &&
      isLocalhostAbsoluteUrl(url)
    ) {
      try {
        const proxyResponse = await window.api.localhostProxy.request({
          url,
          method,
          headers: { "Content-Type": "application/json" },
          body: options?.body,
          responseType
        });
        return {
          ok: proxyResponse.ok,
          status: proxyResponse.status,
          data: proxyResponse.data as T,
          statusText: String(proxyResponse.headers["status-text"] || "")
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.warn(
          `[ComfyUIService] Localhost proxy request failed for ${method} ${url}: ${errorMessage}`
        );
        return {
          ok: false,
          status: 0,
          data: (responseType === "json" ? null : "") as T,
          statusText: errorMessage
        };
      }
    }

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: options?.body
    });
    const data =
      responseType === "json"
        ? ((await response.json()) as T)
        : ((await response.text()) as T);

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data
    };
  }

  private parseJsonValue<T>(value: unknown, context: string): T {
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as T;
      } catch (error) {
        throw new Error(`Invalid JSON response for ${context}: ${String(error)}`);
      }
    }
    return value as T;
  }

  /**
   * Set the ComfyUI backend URL
   */
  setBaseUrl(url: string): void {
    this.baseUrl = normalizeComfyBaseUrl(url);
    // Clear cache when URL changes
    this.objectInfoCache = null;
    this.objectInfoPromise = null;
  }

  /**
   * Get the current ComfyUI backend URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Check if ComfyUI backend is reachable
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await this.comfyRequest("/object_info", {
        method: "GET",
        responseType: "text"
      });
      return response.ok;
    } catch (error) {
      log.warn("ComfyUI connection check failed:", error);
      return false;
    }
  }

  /**
   * Fetch node definitions from ComfyUI /object_info endpoint
   */
  async fetchObjectInfo(forceRefresh = false): Promise<ComfyUIObjectInfo> {
    // Return cached data if available and not forcing refresh
    if (this.objectInfoCache && !forceRefresh) {
      return this.objectInfoCache;
    }

    // If a fetch is already in progress, wait for it
    if (this.objectInfoPromise && !forceRefresh) {
      return this.objectInfoPromise;
    }

    // Start new fetch
    this.objectInfoPromise = this.fetchObjectInfoInternal();
    return this.objectInfoPromise;
  }

  private async fetchObjectInfoInternal(): Promise<ComfyUIObjectInfo> {
    try {
      const response = await this.comfyRequest<string>("/object_info", {
        method: "GET",
        responseType: "text"
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch object_info: HTTP ${response.status}`);
      }

      const data = this.parseJsonValue<ComfyUIObjectInfo>(
        response.data,
        "object_info"
      );
      this.objectInfoCache = data;
      this.objectInfoPromise = null;
      return data;
    } catch (error) {
      this.objectInfoPromise = null;
      log.error("Failed to fetch ComfyUI object_info:", error);
      throw error;
    }
  }

  /**
   * Submit a prompt (workflow) to ComfyUI for execution
   */
  async submitPrompt(
    prompt: ComfyUIPrompt,
    extraData?: Record<string, unknown>
  ): Promise<ComfyUIPromptResponse> {
    try {
      const request: ComfyUIPromptRequest = {
        prompt,
        client_id: this.clientId,
        ...(extraData && { extra_data: extraData })
      };

      const response = await this.comfyRequest<string>("/prompt", {
        method: "POST",
        body: JSON.stringify(request),
        responseType: "text"
      });

      if (!response.ok) {
        throw new Error(`Failed to submit prompt: ${String(response.data)}`);
      }

      return this.parseJsonValue<ComfyUIPromptResponse>(
        response.data,
        "prompt"
      );
    } catch (error) {
      log.error("Failed to submit ComfyUI prompt:", error);
      throw error;
    }
  }

  /**
   * Cancel a running prompt
   */
  async cancelPrompt(_promptId: string): Promise<void> {
    try {
      const response = await this.comfyRequest("/interrupt", {
        method: "POST",
        responseType: "text"
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel prompt: HTTP ${response.status}`);
      }
    } catch (error) {
      log.error("Failed to cancel ComfyUI prompt:", error);
      throw error;
    }
  }

  /**
   * Get queue status
   */
  async getQueue(): Promise<ComfyUIQueueResponse> {
    try {
      const response = await this.comfyRequest<string>("/queue", {
        method: "GET",
        responseType: "text"
      });

      if (!response.ok) {
        throw new Error(`Failed to get queue: HTTP ${response.status}`);
      }

      return this.parseJsonValue<ComfyUIQueueResponse>(response.data, "queue");
    } catch (error) {
      log.error("Failed to get ComfyUI queue:", error);
      throw error;
    }
  }

  /**
   * Get execution history
   */
  async getHistory(promptId?: string): Promise<ComfyUIHistoryResponse> {
    try {
      const path = promptId ? `/history/${promptId}` : "/history";
      const response = await this.comfyRequest<string>(path, {
        method: "GET",
        responseType: "text"
      });

      if (!response.ok) {
        throw new Error(`Failed to get history: HTTP ${response.status}`);
      }

      return this.parseJsonValue<ComfyUIHistoryResponse>(response.data, "history");
    } catch (error) {
      log.error("Failed to get ComfyUI history:", error);
      throw error;
    }
  }

  /**
   * Connect to ComfyUI WebSocket for real-time updates
   */
  connectWebSocket(
    onMessage: (data: ComfyUIWSMessageData) => void,
    onError?: (error: Event) => void,
    onClose?: (event: CloseEvent) => void
  ): void {
    if (this.wsConnection?.readyState === WS_OPEN) {
      log.warn("WebSocket already connected");
      return;
    }

    const wsBaseUrl = getComfyWsBaseUrl(
      hasLocalhostProxyBridge() && this.baseUrl === COMFY_DEV_PROXY_BASE_URL
        ? COMFY_DIRECT_DEFAULT_BASE_URL
        : this.baseUrl
    );
    const wsUrl = `${trimTrailingSlash(wsBaseUrl)}/ws?clientId=${this.clientId}`;

    if (
      hasLocalhostProxyBridge() &&
      isLocalhostAbsoluteUrl(wsUrl) &&
      window.api?.localhostProxy?.wsOpen &&
      window.api?.localhostProxy?.onWsEvent &&
      window.api?.localhostProxy?.wsClose
    ) {
      const proxyConnection: ComfyWebSocketConnection = {
        readyState: WS_CONNECTING,
        close: (code?: number, reason?: string) => {
          const connectionId = this.wsProxyConnectionId;
          if (!connectionId || !window.api?.localhostProxy?.wsClose) {
            return;
          }
          proxyConnection.readyState = WS_CLOSING;
          void window.api.localhostProxy.wsClose({
            connectionId,
            code,
            reason,
          });
        },
      };

      this.wsConnection = proxyConnection;
      this.wsProxyPendingOpen = true;

      this.wsProxyUnsubscribe = window.api.localhostProxy.onWsEvent((event) => {
        if (
          this.wsProxyConnectionId &&
          event.connectionId !== this.wsProxyConnectionId
        ) {
          return;
        }
        if (!this.wsProxyConnectionId) {
          this.wsProxyConnectionId = event.connectionId;
        }

        if (event.event === "open") {
          proxyConnection.readyState = WS_OPEN;
          log.info("ComfyUI WebSocket connected (proxied)");
          return;
        }

        if (event.event === "message") {
          if (!event.data) {
            log.warn("ComfyUI WebSocket proxied message event with empty payload");
            return;
          }
          log.info(
            `ComfyUI WebSocket proxied message received (${event.data.length} chars)`
          );
          try {
            const data = JSON.parse(event.data);
            const typed = data as { type?: string; data?: unknown };
            log.info("ComfyUI WebSocket proxied parsed message", {
              type: typed?.type ?? "unknown",
              hasData: typed?.data !== undefined,
            });
            onMessage(data);
          } catch (error) {
            log.error("Failed to parse proxied WebSocket message:", error);
          }
          return;
        }

        if (event.event === "error") {
          log.error("ComfyUI WebSocket proxy error:", event.error);
          if (onError) {
            onError(new Event("error"));
          }
          return;
        }

        if (event.event === "close") {
          this.wsProxyPendingOpen = false;
          proxyConnection.readyState = WS_CLOSED;
          log.info("ComfyUI WebSocket closed (proxied)");

          if (this.wsProxyUnsubscribe) {
            this.wsProxyUnsubscribe();
            this.wsProxyUnsubscribe = null;
          }
          this.wsProxyConnectionId = null;
          this.wsConnection = null;

          if (onClose) {
            onClose({
              code: event.code || 1000,
              reason: event.reason || "",
              wasClean: true,
            } as CloseEvent);
          }
        }
      });

      void window.api.localhostProxy
        .wsOpen({ url: wsUrl })
        .then((result) => {
          if (
            !this.wsProxyPendingOpen ||
            this.wsConnection !== proxyConnection ||
            !this.wsProxyUnsubscribe
          ) {
            if (window.api?.localhostProxy?.wsClose) {
              void window.api.localhostProxy.wsClose({
                connectionId: result.connectionId,
              });
            }
            return;
          }
          this.wsProxyConnectionId = result.connectionId;
          this.wsProxyPendingOpen = false;
        })
        .catch((error) => {
          this.wsProxyPendingOpen = false;
          proxyConnection.readyState = WS_CLOSED;
          log.error("Failed to open proxied ComfyUI WebSocket:", error);
          if (this.wsProxyUnsubscribe) {
            this.wsProxyUnsubscribe();
            this.wsProxyUnsubscribe = null;
          }
          this.wsProxyConnectionId = null;
          this.wsConnection = null;
          if (onError) {
            onError(new Event("error"));
          }
        });

      return;
    }

    try {
      const browserSocket = new WebSocket(wsUrl);
      this.wsConnection = browserSocket;

      browserSocket.onopen = () => {
        log.info("ComfyUI WebSocket connected");
      };

      browserSocket.onmessage = (event) => {
        const rawData = typeof event.data === "string"
          ? event.data
          : String(event.data);
        log.info(
          `ComfyUI WebSocket message received (${rawData.length} chars)`
        );
        try {
          const data = JSON.parse(event.data);
          const typed = data as { type?: string; data?: unknown };
          log.info("ComfyUI WebSocket parsed message", {
            type: typed?.type ?? "unknown",
            hasData: typed?.data !== undefined,
          });
          onMessage(data);
        } catch (error) {
          log.error("Failed to parse WebSocket message:", error);
        }
      };

      browserSocket.onerror = (error) => {
        log.error("ComfyUI WebSocket error:", error);
        if (onError) {
          onError(error);
        }
      };

      browserSocket.onclose = (event) => {
        log.info("ComfyUI WebSocket closed");
        this.wsConnection = null;
        if (onClose) {
          onClose(event);
        }
      };
    } catch (error) {
      log.error("Failed to connect ComfyUI WebSocket:", error);
      throw error;
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    this.wsProxyPendingOpen = false;
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    if (this.wsProxyUnsubscribe) {
      this.wsProxyUnsubscribe();
      this.wsProxyUnsubscribe = null;
    }
    this.wsProxyConnectionId = null;
  }

  /**
   * Get WebSocket connection status
   */
  isWebSocketConnected(): boolean {
    return this.wsConnection?.readyState === WS_OPEN;
  }
}

// Singleton instance
let comfyUIServiceInstance: ComfyUIService | null = null;

/**
 * Get the singleton ComfyUIService instance
 */
export const getComfyUIService = (): ComfyUIService => {
  if (!comfyUIServiceInstance) {
    comfyUIServiceInstance = new ComfyUIService();
  }
  return comfyUIServiceInstance;
};
