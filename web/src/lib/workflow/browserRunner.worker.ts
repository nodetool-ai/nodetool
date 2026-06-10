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
 *   ← { type: "message", jobId, message }   a raw kernel ProcessingMessage
 *   ← { type: "done", jobId, status, error }
 *   → { type: "run", jobId, graph, params, workflowId }
 *   → { type: "cancel", jobId }
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
  try {
    const gen = runner.runBrowserWorkflow({
      graph: normalizeGraphForKernel(graph) as unknown as Parameters<
        LoadedBrowserRunner["runBrowserWorkflow"]
      >[0]["graph"],
      registry: runner.registry,
      params,
      jobId,
      workflowId,
      signal: controller.signal
    });

    while (true) {
      const next = await gen.next();
      if (next.done) {
        const result = next.value;
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
        } else if (message.type === "output_update" && message.value != null) {
          message.value = await attachPreviewBitmaps(
            await resolve(message.value),
            transfer
          );
        }
      }
      self.postMessage({ type: "message", jobId, message }, transfer);
    }
  } catch (error) {
    self.postMessage({
      type: "done",
      jobId,
      status: "failed",
      error: error instanceof Error ? error.message : "Browser execution failed"
    });
  } finally {
    // Free every GPU texture this run created (run-scoped lifecycle).
    runner.releaseRunTextures?.(jobId);
    controllers.delete(jobId);
  }
}

self.onmessage = (event: MessageEvent<RunMessage | CancelMessage>) => {
  const data = event.data;
  if (!data) return;
  if (data.type === "cancel") {
    controllers.get(data.jobId)?.abort();
    return;
  }
  if (data.type === "run") {
    void runJob(data);
  }
};
