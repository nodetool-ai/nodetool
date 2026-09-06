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
  applyContentCardBody,
  BaseNode,
  classifyFields,
  classNameToTitle,
  defaultForPropType,
  isBoolean,
  isNumber,
  isRecord,
  isString,
  propertyOf,
  registerDeclaredProperty
} from "@nodetool-ai/node-sdk";
import type { NodeClass, NodeValue, PropOptions } from "@nodetool-ai/node-sdk";
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

/** The three field types that carry media rather than a scalar. */
function isAssetField(type: TogetherFieldType): type is AssetMediaKind {
  return ASSET_TYPES.has(type);
}

type ProcessContext = Parameters<BaseNode["process"]>[0] & AssetResolveContext;

function coerceScalar(v: NodeValue, type: TogetherFieldType): NodeValue {
  switch (type) {
    case "int": {
      if (isNumber(v)) return Math.trunc(v);
      const n = parseInt(String(v), 10);
      return Number.isNaN(n) ? null : n;
    }
    case "float": {
      if (isNumber(v)) return v;
      const f = parseFloat(String(v));
      return Number.isNaN(f) ? null : f;
    }
    case "bool": {
      if (isBoolean(v)) return v;
      if (isString(v)) return v.toLowerCase() === "true";
      return Boolean(v);
    }
    default:
      return v;
  }
}

function refHasSource(value: NodeValue): boolean {
  if (!isRecord(value)) return false;
  if (isString(value.uri) && value.uri.trim() !== "") return true;
  const data = value.data;
  if (isString(data) && data.length > 0) return true;
  if (data instanceof Uint8Array && data.byteLength > 0) return true;
  return value.asset_id != null && value.asset_id !== "";
}

/**
 * Route `asset://` media mentioned inline in a node's text inputs onto its empty
 * image/audio/video inputs (and strip the mentions from the text). Shared with
 * the FAL / KIE / Replicate / AtlasCloud factories via `mapPromptAssetsToInputs`.
 */
function promptAssetOverrides(
  instance: BaseNode,
  spec: TogetherManifestEntry,
  context: ProcessContext | undefined
): Promise<Record<string, NodeValue>> {
  const textFields: PromptAssetTextField[] = [];
  const assetFields: PromptAssetInputField[] = [];
  for (const field of spec.fields) {
    const value = propertyOf(instance, field.name);
    if (isAssetField(field.type)) {
      assetFields.push({
        name: field.name,
        kind: field.type,
        list: false,
        hasSource: refHasSource(value)
      });
    } else if (field.type === "str") {
      textFields.push({ name: field.name, value: String(value ?? "") });
    }
  }
  // SAFETY: the overrides are the asset refs this call routed out of `asset://`
  // mentions, so they are node property values like the ones they replace.
  return mapPromptAssetsToInputs(textFields, assetFields, context) as Promise<
    Record<string, NodeValue>
  >;
}

const MEDIA_EXT = {
  image: "png",
  video: "mp4",
  audio: "mp3"
} satisfies Record<AssetMediaKind, string>;
const MEDIA_MIME = {
  image: "image/png",
  video: "video/mp4",
  audio: "audio/mpeg"
} satisfies Record<AssetMediaKind, string>;

/** The media ref a generated asset is emitted as: stored, or embedded inline. */
type StoredMedia = {
  type: AssetMediaKind;
  uri: string;
  data?: string;
};

/** What a Together node emits: a media ref, or the transcriber's text. */
type TogetherNodeOutput = { output: StoredMedia } | { text: string };

async function storeMedia(
  bytes: Uint8Array,
  outputType: AssetMediaKind,
  mimeOverride: string | undefined,
  context: ProcessContext | undefined
): Promise<TogetherNodeOutput> {
  const mime = mimeOverride ?? MEDIA_MIME[outputType];
  const ext = mime === "audio/wav" ? "wav" : MEDIA_EXT[outputType];
  const filename = `together-${outputType}-${Date.now()}.${ext}`;

  const storage = context?.storage;
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
    async process(context?: ProcessContext): Promise<TogetherNodeOutput> {
      const apiKey = getApiKey(this._secrets);

      const overrides = await promptAssetOverrides(this, spec, context);
      const read = (name: string): NodeValue =>
        name in overrides ? overrides[name] : propertyOf(this, name);

      // Collect scalar field values; resolve asset fields to raw bytes.
      const scalars: Record<string, NodeValue> = {};
      const assets: Record<string, Uint8Array> = {};
      for (const f of spec.fields) {
        const v = read(f.name);
        if (v === undefined || v === null) continue;
        if (isAssetField(f.type)) {
          const bytes = await resolveAssetBytes(v, context, f.type);
          if (bytes) assets[f.name] = bytes;
          continue;
        }
        if (v === "") continue;
        scalars[f.name] = coerceScalar(v, f.type);
      }

      const num = (name: string): number | null => {
        const value = scalars[name];
        return isNumber(value) ? value : null;
      };
      const str = (name: string): string | undefined => {
        const value = scalars[name];
        return isString(value) ? value : undefined;
      };

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
  // Preview-forward body for anything the editor can display — the image,
  // video and audio generators plus the text-output transcribers.
  applyContentCardBody(TogetherNodeClass);

  const { inlineFields, inputFields } = classifyFields(
    spec.fields.map((f) => ({ name: f.name, propType: f.type }))
  );
  define(TogetherNodeClass, "inlineFields", inlineFields);
  define(TogetherNodeClass, "inputFields", inputFields);

  for (const field of spec.fields) {
    const propDefault =
      field.default === null
        ? null
        : field.default ?? defaultForPropType(field.type);
    const propOptions: PropOptions = { type: field.type, default: propDefault };
    if (field.title) propOptions.title = field.title;
    if (field.description) propOptions.description = field.description;
    if (field.values?.length) propOptions.values = field.values;
    if (field.min !== undefined) propOptions.min = field.min;
    if (field.max !== undefined) propOptions.max = field.max;
    if (field.required) propOptions.required = true;
    registerDeclaredProperty(TogetherNodeClass, field.name, propOptions);
  }

  return TogetherNodeClass;
}

export function loadTogetherNodesFromManifest(
  manifest: TogetherManifestEntry[]
): NodeClass[] {
  return manifest.map(createTogetherNodeClass);
}

function define(target: NodeClass, key: string, value: NodeValue): void {
  Object.defineProperty(target, key, { value, configurable: true });
}
