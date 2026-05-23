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
    | "list[audio]"
    | "video_clip_list";
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
    "list[audio]",
    "video_clip_list"
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
    case "video_clip_list":
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

  // Scalar and list[str] fields
  for (const field of spec.fields) {
    if (isAssetType(field.type) || clipUploads.has(field.name)) continue;
    const value = (instance as unknown as Record<string, unknown>)[field.name];
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
      const value = (instance as unknown as Record<string, unknown>)[
        upload.field
      ];
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

  const KieNodeClass = class extends BaseNode {
    async process(
      context?: Parameters<BaseNode["process"]>[0]
    ): Promise<Record<string, unknown>> {
      const apiKey = getApiKey(this._secrets);

      // Validation
      if (specRef.validation) {
        for (const v of specRef.validation) {
          if (v.rule === "not_empty") {
            const val = (this as unknown as Record<string, unknown>)[v.field];
            if (!String(val ?? "").trim()) {
              throw new Error(v.message ?? `${v.field} cannot be empty`);
            }
          }
        }
      }

      const params = await buildParams(this, specRef, apiKey, context);

      let result: Awaited<ReturnType<typeof kieExecuteTask>>;
      if (specRef.useOmniDirect) {
        if (!specRef.submitEndpoint || !specRef.responseIdKey) {
          throw new Error(
            `Omni node ${specRef.className} missing submitEndpoint or responseIdKey`
          );
        }
        result = await kieExecuteOmniDirect(
          apiKey,
          specRef.submitEndpoint,
          params,
          specRef.responseIdKey
        );
      } else if (specRef.useSuno) {
        result = await kieExecuteSunoTask(
          apiKey,
          params,
          specRef.pollInterval,
          specRef.maxAttempts,
          specRef.sunoEndpoint
        );
      } else {
        result = await kieExecuteTask(
          apiKey,
          specRef.modelId,
          params,
          specRef.pollInterval,
          specRef.maxAttempts,
          specRef.submitEndpoint,
          specRef.pollEndpoint,
          specRef.resultObjectKey
        );
      }

      reportKieProviderCost(context, result.creditsConsumed);

      if (isTextOutput) {
        return { output: result.data };
      }
      if (isImageOutput) {
        return { output: await kieImageRef(result.data) };
      }
      return {
        output: { type: specRef.outputType, data: result.data }
      };
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
  Object.defineProperty(KieNodeClass, "exposeAsTool", {
    value: true,
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

  // Register declared properties
  for (const field of spec.fields) {
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
