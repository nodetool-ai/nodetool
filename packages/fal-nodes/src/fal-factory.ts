/**
 * Dynamic FAL node class factory.
 *
 * Creates node classes from manifest data at runtime instead of codegen.
 * Each class extends BaseNode with the correct static metadata and
 * declared properties, backed by a generic process() that calls falSubmit.
 */

import {
  BaseNode,
  classifyFields,
  classNameToTitle,
  registerDeclaredProperty
} from "@nodetool-ai/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool-ai/node-sdk";
import type {
  ProcessingContext,
  PromptAssetTextField,
  PromptAssetInputField
} from "@nodetool-ai/runtime";
import { mapPromptAssetsToInputs } from "@nodetool-ai/runtime";
import {
  getFalApiKey,
  falSubmitWithMeta,
  falImageToRef,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl
} from "./fal-base.js";
import type { FalImageResult } from "./fal-base.js";
import { reportFalCost } from "./fal-cost.js";

export interface FalManifestEntry {
  endpointId: string;
  className: string;
  moduleName: string;
  docstring: string;
  tags: string[];
  useCases: string[];
  outputType: string;
  outputFields: Array<{ name: string; propType: string }>;
  enums: Array<{ name: string; values: [string, string][] }>;
  inputFields: Array<{
    name: string;
    apiParamName?: string;
    propType: string;
    tsType: string;
    default: unknown;
    description: string;
    fieldType: string;
    required: boolean;
    enumValues?: string[];
    nestedAssetKey?: string;
    parentField?: string;
    min?: number;
    max?: number;
  }>;
}

function isAssetPropType(propType: string): boolean {
  const lower = propType.toLowerCase();
  return [
    "image",
    "video",
    "audio",
    "list[image]",
    "list[video]",
    "list[audio]"
  ].includes(lower);
}

function isListAsset(propType: string): boolean {
  return propType.toLowerCase().startsWith("list[") && isAssetPropType(propType);
}

function assetKind(
  propType: string
): "image" | "video" | "audio" | "none" {
  const lower = propType.toLowerCase();
  if (lower === "image" || lower === "list[image]") return "image";
  if (lower === "video" || lower === "list[video]") return "video";
  if (lower === "audio" || lower === "list[audio]") return "audio";
  return "none";
}

function defaultForPropType(propType: string): unknown {
  switch (propType) {
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
      return { type: "video", uri: "", asset_id: null, data: null, metadata: null, duration: null, format: null };
    default:
      if (propType.startsWith("list[")) return [];
      return "";
  }
}

function castValue(value: unknown, propType: string): unknown {
  if (value === null || value === undefined) return value;
  if (propType.startsWith("list[") || propType.startsWith("dict[")) {
    return value; // pass through structured types as-is
  }
  switch (propType) {
    case "int":
    case "float":
      return Number(value);
    case "bool":
      return Boolean(value);
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// Field Classification
// ---------------------------------------------------------------------------

/**
 * Compute inlineFields and inputFields from a FAL field list.
 * Delegates to the shared `classifyFields` rule in node-sdk after stripping
 * sub-fields and lowercasing FAL's mixed-case propType values.
 */
function computeFieldClassification(
  fields: Array<{
    name: string;
    propType: string;
    parentField?: string;
  }>
) {
  return classifyFields(
    fields
      .filter((f) => !f.parentField)
      .map((f) => ({ name: f.name, propType: f.propType.toLowerCase() }))
  );
}

/**
 * Route `asset://` media mentioned inline in a node's text inputs onto its
 * empty image/audio/video inputs (and strip the mentions from the text).
 * Shared with KIE / Replicate / image-to-image via `mapPromptAssetsToInputs`.
 */
async function promptAssetOverrides(
  instance: BaseNode,
  spec: FalManifestEntry,
  context?: ProcessingContext
): Promise<Record<string, unknown>> {
  const values = instance as unknown as Record<string, unknown>;
  const textFields: PromptAssetTextField[] = [];
  const assetFields: PromptAssetInputField[] = [];
  for (const field of spec.inputFields) {
    if (field.parentField) continue;
    const kind = assetKind(field.propType);
    if (kind === "image" || kind === "audio" || kind === "video") {
      const list = isListAsset(field.propType);
      const value = values[field.name];
      const hasSource = list
        ? Array.isArray(value) && value.some(isRefSet)
        : isRefSet(value);
      assetFields.push({
        name: field.name,
        label: field.apiParamName ?? field.name,
        kind,
        list,
        hasSource
      });
    } else if (field.propType.toLowerCase() === "str") {
      textFields.push({
        name: field.name,
        value: String(values[field.name] ?? "")
      });
    }
  }
  return mapPromptAssetsToInputs(textFields, assetFields, context);
}

function resolveFieldValue(
  instance: BaseNode,
  fieldName: string,
  apiParamName?: string,
  propType?: string
): unknown {
  const record = instance as unknown as Record<string, unknown>;
  const primary = fieldName in record ? record[fieldName] : undefined;
  const kind = propType ? assetKind(propType) : "none";

  if (
    apiParamName &&
    apiParamName in record &&
    record[apiParamName] !== undefined &&
    (primary === undefined || (kind !== "none" && !isRefSet(primary)))
  ) {
    return record[apiParamName];
  }
  if (primary !== undefined) {
    return primary;
  }
  if (
    fieldName === "mask" &&
    record.mask_url !== undefined &&
    (primary === undefined || (kind !== "none" && !isRefSet(primary)))
  ) {
    return record.mask_url;
  }
  return undefined;
}

function fieldLabel(field: { name: string }): string {
  if (field.name === "mask") return "Mask";
  return field.name;
}

function validateRequiredAssetArgs(
  instance: BaseNode,
  spec: FalManifestEntry,
  nodeTitle: string
): void {
  for (const field of spec.inputFields) {
    if (field.parentField || !field.required) continue;
    const kind = assetKind(field.propType);
    if (kind === "none") continue;
    const value = resolveFieldValue(
      instance,
      field.name,
      field.apiParamName,
      field.propType
    );
    const suffix =
      field.name === "mask" ? " and match image dimensions" : "";
    if (isListAsset(field.propType)) {
      const list = value as Record<string, unknown>[] | undefined;
      if (!list?.some((ref) => isRefSet(ref))) {
        throw new Error(
          `${nodeTitle}: ${fieldLabel(field)} must be connected${suffix}`
        );
      }
      continue;
    }
    if (!isRefSet(value)) {
      throw new Error(
        `${nodeTitle}: ${fieldLabel(field)} must be connected${suffix}`
      );
    }
  }
}

async function buildArgs(
  instance: BaseNode,
  spec: FalManifestEntry,
  apiKey: string,
  context?: ProcessingContext
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = {};
  const overrides = await promptAssetOverrides(instance, spec, context);

  for (const field of spec.inputFields) {
    if (field.parentField) continue;

    // Image-gen nodes always produce a single output — force num_images to 1
    // regardless of any saved value, since the field is no longer exposed.
    if (field.name === "num_images") {
      const apiName = field.apiParamName ?? field.name;
      args[apiName] = 1;
      continue;
    }

    const value =
      field.name in overrides
        ? overrides[field.name]
        : resolveFieldValue(
            instance,
            field.name,
            field.apiParamName,
            field.propType
          );
    const apiName = field.apiParamName ?? field.name;
    const kind = assetKind(field.propType);

    if (kind !== "none") {
      if (isListAsset(field.propType)) {
        const list = value as Record<string, unknown>[] | undefined;
        if (list?.length) {
          const urls: string[] = [];
          for (const ref of list) {
            if (isRefSet(ref)) {
              const u = await assetToFalUrl(apiKey, ref, context);
              if (u) urls.push(u);
            }
          }
          if (urls.length) {
            // Asset-wrapper lists (e.g. list[ImageInput] collapsed to
            // list[image]) carry a nestedAssetKey; the API expects an array of
            // objects like [{ image_url: url }], not bare URL strings.
            args[apiName] = field.nestedAssetKey
              ? urls.map((u) => ({ [field.nestedAssetKey!]: u }))
              : urls;
          }
        }
      } else if (field.nestedAssetKey) {
        const ref = value as Record<string, unknown> | undefined;
        if (isRefSet(ref)) {
          const url = await assetToFalUrl(apiKey, ref!, context);
          if (url) {
            const nested: Record<string, unknown> = {
              [field.nestedAssetKey]: url
            };
            const subFields = spec.inputFields.filter(
              (subField) => subField.parentField === field.name
            );
            for (const subField of subFields) {
              const subValue = (instance as unknown as Record<string, unknown>)[
                subField.name
              ];
              nested[subField.name] = castValue(subValue, subField.propType);
            }
            args[apiName] = nested;
          }
        }
      } else {
        const ref = value as Record<string, unknown> | undefined;
        if (isRefSet(ref)) {
          const url =
            kind === "image"
              ? ((await imageToDataUrl(ref!, context)) ??
                (await assetToFalUrl(apiKey, ref!, context)))
              : await assetToFalUrl(apiKey, ref!, context);
          if (url) args[apiName] = url;
        }
      }
    } else {
      args[apiName] = castValue(value, field.propType);
    }
  }

  removeNulls(args);
  return args;
}

function coerceAssetRef(
  value: unknown,
  propType: string
): unknown {
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  const kind = assetKind(propType);
  if (obj.url) {
    return { type: kind !== "none" ? kind : propType, uri: obj.url, width: obj.width, height: obj.height };
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Pull a usable asset URL out of a FAL response value. FAL endpoints return the
 * asset variously as a File object (`{ url }`), a bare URL string, or an array
 * of either, so handle all three uniformly.
 */
function extractAssetUri(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const u = extractAssetUri(item);
      if (u) return u;
    }
    return "";
  }
  const rec = asRecord(value);
  if (rec && typeof rec.url === "string") return rec.url;
  return "";
}

/**
 * Resolve the URL for a single-asset output. Checks well-known response keys
 * first (e.g. `video`, `video_url`), then falls back to whatever asset field
 * the endpoint's schema declared — covering endpoints that return `video_url`,
 * `audio_file`, etc. instead of the canonical singular key.
 */
function resolveAssetUri(
  spec: FalManifestEntry,
  res: Record<string, unknown>,
  preferredKeys: string[]
): string {
  for (const key of preferredKeys) {
    if (key in res) {
      const u = extractAssetUri(res[key]);
      if (u) return u;
    }
  }
  for (const f of spec.outputFields) {
    if (f.name in res) {
      const u = extractAssetUri(res[f.name]);
      if (u) return u;
    }
  }
  return "";
}

function mapOutput(
  spec: FalManifestEntry,
  res: Record<string, unknown>
): Record<string, unknown> {
  switch (spec.outputType) {
    case "video":
      return {
        output: {
          type: "video",
          uri: resolveAssetUri(spec, res, [
            "video",
            "videos",
            "video_url",
            "video_file"
          ])
        }
      };
    case "audio":
      return {
        output: {
          type: "audio",
          uri: resolveAssetUri(spec, res, [
            "audio",
            "audios",
            "audio_url",
            "audio_file"
          ])
        }
      };
    case "model_3d":
      return {
        output: {
          type: "model_3d",
          uri: resolveAssetUri(spec, res, [
            "model_glb",
            "model_mesh",
            "model",
            "model_url"
          ])
        }
      };
    case "str": {
      // The text lives under the endpoint's declared field name (e.g.
      // `results`, `voice_id`), which is not always `output`.
      const name = spec.outputFields[0]?.name;
      const value = name && name in res ? res[name] : res.output;
      return { output: value ?? "" };
    }
    default:
      if (spec.outputFields.length > 0) {
        const out: Record<string, unknown> = {};
        const fieldMap = new Map(
          spec.outputFields.map((f) => [f.name, f.propType])
        );
        for (const [key, value] of Object.entries(res)) {
          const propType = fieldMap.get(key);
          if (propType && isAssetPropType(propType)) {
            out[key] = coerceAssetRef(value, propType);
          } else {
            out[key] = value;
          }
        }
        return out;
      }
      return { output: res };
  }
}

export function createFalNodeClass(spec: FalManifestEntry): NodeClass {
  const nodeType = `fal.${spec.moduleName}.${spec.className}`;
  const title = classNameToTitle(spec.className);
  const descFirstLine = spec.docstring || `${spec.className} node`;
  const descSecondLine =
    spec.tags.length > 0 ? spec.tags.join(", ") : "fal, ai";
  const description = `${descFirstLine}\n${descSecondLine}`;
  const isImageOutput = spec.outputType === "image";
  // Generative outputs — auto-save assets and auto-show result preview in UI
  const isGenerativeOutput = [
    "image",
    "video",
    "audio",
    "model_3d"
  ].includes(spec.outputType);

  const endpointId = spec.endpointId;
  const specRef = spec;

  const FalNodeClass = class extends BaseNode {
    async process(
      context?: ProcessingContext
    ): Promise<Record<string, unknown>> {
      const apiKey = getFalApiKey(this._secrets);
      validateRequiredAssetArgs(this, specRef, title);
      const args = await buildArgs(this, specRef, apiKey, context);
      const { data: res, requestId } = await falSubmitWithMeta(
        apiKey,
        endpointId,
        args
      );
      reportFalCost(context, nodeType, res, args, requestId);
      if (isImageOutput) {
        const images = res.images as
          | Array<{
              url: string;
              width?: number;
              height?: number;
              content_type?: string;
            }>
          | undefined;
        if (images?.length) {
          return { output: falImageToRef(images[0]) };
        }
        // Many endpoints return a single `image` object instead of an `images`
        // array; map it onto the canonical `output` slot too.
        const single = res.image;
        if (asRecord(single)?.url) {
          return { output: falImageToRef(single as FalImageResult) };
        }
        if (typeof single === "string" && single) {
          return { output: { type: "image", uri: single } };
        }
        return mapOutput(specRef, res);
      }
      return mapOutput(specRef, res);
    }
  };

  // Static properties
  Object.defineProperty(FalNodeClass, "name", {
    value: spec.className,
    configurable: true
  });
  Object.defineProperty(FalNodeClass, "nodeType", {
    value: nodeType,
    configurable: true
  });
  Object.defineProperty(FalNodeClass, "title", {
    value: title,
    configurable: true
  });
  Object.defineProperty(FalNodeClass, "description", {
    value: description,
    configurable: true
  });
  Object.defineProperty(FalNodeClass, "requiredSettings", {
    value: ["FAL_API_KEY"],
    configurable: true
  });
  if (isGenerativeOutput) {
    Object.defineProperty(FalNodeClass, "autoSaveAsset", {
      value: true,
      configurable: true
    });
    // Media generators render as a content card (image/video/audio/3D body).
    // This is the metadata-driven equivalent of the frontend's old
    // "fal.* namespace + media output" heuristic.
    Object.defineProperty(FalNodeClass, "body", {
      value: "content_card",
      configurable: true
    });
  }

  if (isImageOutput) {
    Object.defineProperty(FalNodeClass, "metadataOutputTypes", {
      value: { output: "image" },
      configurable: true
    });
  } else if (spec.outputType === "audio") {
    Object.defineProperty(FalNodeClass, "metadataOutputTypes", {
      value: { output: "audio" },
      configurable: true
    });
  } else if (spec.outputType === "video") {
    Object.defineProperty(FalNodeClass, "metadataOutputTypes", {
      value: { output: "video" },
      configurable: true
    });
  } else if (spec.outputType === "model_3d") {
    Object.defineProperty(FalNodeClass, "metadataOutputTypes", {
      value: { output: "model_3d" },
      configurable: true
    });
  } else if (spec.outputType === "str") {
    Object.defineProperty(FalNodeClass, "outputTypes", {
      value: { output: "str" },
      configurable: true
    });
  } else if (spec.outputFields.length > 0) {
    const entries: Record<string, string> = {};
    const metaEntries: Record<string, string> = {};
    for (const f of spec.outputFields) {
      entries[f.name] = f.propType;
      const kind = assetKind(f.propType);
      if (kind !== "none") {
        metaEntries[f.name] = kind;
      }
    }
    if (Object.keys(metaEntries).length > 0) {
      Object.defineProperty(FalNodeClass, "metadataOutputTypes", {
        value: metaEntries,
        configurable: true
      });
    }
    Object.defineProperty(FalNodeClass, "outputTypes", {
      value: entries,
      configurable: true
    });
  } else {
    Object.defineProperty(FalNodeClass, "outputTypes", {
      value: { output: "dict" },
      configurable: true
    });
  }

  // Compute and set field classification
  const { inlineFields, inputFields } = computeFieldClassification(spec.inputFields);
  Object.defineProperty(FalNodeClass, "inlineFields", {
    value: inlineFields,
    configurable: true
  });
  Object.defineProperty(FalNodeClass, "inputFields", {
    value: inputFields,
    configurable: true
  });

  // Register declared properties (equivalent to @prop decorator).
  // num_images is internal-only (pinned to 1) and not exposed in the UI.
  for (const field of spec.inputFields) {
    if (field.parentField) continue;
    if (field.name === "num_images") continue;

    // Asset inputs need a proper AssetRef default object. Some manifest entries
    // carry `default: ""` for asset fields (notably inpaint `mask`s); an empty
    // string must not shadow the AssetRef default, so ignore non-object
    // manifest defaults for asset propTypes.
    const manifestDefault =
      assetKind(field.propType) !== "none" &&
      typeof field.default !== "object"
        ? undefined
        : field.default;
    const propOptions: PropOptions = {
      type: field.propType,
      default: manifestDefault ?? defaultForPropType(field.propType)
    };
    if (field.description) propOptions.description = field.description;
    if (field.enumValues?.length) propOptions.values = field.enumValues;
    if (field.min !== undefined) propOptions.min = field.min;
    if (field.max !== undefined) propOptions.max = field.max;

    registerDeclaredProperty(FalNodeClass, field.name, propOptions);
  }

  return FalNodeClass as unknown as NodeClass;
}

export function loadFalNodesFromManifest(
  manifest: FalManifestEntry[]
): NodeClass[] {
  return manifest.map(createFalNodeClass);
}
