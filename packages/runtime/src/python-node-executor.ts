import type { ProcessingContext } from "./context.js";
import type {
  ExecuteIdentity,
  ExecuteInputBlobs,
  ExecuteOptions,
  ExecuteResult,
  ProgressEvent
} from "./python-bridge-types.js";
import { loadMediaRefBytes, type MediaRefValue } from "./media-ref-bytes.js";
import { isString } from "@nodetool-ai/protocol";
import { createLogger, getNodeBuiltinSync } from "@nodetool-ai/config";

const log = createLogger("nodetool.runtime.python-node-executor");

/** Minimal interface for the local Python stdio bridge. */
interface PythonBridgeLike {
  execute(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void,
    identity?: ExecuteIdentity,
    options?: ExecuteOptions
  ): Promise<ExecuteResult>;
  executeStream?(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void,
    identity?: ExecuteIdentity,
    options?: ExecuteOptions
  ): AsyncGenerator<ExecuteResult>;
}
const _nodeCrypto = getNodeBuiltinSync<typeof import("node:crypto")>(
  "node:crypto"
);
const randomUUID = (): string =>
  _nodeCrypto?.randomUUID
    ? _nodeCrypto.randomUUID()
    : globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : (() => {
          throw new Error("node:crypto.randomUUID requires Node");
        })();

/** Media ref types that need blob conversion. */
const MEDIA_TYPE_ALIASES: Record<string, string> = {
  ImageRef: "image",
  AudioRef: "audio",
  VideoRef: "video",
  Model3DRef: "model_3d",
  image: "image",
  audio: "audio",
  video: "video",
  model_3d: "model_3d"
};

/** Fallback extension when the ref names no format. */
const EXTENSION_MAP: Record<string, string> = {
  image: ".png",
  audio: ".wav",
  video: ".mp4",
  model_3d: ".glb"
};

/** Fallback MIME type when the ref names no format. */
const MIME_MAP: Record<string, string> = {
  image: "image/png",
  audio: "audio/wav",
  video: "video/mp4",
  model_3d: "model/gltf-binary"
};

/**
 * MIME type per declared ref format. A ref that says `format: "jpeg"` must not
 * be stored as `.png` with `image/png`: the extension decides how a browser
 * and every downstream reader treat the bytes.
 *
 * A format absent from this table still shapes the extension — the entry only
 * decides the content type, which falls back to the media kind's default.
 */
const FORMAT_MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  ogg: "audio/ogg",
  opus: "audio/opus",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "model/obj",
  stl: "model/stl",
  ply: "model/mesh",
  fbx: "application/octet-stream"
};

/**
 * The format a ref declares, as a storage-key-safe token, or null.
 *
 * The value is node-controlled and lands in a storage key, so anything but a
 * short alphanumeric token is refused rather than sanitized — a format of
 * `../../etc` has no legitimate reading.
 */
function refFormat(ref: Record<string, unknown> | null): string | null {
  const raw = ref?.["format"];
  if (!isString(raw)) return null;
  const format = raw.trim().toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(format) ? format : null;
}

/** True when a ref's `data` holds raw bytes rather than an inline payload. */
function isBinaryPayload(value: unknown): boolean {
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return true;
  return (
    Array.isArray(value) &&
    value.some(
      (item) => item instanceof Uint8Array || item instanceof ArrayBuffer
    )
  );
}

/** The ref the worker sent for this output slot, if it sent one. */
function carriedRef(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeMediaOutputType(outputType: string | undefined): string | null {
  if (!outputType) {
    return null;
  }
  return MEDIA_TYPE_ALIASES[outputType] ?? null;
}

function isMediaRef(value: unknown): value is { uri: string; type?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "uri" in value &&
    typeof (value as Record<string, unknown>).uri === "string"
  );
}

function isMediaRefList(value: unknown): value is MediaRefValue[] {
  return Array.isArray(value) && value.every(isMediaRef);
}

/**
 * Secrets a Python node receives when the user has set them, whether or not
 * the node lists them in `required_settings`, keyed by node-type namespace.
 * Hugging Face nodes read `HF_TOKEN` for gated repositories (FLUX Control,
 * Kontext, pyannote) and most do not declare it, so without this a token
 * stored in NodeTool settings never reaches the worker and the gated download
 * fails. Scoped to the `huggingface.` namespace so other Python packages do
 * not receive a credential they never asked for.
 */
const IMPLICIT_SECRETS_BY_NAMESPACE: ReadonlyArray<
  readonly [prefix: string, secrets: readonly string[]]
> = [["huggingface.", ["HF_TOKEN"]]];

function implicitSecrets(nodeType: string): readonly string[] {
  return IMPLICIT_SECRETS_BY_NAMESPACE.flatMap(([prefix, secrets]) =>
    nodeType.startsWith(prefix) ? secrets : []
  );
}

/** Prefix of the uri the worker gives a ref whose bytes travel as a blob. */
const BLOB_URI_PREFIX = "blob://";

/**
 * Replace every ref nested in `value` whose uri is `blob://<key>` for a key in
 * `blobs` with the result of `resolve`. Returns the input itself when nothing
 * matched. The worker keys the bytes of a ref that is not a top-level output
 * (an item of a `list[ImageRef]`, a field of a TypedDict) by its internal
 * blob id, so this is the only place those bytes can be reattached.
 */
async function resolveNestedBlobRefs(
  value: unknown,
  blobs: Map<string, Uint8Array>,
  used: Set<string>,
  resolve: (
    ref: Record<string, unknown>,
    bytes: Uint8Array
  ) => Promise<Record<string, unknown>>
): Promise<unknown> {
  if (Array.isArray(value)) {
    let changed = false;
    const items = await Promise.all(
      value.map(async (item) => {
        const next = await resolveNestedBlobRefs(item, blobs, used, resolve);
        if (next !== item) changed = true;
        return next;
      })
    );
    return changed ? items : value;
  }
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return value;
  const record = value as Record<string, unknown>;
  const uri = record["uri"];
  if (isString(uri) && uri.startsWith(BLOB_URI_PREFIX)) {
    const key = uri.slice(BLOB_URI_PREFIX.length);
    const bytes = blobs.get(key);
    if (bytes) {
      used.add(key);
      return resolve(record, bytes);
    }
    return value;
  }
  let copy: Record<string, unknown> | null = null;
  for (const key of Object.keys(record)) {
    const item = record[key];
    const next = await resolveNestedBlobRefs(item, blobs, used, resolve);
    if (next !== item) {
      copy ??= { ...record };
      Object.defineProperty(copy, key, {
        value: next,
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
  }
  return copy ?? value;
}

export class PythonNodeExecutor {
  constructor(
    private bridge: PythonBridgeLike,
    private nodeType: string,
    _properties: Record<string, unknown>,
    private outputTypes: Record<string, string>,
    private requiredSettings: string[],
    /** Graph node id, used to surface Python worker progress as node_progress. */
    private nodeId?: string,
    /**
     * VRAM hint from this node type's `discover` metadata, forwarded on every
     * execute so the worker can size its reclaim pass. Absent for a worker
     * that does not report one.
     */
    private requiresVramGb?: number
  ) {}

  /**
   * Run identity for the `execute` payload (bridge protocol v4).
   *
   * Before v4 the worker saw an unlabeled stream of single-node executions: it
   * constructed every node with no id, so `self._id` was `""` for all of them
   * and its node → model map collapsed into one bucket. `node_id` is what makes
   * that map real; `job_id` is what pairs the execution with the `job.end`
   * boundary that releases it.
   */
  private identity(context?: ProcessingContext): ExecuteIdentity {
    const identity: ExecuteIdentity = {};
    if (this.nodeId) {
      identity.nodeId = this.nodeId;
    }
    if (context?.jobId) {
      identity.jobId = context.jobId;
    }
    if (context?.workflowId) {
      identity.workflowId = context.workflowId;
    }
    if (context?.userId) {
      identity.userId = context.userId;
    }
    if (this.requiresVramGb != null) {
      identity.requiresVramGb = this.requiresVramGb;
    }
    return identity;
  }

  /**
   * Build an onProgress sink that forwards the Python worker's progress events
   * to the context message stream as `node_progress`. Returns undefined when we
   * lack the context or node id needed to address the message.
   */
  private progressHandler(
    context?: ProcessingContext
  ): ((event: ProgressEvent) => void) | undefined {
    const nodeId = this.nodeId;
    if (!context || !nodeId) return undefined;
    return (event: ProgressEvent) => {
      context.postMessage({
        type: "node_progress",
        node_id: nodeId,
        progress: event.progress,
        total: event.total,
        workflow_id: context.workflowId
      });
    };
  }

  /**
   * Build the `update` frame sink: forwards a node's log and binary updates
   * to the context message stream, addressed to this graph node. The worker
   * also defines `preview_update`, but the TS message protocol has no such
   * type and no Python node package posts one, so it is dropped here.
   */
  private updateHandler(
    context?: ProcessingContext
  ): ((update: Record<string, unknown>) => void) | undefined {
    const nodeId = this.nodeId;
    if (!context || !nodeId) return undefined;
    return (update: Record<string, unknown>) => {
      const type = update["type"];
      if (type === "log_update") {
        const severity = update["severity"];
        context.postMessage({
          type: "log_update",
          node_id: nodeId,
          node_name: isString(update["node_name"])
            ? update["node_name"]
            : this.nodeType,
          content: isString(update["content"]) ? update["content"] : "",
          severity:
            severity === "warning" || severity === "error" ? severity : "info",
          workflow_id: context.workflowId
        });
      } else if (type === "binary_update") {
        const binary = update["binary"];
        if (!(binary instanceof Uint8Array)) return;
        context.postMessage({
          type: "binary_update",
          node_id: nodeId,
          output_name: isString(update["output_name"])
            ? update["output_name"]
            : "output",
          // A view over the same bytes when they sit in a plain ArrayBuffer,
          // which is what the msgpack decoder produces.
          binary:
            binary.buffer instanceof ArrayBuffer
              ? new Uint8Array(
                  binary.buffer,
                  binary.byteOffset,
                  binary.byteLength
                )
              : new Uint8Array(binary)
        });
      } else {
        log.debug("Dropping unsupported Python worker update", {
          nodeType: this.nodeType,
          updateType: type
        });
      }
    };
  }

  /** Per-call bridge options: run cancellation and the update sink. */
  private executeOptions(context?: ProcessingContext): ExecuteOptions {
    const options: ExecuteOptions = {};
    if (context?.signal) options.signal = context.signal;
    const onUpdate = this.updateHandler(context);
    if (onUpdate) options.onUpdate = onUpdate;
    return options;
  }

  private async prepareExecution(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<{
    fields: Record<string, unknown>;
    blobs: ExecuteInputBlobs;
    secrets: Record<string, string>;
  }> {
    // NodeActor merges node.properties + edge inputs before calling process(),
    // so `inputs` already contains all fields. Filter out internal keys.
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(inputs)) {
      if (key !== "_secrets" && !key.startsWith("__")) {
        fields[key] = value;
      }
    }

    const blobs: ExecuteInputBlobs = {};
    for (const [key, value] of Object.entries(fields)) {
      if (isMediaRef(value)) {
        const ref = value as Record<string, unknown>;
        log.info("Processing media ref input", {
          nodeType: this.nodeType,
          key,
          type: ref.type,
          hasUri: Boolean(ref.uri),
          uriLength: isString(ref.uri) ? ref.uri.length : 0,
          hasData: ref.data !== null && ref.data !== undefined,
          dataType: typeof ref.data,
          dataLength:
            isString(ref.data)
              ? ref.data.length
              : ref.data instanceof Uint8Array
                ? ref.data.length
                : 0,
          hasAssetId: Boolean(ref.asset_id)
        });
        const data = await loadMediaRefBytes(value, context);
        log.info("Media ref blob result", {
          nodeType: this.nodeType,
          key,
          loaded: data !== null,
          blobSize: data?.length ?? 0
        });
        if (data !== null) {
          blobs[key] = data;
          delete fields[key];
        }
        continue;
      }

      if (isMediaRefList(value) && value.length > 0) {
        const items = await Promise.all(
          value.map((item) => loadMediaRefBytes(item, context))
        );
        if (items.every((item): item is Uint8Array => item !== null)) {
          blobs[key] = items;
          delete fields[key];
        }
      }
    }

    const secrets: Record<string, string> = {};
    if (context) {
      const keys = new Set([
        ...this.requiredSettings,
        ...implicitSecrets(this.nodeType)
      ]);
      for (const key of keys) {
        const value = await context.getSecret(key);
        if (value) secrets[key] = value;
      }
    }

    return { fields, blobs, secrets };
  }

  private async materializeOutputs(
    result: ExecuteResult,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    // Output names come across the Python bridge (node-controlled), so build a
    // null-prototype object: a blob/output named "__proto__" or "constructor"
    // then lands as a plain own key and can't reach the prototype setter.
    // Downstream only does own-key ops (Object.keys, spread, msgpack/JSON), so a
    // null-prototype object behaves identically for legitimate names.
    const outputs: Record<string, unknown> = Object.assign(
      Object.create(null),
      result.outputs
    );
    // A blob is paired with an output slot by name. A blob whose key names
    // no slot belongs to a ref nested inside an output (its uri is
    // `blob://<key>`); it is reattached there below, never emitted as an
    // output of its own.
    const nestedBlobs = new Map<string, Uint8Array>();
    for (const [name, blobData] of Object.entries(result.blobs)) {
      if (
        name !== "output" &&
        !Object.hasOwn(result.outputs, name) &&
        !Object.hasOwn(this.outputTypes, name)
      ) {
        nestedBlobs.set(name, blobData);
        continue;
      }
      // Guard the outputTypes lookup with Object.hasOwn so an external name like
      // "constructor" can't resolve to an inherited Object.prototype member.
      const mediaType = Object.hasOwn(this.outputTypes, name)
        ? normalizeMediaOutputType(this.outputTypes[name])
        : null;
      // The ref the worker sent for this slot, when it sent one. Rebuilding a
      // bare {uri, type} from the media kind drops everything else it carried —
      // a VideoRef's duration and format, a Model3DRef's material_file and
      // texture_files, which are what make the asset renderable.
      // Guarded with Object.hasOwn for the same reason the outputTypes lookup
      // is: a blob named "__proto__" would otherwise read Object.prototype and
      // spread its members into the output.
      const ref = Object.hasOwn(result.outputs, name)
        ? carriedRef(result.outputs[name])
        : null;

      if (mediaType && context?.storage) {
        const format = refFormat(ref);
        const ext = format ? `.${format}` : (EXTENSION_MAP[mediaType] ?? "");
        const contentType =
          (format ? FORMAT_MIME_MAP[format] : undefined) ?? MIME_MAP[mediaType];
        const storageKey = `python-bridge/${randomUUID()}${ext}`;
        const uri = await context.storage.store(
          storageKey,
          blobData,
          contentType
        );
        outputs[name] = { ...ref, uri, type: mediaType };
        // The payload is the blob, now at `uri`. A ref that also carries bytes
        // would duplicate a megabyte-scale payload downstream, so drop them —
        // tested by value, since an inline non-binary payload (a dataframe's
        // rows) is content and must survive.
        if (ref && isBinaryPayload(ref["data"])) {
          delete (outputs[name] as Record<string, unknown>)["data"];
        }
      } else if (mediaType) {
        // No storage adapter available: keep the bytes inline but preserve the
        // media kind so downstream nodes receive a typed ref (e.g. ImageRef),
        // not a bare Uint8Array.
        outputs[name] = { ...ref, type: mediaType, data: blobData };
      } else {
        outputs[name] = blobData;
      }
    }
    if (nestedBlobs.size > 0) {
      await this.attachNestedBlobs(outputs, nestedBlobs, context);
    }
    return outputs;
  }

  /** Reattach blobs keyed by internal id to the nested refs that name them. */
  private async attachNestedBlobs(
    outputs: Record<string, unknown>,
    blobs: Map<string, Uint8Array>,
    context?: ProcessingContext
  ): Promise<void> {
    const used = new Set<string>();
    const resolve = async (
      ref: Record<string, unknown>,
      bytes: Uint8Array
    ): Promise<Record<string, unknown>> => {
      const mediaType = isString(ref["type"])
        ? normalizeMediaOutputType(ref["type"])
        : null;
      if (!context?.storage) {
        return { ...ref, data: bytes };
      }
      const format = refFormat(ref);
      const ext = format
        ? `.${format}`
        : mediaType
          ? (EXTENSION_MAP[mediaType] ?? "")
          : "";
      const contentType =
        (format ? FORMAT_MIME_MAP[format] : undefined) ??
        (mediaType ? MIME_MAP[mediaType] : undefined) ??
        "application/octet-stream";
      const uri = await context.storage.store(
        `python-bridge/${randomUUID()}${ext}`,
        bytes,
        contentType
      );
      const stored: Record<string, unknown> = { ...ref, uri };
      if (isBinaryPayload(stored["data"])) delete stored["data"];
      return stored;
    };
    for (const name of Object.keys(outputs)) {
      const value = outputs[name];
      const next = await resolveNestedBlobRefs(value, blobs, used, resolve);
      if (next !== value) outputs[name] = next;
    }
    for (const key of blobs.keys()) {
      if (!used.has(key)) {
        log.warn("Dropping Python worker blob that matches no output", {
          nodeType: this.nodeType,
          blob: key
        });
      }
    }
  }

  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const { fields, blobs, secrets } = await this.prepareExecution(inputs, context);
    log.info("Python node executor calling bridge", { nodeType: this.nodeType });
    const result = await this.bridge.execute(
      this.nodeType,
      fields,
      secrets,
      blobs,
      this.progressHandler(context),
      this.identity(context),
      this.executeOptions(context)
    );
    return this.materializeOutputs(result, context);
  }

  async *genProcess(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    if (!this.bridge.executeStream) {
      yield await this.process(inputs, context);
      return;
    }

    const { fields, blobs, secrets } = await this.prepareExecution(inputs, context);
    for await (const partial of this.bridge.executeStream(
      this.nodeType,
      fields,
      secrets,
      blobs,
      this.progressHandler(context),
      this.identity(context),
      this.executeOptions(context)
    )) {
      yield await this.materializeOutputs(partial, context);
    }
  }
}
