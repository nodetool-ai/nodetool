/**
 * HTTP client for the workflow endpoints a deployed NodeTool server exposes.
 *
 * Only routes the Fastify server actually registers live here. The `/admin/*`
 * surface this client used to carry (db rows, assets, model downloads,
 * collections) was ported from the retired Python server and never mounted, so
 * every one of those calls answered 404.
 */

export interface AdminHTTPClientOptions {
  baseUrl: string;
  authToken?: string;
}

export class AdminHTTPClient {
  readonly baseUrl: string;
  readonly headers: Record<string, string>;

  constructor(options: AdminHTTPClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    if (options.authToken) {
      this.headers["Authorization"] = `Bearer ${options.authToken}`;
    }
  }

  private async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    options?: { body?: unknown }
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
    }

    return (await response.json()) as T;
  }

  async healthCheck(): Promise<Record<string, unknown>> {
    return this.request("GET", "/health");
  }

  async listWorkflows(): Promise<Record<string, unknown>> {
    return this.request("GET", "/api/workflows/");
  }

  async updateWorkflow(
    workflowId: string,
    workflow: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.request("PUT", `/api/workflows/${workflowId}`, {
      body: workflow
    });
  }

  async deleteWorkflow(workflowId: string): Promise<Record<string, unknown>> {
    return this.request("DELETE", `/api/workflows/${workflowId}`);
  }

  async runWorkflow(
    workflowId: string,
    params?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.request("POST", `/api/workflows/${workflowId}/run`, {
      body: { params: params ?? {} }
    });
  }
}
