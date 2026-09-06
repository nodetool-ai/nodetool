import type { ProcessingContext } from "./context.js";
import type {
  ExecuteIdentity,
  ExecuteInputBlobs,
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
    identity?: ExecuteIdentity
  ): Promise<ExecuteResult>;
  executeStream?(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void,
    identity?: ExecuteIdentity
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
      for (const key of this.requiredSettings) {
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
    for (const [name, blobData] of Object.entries(result.blobs)) {
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
    return outputs;
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
      this.identity(context)
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
      this.identity(context)
    )) {
      yield await this.materializeOutputs(partial, context);
    }
  }
}
