import type { ProcessingContext } from "./context.js";
import type {
  ExecuteInputBlobs,
  ExecuteResult,
  ProgressEvent
} from "./python-bridge-types.js";
import { loadMediaRefBytes, type MediaRefValue } from "./media-ref-bytes.js";
import { createLogger, importNodeBuiltin } from "@nodetool-ai/config";

const log = createLogger("nodetool.runtime.python-node-executor");

/** Minimal interface for the local Python stdio bridge. */
interface PythonBridgeLike {
  execute(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void
  ): Promise<ExecuteResult>;
  executeStream?(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void
  ): AsyncGenerator<ExecuteResult>;
}
const _nodeCrypto = await importNodeBuiltin<typeof import("node:crypto")>(
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

/** File extensions by ref type. */
const EXTENSION_MAP: Record<string, string> = {
  image: ".png",
  audio: ".wav",
  video: ".mp4",
  model_3d: ".glb"
};

/** MIME types by ref type. */
const MIME_MAP: Record<string, string> = {
  image: "image/png",
  audio: "audio/wav",
  video: "video/mp4",
  model_3d: "model/gltf-binary"
};

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
    private nodeId?: string
  ) {}

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
          uriLength: typeof ref.uri === "string" ? ref.uri.length : 0,
          hasData: ref.data !== null && ref.data !== undefined,
          dataType: typeof ref.data,
          dataLength:
            typeof ref.data === "string"
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
    const outputs: Record<string, unknown> = { ...result.outputs };
    for (const [name, blobData] of Object.entries(result.blobs)) {
      const mediaType = normalizeMediaOutputType(this.outputTypes[name]);
      if (mediaType && context?.storage) {
        const ext = EXTENSION_MAP[mediaType] ?? "";
        const contentType = MIME_MAP[mediaType];
        const storageKey = `python-bridge/${randomUUID()}${ext}`;
        const uri = await context.storage.store(
          storageKey,
          blobData,
          contentType
        );
        outputs[name] = { uri, type: mediaType };
      } else if (mediaType) {
        // No storage adapter available: keep the bytes inline but preserve the
        // media kind so downstream nodes receive a typed ref (e.g. ImageRef),
        // not a bare Uint8Array.
        outputs[name] = { type: mediaType, data: blobData };
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
      this.progressHandler(context)
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
      this.progressHandler(context)
    )) {
      yield await this.materializeOutputs(partial, context);
    }
  }
}
