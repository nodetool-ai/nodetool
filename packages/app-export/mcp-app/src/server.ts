/**
 * The MCP host's stand-in for the exported app's `runtime/server.ts`.
 *
 * The build swaps this module in for that one, so the widgets and the runtime
 * hook render exactly as they do in an exported app. Where the exported app
 * fetches its own Node server, this page calls NodeTool MCP tools through the
 * host:
 *
 *   run       `run_app_operation`, then `poll_app_run` until the run ends
 *   upload    `upload_asset`
 *   models    the models the app's own graphs use (no catalog call)
 */
import { hostBridge, toolPayload } from "./bridge";

export type RunMessage = Record<string, unknown>;

export interface RunRequest {
  /** What to run: a workflow's or a script's key in the bundle. */
  target: { workflow: string } | { script: string };
  params: Record<string, unknown>;
  operationId: string;
  propertyOverrides: Record<string, { value: unknown }>;
  jobId: string;
  signal: AbortSignal;
  onMessage: (message: RunMessage) => void;
}

interface Session {
  instanceId: string;
}

let session: Session | null = null;

/** Set once the `open_app` result names the app instance this page drives. */
export function setAppSession(next: Session): void {
  session = next;
}

interface RunSlice {
  run_id?: unknown;
  cursor?: unknown;
  messages?: unknown;
  done?: unknown;
  status?: unknown;
  error?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Run one operation. The server answers with the messages produced so far;
 * the page polls for the rest. Every message is folded under the page's own
 * invocation id, because the server's run id means nothing to the runtime.
 */
export async function runOperation(request: RunRequest): Promise<void> {
  if (!session) throw new Error("The app has not finished loading.");
  const bridge = hostBridge();
  const deliver = (slice: RunSlice): void => {
    if (!Array.isArray(slice.messages)) return;
    for (const message of slice.messages) {
      if (isRecord(message)) request.onMessage({ ...message, job_id: request.jobId });
    }
  };
  let slice = toolPayload(
    await bridge.callTool("run_app_operation", {
      instance_id: session.instanceId,
      operation_id: request.operationId,
      params: request.params,
      property_overrides: request.propertyOverrides
    })
  ) as RunSlice;
  const runId = typeof slice.run_id === "string" ? slice.run_id : null;
  const onAbort = (): void => {
    if (runId) void bridge.callTool("poll_app_run", { run_id: runId, cancel: true }).catch(() => undefined);
  };
  request.signal.addEventListener("abort", onAbort, { once: true });
  try {
    deliver(slice);
    while (slice.done !== true) {
      if (request.signal.aborted || !runId) return;
      slice = toolPayload(
        await bridge.callTool("poll_app_run", {
          run_id: runId,
          cursor: typeof slice.cursor === "number" ? slice.cursor : 0
        })
      ) as RunSlice;
      if (request.signal.aborted) return;
      deliver(slice);
    }
  } finally {
    request.signal.removeEventListener("abort", onAbort);
  }
}

export type MediaKind = "image" | "audio" | "video" | "document" | "model_3d";

export interface MediaValue {
  type: MediaKind;
  uri: string;
  content_type?: string;
}

/**
 * Previews of files this page uploaded, by asset URI. The page can show a
 * `data:` URL but not an `asset://` one, and the upload already read the bytes.
 */
const previews = new Map<string, string>();

const PREVIEW_LIMIT_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/** Store a picked file in the user's NodeTool assets and return its ref. */
export async function uploadFile(kind: MediaKind, file: File): Promise<MediaValue> {
  const dataUrl = await readAsDataUrl(file);
  const comma = dataUrl.indexOf(",");
  const args: Record<string, unknown> = {
    name: file.name || `upload.${kind}`,
    content_base64: comma >= 0 ? dataUrl.slice(comma + 1) : ""
  };
  if (file.type) args.content_type = file.type;
  const payload = toolPayload(await hostBridge().callTool("upload_asset", args));
  const uri = typeof payload.asset_uri === "string" ? payload.asset_uri : null;
  if (!uri) throw new Error("Upload failed");
  if (file.size <= PREVIEW_LIMIT_BYTES) previews.set(uri, dataUrl);
  const value: MediaValue = { type: kind, uri };
  if (typeof payload.content_type === "string") value.content_type = payload.content_type;
  return value;
}

export interface ModelOption {
  type: string;
  provider?: string;
  id: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * No provider catalog is listed here, so a `ModelSelect` offers the models
 * the app's own graphs reference, as in an exported app without a server.
 */
export function listModels(_kind: string, _task?: string): Promise<ModelOption[]> {
  return Promise.resolve([]);
}

/**
 * The URL a media value can be loaded from in this frame, or null. The server
 * inlines run outputs as `data:` URLs or signs an `https:` URL whose origin
 * the resource's CSP allows; anything else cannot load in the sandbox.
 */
export function mediaUrl(value: unknown): string | null {
  const raw =
    typeof value === "string"
      ? value
      : isRecord(value)
        ? (value.uri ?? value.url)
        : null;
  if (typeof raw !== "string" || raw === "") return null;
  const preview = previews.get(raw);
  if (preview) return preview;
  if (/^(https:|data:)/.test(raw)) return raw;
  return null;
}
