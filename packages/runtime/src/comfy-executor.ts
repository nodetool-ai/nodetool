/**
 * ComfyUI workflow executor — submits prompts to any ComfyUI server
 * and streams progress via ComfyUI's WebSocket.
 */
import { createLogger } from "@nodetool-ai/config";
import WebSocket from "ws";

const log = createLogger("runtime:comfy-executor");

export interface ComfyImage {
  type: "image";
  data: string;
  filename: string;
}

/** A single file produced by a ComfyUI output node (image, audio, or video). */
export interface ComfyFileOutput {
  /** base64-encoded file bytes */
  data: string;
  filename: string;
  mimeType: string;
}

/** Outputs produced by one ComfyUI node, grouped by media kind. */
export interface ComfyNodeOutputs {
  images?: ComfyFileOutput[];
  audio?: ComfyFileOutput[];
  video?: ComfyFileOutput[];
}

export interface ComfyExecutorResult {
  status: "completed" | "failed";
  /** Flat list of all output images, across every node (legacy convenience). */
  images?: ComfyImage[];
  /** Per-node outputs keyed by ComfyUI node id, grouped by media kind. */
  nodeOutputs?: Record<string, ComfyNodeOutputs>;
  raw_output?: Record<string, unknown>;
  error?: string;
}

/** ComfyUI history output file descriptor. */
interface ComfyOutputFile {
  filename: string;
  subfolder: string;
  type: string;
}

/** Progress events emitted during execution. */
export interface ComfyProgressEvent {
  type:
    | "executing"
    | "progress"
    | "executed"
    | "execution_cached"
    | "execution_start"
    | "execution_error"
    | "execution_interrupted";
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
  timeoutMs = 600000
): ComfyExecutionHandle {
  const base = normalizeBaseUrl(addr);
  const clientId = `nodetool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let cancelled = false;
  let ws: WebSocket | null = null;

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    // Tell ComfyUI to interrupt
    void fetch(`${base}/interrupt`, { method: "POST" }).catch((err) => {
      log.warn("Failed to send ComfyUI interrupt request", {
        error: String(err)
      });
    });
    if (ws) {
      try {
        ws.close();
      } catch {
        /* Intentional: best-effort WebSocket close during cleanup */
      }
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
      try {
        ws.close();
      } catch {
        /* Intentional: best-effort WebSocket close during cleanup */
      }
      return { status: "failed", error: "Cancelled before submission" };
    }

    // Submit prompt (with client_id so ComfyUI routes events to our WS)
    let promptId: string;
    try {
      const url = `${base}/prompt`;
      const body = JSON.stringify({ prompt, client_id: clientId });
      log.info(
        `Submitting prompt to ${url} (${body.length} bytes, ${Object.keys(prompt).length} nodes)`
      );
      const submitRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      if (!submitRes.ok) {
        const text = await submitRes.text();
        log.error(`Submit failed: HTTP ${submitRes.status} — ${text}`);
        try {
          ws.close();
        } catch {
          /* Intentional: best-effort WebSocket close during cleanup */
        }
        return {
          status: "failed",
          error: `Submit failed (${submitRes.status}): ${text}`
        };
      }
      const submitData = (await submitRes.json()) as { prompt_id: string };
      promptId = submitData.prompt_id;
      log.info(`Prompt accepted: ${promptId}`);
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? `${err.message} (${err.cause ?? "no cause"})`
          : String(err);
      log.error(`Submit error to ${base}/prompt: ${errMsg}`);
      try {
        ws.close();
      } catch {
        /* Intentional: best-effort WebSocket close during cleanup */
      }
      return { status: "failed", error: `Submit error: ${errMsg}` };
    }

    // Listen for progress events on the already-connected WebSocket
    const listenResult = await listenForCompletion(
      ws,
      promptId,
      onProgress,
      timeoutMs
    );

    if (listenResult.status === "failed") {
      return listenResult;
    }

    // Fetch outputs from history (images, audio, video — grouped per node)
    const nodeOutputs = await fetchOutputs(base, promptId);
    const images: ComfyImage[] = [];
    for (const out of Object.values(nodeOutputs)) {
      for (const img of out.images ?? []) {
        images.push({ type: "image", data: img.data, filename: img.filename });
      }
    }

    return {
      status: "completed",
      images,
      nodeOutputs,
      raw_output: listenResult.raw_output
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
  timeoutMs: number
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
      try {
        ws.close();
      } catch {
        /* Intentional: best-effort WebSocket close during cleanup */
      }
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
        settle({
          status: "failed",
          error: "ComfyUI WebSocket closed unexpectedly"
        });
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
            total: max
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
          const errMsg =
            typeof data.exception_message === "string"
              ? data.exception_message
              : "ComfyUI execution error";
          const nodeId = data.node != null ? String(data.node) : currentNode;
          onProgress?.({
            type: "execution_error",
            node: nodeId,
            error: errMsg
          });
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

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska"
};

function mimeForFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Download one history output file and return it base64-encoded. */
async function downloadOutputFile(
  base: string,
  file: ComfyOutputFile
): Promise<ComfyFileOutput | null> {
  try {
    const params = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder,
      type: file.type
    });
    const viewRes = await fetch(`${base}/view?${params.toString()}`, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS)
    });
    if (!viewRes.ok) return null;
    const buffer = await viewRes.arrayBuffer();
    return {
      data: Buffer.from(buffer).toString("base64"),
      filename: file.filename,
      mimeType: mimeForFilename(file.filename)
    };
  } catch (err) {
    log.warn(`Failed to fetch output ${file.filename}: ${String(err)}`);
    return null;
  }
}

/**
 * Fetch output files from ComfyUI history after a prompt completes, grouped
 * per node and by media kind (images, audio, video).
 */
async function fetchOutputs(
  base: string,
  promptId: string
): Promise<Record<string, ComfyNodeOutputs>> {
  const result: Record<string, ComfyNodeOutputs> = {};
  try {
    const histRes = await fetch(`${base}/history/${promptId}`, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS)
    });
    if (!histRes.ok) return result;

    const histData = (await histRes.json()) as Record<string, unknown>;
    const entry = histData[promptId] as Record<string, unknown> | undefined;
    const outputs = entry?.outputs as
      | Record<
          string,
          {
            images?: ComfyOutputFile[];
            audio?: ComfyOutputFile[];
            // VHS and core video nodes report under different keys
            gifs?: ComfyOutputFile[];
            videos?: ComfyOutputFile[];
          }
        >
      | undefined;
    if (!outputs) return result;

    for (const [nodeId, nodeOutput] of Object.entries(outputs)) {
      const collected: ComfyNodeOutputs = {};
      const groups: Array<[keyof ComfyNodeOutputs, ComfyOutputFile[]]> = [
        ["images", nodeOutput.images ?? []],
        ["audio", nodeOutput.audio ?? []],
        ["video", [...(nodeOutput.gifs ?? []), ...(nodeOutput.videos ?? [])]]
      ];
      for (const [kind, files] of groups) {
        if (files.length === 0) continue;
        const downloaded: ComfyFileOutput[] = [];
        for (const file of files) {
          const out = await downloadOutputFile(base, file);
          if (out) downloaded.push(out);
        }
        if (downloaded.length > 0) collected[kind] = downloaded;
      }
      if (Object.keys(collected).length > 0) result[nodeId] = collected;
    }
  } catch (err) {
    log.warn(`Failed to fetch history for ${promptId}: ${String(err)}`);
  }
  return result;
}

/**
 * Upload a file to a ComfyUI server's input folder via `/upload/image`
 * (ComfyUI accepts arbitrary input files on this endpoint, not just images).
 * Returns the stored filename to reference from a Load* node's input.
 */
export async function uploadComfyFile(
  addr: string,
  bytes: Uint8Array,
  filename: string,
  mimeType = "application/octet-stream"
): Promise<string> {
  const base = normalizeBaseUrl(addr);
  const form = new FormData();
  const view = new Uint8Array(bytes);
  const ab = view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength
  ) as ArrayBuffer;
  form.append("image", new Blob([ab], { type: mimeType }), filename);
  form.append("overwrite", "true");
  const res = await fetch(`${base}/upload/image`, {
    method: "POST",
    body: form
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI upload failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { name?: string; subfolder?: string };
  const name = data.name ?? filename;
  return data.subfolder ? `${data.subfolder}/${name}` : name;
}
