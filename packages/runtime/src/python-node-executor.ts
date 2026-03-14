import type { ProcessingContext } from "./context.js";
import type { PythonBridge } from "./python-bridge.js";
import { randomUUID } from "node:crypto";

/** Media ref types that need blob conversion. */
const MEDIA_REF_TYPES = new Set([
  "ImageRef", "AudioRef", "VideoRef", "Model3DRef",
]);

/** File extensions by ref type. */
const EXTENSION_MAP: Record<string, string> = {
  ImageRef: ".png",
  AudioRef: ".wav",
  VideoRef: ".mp4",
  Model3DRef: ".glb",
};

/** MIME types by ref type. */
const MIME_MAP: Record<string, string> = {
  ImageRef: "image/png",
  AudioRef: "audio/wav",
  VideoRef: "video/mp4",
  Model3DRef: "model/gltf-binary",
};

function isMediaRef(value: unknown): value is { uri: string; type?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "uri" in value &&
    typeof (value as Record<string, unknown>).uri === "string"
  );
}

export class PythonNodeExecutor {
  constructor(
    private bridge: PythonBridge,
    private nodeType: string,
    private properties: Record<string, unknown>,
    private outputTypes: Record<string, string>,
    private requiredSettings: string[],
  ) {}

  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext,
  ): Promise<Record<string, unknown>> {
    // 1. Merge properties + edge inputs into fields
    const fields: Record<string, unknown> = { ...this.properties };
    for (const [key, value] of Object.entries(inputs)) {
      if (key !== "_secrets") {
        fields[key] = value;
      }
    }

    // 2. Extract input blobs from media refs
    const blobs: Record<string, Uint8Array> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (isMediaRef(value) && value.uri && context?.storage) {
        const data = await context.storage.retrieve(value.uri);
        if (data !== null) {
          blobs[key] = data;
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
      undefined,
    );

    // 5. Convert output blobs to stored assets
    const outputs: Record<string, unknown> = { ...result.outputs };
    for (const [name, blobData] of Object.entries(result.blobs)) {
      const outputType = this.outputTypes[name] ?? "AssetRef";
      if (MEDIA_REF_TYPES.has(outputType) && context?.storage) {
        const ext = EXTENSION_MAP[outputType] ?? "";
        const contentType = MIME_MAP[outputType];
        const storageKey = `python-bridge/${randomUUID()}${ext}`;
        const uri = await context.storage.store(storageKey, blobData, contentType);
        outputs[name] = { uri, type: outputType };
      } else {
        outputs[name] = blobData;
      }
    }

    return outputs;
  }
}
