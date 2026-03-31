/**
 * RunPod ComfyUI Client
 *
 * Backend service for executing ComfyUI workflows on RunPod serverless endpoints.
 * Used by workflow nodes to submit ComfyUI prompts to RunPod and poll for results.
 *
 * API: POST https://api.runpod.ai/v2/{endpointId}/run
 * Status: GET  https://api.runpod.ai/v2/{endpointId}/status/{jobId}
 * Cancel: POST https://api.runpod.ai/v2/{endpointId}/cancel/{jobId}
 */

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const STATUS_POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 900; // 30 minutes at 2s intervals

export type RunPodJobStatus =
  | "IN_QUEUE"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "TIMED_OUT"
  | "CANCELLED";

export interface RunPodImageOutput {
  filename: string;
  type: "base64" | "s3_url";
  data: string;
}

export interface RunPodJobResponse {
  id: string;
  status: RunPodJobStatus;
  delayTime?: number;
  executionTime?: number;
  output?: {
    images?: RunPodImageOutput[];
    errors?: string[];
  };
  error?: string;
}

export interface RunPodComfyInput {
  workflow: Record<string, unknown>;
  images?: Array<{ name: string; image: string }>;
}

const TERMINAL_STATUSES = new Set<RunPodJobStatus>([
  "COMPLETED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
]);

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          reject(new Error("RunPod polling cancelled"));
        },
        { once: true }
      );
    }
  });
}

export class RunPodComfyClient {
  private readonly apiKey: string;
  private readonly endpointId: string;

  constructor(apiKey: string, endpointId: string) {
    if (!apiKey) throw new Error("RunPod API key is required");
    if (!endpointId) throw new Error("RunPod endpoint ID is required");
    this.apiKey = apiKey;
    this.endpointId = endpointId;
  }

  private buildUrl(path: string): string {
    return `${RUNPOD_API_BASE}/${this.endpointId}${path}`;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Submit a ComfyUI workflow (API format) for async execution.
   */
  async submitWorkflow(
    input: RunPodComfyInput
  ): Promise<RunPodJobResponse> {
    const response = await fetch(this.buildUrl("/run"), {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`RunPod /run failed (HTTP ${response.status}): ${text}`);
    }

    return (await response.json()) as RunPodJobResponse;
  }

  /**
   * Get the current status / result of a job.
   */
  async getStatus(jobId: string): Promise<RunPodJobResponse> {
    const response = await fetch(this.buildUrl(`/status/${jobId}`), {
      method: "GET",
      headers: this.headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `RunPod /status failed (HTTP ${response.status}): ${text}`
      );
    }

    return (await response.json()) as RunPodJobResponse;
  }

  /**
   * Cancel a running or queued job.
   */
  async cancelJob(jobId: string): Promise<void> {
    const response = await fetch(this.buildUrl(`/cancel/${jobId}`), {
      method: "POST",
      headers: this.headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `RunPod /cancel failed (HTTP ${response.status}): ${text}`
      );
    }
  }

  /**
   * Check if the endpoint is healthy.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(this.buildUrl("/health"), {
        method: "GET",
        headers: this.headers,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Submit a workflow and poll until it reaches a terminal state.
   * Calls onStatus on each poll for progress tracking.
   */
  async runWorkflow(
    input: RunPodComfyInput,
    options?: {
      onStatus?: (status: RunPodJobResponse) => void;
      signal?: AbortSignal;
    }
  ): Promise<RunPodJobResponse> {
    const submitResponse = await this.submitWorkflow(input);
    const jobId = submitResponse.id;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (options?.signal?.aborted) {
        await this.cancelJob(jobId).catch(() => {
          /* best effort */
        });
        throw new Error("RunPod job cancelled");
      }

      await delay(STATUS_POLL_INTERVAL_MS, options?.signal);

      const statusResponse = await this.getStatus(jobId);
      if (options?.onStatus) {
        options.onStatus(statusResponse);
      }

      if (TERMINAL_STATUSES.has(statusResponse.status)) {
        return statusResponse;
      }
    }

    // Timed out waiting — try to cancel
    await this.cancelJob(jobId).catch(() => {
      /* best effort */
    });
    throw new Error(
      `RunPod job ${jobId} timed out after ${MAX_POLL_ATTEMPTS * STATUS_POLL_INTERVAL_MS / 1000}s`
    );
  }
}
