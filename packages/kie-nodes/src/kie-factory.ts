/**
 * Dynamic KIE node class factory.
 *
 * Creates node classes from manifest data at runtime instead of codegen.
 * Each class extends BaseNode with the correct static metadata and
 * declared properties, backed by a generic process() that calls the KIE API.
 */

import {
  BaseNode,
  classifyFields,
  classNameToTitle,
  registerDeclaredProperty
} from "@nodetool-ai/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool-ai/node-sdk";
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

export interface KieFieldDef {
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

export interface KieUploadDef {
  field: string;
  kind: "image" | "audio" | "video";
  isList?: boolean;
  isVideoClip?: boolean;
  paramName?: string;
  groupKey?: string;
}

export interface KieValidationDef {
  field: string;
  rule: "not_empty";
  message?: string;
}

export interface KieConditionalDef {
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

function isListStrType(type: string): boolean {
  return type === "list[str]";
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

function castValue(value: unknown, type: string): unknown {
  if (value === null || value === undefined) return value;
  switch (type) {
    case "int":
    case "float":
      return Number(value);
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
    if (
      field.type === "list[str]" &&
      !base.inputFields.includes(field.name)
    ) {
      base.inputFields.push(field.name);
    }
  }
  return base;
}

function defaultForType(type: string): unknown {
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
      return {
        type: "video",
        uri: "",
        asset_id: null,
        data: null,
        metadata: null,
        duration: null,
        format: null
      };
    case "list[image]":
    case "list[video]":
    case "list[audio]":
    case "list[str]":
      return [];
    default:
      return "";
  }
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
  const values = instance as unknown as Record<string, unknown>;
  const textFields: PromptAssetTextField[] = spec.fields
    .filter((f) => f.type === "str")
    .map((f) => ({ name: f.name, value: String(values[f.name] ?? "") }));
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
    const value = values[upload.field];
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
  const readValue = (name: string): unknown =>
    name in overrides
      ? overrides[name]
      : (instance as unknown as Record<string, unknown>)[name];

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
    const defLit = field.default ?? defaultForType(field.type);

    if (isListStrType(field.type)) {
      const list = normalizeStringList(value ?? defLit);
      if (list.length) {
        params[paramName] = list;
      }
      continue;
    }

    const cast = castValue(value ?? defLit, field.type);

    const conditional = spec.conditionalFields?.find(
      (c) => c.field === field.name
    );
    if (conditional) {
      if (conditional.condition === "gte_zero" && Number(cast) >= 0) {
        params[paramName] = cast;
      } else if (conditional.condition === "truthy" && value) {
        params[paramName] = cast;
      } else if (!conditional) {
        params[paramName] = cast;
      }
    } else {
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
          const val = (instance as unknown as Record<string, unknown>)[v.field];
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
      reportKieProviderCost(context, result.creditsConsumed);
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
    // Media generators render as a content card. Metadata-driven equivalent of
    // the frontend's old "kie.* namespace + media output" heuristic.
    Object.defineProperty(KieNodeClass, "body", {
      value: "content_card",
      configurable: true
    });
  }
  Object.defineProperty(KieNodeClass, "metadataOutputTypes", {
    value: { output: spec.outputType },
    configurable: true
  });

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
      default: field.default ?? defaultForType(field.type)
    };
    if (field.title) propOptions.title = field.title;
    if (field.description) propOptions.description = field.description;
    if (field.values?.length) propOptions.values = field.values;
    if (field.min !== undefined) propOptions.min = field.min;
    if (field.max !== undefined) propOptions.max = field.max;

    registerDeclaredProperty(KieNodeClass, field.name, propOptions);
  }

  return KieNodeClass as unknown as NodeClass;
}

export function loadKieNodesFromManifest(
  manifest: KieManifestEntry[]
): NodeClass[] {
  return manifest.map(createKieNodeClass);
}
