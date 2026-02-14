/**
 * ComfyUIService
 * 
 * Service for communicating with ComfyUI backend.
 * Fetches node definitions, submits workflows, and streams execution results.
 */

import log from "loglevel";

// ComfyUI node schema types based on /object_info response
export interface ComfyUIInputSpec {
  type: string;
  default?: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  multiline?: boolean;
  tooltip?: string;
}

export interface ComfyUINodeSchema {
  input: {
    required?: Record<string, [string, Record<string, any>?]>;
    optional?: Record<string, [string, Record<string, any>?]>;
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
export interface ComfyUINode {
  id: number;
  type: string;
  pos: [number, number];
  size: [number, number];
  flags: Record<string, any>;
  order: number;
  mode: number;
  inputs?: Array<{
    name: string;
    type: string;
    link: number | null;
  }>;
  outputs?: Array<{
    name: string;
    type: string;
    links: number[];
  }>;
  properties: Record<string, any>;
  widgets_values?: any[];
}

export interface ComfyUILink {
  id: number;
  origin_id: number;
  origin_slot: number;
  target_id: number;
  target_slot: number;
  type: string;
}

export interface ComfyUIWorkflow {
  last_node_id: number;
  last_link_id: number;
  nodes: ComfyUINode[];
  links: ComfyUILink[];
  groups: any[];
  config: Record<string, any>;
  extra: Record<string, any>;
  version: number;
}

// ComfyUI prompt format (for execution)
export interface ComfyUIPrompt {
  [nodeId: string]: {
    inputs: Record<string, any>;
    class_type: string;
  };
}

export interface ComfyUIPromptRequest {
  prompt: ComfyUIPrompt;
  client_id?: string;
}

export interface ComfyUIPromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, any>;
}

export class ComfyUIService {
  private baseUrl: string;
  private clientId: string;
  private wsConnection: WebSocket | null = null;
  private objectInfoCache: ComfyUIObjectInfo | null = null;
  private objectInfoPromise: Promise<ComfyUIObjectInfo> | null = null;

  constructor(baseUrl: string = "http://127.0.0.1:8188") {
    this.baseUrl = baseUrl;
    this.clientId = this.generateClientId();
  }

  private generateClientId(): string {
    return `nodetool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set the ComfyUI backend URL
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
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
      const response = await fetch(`${this.baseUrl}/system_stats`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
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
      const response = await fetch(`${this.baseUrl}/object_info`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch object_info: ${response.statusText}`);
      }

      const data = await response.json();
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
    extraData?: Record<string, any>
  ): Promise<ComfyUIPromptResponse> {
    try {
      const request: ComfyUIPromptRequest = {
        prompt,
        client_id: this.clientId
      };

      if (extraData) {
        (request as any).extra_data = extraData;
      }

      const response = await fetch(`${this.baseUrl}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to submit prompt: ${errorText}`);
      }

      return await response.json();
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
      const response = await fetch(`${this.baseUrl}/interrupt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel prompt: ${response.statusText}`);
      }
    } catch (error) {
      log.error("Failed to cancel ComfyUI prompt:", error);
      throw error;
    }
  }

  /**
   * Get queue status
   */
  async getQueue(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/queue`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Failed to get queue: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      log.error("Failed to get ComfyUI queue:", error);
      throw error;
    }
  }

  /**
   * Get execution history
   */
  async getHistory(promptId?: string): Promise<any> {
    try {
      const url = promptId
        ? `${this.baseUrl}/history/${promptId}`
        : `${this.baseUrl}/history`;

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Failed to get history: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      log.error("Failed to get ComfyUI history:", error);
      throw error;
    }
  }

  /**
   * Connect to ComfyUI WebSocket for real-time updates
   */
  connectWebSocket(
    onMessage: (data: any) => void,
    onError?: (error: Event) => void,
    onClose?: (event: CloseEvent) => void
  ): void {
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      log.warn("WebSocket already connected");
      return;
    }

    const wsUrl = this.baseUrl.replace(/^http/, "ws") + `/ws?clientId=${this.clientId}`;

    try {
      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.onopen = () => {
        log.info("ComfyUI WebSocket connected");
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (error) {
          log.error("Failed to parse WebSocket message:", error);
        }
      };

      this.wsConnection.onerror = (error) => {
        log.error("ComfyUI WebSocket error:", error);
        if (onError) {
          onError(error);
        }
      };

      this.wsConnection.onclose = (event) => {
        log.info("ComfyUI WebSocket closed");
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
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }

  /**
   * Get WebSocket connection status
   */
  isWebSocketConnected(): boolean {
    return this.wsConnection?.readyState === WebSocket.OPEN;
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
