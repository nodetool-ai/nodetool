import type { ProcessingContext } from "./context.js";
import type {
  ExecuteInputBlobs,
  ExecuteResult,
  ProgressEvent
} from "./python-bridge.js";

/** Minimal interface for the bridge — works with both PythonBridge and PythonStdioBridge. */
interface PythonBridgeLike {
  execute(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void
  ): Promise<ExecuteResult>;
}
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

/** Media ref types that need blob conversion. */
const MEDIA_REF_TYPES = new Set([
  "ImageRef",
  "AudioRef",
  "VideoRef",
  "Model3DRef"
]);

/** File extensions by ref type. */
const EXTENSION_MAP: Record<string, string> = {
  ImageRef: ".png",
  AudioRef: ".wav",
  VideoRef: ".mp4",
  Model3DRef: ".glb"
};

/** MIME types by ref type. */
const MIME_MAP: Record<string, string> = {
  ImageRef: "image/png",
  AudioRef: "audio/wav",
  VideoRef: "video/mp4",
  Model3DRef: "model/gltf-binary"
};

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
  constructor(
    private bridge: PythonBridgeLike,
    private nodeType: string,
    _properties: Record<string, unknown>,
    private outputTypes: Record<string, string>,
    private requiredSettings: string[]
  ) {}

  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    // NodeActor merges node.properties + edge inputs before calling process(),
    // so `inputs` already contains all fields. Filter out internal keys.
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(inputs)) {
      if (key !== "_secrets" && !key.startsWith("__")) {
        fields[key] = value;
      }
    }

    // 2. Extract input blobs from media refs
    const blobs: ExecuteInputBlobs = {};
    for (const [key, value] of Object.entries(fields)) {
      if (isMediaRef(value)) {
        const data = await loadMediaRefBytes(value, context);
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

    // 3. Gather secrets
    const secrets: Record<string, string> = {};
    if (context) {
      for (const key of this.requiredSettings) {
        const value = await context.getSecret(key);
        if (value) secrets[key] = value;
      }
    }

    // 4. Execute via bridge
    const result = await this.bridge.execute(
      this.nodeType,
      fields,
      secrets,
      blobs,
      undefined
    );

    // 5. Convert output blobs to stored assets
    const outputs: Record<string, unknown> = { ...result.outputs };
    for (const [name, blobData] of Object.entries(result.blobs)) {
      const outputType = this.outputTypes[name] ?? "AssetRef";
      if (MEDIA_REF_TYPES.has(outputType) && context?.storage) {
        const ext = EXTENSION_MAP[outputType] ?? "";
        const contentType = MIME_MAP[outputType];
        const storageKey = `python-bridge/${randomUUID()}${ext}`;
        const uri = await context.storage.store(
          storageKey,
          blobData,
          contentType
        );
        outputs[name] = { uri, type: outputType };
      } else {
        outputs[name] = blobData;
      }
    }

    return outputs;
  }
}
