/**
 * RunPodService
 *
 * Service for executing ComfyUI workflows on RunPod serverless endpoints.
 * Uses the RunPod /run (async) API with /status polling for progress updates.
 *
 * RunPod ComfyUI worker expects:
 *   POST https://api.runpod.ai/v2/{endpointId}/run
 *   { "input": { "workflow": { ...comfyPrompt... } } }
 *
 * Statuses: IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED | TIMED_OUT | CANCELLED
 */

import log from "loglevel";
import type { ComfyUIPrompt } from "./ComfyUIService";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";

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

export interface RunPodRunRequest {
  input: {
    workflow: ComfyUIPrompt;
    images?: Array<{ name: string; image: string }>;
  };
}

const STATUS_POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 900; // 30 minutes at 2s intervals

export class RunPodService {
  private apiKey: string;
  private endpointId: string;
  private abortController: AbortController | null = null;

  constructor(apiKey: string, endpointId: string) {
    this.apiKey = apiKey;
    this.endpointId = endpointId;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  setEndpointId(endpointId: string): void {
    this.endpointId = endpointId;
  }

  getEndpointId(): string {
    return this.endpointId;
  }

  private buildUrl(path: string): string {
    return `${RUNPOD_API_BASE}/${this.endpointId}${path}`;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }

  /**
   * Check if the RunPod endpoint is reachable by hitting /health.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(this.buildUrl("/health"), {
        method: "GET",
        headers: this.headers
      });
      return response.ok;
    } catch (error) {
      log.warn("RunPod health check failed:", error);
      return false;
    }
  }

  /**
   * Submit a ComfyUI workflow for async execution.
   * Returns the job id immediately.
   */
  async submitWorkflow(
    prompt: ComfyUIPrompt,
    images?: Array<{ name: string; image: string }>
  ): Promise<RunPodJobResponse> {
    const body: RunPodRunRequest = {
      input: {
        workflow: prompt,
        ...(images && images.length > 0 ? { images } : {})
      }
    };

    const response = await fetch(this.buildUrl("/run"), {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `RunPod /run failed (HTTP ${response.status}): ${text}`
      );
    }

    return (await response.json()) as RunPodJobResponse;
  }

  /**
   * Poll the status of a job until it reaches a terminal state.
   * Calls onStatus on every poll so the UI can reflect progress.
   */
  async pollUntilComplete(
    jobId: string,
    onStatus?: (status: RunPodJobResponse) => void
  ): Promise<RunPodJobResponse> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (signal.aborted) {
        throw new Error("RunPod polling cancelled");
      }

      const statusResponse = await this.getStatus(jobId);
      if (onStatus) {
        onStatus(statusResponse);
      }

      const terminal: RunPodJobStatus[] = [
        "COMPLETED",
        "FAILED",
        "TIMED_OUT",
        "CANCELLED"
      ];
      if (terminal.includes(statusResponse.status)) {
        this.abortController = null;
        return statusResponse;
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, STATUS_POLL_INTERVAL_MS);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(new Error("RunPod polling cancelled"));
          },
          { once: true }
        );
      });
    }

    this.abortController = null;
    throw new Error("RunPod job timed out waiting for completion");
  }

  /**
   * Get the current status of a job.
   */
  async getStatus(jobId: string): Promise<RunPodJobResponse> {
    const response = await fetch(this.buildUrl(`/status/${jobId}`), {
      method: "GET",
      headers: this.headers
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
   * Cancel a running job.
   */
  async cancelJob(jobId: string): Promise<void> {
    // Stop polling first
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    try {
      const response = await fetch(this.buildUrl(`/cancel/${jobId}`), {
        method: "POST",
        headers: this.headers
      });

      if (!response.ok) {
        log.warn(`RunPod /cancel failed: HTTP ${response.status}`);
      }
    } catch (error) {
      log.warn("RunPod cancel request failed:", error);
    }
  }

  /**
   * Stop any active polling without cancelling the remote job.
   */
  stopPolling(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
