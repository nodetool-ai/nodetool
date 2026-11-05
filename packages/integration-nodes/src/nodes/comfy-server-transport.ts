/**
 * Run a Comfy workflow on a self-hosted ComfyUI through its native API
 * (`/prompt`, `/ws`, `/history`, `/view`, `/upload/image`).
 *
 * This gives the native executor the same {@link ComfyTransport} shape as the
 * Comfy API v2, so the workflow runner does not depend on where a job runs.
 */

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
  executeComfy,
  uploadComfyFile,
  type ComfyFileOutput,
  type ComfyNodeOutputs,
  type ComfyProgressEvent
} from "@nodetool-ai/runtime";
import type {
  ComfyJob,
  ComfyJobError,
  ComfyOutput,
  ComfyPrompt,
  ComfyRunEvent,
  ComfyTransport
} from "./comfy-sdk.js";

interface PendingUpload {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

const KINDS = [
  ["images", "image"],
  ["audio", "audio"],
  ["video", "video"]
] as const;

function toOutput(
  nodeId: string,
  type: ComfyOutput["type"],
  file: ComfyFileOutput
): ComfyOutput {
  const bytes = Buffer.from(file.data, "base64");
  return {
    nodeId,
    name: file.filename,
    id: `${nodeId}:${type}:${file.filename}`,
    type,
    contentType: file.mimeType,
    sizeBytes: bytes.byteLength,
    toBytes: async () => bytes
  };
}

class ComfyServerJob implements ComfyJob {
  readonly id = randomUUID();
  status = "queued";
  outputs: ComfyOutput[] = [];
  error: ComfyJobError | null = null;
  private cancelRun: () => void = () => {};
  private readonly queue: ComfyRunEvent[] = [];
  private wake: () => void = () => {};
  private settled = false;

  constructor(prompt: ComfyPrompt, url: string, timeoutMs: number) {
    const { result, cancel } = executeComfy(
      prompt,
      url,
      (event) => this.onProgress(event),
      timeoutMs,
      (nodeId, outputs) => this.onOutputs(nodeId, outputs)
    );
    this.cancelRun = cancel;
    void result
      .then((outcome) => {
        if (outcome.status === "completed") {
          this.setStatus("succeeded");
        } else if (this.status !== "canceled") {
          this.fail(outcome.error ?? "ComfyUI reported a failure");
        }
      })
      .catch((err: unknown) => {
        this.fail(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        this.settled = true;
        this.wake();
      });
  }

  private push(event: ComfyRunEvent): void {
    this.queue.push(event);
    this.wake();
  }

  private setStatus(status: string): void {
    if (this.status === status) return;
    this.status = status;
    this.push({ kind: "statusChange", status, queuePosition: null });
  }

  private fail(message: string): void {
    this.error = { code: "comfy_server_error", message };
    this.setStatus("failed");
  }

  private onProgress(event: ComfyProgressEvent): void {
    if (event.type === "execution_start") {
      this.setStatus("running");
    } else if (event.type === "execution_interrupted") {
      this.setStatus("canceled");
    } else if (event.type === "executing" && event.node) {
      this.setStatus("running");
      this.push(this.progressEvent(event.node, null, null));
    } else if (
      event.type === "progress" &&
      typeof event.progress === "number" &&
      typeof event.total === "number" &&
      event.total > 0
    ) {
      this.push(this.progressEvent(event.node ?? null, event.progress, event.total));
    }
  }

  private progressEvent(
    currentNode: string | null,
    step: number | null,
    steps: number | null
  ): ComfyRunEvent {
    return {
      kind: "progress",
      value: step !== null && steps ? step / steps : 0,
      message: null,
      nodesDone: null,
      nodesTotal: null,
      currentNode,
      step,
      steps
    };
  }

  private onOutputs(nodeId: string, outputs: ComfyNodeOutputs): void {
    for (const [group, type] of KINDS) {
      for (const file of outputs[group] ?? []) {
        const output = toOutput(nodeId, type, file);
        this.outputs.push(output);
        this.push({ kind: "outputReady", output });
      }
    }
  }

  async *events(signal?: AbortSignal): AsyncGenerator<ComfyRunEvent, void, void> {
    const onAbort = (): void => this.wake();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      for (;;) {
        const event = this.queue.shift();
        if (event) {
          yield event;
          continue;
        }
        if (signal?.aborted) {
          const error = new Error("Comfy job was canceled");
          error.name = "AbortError";
          throw error;
        }
        if (this.settled) return;
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async refresh(): Promise<this> {
    return this;
  }

  async cancel(): Promise<this> {
    this.cancelRun();
    this.status = "canceled";
    return this;
  }
}

/** A ComfyUI server at `url`, with no authentication. */
export function serverTransport(url: string, timeoutMs: number): ComfyTransport {
  const uploads = new WeakMap<object, PendingUpload>();
  return {
    async submit(graph) {
      for (const node of Object.values(graph)) {
        for (const [field, value] of Object.entries(node.inputs)) {
          const upload =
            typeof value === "object" && value !== null ? uploads.get(value) : undefined;
          if (upload) {
            node.inputs[field] = await uploadComfyFile(
              url,
              upload.bytes,
              upload.filename,
              upload.contentType
            );
          }
        }
      }
      return new ComfyServerJob(graph, url, timeoutMs);
    },
    assetFromBytes(bytes, filename, contentType) {
      const handle = {};
      uploads.set(handle, { bytes, filename, contentType });
      return handle;
    }
  };
}
