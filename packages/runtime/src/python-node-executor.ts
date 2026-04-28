import type { ProcessingContext } from "./context.js";
import { PythonRealtimeSession } from "./python-realtime-session.js";
import type {
  ExecuteInputBlobs,
  ExecuteResult,
  ProgressEvent,
  RealtimeOutputFrameEvent,
  RealtimeSessionInfoPayload,
  RealtimeStartSessionRequest,
  RealtimeStartSessionResult,
  RealtimePushInputFrameRequest,
  RealtimePushInputFrameResult,
  RealtimeUpdateParameterRequest,
  RealtimeUpdateParameterResult,
  RealtimeStopSessionRequest,
  RealtimeStopSessionResult
} from "./python-bridge-types.js";
import { createLogger } from "@nodetool/config";
import type { RealtimeSessionInfo } from "@nodetool/protocol";

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
  startRealtimeSession?: (
    request: RealtimeStartSessionRequest
  ) => Promise<RealtimeStartSessionResult>;
  pushRealtimeInputFrame?: (
    request: RealtimePushInputFrameRequest
  ) => Promise<RealtimePushInputFrameResult>;
  updateRealtimeParameter?: (
    request: RealtimeUpdateParameterRequest
  ) => Promise<RealtimeUpdateParameterResult>;
  stopRealtimeSession?: (
    request: RealtimeStopSessionRequest
  ) => Promise<RealtimeStopSessionResult>;
  on?: (
    event: "realtimeOutputFrame",
    listener: (event: RealtimeOutputFrameEvent) => void
  ) => unknown;
  off?: (
    event: "realtimeOutputFrame",
    listener: (event: RealtimeOutputFrameEvent) => void
  ) => unknown;
}
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

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

const REALTIME_OUTPUT_TIMEOUT_MS = 300_000;

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

type MediaRefValue = {
  uri: string;
  type?: string;
  asset_id?: string | null;
};

function isMediaRefList(value: unknown): value is MediaRefValue[] {
  return Array.isArray(value) && value.every(isMediaRef);
}

function isRealtimeFramePayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const type = (value as Record<string, unknown>).type;
  return type === "realtime_video_frame" || type === "realtime_audio_frame";
}

const ASSET_ID_EXTENSION_CANDIDATES: Record<string, string[]> = {
  image: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"],
  audio: ["wav", "mp3", "ogg", "m4a", "aac", "flac"],
  video: ["mp4", "webm", "mov", "avi", "mpeg", "mkv"],
  model3d: ["glb", "gltf", "obj", "fbx"]
};

function isAbsoluteFilePath(uri: string): boolean {
  return (
    /^[A-Za-z]:[\\/]/.test(uri) || uri.startsWith("\\\\") || uri.startsWith("/")
  );
}

async function readUriBytes(uri: string): Promise<Uint8Array | null> {
  if (uri.startsWith("data:")) {
    const parts = uri.split(",", 2);
    if (parts.length !== 2) {
      return null;
    }
    const [header, data] = parts;
    const bytes = header.includes(";base64")
      ? Buffer.from(data, "base64")
      : Buffer.from(decodeURIComponent(data), "utf-8");
    return new Uint8Array(bytes);
  }

  if (uri.startsWith("file://")) {
    try {
      return await readFile(fileURLToPath(uri));
    } catch {
      return null;
    }
  }

  if (isAbsoluteFilePath(uri)) {
    try {
      return await readFile(uri);
    } catch {
      return null;
    }
  }

  return null;
}

async function loadMediaRefBytes(
  value: MediaRefValue,
  context?: ProcessingContext
): Promise<Uint8Array | null> {
  // Inline base64 data takes priority over uri
  const data = (value as Record<string, unknown>).data;
  if (typeof data === "string" && data.length > 0) {
    return new Uint8Array(Buffer.from(data, "base64"));
  }
  if (data instanceof Uint8Array) {
    return data;
  }

  if (!value.uri) {
    return null;
  }

  if (context?.storage) {
    const candidates = new Set<string>();
    candidates.add(value.uri);

    if (value.asset_id) {
      const refType = (value.type ?? "").toLowerCase();
      const extensions = ASSET_ID_EXTENSION_CANDIDATES[refType] ?? ["bin"];
      for (const extension of extensions) {
        candidates.add(`/api/storage/${value.asset_id}.${extension}`);
      }
    }

    for (const candidate of candidates) {
      const stored = await context.storage.retrieve(candidate);
      if (stored !== null) {
        return stored;
      }
    }
  }

  return readUriBytes(value.uri);
}

export class PythonNodeExecutor {
  private realtimeSession: PythonRealtimeSession | null = null;

  constructor(
    private bridge: PythonBridgeLike,
    private nodeType: string,
    private properties: Record<string, unknown>,
    private outputTypes: Record<string, string>,
    private requiredSettings: string[]
  ) {}

  private async resolveSecrets(
    context?: ProcessingContext
  ): Promise<Record<string, string>> {
    const secrets: Record<string, string> = {};
    if (context) {
      for (const key of this.requiredSettings) {
        const value = await context.getSecret(key);
        if (value) secrets[key] = value;
      }
    }
    return secrets;
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

    const secrets = await this.resolveSecrets(context);

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
      } else {
        outputs[name] = blobData;
      }
    }
    return outputs;
  }

  async onSessionStart(
    context: ProcessingContext,
    session: RealtimeSessionInfo
  ): Promise<void> {
    const hasRealtimeBridge =
      this.bridge.startRealtimeSession &&
      this.bridge.pushRealtimeInputFrame &&
      this.bridge.stopRealtimeSession &&
      this.bridge.on &&
      this.bridge.off;
    if (!hasRealtimeBridge) {
      throw new Error(
        `Python node ${this.nodeType} cannot start a realtime session: bridge does not implement realtime session verbs`
      );
    }

    const sessionPayload: RealtimeSessionInfoPayload = {
      session_id: session.session_id,
      workflow_id: session.workflow_id ?? null,
      transport: session.transport,
      parameters: {},
      media_tracks: session.media_tracks ?? []
    };
    this.realtimeSession = new PythonRealtimeSession(
      this.bridge as ConstructorParameters<typeof PythonRealtimeSession>[0],
      {
        session: sessionPayload,
        nodeType: this.nodeType,
        fields: this.properties,
        secrets: await this.resolveSecrets(context)
      }
    );
    await this.realtimeSession.start();
  }

  async onSessionStop(): Promise<void> {
    const session = this.realtimeSession;
    this.realtimeSession = null;
    await session?.stop();
  }

  resetWarmState(): void {
    this.realtimeSession?.dispose();
    this.realtimeSession = null;
  }

  private waitForRealtimeOutput(): Promise<RealtimeOutputFrameEvent> {
    const session = this.realtimeSession;
    if (!session) {
      throw new Error(
        `Python node ${this.nodeType} has no active realtime session`
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        session.off("frame", onFrame);
        reject(
          new Error(
            `Timed out waiting for realtime output from Python node ${this.nodeType}`
          )
        );
      }, REALTIME_OUTPUT_TIMEOUT_MS);

      const onFrame = (event: RealtimeOutputFrameEvent) => {
        clearTimeout(timeout);
        session.off("frame", onFrame);
        resolve(event);
      };

      session.on("frame", onFrame);
    });
  }

  private async processRealtimeFrame(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    if (!this.realtimeSession) {
      return null;
    }

    const frameInput = Object.entries(inputs).find(([, value]) =>
      isRealtimeFramePayload(value)
    );
    if (!frameInput) {
      return {};
    }

    const [handle, payload] = frameInput;
    const outputPromise = this.waitForRealtimeOutput();
    await this.realtimeSession.pushFrame(handle, payload);
    const output = await outputPromise;
    return {
      [output.handle]: output.payload
    };
  }

  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const realtimeOutputs = await this.processRealtimeFrame(inputs);
    if (realtimeOutputs !== null) {
      return realtimeOutputs;
    }

    const { fields, blobs, secrets } = await this.prepareExecution(inputs, context);
    const result = await this.bridge.execute(
      this.nodeType,
      fields,
      secrets,
      blobs,
      undefined
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
      undefined
    )) {
      yield await this.materializeOutputs(partial, context);
    }
  }
}
