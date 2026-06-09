/**
 * Main-thread half of the in-browser runner Web Worker.
 *
 * Lazily imported (only in real browsers, never under jest) so the
 * `new Worker(new URL(...))` / `import.meta.url` here never reaches the test
 * transform. Owns the singleton worker, its readiness handshake, and the
 * per-job message transport: it materializes each raw kernel message (raw-RGBA →
 * PNG) and feeds it into the same `deliverLocal` pipeline a server run uses.
 */
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../websocket/GlobalWebSocketManager";
import { uuidv4 } from "../../stores/uuidv4";
import { materializeBrowserOutputs } from "./materializeBrowserOutputs";
import type {
  BrowserGraphJobOptions,
  BrowserGraphJobResult
} from "./browserRunnerCore";

interface ReadyMessage {
  type: "ready";
  browserNodeTypes: string[];
}
interface InitErrorMessage {
  type: "init-error";
  error: string;
}
interface StreamMessage {
  type: "message";
  jobId: string;
  message: WebSocketMessage;
}
interface DoneMessage {
  type: "done";
  jobId: string;
  status: "completed" | "failed" | "cancelled";
  error?: string;
}
type FromWorker = ReadyMessage | InitErrorMessage | StreamMessage | DoneMessage;

let worker: Worker | null = null;
let ready: Promise<Set<string>> | null = null;

function spawn(): { worker: Worker; ready: Promise<Set<string>> } {
  if (!worker) {
    const w = new Worker(
      new URL("./browserRunner.worker.ts", import.meta.url),
      { type: "module" }
    );
    worker = w;
    ready = new Promise<Set<string>>((resolve, reject) => {
      const onInit = (event: MessageEvent<FromWorker>) => {
        const data = event.data;
        if (data?.type === "ready") {
          w.removeEventListener("message", onInit);
          resolve(new Set(data.browserNodeTypes));
        } else if (data?.type === "init-error") {
          w.removeEventListener("message", onInit);
          reject(new Error(data.error));
        }
      };
      w.addEventListener("message", onInit);
      w.addEventListener(
        "error",
        (event) =>
          reject(new Error(event.message || "Browser runner worker failed")),
        { once: true }
      );
    });
    // Swallow unhandled rejection; callers handle failure by falling back.
    ready.catch(() => undefined);
  }
  return { worker, ready: ready! };
}

/**
 * Spawn the worker (if needed) and resolve with the node types it can run
 * client-side. Rejects if the worker fails to initialize, signalling the caller
 * to fall back to the server / main-thread path.
 */
export function getBrowserWorkerReady(): Promise<Set<string>> {
  return spawn().ready;
}

/**
 * Run a graph in the worker, streaming its messages into `deliverLocal`. Assumes
 * the worker is already ready (caller awaits {@link getBrowserWorkerReady}).
 */
export function runBrowserGraphJobInWorker(
  options: BrowserGraphJobOptions
): Promise<BrowserGraphJobResult> {
  const { graph, params = {}, signal, workflowId } = options;
  if (signal?.aborted) {
    return Promise.resolve({ success: false, outputs: {}, error: "Aborted" });
  }
  const { worker: w } = spawn();
  const jobId = options.jobId ?? uuidv4();

  const nodeTypes = (graph.nodes ?? [])
    .map((n) => (n as { type?: string }).type)
    .filter((t): t is string => typeof t === "string");
  const startedAt = performance.now();
  const elapsed = () => `${Math.round(performance.now() - startedAt)}ms`;
  console.info(
    `[browserRunner] ▶ running ${nodeTypes.length} node(s) in worker ` +
      `(job ${jobId}): ${nodeTypes.join(", ")}`
  );

  return new Promise<BrowserGraphJobResult>((resolve) => {
    let settled = false;
    // Accumulate node outputs so callers that consume the returned value
    // (e.g. runInlineGraphJob → sketch/bespoke single-node runs) get results,
    // matching the main-thread and server paths. The canvas updates separately
    // via deliverLocal.
    const outputs: Record<string, unknown> = {};
    const cleanup = () => {
      if (settled) return;
      settled = true;
      w.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => w.postMessage({ type: "cancel", jobId });

    const onMessage = (event: MessageEvent<FromWorker>) => {
      const data = event.data;
      if (!data || (data as { jobId?: string }).jobId !== jobId) return;

      if (data.type === "message") {
        const message = data.message;
        const mutable = message as Record<string, unknown>;
        if (message.type === "node_update" && mutable.result != null) {
          mutable.result = materializeBrowserOutputs(mutable.result);
        } else if (message.type === "output_update" && mutable.value != null) {
          mutable.value = materializeBrowserOutputs(mutable.value);
        }
        globalWebSocketManager.deliverLocal(message);

        if (message.type === "node_update") {
          const status = (mutable.status as string | undefined) ?? "";
          const nodeId = (mutable.node_id as string | undefined) ?? "";
          if (status === "completed" && nodeId && mutable.result != null) {
            outputs[nodeId] = mutable.result;
          }
        } else if (message.type === "job_update") {
          const res = mutable.result as { outputs?: unknown } | undefined;
          if (res?.outputs && typeof res.outputs === "object") {
            Object.assign(outputs, res.outputs as Record<string, unknown>);
          }
        }
        return;
      }

      if (data.type === "done") {
        cleanup();
        if (data.status === "completed") {
          console.info(
            `[browserRunner] ✔ completed ${nodeTypes.length} node(s) in ` +
              `${elapsed()} (job ${jobId})`
          );
          resolve({ success: true, outputs });
        } else {
          const error =
            data.error ??
            (data.status === "cancelled" ? "Cancelled" : "Workflow failed");
          console[data.status === "cancelled" ? "warn" : "error"](
            `[browserRunner] ${data.status} in ${elapsed()} (job ${jobId}): ${error}`
          );
          resolve({ success: false, outputs, error });
        }
      }
    };

    w.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort, { once: true });
    w.postMessage({ type: "run", jobId, graph, params, workflowId });
  });
}
