/**
 * Comfy API v2 transport and the workflow runner shared by the SDK-backed
 * ComfyUI nodes.
 *
 * A {@link ComfyTransport} is the only thing that differs between Comfy
 * surfaces: Comfy Cloud gets {@link cloudTransport}, and any other v2 surface
 * at a known base URL gets {@link v2Transport}. {@link runComfyWorkflow} takes one, plus
 * an API-format prompt and the node's dynamic inputs, and yields the same
 * frames every ComfyUI node in this package yields — one per output file on
 * `"<comfyNodeId>:<kind>"`, then a final `output` frame.
 *
 * The structural `ComfyJob` / `ComfyOutput` / `ComfyRunEvent` types mirror the
 * `@comfyorg/sdk` surface this module uses. The compile-time assignability
 * checks at the bottom of the type block pin that surface, so a breaking bump
 * of the (0.1.x) SDK fails `tsc` here instead of at run time.
 */

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
  Asset,
  AssetFactory,
  Comfy,
  ComfyError,
  Job,
  QueueFull,
  WorkflowFormatUi,
  type ComfyEvent as SdkComfyEvent,
  type Job as SdkJob
} from "@comfyorg/sdk";
import { ApiError, ComfyLow } from "@comfyorg/sdk/low";
import {
  comfyCloudFetch,
  loadMediaRefBytes,
  type MediaRefValue,
  type ProcessingContext
} from "@nodetool-ai/runtime";

/** A ComfyUI workflow in API ("prompt") format. */
export type ComfyPrompt = Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;

/** Media kind → default filename extension / mime for uploads. */
export const UPLOAD_DEFAULTS: Record<string, { ext: string; mime: string }> = {
  image: { ext: "png", mime: "image/png" },
  audio: { ext: "wav", mime: "audio/wav" },
  video: { ext: "mp4", mime: "video/mp4" }
};

/** A connected media ref looks like an object carrying uri/data/asset_id. */
export function isMediaRef(value: unknown): value is MediaRefValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    "uri" in v || "data" in v || "asset_id" in v || typeof v.type === "string"
  );
}

export function extFromUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  const clean = uri.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop();
  return ext && ext.length <= 5 && /^[a-z0-9]+$/i.test(ext)
    ? ext.toLowerCase()
    : undefined;
}

/** Filename + content type to upload a connected media ref under. */
export function uploadNaming(
  nodeId: string,
  field: string,
  value: MediaRefValue
): { filename: string; contentType: string } {
  const fallback = UPLOAD_DEFAULTS[value.type ?? "image"] ?? UPLOAD_DEFAULTS.image;
  const ext = extFromUri(value.uri) ?? fallback.ext;
  return {
    filename: `nodetool_${nodeId}_${field}.${ext}`,
    contentType: fallback.mime
  };
}

/**
 * A lazy asset handle. The transport mints one; the runner writes it into the
 * prompt and the transport substitutes the real `core/ASSET` object at submit.
 * Opaque here on purpose — the runner never reads it.
 */
export type ComfyAssetHandle = object;

/** One file produced by one node of a finished job. */
export interface ComfyOutput {
  readonly nodeId: string;
  readonly name: string;
  readonly id: string;
  readonly type: "image" | "video" | "audio" | "text" | "file" | "latent";
  readonly contentType: string;
  readonly sizeBytes: number;
  toBytes(options?: { signal?: AbortSignal }): Promise<Uint8Array>;
}

/** Execution failure detail carried on a terminal `failed` job. */
export interface ComfyJobError {
  code: string;
  message: string;
  node_id?: string | null;
  class_type?: string | null;
  traceback?: string | null;
}

/** Typed live events, discriminated on `kind`. */
export type ComfyRunEvent =
  | {
      kind: "progress";
      value: number;
      message: string | null;
      nodesDone: number | null;
      nodesTotal: number | null;
      currentNode: string | null;
      step: number | null;
      steps: number | null;
    }
  | { kind: "preview"; nodeId: string; contentType: string; data: Uint8Array }
  | { kind: "outputReady"; output: ComfyOutput }
  | { kind: "statusChange"; status: string; queuePosition: number | null }
  | { kind: "log"; level: string; message: string };

/** A handle to one submitted job. */
export interface ComfyJob {
  readonly id: string;
  readonly status: string;
  readonly outputs: ComfyOutput[];
  readonly error: ComfyJobError | null;
  events(signal?: AbortSignal): AsyncGenerator<ComfyRunEvent, void, void>;
  /** Re-reads the job from the server; resolves to the same handle. */
  refresh(signal?: AbortSignal): Promise<this>;
  /** Requests cancellation; resolves to the same handle. */
  cancel(signal?: AbortSignal): Promise<this>;
}

/** The one thing that differs between Comfy API v2 surfaces. */
export interface ComfyTransport {
  submit(
    graph: ComfyPrompt,
    options: { signal: AbortSignal; apiKey?: string }
  ): Promise<ComfyJob>;
  assetFromBytes(
    bytes: Uint8Array,
    filename: string,
    contentType: string
  ): ComfyAssetHandle;
}

// Pin the SDK surface: these fail to compile if @comfyorg/sdk changes the
// shape of an event, an output, or a job in a way this module reads.
type AssertAssignable<T extends U, U> = T;
type _SdkEventsMatch = AssertAssignable<SdkComfyEvent, ComfyRunEvent>;
type _SdkJobMatches = AssertAssignable<SdkJob, ComfyJob>;

/**
 * Comfy Cloud, authenticated with a `COMFY_API_KEY`. Comfy Cloud answers a job
 * with `http://` links, which the SDK polls with no key; `comfyCloudFetch`
 * restores https and the key, as the comfy_cloud provider does.
 */
export function cloudTransport(apiKey: string): ComfyTransport {
  const client = new Comfy({ apiKey, fetch: comfyCloudFetch(apiKey) });
  return {
    async submit(graph, options) {
      const workflow = client.workflows.fromJson(graph);
      return client.submit(workflow, {
        signal: options.signal,
        apiKey: options.apiKey
      });
    },
    assetFromBytes: (bytes, filename, contentType) =>
      client.assets.fromBytes(bytes, { filename, contentType })
  };
}

// How long a full queue is retried before submit gives up, and the pause used
// for a `queue_full` a server sent without a `Retry-After` header.
const QUEUE_RETRY_BUDGET_MS = 60_000;
const DEFAULT_RETRY_AFTER_S = 2;

/** UI-export JSON carries all three of these top-level keys; API format never does. */
const UI_FORMAT_KEYS = ["nodes", "links", "last_node_id"] as const;

/**
 * Validate and canonicalize a caller-supplied Comfy API v2 base URL.
 *
 * `ComfyLow` builds every request URL by appending `/api/v2/<path>` to this
 * string, so a query or fragment would land in the middle of the path and a
 * trailing slash would double the separator. Same rule the SDK applies to
 * `COMFY_BASE_URL` in `resolveBaseUrl`, which is the only base URL it accepts.
 */
function normalizeBaseUrl(baseUrl: string): string {
  const raw = baseUrl.trim();
  let parsed: URL | undefined;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = undefined;
  }
  const valid =
    parsed !== undefined &&
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    parsed.search === "" &&
    parsed.hash === "";
  if (!valid) {
    throw new TypeError(
      "Comfy base URL must be an http(s) URL with no query or fragment " +
        `(e.g. "http://127.0.0.1:8189"), got ${JSON.stringify(baseUrl)}`
    );
  }
  return stripTrailingSlashes(raw);
}

/** Drop every trailing `/` without a regex that backtracks on long runs. */
export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end--;
  return value.slice(0, end);
}

/** `setTimeout` sleep that rejects as soon as `signal` aborts. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  const canceled = (): Error => abortError("Comfy submit was canceled");
  if (signal?.aborted) {
    return Promise.reject(canceled());
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(canceled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Replace every `Asset` handle sitting on a node input with the `core/ASSET`
 * reference the server understands, uploading its bytes on first use.
 *
 * Copies the nodes and their `inputs` maps rather than writing through, so the
 * caller's graph is left as it was. The high-level client does this with
 * `findAssetHandles`/`substituteAssetHandles`, which `@comfyorg/sdk` keeps
 * private to `sdk/core.js`.
 */
async function materializeAssets(
  graph: ComfyPrompt,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const materialized: Record<string, unknown> = {};
  for (const [nodeId, node] of Object.entries(graph)) {
    const inputs = node === null ? undefined : node.inputs;
    if (typeof inputs !== "object" || inputs === null) {
      materialized[nodeId] = node;
      continue;
    }
    const substituted: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(inputs)) {
      substituted[field] =
        value instanceof Asset ? await value.asReference(signal) : value;
    }
    materialized[nodeId] = { ...node, inputs: substituted };
  }
  return materialized;
}

/**
 * Any Comfy API v2 surface at a caller-supplied base URL — a
 * `comfy-api-proxy` in front of a local ComfyUI, a NodeTool worker, or a
 * ComfyUI that serves v2 itself.
 *
 * The high-level `Comfy` client cannot target one: it reads `COMFY_BASE_URL`
 * from the environment per construction, which is process-global and races
 * across concurrent node runs. So this builds `ComfyLow` directly and
 * reimplements the one thing `Comfy` keeps private — the submit loop: guard
 * UI-format JSON, materialize asset handles, mint an idempotency key, and
 * retry a 429 against a 60 second budget with the same key. Collapses to
 * `new Comfy({ apiKey, baseUrl })` once upstream accepts a `baseUrl` option
 * (spec D3), and the loop below is deleted with it.
 *
 * `options.fetch` is handed to `ComfyLow` verbatim; tests script the wire with
 * it, and production passes nothing.
 */
export function v2Transport(
  baseUrl: string,
  apiKey?: string,
  options?: { fetch?: typeof fetch }
): ComfyTransport {
  const low = new ComfyLow(normalizeBaseUrl(baseUrl), apiKey, {
    fetch: options?.fetch
  });
  const assets = new AssetFactory(low);

  return {
    async submit(graph, submitOptions) {
      if (UI_FORMAT_KEYS.every((key) => key in graph)) {
        throw new WorkflowFormatUi(
          "workflow is in UI-export format (nodes/links/last_node_id); " +
            "submit the API-format graph instead",
          { code: "workflow_format_ui", httpStatus: 422 }
        );
      }
      const { signal } = submitOptions;
      const workflow = await materializeAssets(graph, signal);
      // One key for the whole loop: a retry must not create a second job.
      const idempotencyKey = randomUUID();
      const extraData = submitOptions.apiKey
        ? { api_key_comfy_org: submitOptions.apiKey }
        : undefined;
      const deadline = performance.now() + QUEUE_RETRY_BUDGET_MS;

      for (;;) {
        try {
          return new Job(
            low,
            await low.postJobs(workflow, {
              idempotencyKey,
              extraData,
              signal
            })
          );
        } catch (err) {
          if (!(err instanceof ApiError)) throw err;
          // Any 429 carrying Retry-After is backpressure; a `queue_full`
          // without one gets the default pause, since servers omit it today.
          const retryAfterS =
            err.retryAfter ??
            (err.code === "queue_full" ? DEFAULT_RETRY_AFTER_S : null);
          // Clamp to what is left of the budget, so a hostile Retry-After
          // (86400s) cannot sleep past it — the loop-entry check bounds when
          // the next attempt starts, not how long this sleep runs.
          const remainingMs = deadline - performance.now();
          if (err.httpStatus === 429 && retryAfterS !== null && remainingMs > 0) {
            await abortableSleep(Math.min(retryAfterS * 1000, remainingMs), signal);
            continue;
          }
          throw err;
        }
      }
    },
    assetFromBytes: (bytes, filename, contentType) =>
      assets.fromBytes(bytes, { filename, contentType })
  };
}

export interface ComfyRunOptions {
  /** Cancels the submit, the event stream, and the output downloads. */
  signal: AbortSignal;
  /** Node id used to address `log_update` / `node_progress` messages. */
  nodeId: string;
  /** Node name shown on `log_update` messages. */
  nodeName: string;
  context?: ProcessingContext;
  /** Also sent as `extra_data.api_key_comfy_org` for partner (API) nodes. */
  apiKey?: string;
  /** Log preview frames as they arrive. */
  previews?: boolean;
}

const TERMINAL_STATUSES = new Set([
  "succeeded",
  "canceled",
  "failed",
  "expired"
]);

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

/** Turn an SDK error into a message a workflow author can act on. */
export function describeComfyError(err: unknown): Error {
  // The high-level client throws `ComfyError` subclasses and `v2Transport`
  // surfaces the low layer's `ApiError`s. Both carry the same `code` and
  // `httpStatus`, so the mapping keys on those rather than on the class.
  if (!(err instanceof ComfyError) && !(err instanceof ApiError)) {
    return err instanceof Error ? err : new Error(String(err));
  }
  if (err.code === "queue_full") {
    const retryAfter =
      err instanceof QueueFull || err instanceof ApiError
        ? err.retryAfter
        : null;
    const wait = retryAfter === null ? "" : ` Retry after ${retryAfter}s.`;
    return new Error(`Comfy queue is full: ${err.message}${wait}`);
  }
  if (err.code === "workflow_format_ui") {
    return new Error(
      "ComfyUI workflow is in UI-export format. Save it with " +
        "Workflow → Export (API) and paste the API-format JSON instead."
    );
  }
  if (err.code === "insufficient_credits" || err.httpStatus === 402) {
    return new Error(`Comfy account has insufficient credits: ${err.message}`);
  }
  return err;
}

export function jobFailure(job: ComfyJob): Error {
  const error = job.error;
  if (!error) {
    return new Error(`Comfy job ${job.id} failed`);
  }
  const where = error.class_type
    ? ` in ${error.class_type} (#${error.node_id ?? "?"})`
    : error.node_id
      ? ` in node #${error.node_id}`
      : "";
  return new Error(`Comfy job ${job.id} failed${where}: ${error.message} [${error.code}]`);
}

/**
 * The media kind of an output. Comfy Cloud reports SaveVideo and SaveAudio
 * files with `type: "image"`, so a video or audio content type wins over it.
 */
export function outputKind(output: Pick<ComfyOutput, "type" | "contentType">): string {
  const mime = (output.contentType ?? "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return output.type;
}

/** Map one finished output onto its dynamic slot name and frame value. */
export async function outputFrame(
  output: ComfyOutput,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  // Signed output URLs expire, so the bytes are pulled during the run.
  const bytes = await output.toBytes({ signal });
  const type = outputKind(output);
  const slot = `${output.nodeId}:${type}`;
  if (type === "text") {
    return { [slot]: Buffer.from(bytes).toString("utf-8") };
  }
  const kind =
    type === "image" || type === "audio" || type === "video" ? type : "document";
  return {
    [slot]: {
      type: kind,
      uri: "",
      data: Buffer.from(bytes).toString("base64"),
      mimeType: output.contentType
    }
  };
}

/**
 * Write run inputs into `graph`. A key `<comfyNodeId>:<field>` names the field,
 * and a media value is uploaded through `transport`.
 */
export async function applyComfyInputs(
  graph: ComfyPrompt,
  dynamicProps: Iterable<[string, unknown]>,
  transport: ComfyTransport,
  context: ProcessingContext | undefined
): Promise<void> {
  for (const [handle, value] of dynamicProps) {
    if (value === undefined || value === null) continue;
    const sep = handle.indexOf(":");
    if (sep <= 0) continue;
    const comfyNodeId = handle.slice(0, sep);
    const field = handle.slice(sep + 1);
    const target = graph[comfyNodeId];
    if (!target || typeof target.inputs !== "object" || target.inputs === null) {
      continue;
    }
    if (isMediaRef(value)) {
      const bytes = await loadMediaRefBytes(value, context);
      if (!bytes) {
        // An empty ref leaves the graph's own value in place.
        if (!value.uri && !value.asset_id && !value.data) continue;
        // Skipping a ref that points somewhere would submit the graph's
        // placeholder filename, and Comfy would fail with a misleading
        // "file doesn't exist" error.
        throw new Error(
          `Could not read the ${value.type ?? "media"} connected to ${handle}. ` +
            "Pick the file again or connect a different one."
        );
      }
      const { filename, contentType } = uploadNaming(comfyNodeId, field, value);
      target.inputs[field] = transport.assetFromBytes(
        bytes,
        filename,
        contentType
      );
    } else {
      target.inputs[field] = value;
    }
  }
}

/**
 * Submit `prompt` through `transport` and stream what it produces.
 *
 * Yields one frame per output file, keyed `"<comfyNodeId>:<kind>"`, as each
 * arrives, then a final `{ output }` frame describing the finished job.
 * Throws on a `failed` job (with the node-level detail), on cancellation, and
 * on the SDK errors an author can act on (queue full, insufficient credits,
 * UI-format workflow).
 */
export async function* runComfyWorkflow(
  transport: ComfyTransport,
  prompt: ComfyPrompt,
  dynamicProps: Iterable<[string, unknown]>,
  options: ComfyRunOptions
): AsyncGenerator<Record<string, unknown>> {
  const { signal, context, nodeId, nodeName } = options;
  const logLine = (
    content: string,
    severity: "info" | "warning" | "error" = "info"
  ): void => {
    context?.postMessage({
      type: "log_update",
      node_id: nodeId,
      node_name: nodeName,
      content,
      severity
    });
  };

  // Deep clone so injected inputs never mutate the stored workflow prop.
  const graph = JSON.parse(JSON.stringify(prompt)) as ComfyPrompt;

  await applyComfyInputs(graph, dynamicProps, transport, context);

  logLine(`Submitting ComfyUI workflow (${Object.keys(graph).length} nodes)`);

  let job: ComfyJob;
  try {
    job = await transport.submit(graph, { signal, apiKey: options.apiKey });
  } catch (err) {
    throw describeComfyError(err);
  }

  logLine(`Comfy job ${job.id} submitted`);

  // The abort signal cancels the job server-side, not just this generator.
  const onAbort = (): void => {
    void job.cancel().catch(() => {
      // Best-effort: a job that already finished stays in its terminal state.
    });
  };
  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  let terminalStatus: string | null = null;
  let fileCount = 0;
  const emitted = new Set<string>();
  try {
    for await (const event of job.events(signal)) {
      switch (event.kind) {
        case "progress": {
          const [progress, total] =
            event.step !== null && event.steps !== null && event.steps > 0
              ? [event.step, event.steps]
              : event.nodesTotal !== null && event.nodesTotal > 0
                ? [event.value * event.nodesTotal, event.nodesTotal]
                : [event.value, 1];
          context?.postMessage({
            type: "node_progress",
            node_id: nodeId,
            progress,
            total
          });
          break;
        }
        case "log":
          logLine(
            event.message,
            event.level === "error"
              ? "error"
              : event.level === "warning"
                ? "warning"
                : "info"
          );
          break;
        case "statusChange":
          logLine(
            event.queuePosition === null
              ? `Status: ${event.status}`
              : `Status: ${event.status} (queue position ${event.queuePosition})`
          );
          if (TERMINAL_STATUSES.has(event.status)) {
            terminalStatus = event.status;
          }
          break;
        case "preview":
          // Nothing downstream consumes preview bitmaps today, so they are
          // logged rather than emitted on a slot no consumer declares.
          if (options.previews) {
            logLine(
              `Preview from #${event.nodeId} (${event.data.length} bytes, ${event.contentType})`
            );
          }
          break;
        case "outputReady": {
          fileCount += 1;
          emitted.add(event.output.id);
          logLine(
            `Output from #${event.output.nodeId} (${event.output.name}, ${event.output.contentType})`
          );
          yield await outputFrame(event.output, signal);
          break;
        }
      }
    }
  } catch (err) {
    if (signal.aborted) {
      throw abortError(`Comfy job ${job.id} was canceled`);
    }
    throw describeComfyError(err);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }

  // `events()` never writes the job model, and a deployment without live SSE
  // ends the stream with no terminal frame at all — so pull the authoritative
  // status, outputs and error before deciding what happened.
  await job.refresh(signal);
  const status = TERMINAL_STATUSES.has(job.status)
    ? job.status
    : (terminalStatus ?? job.status);

  if (status === "canceled" || status === "canceling") {
    throw abortError(`Comfy job ${job.id} was canceled`);
  }
  if (status !== "succeeded") {
    const error = status === "failed" ? jobFailure(job) : new Error(`Comfy job ${job.id} ended ${status}`);
    logLine(error.message, "error");
    throw error;
  }

  // Comfy Cloud can finish a job without sending `outputReady` events, so
  // every output on the finished job that the stream did not deliver is
  // emitted here, or a downstream node wired to `<node>:video` gets nothing.
  for (const output of job.outputs) {
    if (emitted.has(output.id)) continue;
    fileCount += 1;
    yield await outputFrame(output, signal);
  }

  logLine(
    `Comfy job ${job.id} completed (${fileCount} file${fileCount === 1 ? "" : "s"})`
  );

  yield {
    output: {
      job_id: job.id,
      status,
      outputs: job.outputs.map((output) => ({
        node_id: output.nodeId,
        name: output.name,
        type: output.type,
        content_type: output.contentType,
        size_bytes: output.sizeBytes,
        asset_id: output.id
      }))
    }
  };
}

/** Sniff a media kind + mime from the leading bytes of a ComfyUI output blob. */
export function sniffMedia(bytes: Uint8Array): { kind: string; mime: string } {
  const b = bytes;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { kind: "image", mime: "image/png" };
  }
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { kind: "image", mime: "image/jpeg" };
  }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { kind: "image", mime: "image/gif" };
  }
  // RIFF container — disambiguate by the form type in bytes 8-11. RIFF is
  // generic (WEBP, WAVE, AVI, …), so only classify on an exact form match and
  // fall through otherwise rather than assuming WebP.
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    // "WEBP"
    if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
      return { kind: "image", mime: "image/webp" };
    }
    // "WAVE"
    if (b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45) {
      return { kind: "audio", mime: "audio/wav" };
    }
    // "AVI "
    if (b[8] === 0x41 && b[9] === 0x56 && b[10] === 0x49 && b[11] === 0x20) {
      return { kind: "video", mime: "video/x-msvideo" };
    }
  }
  // ftyp box → MP4/MOV
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return { kind: "video", mime: "video/mp4" };
  }
  // OGG
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) {
    return { kind: "audio", mime: "audio/ogg" };
  }
  // ID3 / MPEG audio
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    return { kind: "audio", mime: "audio/mpeg" };
  }
  return { kind: "image", mime: "image/png" };
}

/**
 * Turn a worker WebSocket URL into the HTTP origin its API v2 routes live on:
 * `ws:` becomes `http:`, `wss:` becomes `https:`, and path and query are
 * dropped (`wss://abc-7777.proxy.runpod.net/ws` →
 * `https://abc-7777.proxy.runpod.net`).
 */
export function workerHttpOrigin(workerUrl: string): string {
  const address = workerUrl.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(address)
    ? address
    : `ws://${address}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`Worker URL is not a valid URL: ${workerUrl}`);
  }
  if (url.protocol === "ws:") url.protocol = "http:";
  else if (url.protocol === "wss:") url.protocol = "https:";
  return url.origin;
}
