/**
 * Dynamic Together AI node-class factory.
 *
 * Generates node classes from `together-manifest.json` at runtime, mirroring the
 * atlascloud-nodes / fal-nodes / kie-nodes factories. Each manifest entry
 * declares one (model × task) node: its modality, model id, output type, and the
 * input fields exposed in the node UI. The generated class extends `BaseNode`, so
 * `BaseNode._injectSecrets` resolves `TOGETHER_API_KEY` from
 * `context.getSecret(...)` and surfaces it as `this._secrets.TOGETHER_API_KEY`.
 */

import {
  BaseNode,
  classifyFields,
  classNameToTitle,
  registerDeclaredProperty
} from "@nodetool-ai/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool-ai/node-sdk";
import { mapPromptAssetsToInputs } from "@nodetool-ai/runtime";
import type {
  AssetMediaKind,
  PromptAssetInputField,
  PromptAssetTextField
} from "@nodetool-ai/runtime";
import {
  getApiKey,
  imageBytesToDataUri,
  resolveAssetBytes,
  togetherGenerateImage,
  togetherGenerateVideo,
  togetherTextToSpeech,
  togetherTranscribe,
  type AssetResolveContext
} from "./together-base.js";

export type TogetherFieldType =
  | "str"
  | "int"
  | "float"
  | "bool"
  | "enum"
  | "image"
  | "audio"
  | "video";

export type TogetherModality =
  | "text_to_image"
  | "image_to_image"
  | "text_to_speech"
  | "automatic_speech_recognition"
  | "text_to_video"
  | "image_to_video";

export type TogetherOutputType = "image" | "video" | "audio" | "string";

export interface TogetherFieldDef {
  name: string;
  type: TogetherFieldType;
  default?: unknown;
  title?: string;
  description?: string;
  values?: Array<string | number>;
  min?: number;
  max?: number;
  required?: boolean;
}

export interface TogetherManifestEntry {
  className: string;
  moduleName: string;
  modality: TogetherModality;
  modelId: string;
  outputType: TogetherOutputType;
  /** Full task set of the underlying model — consumed by manifest-models.ts. */
  supportedTasks?: string[];
  title: string;
  description: string;
  fields: TogetherFieldDef[];
}

const ASSET_TYPES = new Set<TogetherFieldType>(["image", "audio", "video"]);

type ProcessContext = Parameters<BaseNode["process"]>[0] & AssetResolveContext;

function coerceScalar(v: unknown, type: TogetherFieldType): unknown {
  switch (type) {
    case "int": {
      if (typeof v === "number") return Math.trunc(v);
      const n = parseInt(String(v), 10);
      return Number.isNaN(n) ? null : n;
    }
    case "float": {
      if (typeof v === "number") return v;
      const f = parseFloat(String(v));
      return Number.isNaN(f) ? null : f;
    }
    case "bool": {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v.toLowerCase() === "true";
      return Boolean(v);
    }
    default:
      return v;
  }
}

function defaultForType(type: TogetherFieldType): unknown {
  switch (type) {
    case "bool":
      return false;
    case "int":
    case "float":
      return 0;
    case "image":
      return { type: "image", uri: "", asset_id: null, data: null, metadata: null };
    case "audio":
      return { type: "audio", uri: "", asset_id: null, data: null, metadata: null };
    case "video":
      return { type: "video", uri: "", asset_id: null, data: null, metadata: null };
    default:
      return "";
  }
}

function refHasSource(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const r = value as { uri?: string; data?: unknown; asset_id?: unknown };
  if (typeof r.uri === "string" && r.uri.trim() !== "") return true;
  if (typeof r.data === "string" && r.data.length > 0) return true;
  if (r.data instanceof Uint8Array && r.data.byteLength > 0) return true;
  return r.asset_id != null && r.asset_id !== "";
}

/**
 * Route `asset://` media mentioned inline in a node's text inputs onto its empty
 * image/audio/video inputs (and strip the mentions from the text). Shared with
 * the FAL / KIE / Replicate / AtlasCloud factories via `mapPromptAssetsToInputs`.
 */
function promptAssetOverrides(
  instance: Record<string, unknown>,
  spec: TogetherManifestEntry,
  context: ProcessContext | undefined
): Promise<Record<string, unknown>> {
  const textFields: PromptAssetTextField[] = [];
  const assetFields: PromptAssetInputField[] = [];
  for (const field of spec.fields) {
    const value = instance[field.name];
    if (ASSET_TYPES.has(field.type)) {
      assetFields.push({
        name: field.name,
        kind: field.type as AssetMediaKind,
        list: false,
        hasSource: refHasSource(value)
      });
    } else if (field.type === "str") {
      textFields.push({ name: field.name, value: String(value ?? "") });
    }
  }
  return mapPromptAssetsToInputs(textFields, assetFields, context);
}

const MEDIA_EXT: Record<string, string> = {
  image: "png",
  video: "mp4",
  audio: "mp3"
};
const MEDIA_MIME: Record<string, string> = {
  image: "image/png",
  video: "video/mp4",
  audio: "audio/mpeg"
};

type StorageWriter = {
  store?: (key: string, bytes: Uint8Array, mime?: string) => Promise<string>;
};

async function storeMedia(
  bytes: Uint8Array,
  outputType: "image" | "video" | "audio",
  mimeOverride: string | undefined,
  context: ProcessContext | undefined
): Promise<Record<string, unknown>> {
  const mime = mimeOverride ?? MEDIA_MIME[outputType];
  const ext = mime === "audio/wav" ? "wav" : MEDIA_EXT[outputType];
  const filename = `together-${outputType}-${Date.now()}.${ext}`;

  const storage = context?.storage as StorageWriter | null | undefined;
  if (storage?.store) {
    try {
      const uri = await storage.store(filename, bytes, mime);
      return { output: { type: outputType, uri } };
    } catch {
      /* fall through to base64 embed */
    }
  }
  return {
    output: {
      type: outputType,
      uri: "",
      data: Buffer.from(bytes).toString("base64")
    }
  };
}

export function createTogetherNodeClass(spec: TogetherManifestEntry): NodeClass {
  const nodeType = `together.${spec.moduleName}.${spec.className}`;
  const title = spec.title || classNameToTitle(spec.className);
  const isMedia = spec.outputType !== "string";

  const TogetherNodeClass = class extends BaseNode {
    async process(context?: ProcessContext): Promise<Record<string, unknown>> {
      const apiKey = getApiKey(this._secrets);

      const overrides = await promptAssetOverrides(
        this as unknown as Record<string, unknown>,
        spec,
        context
      );
      const self = this as unknown as Record<string, unknown>;
      const read = (name: string): unknown =>
        name in overrides ? overrides[name] : self[name];

      // Collect scalar field values; resolve asset fields to raw bytes.
      const scalars: Record<string, unknown> = {};
      const assets: Record<string, Uint8Array> = {};
      for (const f of spec.fields) {
        const v = read(f.name);
        if (v === undefined || v === null) continue;
        if (ASSET_TYPES.has(f.type)) {
          const bytes = await resolveAssetBytes(
            v,
            context,
            f.type as "image" | "audio" | "video"
          );
          if (bytes) assets[f.name] = bytes;
          continue;
        }
        if (typeof v === "string" && v === "") continue;
        scalars[f.name] = coerceScalar(v, f.type);
      }

      const num = (name: string): number | null =>
        typeof scalars[name] === "number" ? (scalars[name] as number) : null;
      const str = (name: string): string | undefined =>
        typeof scalars[name] === "string" ? (scalars[name] as string) : undefined;

      const requireAsset = (name: string, kind: string): Uint8Array => {
        const bytes = assets[name];
        if (!bytes) {
          throw new Error(`Together ${spec.className}: ${kind} input is required.`);
        }
        return bytes;
      };

      switch (spec.modality) {
        case "text_to_image": {
          const bytes = await togetherGenerateImage(apiKey, spec.modelId, {
            prompt: str("prompt") ?? "",
            width: num("width"),
            height: num("height"),
            steps: num("steps"),
            guidanceScale: num("guidance_scale"),
            seed: num("seed"),
            negativePrompt: str("negative_prompt")
          });
          return storeMedia(bytes, "image", undefined, context);
        }
        case "image_to_image": {
          const imageBytes = requireAsset("image", "image");
          const bytes = await togetherGenerateImage(apiKey, spec.modelId, {
            prompt: str("prompt") ?? "",
            imageUrl: imageBytesToDataUri(imageBytes),
            width: num("width"),
            height: num("height"),
            steps: num("steps"),
            guidanceScale: num("guidance_scale"),
            seed: num("seed")
          });
          return storeMedia(bytes, "image", undefined, context);
        }
        case "text_to_speech": {
          const format = str("format") ?? "mp3";
          const { data, mimeType } = await togetherTextToSpeech(
            apiKey,
            spec.modelId,
            {
              text: str("text") ?? "",
              voice: str("voice"),
              speed: num("speed"),
              format
            }
          );
          return storeMedia(data, "audio", mimeType, context);
        }
        case "automatic_speech_recognition": {
          const audioBytes = requireAsset("audio", "audio");
          const text = await togetherTranscribe(apiKey, spec.modelId, {
            audio: audioBytes,
            language: str("language")
          });
          return { text };
        }
        case "text_to_video": {
          const bytes = await togetherGenerateVideo(apiKey, spec.modelId, {
            prompt: str("prompt") ?? "",
            aspectRatio: str("aspect_ratio"),
            resolution: str("resolution"),
            durationSeconds: num("duration"),
            steps: num("steps"),
            guidanceScale: num("guidance_scale"),
            seed: num("seed"),
            negativePrompt: str("negative_prompt")
          });
          return storeMedia(bytes, "video", undefined, context);
        }
        case "image_to_video": {
          const imageBytes = requireAsset("image", "image");
          const bytes = await togetherGenerateVideo(apiKey, spec.modelId, {
            prompt: str("prompt") ?? "",
            firstFrameDataUri: imageBytesToDataUri(imageBytes),
            aspectRatio: str("aspect_ratio"),
            resolution: str("resolution"),
            durationSeconds: num("duration"),
            steps: num("steps"),
            guidanceScale: num("guidance_scale"),
            seed: num("seed"),
            negativePrompt: str("negative_prompt")
          });
          return storeMedia(bytes, "video", undefined, context);
        }
        default: {
          const exhaustive: never = spec.modality;
          throw new Error(`Unsupported Together modality: ${String(exhaustive)}`);
        }
      }
    }
  };

  define(TogetherNodeClass, "name", spec.className);
  define(TogetherNodeClass, "nodeType", nodeType);
  define(TogetherNodeClass, "title", title);
  define(TogetherNodeClass, "description", spec.description);
  define(TogetherNodeClass, "requiredSettings", ["TOGETHER_API_KEY"]);
  define(TogetherNodeClass, "autoSaveAsset", isMedia);
  define(
    TogetherNodeClass,
    "metadataOutputTypes",
    isMedia ? { output: spec.outputType } : { text: "str" }
  );

  const { inlineFields, inputFields } = classifyFields(
    spec.fields.map((f) => ({ name: f.name, propType: f.type }))
  );
  define(TogetherNodeClass, "inlineFields", inlineFields);
  define(TogetherNodeClass, "inputFields", inputFields);

  for (const field of spec.fields) {
    const propDefault =
      field.default === null ? null : field.default ?? defaultForType(field.type);
    const propOptions: PropOptions = { type: field.type, default: propDefault };
    if (field.title) propOptions.title = field.title;
    if (field.description) propOptions.description = field.description;
    if (field.values?.length) propOptions.values = field.values;
    if (field.min !== undefined) propOptions.min = field.min;
    if (field.max !== undefined) propOptions.max = field.max;
    if (field.required) propOptions.required = true;
    registerDeclaredProperty(TogetherNodeClass, field.name, propOptions);
  }

  return TogetherNodeClass as unknown as NodeClass;
}

export function loadTogetherNodesFromManifest(
  manifest: TogetherManifestEntry[]
): NodeClass[] {
  return manifest.map(createTogetherNodeClass);
}

function define(target: unknown, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, configurable: true });
}
