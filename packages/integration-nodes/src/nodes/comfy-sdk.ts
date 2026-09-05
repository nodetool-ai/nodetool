/**
 * Comfy API v2 transport and the workflow runner shared by the SDK-backed
 * ComfyUI nodes.
 *
 * A {@link ComfyTransport} is the only thing that differs between Comfy
 * surfaces: Comfy Cloud gets {@link cloudTransport}, and a self-hosted v2
 * surface will get its own factory. {@link runComfyWorkflow} takes one, plus
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
import {
  Comfy,
  ComfyError,
  InsufficientCredits,
  QueueFull,
  WorkflowFormatUi,
  type ComfyEvent as SdkComfyEvent,
  type Job as SdkJob
} from "@comfyorg/sdk";
import {
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
  refresh(signal?: AbortSignal): Promise<unknown>;
  cancel(signal?: AbortSignal): Promise<unknown>;
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

/** Comfy Cloud, authenticated with a `COMFY_API_KEY`. */
export function cloudTransport(apiKey: string): ComfyTransport {
  const client = new Comfy({ apiKey });
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
  if (err instanceof QueueFull) {
    const wait =
      err.retryAfter === null ? "" : ` Retry after ${err.retryAfter}s.`;
    return new Error(`Comfy queue is full: ${err.message}${wait}`);
  }
  if (err instanceof WorkflowFormatUi) {
    return new Error(
      "ComfyUI workflow is in UI-export format. Save it with " +
        "Workflow → Export (API) and paste the API-format JSON instead."
    );
  }
  if (
    err instanceof InsufficientCredits ||
    (err instanceof ComfyError && err.httpStatus === 402)
  ) {
    return new Error(
      `Comfy account has insufficient credits: ${(err as ComfyError).message}`
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

function jobFailure(job: ComfyJob): Error {
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

/** Map one finished output onto its dynamic slot name and frame value. */
async function outputFrame(
  output: ComfyOutput,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  // Signed output URLs expire, so the bytes are pulled during the run.
  const bytes = await output.toBytes({ signal });
  const slot = `${output.nodeId}:${output.type}`;
  if (output.type === "text") {
    return { [slot]: Buffer.from(bytes).toString("utf-8") };
  }
  const kind =
    output.type === "image" || output.type === "audio" || output.type === "video"
      ? output.type
      : "document";
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
      if (!bytes) continue;
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
