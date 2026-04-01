/**
 * ComfyUI workflow executor — submits prompts to any ComfyUI server
 * and streams progress via ComfyUI's WebSocket.
 */
import { createLogger } from "@nodetool/config";
import WebSocket from "ws";

const log = createLogger("runtime:comfy-executor");

export interface ComfyImage {
  type: "image";
  data: string;
  filename: string;
}

export interface ComfyExecutorResult {
  status: "completed" | "failed";
  images?: ComfyImage[];
  raw_output?: Record<string, unknown>;
  error?: string;
}

/** Progress events emitted during execution. */
export interface ComfyProgressEvent {
  type: "executing" | "progress" | "executed" | "execution_cached" | "execution_start" | "execution_error" | "execution_interrupted";
  node?: string | null;
  progress?: number;
  total?: number;
  output?: Record<string, unknown>;
  error?: string;
  cached_nodes?: string[];
}

type ComfyPrompt = Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;

/** Handle returned by executeComfy for cancellation support. */
export interface ComfyExecutionHandle {
  /** Promise that resolves when execution completes or fails. */
  result: Promise<ComfyExecutorResult>;
  /** Cancel the execution — closes WS and sends interrupt to ComfyUI. */
  cancel: () => void;
}

function normalizeBaseUrl(addr: string): string {
  const url = addr.startsWith("http") ? addr : `http://${addr}`;
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

function toWsUrl(httpBase: string, clientId: string): string {
  return httpBase.replace(/^http/, "ws") + `/ws?clientId=${clientId}`;
}

const IMAGE_FETCH_TIMEOUT_MS = 30_000;

/**
 * Execute a ComfyUI workflow against a ComfyUI server.
 * Connects to ComfyUI's WebSocket for real-time progress events.
 *
 * Returns a handle with a result promise and a cancel() method.
 */
export function executeComfy(
  prompt: ComfyPrompt,
  addr: string,
  onProgress?: (event: ComfyProgressEvent) => void,
  timeoutMs = 600000,
): ComfyExecutionHandle {
  const base = normalizeBaseUrl(addr);
  const clientId = `nodetool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let cancelled = false;
  let ws: WebSocket | null = null;

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    // Tell ComfyUI to interrupt
    void fetch(`${base}/interrupt`, { method: "POST" }).catch(() => {});
    if (ws) {
      try { ws.close(); } catch { /* ignore */ }
    }
  };

  const result = (async (): Promise<ComfyExecutorResult> => {
    // Connect WebSocket FIRST so we don't miss any events
    const wsUrl = toWsUrl(base, clientId);
    try {
      ws = new WebSocket(wsUrl);
      await new Promise<void>((resolve, reject) => {
        ws!.on("open", resolve);
        ws!.on("error", reject);
      });
      log.info(`ComfyUI WebSocket connected: ${wsUrl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to connect ComfyUI WebSocket: ${msg}`);
      return { status: "failed", error: `WebSocket connection failed: ${msg}` };
    }

    if (cancelled) {
      try { ws.close(); } catch { /* ignore */ }
      return { status: "failed", error: "Cancelled before submission" };
    }

    // Submit prompt (with client_id so ComfyUI routes events to our WS)
    let promptId: string;
    try {
      const url = `${base}/prompt`;
      const body = JSON.stringify({ prompt, client_id: clientId });
      log.info(`Submitting prompt to ${url} (${body.length} bytes, ${Object.keys(prompt).length} nodes)`);
      const submitRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!submitRes.ok) {
        const text = await submitRes.text();
        log.error(`Submit failed: HTTP ${submitRes.status} — ${text}`);
        try { ws.close(); } catch { /* ignore */ }
        return { status: "failed", error: `Submit failed (${submitRes.status}): ${text}` };
      }
      const submitData = (await submitRes.json()) as { prompt_id: string };
      promptId = submitData.prompt_id;
      log.info(`Prompt accepted: ${promptId}`);
    } catch (err) {
      const errMsg = err instanceof Error ? `${err.message} (${err.cause ?? "no cause"})` : String(err);
      log.error(`Submit error to ${base}/prompt: ${errMsg}`);
      try { ws.close(); } catch { /* ignore */ }
      return { status: "failed", error: `Submit error: ${errMsg}` };
    }

    // Listen for progress events on the already-connected WebSocket
    const listenResult = await listenForCompletion(ws, promptId, onProgress, timeoutMs);

    if (listenResult.status === "failed") {
      return listenResult;
    }

    // Fetch images from history
    const images = await fetchOutputImages(base, promptId);

    return {
      status: "completed",
      images,
      raw_output: listenResult.raw_output,
    };
  })();

  return { result, cancel };
}

/**
 * Listen on an already-connected ComfyUI WebSocket for the prompt to complete,
 * streaming progress events along the way.
 */
function listenForCompletion(
  ws: WebSocket,
  promptId: string,
  onProgress: ((event: ComfyProgressEvent) => void) | undefined,
  timeoutMs: number,
): Promise<ComfyExecutorResult> {
  return new Promise((resolve) => {
    let settled = false;
    let currentNode: string | null = null;

    const settle = (result: ComfyExecutorResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Remove message listener before closing to prevent stale callbacks
      ws.removeAllListeners("message");
      try { ws.close(); } catch { /* ignore */ }
      resolve(result);
    };

    const timer = setTimeout(() => {
      log.error(`Timeout waiting for prompt ${promptId} after ${timeoutMs}ms`);
      settle({ status: "failed", error: "Timeout waiting for ComfyUI result" });
    }, timeoutMs);

    ws.on("error", (err) => {
      log.error(`ComfyUI WebSocket error: ${err.message}`);
      settle({ status: "failed", error: `WebSocket error: ${err.message}` });
    });

    ws.on("close", () => {
      if (!settled) {
        settle({ status: "failed", error: "ComfyUI WebSocket closed unexpectedly" });
      }
    });

    ws.on("message", (raw) => {
      if (settled) return; // Guard against late messages in receive buffer

      let msg: { type?: string; data?: Record<string, unknown> };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // binary preview frame or malformed — skip
      }

      const type = msg.type;
      const data = msg.data ?? {};
      const msgPromptId = data.prompt_id as string | undefined;

      // Skip messages for other prompts
      if (msgPromptId && msgPromptId !== promptId) return;

      switch (type) {
        case "execution_start":
          onProgress?.({ type: "execution_start" });
          break;

        case "execution_cached": {
          const nodes = Array.isArray(data.nodes) ? data.nodes.map(String) : [];
          onProgress?.({ type: "execution_cached", cached_nodes: nodes });
          break;
        }

        case "executing": {
          const nodeId = data.node != null ? String(data.node) : null;
          currentNode = nodeId;
          // Always emit the executing event (even for null/end-of-execution)
          onProgress?.({ type: "executing", node: nodeId });
          if (nodeId === null) {
            // null node means execution finished — but prefer execution_success
            // for the actual settle, as it carries richer data. Only settle here
            // if execution_success doesn't arrive within a short window.
            setTimeout(() => {
              if (!settled) {
                settle({ status: "completed", raw_output: {} });
              }
            }, 500);
          }
          break;
        }

        case "progress": {
          const value = typeof data.value === "number" ? data.value : 0;
          const max = typeof data.max === "number" ? data.max : 1;
          onProgress?.({
            type: "progress",
            node: currentNode,
            progress: value,
            total: max,
          });
          break;
        }

        case "executed": {
          const nodeId = data.node != null ? String(data.node) : null;
          const output = (data.output ?? {}) as Record<string, unknown>;
          onProgress?.({ type: "executed", node: nodeId, output });
          break;
        }

        case "execution_success":
          settle({ status: "completed", raw_output: data });
          break;

        case "execution_error": {
          const errMsg = typeof data.exception_message === "string"
            ? data.exception_message
            : "ComfyUI execution error";
          const nodeId = data.node != null ? String(data.node) : currentNode;
          onProgress?.({ type: "execution_error", node: nodeId, error: errMsg });
          settle({ status: "failed", error: errMsg });
          break;
        }

        case "execution_interrupted":
          onProgress?.({ type: "execution_interrupted" });
          settle({ status: "failed", error: "Execution interrupted" });
          break;
      }
    });
  });
}

/**
 * Fetch output images from ComfyUI history after prompt completes.
 */
async function fetchOutputImages(base: string, promptId: string): Promise<ComfyImage[]> {
  const images: ComfyImage[] = [];
  try {
    const histRes = await fetch(`${base}/history/${promptId}`, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!histRes.ok) return images;

    const histData = (await histRes.json()) as Record<string, unknown>;
    const entry = histData[promptId] as Record<string, unknown> | undefined;
    if (!entry) return images;

    const outputs = entry.outputs as
      | Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>
      | undefined;

    if (outputs) {
      for (const nodeOutput of Object.values(outputs)) {
        if (!nodeOutput.images) continue;
        for (const img of nodeOutput.images) {
          try {
            const params = new URLSearchParams({
              filename: img.filename,
              subfolder: img.subfolder,
              type: img.type,
            });
            const viewRes = await fetch(`${base}/view?${params.toString()}`, {
              signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
            });
            if (viewRes.ok) {
              const buffer = await viewRes.arrayBuffer();
              const base64 = Buffer.from(buffer).toString("base64");
              images.push({ type: "image", data: base64, filename: img.filename });
            }
          } catch (err) {
            log.warn(`Failed to fetch image ${img.filename}: ${String(err)}`);
          }
        }
      }
    }
  } catch (err) {
    log.warn(`Failed to fetch history for ${promptId}: ${String(err)}`);
  }
  return images;
}
