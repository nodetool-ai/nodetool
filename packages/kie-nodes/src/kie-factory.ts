/**
 * Dynamic KIE node class factory.
 *
 * Creates node classes from manifest data at runtime instead of codegen.
 * Each class extends BaseNode with the correct static metadata and
 * declared properties, backed by a generic process() that calls the KIE API.
 */

import {
  applyContentCardBody,
  BaseNode,
  classifyFields,
  classNameToTitle,
  defaultForPropType,
  propertyOf,
  registerDeclaredProperty
} from "@nodetool-ai/node-sdk";
import type { NodeClass, NodeValue, PropOptions } from "@nodetool-ai/node-sdk";
import type {
  PromptAssetTextField,
  PromptAssetInputField
} from "@nodetool-ai/runtime";
import { mapPromptAssetsToInputs } from "@nodetool-ai/runtime";
import {
  getApiKey,
  kieExecuteTask,
  kieExecuteOmniDirect,
  kieExecuteSunoTask,
  kieImageRef,
  isRefSet,
  reportKieProviderCost,
  uploadImageInput,
  uploadAudioInput,
  uploadVideoInput
} from "./kie-base.js";
import { buildVideoClipsFromRefs } from "./video-clip.js";

// ---------------------------------------------------------------------------
// Manifest types — mirrors kie-codegen types.ts
// ---------------------------------------------------------------------------

interface KieFieldDef {
  name: string;
  type:
    | "str"
    | "int"
    | "float"
    | "bool"
    | "enum"
    | "image"
    | "audio"
    | "video"
    | "list[str]"
    | "list[int]"
    | "list[float]"
    | "list[dict]"
    | "list[image]"
    | "list[video]"
    | "list[audio]";
  default?: unknown;
  title?: string;
  description?: string;
  values?: string[];
  min?: number;
  max?: number;
  required?: boolean;
}

interface KieUploadDef {
  field: string;
  kind: "image" | "audio" | "video";
  isList?: boolean;
  isVideoClip?: boolean;
  paramName?: string;
  groupKey?: string;
}

interface KieValidationDef {
  field: string;
  rule: "not_empty";
  message?: string;
}

interface KieConditionalDef {
  field: string;
  condition: "gte_zero" | "truthy" | "not_default";
  defaultValue?: unknown;
}

export interface KieManifestEntry {
  className: string;
  moduleName: string;
  modelId: string;
  title: string;
  description: string;
  outputType: "image" | "audio" | "video" | "text";
  pollInterval: number;
  maxAttempts: number;
  useSuno?: boolean;
  sunoEndpoint?: string;
  useOmniDirect?: boolean;
  submitEndpoint?: string;
  pollEndpoint?: string;
  responseIdKey?: string;
  resultObjectKey?: string;
  fields: KieFieldDef[];
  uploads?: KieUploadDef[];
  validation?: KieValidationDef[];
  paramNames?: Record<string, string>;
  conditionalFields?: KieConditionalDef[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAssetType(type: string): boolean {
  return [
    "image",
    "audio",
    "video",
    "list[image]",
    "list[video]",
    "list[audio]"
  ].includes(type);
}

/** The list types the API takes by value rather than as an uploaded asset. */
const VALUE_LIST_TYPES: ReadonlySet<string> = new Set([
  "list[str]",
  "list[int]",
  "list[float]",
  "list[dict]"
]);

function isValueListType(type: string): boolean {
  return VALUE_LIST_TYPES.has(type);
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter((item) => item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizeNumberList(value: unknown): number[] {
  const items = Array.isArray(value) ? value : [value];
  return items.map(Number).filter((item) => Number.isFinite(item));
}

/**
 * A `list[dict]` parameter (Kling 3.0 Omni's `elements` and `multi_prompt`)
 * carries request objects the caller supplies, so it passes through untouched.
 * A JSON string is accepted too — that is what a text upstream wires in.
 */
function normalizeRecordList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== null && item !== undefined);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Not JSON — nothing this parameter can carry, so send nothing.
      return [];
    }
  }
  return [];
}

function normalizeValueList(value: unknown, type: string): unknown[] {
  if (type === "list[int]") {
    return normalizeNumberList(value).map((item) => Math.trunc(item));
  }
  if (type === "list[float]") {
    return normalizeNumberList(value);
  }
  if (type === "list[dict]") {
    return normalizeRecordList(value);
  }
  return normalizeStringList(value);
}

/** A scalar as the KIE API takes it, after coercion from the stored value. */
type CoercedScalar = string | number | boolean | null | undefined;

function castValue(value: unknown, type: string): CoercedScalar {
  if (value === null || value === undefined) return value;
  switch (type) {
    case "int":
    case "float": {
      // A saved graph can hold a non-numeric string in a numeric slot. `Number`
      // answers NaN there, and NaN reaches KIE as the literal "NaN" or a
      // JSON null. Return null so the caller's empty-arg pruning drops the
      // field and the model's own default applies.
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case "bool":
      return Boolean(value);
    default:
      return String(value);
  }
}

function computeFieldClassification(fields: KieFieldDef[]) {
  const base = classifyFields(
    fields.map((f) => ({ name: f.name, propType: f.type }))
  );
  for (const field of fields) {
    if (isValueListType(field.type) && !base.inputFields.includes(field.name)) {
      base.inputFields.push(field.name);
    }
  }
  return base;
}

function uploadFnForKind(
  kind: "image" | "audio" | "video"
): (
  apiKey: string,
  ref: unknown,
  context?: Parameters<BaseNode["process"]>[0]
) => Promise<string> {
  switch (kind) {
    case "image":
      return uploadImageInput;
    case "audio":
      return uploadAudioInput;
    case "video":
      return uploadVideoInput;
  }
}

async function buildVideoClips(
  apiKey: string,
  value: unknown,
  context?: Parameters<BaseNode["process"]>[0]
): Promise<Array<{ url: string; start: number; ends: number }>> {
  return buildVideoClipsFromRefs(
    (ref) => uploadVideoInput(apiKey, ref, context),
    value
  );
}

/**
 * Route `asset://` media mentioned inline in a node's text inputs onto its
 * empty image/audio/video uploads (and strip the mentions from the text).
 * Shared with FAL / Replicate / image-to-image via `mapPromptAssetsToInputs`.
 */
async function promptAssetOverrides(
  instance: BaseNode,
  spec: KieManifestEntry,
  context?: Parameters<BaseNode["process"]>[0]
): Promise<Record<string, unknown>> {
  const textFields: PromptAssetTextField[] = spec.fields
    .filter((f) => f.type === "str")
    .map((f) => ({
      name: f.name,
      value: String(propertyOf(instance, f.name) ?? "")
    }));
  const assetFields: PromptAssetInputField[] = [];
  for (const upload of spec.uploads ?? []) {
    // Video-clip uploads carry per-clip start/end timing, not a plain ref, so
    // they aren't a target for inline mentions; plain video uploads are.
    if (upload.isVideoClip) continue;
    if (
      upload.kind !== "image" &&
      upload.kind !== "audio" &&
      upload.kind !== "video"
    )
      continue;
    const value = propertyOf(instance, upload.field);
    const list = Boolean(upload.isList);
    const hasSource = list
      ? Array.isArray(value) && value.some(isRefSet)
      : isRefSet(value);
    assetFields.push({
      name: upload.field,
      label: upload.paramName ?? upload.field,
      kind: upload.kind,
      list,
      hasSource
    });
  }
  return mapPromptAssetsToInputs(textFields, assetFields, context);
}

async function buildParams(
  instance: BaseNode,
  spec: KieManifestEntry,
  apiKey: string,
  context?: Parameters<BaseNode["process"]>[0]
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = {};
  const clipUploads = new Set(
    spec.uploads?.filter((u) => u.isVideoClip).map((u) => u.field) ?? []
  );
  const overrides = await promptAssetOverrides(instance, spec, context);
  // SAFETY: both sources hold node property values, and NodeTool restricts
  // those to its own property types — the shapes `NodeValue` names.
  const readValue = (name: string): NodeValue =>
    (name in overrides
      ? overrides[name]
      : propertyOf(instance, name)) as NodeValue;

  // Scalar and list[str] fields
  for (const field of spec.fields) {
    if (isAssetType(field.type) || clipUploads.has(field.name)) continue;

    // Image-gen nodes always produce a single output — force the count to 1
    // regardless of any saved value, since the field is no longer exposed.
    if (field.name === "num_images") {
      const paramName = spec.paramNames?.[field.name] ?? field.name;
      params[paramName] = castValue(1, field.type);
      continue;
    }

    const value = readValue(field.name);
    const paramName = spec.paramNames?.[field.name] ?? field.name;
    const defLit = field.default ?? defaultForPropType(field.type);

    if (isValueListType(field.type)) {
      const list = normalizeValueList(value ?? defLit, field.type);
      if (list.length) {
        params[paramName] = list;
      }
      continue;
    }

    const cast = castValue(value ?? defLit, field.type);

    const conditional = spec.conditionalFields?.find(
      (c) => c.field === field.name
    );
    if (conditional?.condition === "gte_zero") {
      if (Number(cast) >= 0) params[paramName] = cast;
    } else if (conditional?.condition === "truthy") {
      if (value) params[paramName] = cast;
    } else {
      // No conditional, or an unconditional rule ("not_default"): include the
      // param as-is. Mirrors the codegen reference (node-generator.ts), whose
      // `else` branch emits the value unconditionally. The previous
      // `else if (!conditional)` was dead code inside `if (conditional)`, so
      // "not_default" fields were silently dropped from the request.
      params[paramName] = cast;
    }
  }

  // Upload assets
  if (spec.uploads) {
    const groups = new Map<string, string[]>();

    for (const upload of spec.uploads) {
      const value = readValue(upload.field);
      const fn = uploadFnForKind(upload.kind);

      if (upload.isVideoClip) {
        const clips = await buildVideoClips(apiKey, value, context);
        const paramName = upload.paramName ?? upload.field;
        if (clips.length) {
          params[paramName] = clips;
        }
        continue;
      }

      if (upload.groupKey) {
        if (!groups.has(upload.groupKey)) groups.set(upload.groupKey, []);
        if (isRefSet(value)) {
          const url = await fn(apiKey, value, context);
          groups.get(upload.groupKey)!.push(url);
        }
      } else if (upload.isList) {
        const list = Array.isArray(value) ? value : [];
        const urls: string[] = [];
        for (const item of list) {
          if (isRefSet(item)) urls.push(await fn(apiKey, item, context));
        }
        const paramName = upload.paramName ?? `${upload.field}_urls`;
        if (urls.length) params[paramName] = urls;
      } else {
        if (isRefSet(value)) {
          const url = await fn(apiKey, value, context);
          const paramName = upload.paramName ?? `${upload.field}_url`;
          if (url) params[paramName] = url;
        }
      }
    }

    // Emit grouped uploads
    for (const [groupKey, urls] of groups) {
      if (urls.length) {
        const groupUpload: KieUploadDef | undefined = spec.uploads!.find(
          (u) => u.groupKey === groupKey
        );
        const paramName = groupUpload?.paramName ?? "image_urls";
        params[paramName] = urls;
      }
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createKieNodeClass(spec: KieManifestEntry): NodeClass {
  const nodeType = `kie.${spec.moduleName}.${spec.className}`;
  const title = spec.title || classNameToTitle(spec.className);
  const description = spec.description;
  const isImageOutput = spec.outputType === "image";
  const isTextOutput = spec.outputType === "text";
  const isGenerativeOutput = ["image", "audio", "video"].includes(
    spec.outputType
  );
  const specRef = spec;

  const wrapOutput = async (b64: string): Promise<Record<string, unknown>> => {
    if (isTextOutput) return { output: b64 };
    if (isImageOutput) return { output: await kieImageRef(b64) };
    return { output: { type: specRef.outputType, data: b64 } };
  };

  const executeTask = async (
    instance: BaseNode,
    context: Parameters<BaseNode["process"]>[0] | undefined
  ) => {
    const apiKey = getApiKey(instance._secrets);

    if (specRef.validation) {
      for (const v of specRef.validation) {
        if (v.rule === "not_empty") {
          const val = propertyOf(instance, v.field);
          if (!String(val ?? "").trim()) {
            throw new Error(v.message ?? `${v.field} cannot be empty`);
          }
        }
      }
    }

    const params = await buildParams(instance, specRef, apiKey, context);

    if (specRef.useOmniDirect) {
      if (!specRef.submitEndpoint || !specRef.responseIdKey) {
        throw new Error(
          `Omni node ${specRef.className} missing submitEndpoint or responseIdKey`
        );
      }
      return await kieExecuteOmniDirect(
        apiKey,
        specRef.submitEndpoint,
        params,
        specRef.responseIdKey
      );
    }
    if (specRef.useSuno) {
      return await kieExecuteSunoTask(
        apiKey,
        params,
        specRef.pollInterval,
        specRef.maxAttempts,
        specRef.sunoEndpoint
      );
    }
    return await kieExecuteTask(
      apiKey,
      specRef.modelId,
      params,
      specRef.pollInterval,
      specRef.maxAttempts,
      specRef.submitEndpoint,
      specRef.pollEndpoint,
      specRef.resultObjectKey
    );
  };

  const KieNodeClass = class extends BaseNode {
    async process(
      context?: Parameters<BaseNode["process"]>[0]
    ): Promise<Record<string, unknown>> {
      const result = await executeTask(this, context);
      reportKieProviderCost(context, result.creditsConsumed, result.taskId);
      return wrapOutput(result.items[0]);
    }
  };

  // Static properties
  Object.defineProperty(KieNodeClass, "name", {
    value: spec.className,
    configurable: true
  });
  Object.defineProperty(KieNodeClass, "nodeType", {
    value: nodeType,
    configurable: true
  });
  Object.defineProperty(KieNodeClass, "title", {
    value: title,
    configurable: true
  });
  Object.defineProperty(KieNodeClass, "description", {
    value: description,
    configurable: true
  });
  Object.defineProperty(KieNodeClass, "requiredSettings", {
    value: ["KIE_API_KEY"],
    configurable: true
  });
  if (isGenerativeOutput) {
    Object.defineProperty(KieNodeClass, "autoSaveAsset", {
      value: true,
      configurable: true
    });
  }
  Object.defineProperty(KieNodeClass, "metadataOutputTypes", {
    value: { output: spec.outputType },
    configurable: true
  });
  // Preview-forward body for anything the editor can display — the media
  // generators plus the text-output models.
  applyContentCardBody(KieNodeClass);

  // Compute and set field classification
  const { inlineFields, inputFields } = computeFieldClassification(spec.fields);
  Object.defineProperty(KieNodeClass, "inlineFields", {
    value: inlineFields,
    configurable: true
  });
  Object.defineProperty(KieNodeClass, "inputFields", {
    value: inputFields,
    configurable: true
  });

  // Register declared properties — num_images is internal-only (pinned to 1)
  // and not exposed in the UI.
  for (const field of spec.fields) {
    if (field.name === "num_images") continue;
    const propOptions: PropOptions = {
      type: field.type === "list[image]" ? "list[image]" : field.type,
      default: field.default ?? defaultForPropType(field.type)
    };
    if (field.title) propOptions.title = field.title;
    if (field.description) propOptions.description = field.description;
    if (field.values?.length) propOptions.values = field.values;
    if (field.min !== undefined) propOptions.min = field.min;
    if (field.max !== undefined) propOptions.max = field.max;

    registerDeclaredProperty(KieNodeClass, field.name, propOptions);
  }

  return KieNodeClass;
}

export function loadKieNodesFromManifest(
  manifest: KieManifestEntry[]
): NodeClass[] {
  return manifest.map(createKieNodeClass);
}
