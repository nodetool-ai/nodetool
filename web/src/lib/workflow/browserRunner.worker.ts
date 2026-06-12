/// <reference lib="webworker" />
/**
 * In-browser workflow runner — Web Worker.
 *
 * Runs the kernel + node executors off the main thread so a workflow run never
 * blocks the editor/canvas — most valuable for the CPU-fallback image nodes
 * (Canny, histogram enhancers, RankFilter) that loop over full-res RGBA in JS.
 * GPU (`navigator.gpu`) and the codec (`OffscreenCanvas`) both work in a worker.
 *
 * Protocol (see `browserWorkerClient.ts` for the main-thread half):
 *   ← { type: "ready", browserNodeTypes }   once, after the registry builds
 *   ← { type: "init-error", error }         registry build failed → main falls back
 *   ← { type: "messages", jobId, messages } a batch of kernel ProcessingMessages
 *   ← { type: "done", jobId, status, error }
 *   → { type: "run", jobId, graph, params, workflowId }
 *   → { type: "cancel", jobId }
 *   → { type: "update-properties", jobId, nodeId, properties }   live params
 *
 * Messages are BATCHED: streaming nodes (realtime audio) emit hundreds of
 * messages per second, and one postMessage → one main-thread task each would
 * dominate the main thread. Messages buffer for up to BATCH_INTERVAL_MS and
 * cross as a single postMessage; the client delivers them in order.
 *
 * Messages are streamed with image outputs resolved for transport: GPU textures
 * are read back to CPU, then converted to transferable ImageBitmaps
 * (`attachPreviewBitmaps`) so the main thread paints previews directly — no
 * PNG encode/decode in the live path. Refs the bitmap pass can't handle fall
 * through to the main thread's materialization (raw-RGBA → PNG data URL).
 */
import {
  loadBrowserModules,
  buildBrowserRunner,
  normalizeGraphForKernel,
  type LoadedBrowserRunner
} from "./browserRunnerCore";
import { attachPreviewBitmaps } from "./attachPreviewBitmaps";

declare const self: DedicatedWorkerGlobalScope;

const controllers = new Map<string, AbortController>();

/** Streamed audio chunk payload — never contains image refs to resolve. */
const isAudioChunkValue = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; content_type?: unknown };
  return v.type === "chunk" && v.content_type === "audio";
};
/** Live WorkflowRunner per job, for in-flight property updates. */
const runners = new Map<
  string,
  { updateNodeProperties: (nodeId: string, props: Record<string, unknown>) => boolean }
>();

// Build the registry once for the worker's lifetime; announce readiness (and
// the browser-capable node types, so the main thread can make routing
// decisions without loading any node code itself).
const runnerPromise: Promise<LoadedBrowserRunner> = (async () => {
  const mods = await loadBrowserModules();
  return buildBrowserRunner(mods);
})();

runnerPromise.then(
  (runner) =>
    self.postMessage({
      type: "ready",
      browserNodeTypes: runner.browserNodeTypes
    }),
  (error) =>
    self.postMessage({
      type: "init-error",
      error: error instanceof Error ? error.message : String(error)
    })
);

interface RunMessage {
  type: "run";
  jobId: string;
  graph: Parameters<typeof normalizeGraphForKernel>[0];
  params?: Record<string, unknown>;
  workflowId: string;
}
interface CancelMessage {
  type: "cancel";
  jobId: string;
}
interface UpdatePropertiesMessage {
  type: "update-properties";
  jobId: string;
  nodeId: string;
  properties: Record<string, unknown>;
}

async function runJob(msg: RunMessage): Promise<void> {
  const { jobId, graph, params = {}, workflowId } = msg;

  let runner: LoadedBrowserRunner;
  try {
    runner = await runnerPromise;
  } catch (error) {
    self.postMessage({
      type: "done",
      jobId,
      status: "failed",
      error: error instanceof Error ? error.message : "Runner unavailable"
    });
    return;
  }

  const controller = new AbortController();
  controllers.set(jobId, controller);

  // Message batching: coalesce the streaming firehose into one postMessage
  // (= one main-thread task) per interval. ~16ms keeps UI updates at frame
  // cadence while cutting task churn by an order of magnitude.
  const BATCH_INTERVAL_MS = 16;
  let batch: Array<Record<string, unknown>> = [];
  let batchTransfer: Transferable[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (batch.length === 0) return;
    const messages = batch;
    const transfer = batchTransfer;
    batch = [];
    batchTransfer = [];
    self.postMessage({ type: "messages", jobId, messages }, transfer);
  };
  const enqueue = (
    message: Record<string, unknown>,
    transfer: Transferable[]
  ) => {
    batch.push(message);
    if (transfer.length > 0) batchTransfer.push(...transfer);
    if (flushTimer === null) {
      flushTimer = setTimeout(flush, BATCH_INTERVAL_MS);
    }
  };

  try {
    const gen = runner.runBrowserWorkflow({
      graph: normalizeGraphForKernel(graph) as unknown as Parameters<
        LoadedBrowserRunner["runBrowserWorkflow"]
      >[0]["graph"],
      registry: runner.registry,
      params,
      jobId,
      workflowId,
      signal: controller.signal,
      onRunner: (workflowRunner) => {
        runners.set(jobId, workflowRunner);
      }
    });

    while (true) {
      const next = await gen.next();
      if (next.done) {
        const result = next.value;
        // Deliver any buffered messages before the terminal signal so the
        // client never sees "done" with updates still in flight.
        flush();
        self.postMessage({
          type: "done",
          jobId,
          status: result.status,
          error: result.error
        });
        return;
      }
      // Read any GPU-texture refs in this message back to CPU buffers before it
      // crosses postMessage (textures aren't cloneable). The kernel keeps the
      // texture for downstream edges; only this transported copy is read back.
      // The readback copy is then turned into a transferable ImageBitmap so the
      // main thread can paint it without any PNG encode/decode round-trip; the
      // kernel's own buffers are untouched, so transferring is safe here.
      const message = next.value as Record<string, unknown>;
      const resolve = runner.resolveImageRefForTransport;
      const transfer: Transferable[] = [];
      if (resolve) {
        if (message.type === "node_update" && message.result != null) {
          message.result = await attachPreviewBitmaps(
            await resolve(message.result),
            transfer
          );
        } else if (
          message.type === "output_update" &&
          message.value != null &&
          // Audio chunks stream at ~50/s per node and never hold image refs
          // — skip the async resolve/walk entirely on the hot path.
          !isAudioChunkValue(message.value)
        ) {
          message.value = await attachPreviewBitmaps(
            await resolve(message.value),
            transfer
          );
        }
      }
      enqueue(message, transfer);
    }
  } catch (error) {
    flush();
    self.postMessage({
      type: "done",
      jobId,
      status: "failed",
      error: error instanceof Error ? error.message : "Browser execution failed"
    });
  } finally {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    // Free every GPU texture this run created (run-scoped lifecycle).
    runner.releaseRunTextures?.(jobId);
    controllers.delete(jobId);
    runners.delete(jobId);
  }
}

self.onmessage = (
  event: MessageEvent<RunMessage | CancelMessage | UpdatePropertiesMessage>
) => {
  const data = event.data;
  if (!data) return;
  if (data.type === "cancel") {
    controllers.get(data.jobId)?.abort();
    return;
  }
  if (data.type === "update-properties") {
    runners.get(data.jobId)?.updateNodeProperties(data.nodeId, data.properties);
    return;
  }
  if (data.type === "run") {
    void runJob(data);
  }
};
