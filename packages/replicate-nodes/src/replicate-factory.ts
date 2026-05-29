/**
 * Dynamic Replicate node class factory.
 *
 * Creates node classes from manifest data at runtime instead of codegen.
 * Each class extends BaseNode with the correct static metadata and
 * declared properties, backed by a generic process() that calls Replicate.
 */

import {
  BaseNode,
  classifyFields,
  classNameToTitle,
  registerDeclaredProperty
} from "@nodetool-ai/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool-ai/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString
} from "./replicate-base.js";

// ---------------------------------------------------------------------------
// Manifest types — mirrors replicate-codegen types.ts NodeSpec
// ---------------------------------------------------------------------------

export interface ReplicateFieldDef {
  name: string;
  apiParamName?: string;
  tsType: string;
  propType: string;
  default: unknown;
  description: string;
  fieldType: "input" | "output";
  required: boolean;
  enumRef?: string;
  enumValues?: string[];
  nestedAssetKey?: string;
  parentField?: string;
  min?: number;
  max?: number;
}

export interface ReplicateManifestEntry {
  endpointId: string;
  className: string;
  moduleName: string;
  docstring: string;
  tags: string[];
  useCases: string[];
  outputType: string;
  inputFields: ReplicateFieldDef[];
  outputFields: ReplicateFieldDef[];
  enums: Array<{ name: string; values: [string, string][] }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAssetPropType(propType: string): boolean {
  return [
    "image",
    "video",
    "audio",
    "list[image]",
    "list[video]",
    "list[audio]"
  ].includes(propType);
}

function assetKind(
  propType: string
): "image" | "video" | "audio" | "none" {
  if (propType === "image" || propType === "list[image]") return "image";
  if (propType === "video" || propType === "list[video]") return "video";
  if (propType === "audio" || propType === "list[audio]") return "audio";
  return "none";
}

function isListAsset(propType: string): boolean {
  return propType.startsWith("list[") && isAssetPropType(propType);
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
    return value;
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

const EXCLUDED_FIELDS = new Set(["prompt_template"]);

// ---------------------------------------------------------------------------
// Field Classification
// ---------------------------------------------------------------------------

/**
 * Compute inlineFields and inputFields from a Replicate field list.
 * Delegates to the shared `classifyFields` rule in node-sdk after stripping
 * sub-fields and Replicate-specific `EXCLUDED_FIELDS`.
 */
function computeFieldClassification(fields: ReplicateFieldDef[]) {
  return classifyFields(
    fields
      .filter((f) => !f.parentField && !EXCLUDED_FIELDS.has(f.name))
      .map((f) => ({ name: f.name, propType: f.propType }))
  );
}

async function buildArgs(
  instance: BaseNode,
  spec: ReplicateManifestEntry,
  apiKey: string,
  context?: Parameters<BaseNode["process"]>[0]
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = {};

  for (const field of spec.inputFields) {
    if (field.parentField) continue;
    if (EXCLUDED_FIELDS.has(field.name)) continue;

    // Image-gen nodes always produce a single output — force num_outputs to 1
    // regardless of any saved value, since the field is no longer exposed.
    if (field.name === "num_outputs") {
      const apiName = field.apiParamName ?? field.name;
      args[apiName] = 1;
      continue;
    }

    const value = (instance as unknown as Record<string, unknown>)[field.name];
    const apiName = field.apiParamName ?? field.name;
    const kind = assetKind(field.propType);

    if (kind !== "none") {
      if (isListAsset(field.propType)) {
        const refs = Array.isArray(value) ? value : [];
        const urls: string[] = [];
        for (const ref of refs) {
          if (isRefSet(ref)) {
            const url = await assetToUrl(
              ref as Record<string, unknown>,
              apiKey,
              context
            );
            if (url) urls.push(url);
          }
        }
        if (urls.length) args[apiName] = urls;
      } else {
        const ref = value as Record<string, unknown> | undefined;
        if (isRefSet(ref)) {
          const url = await assetToUrl(ref!, apiKey, context);
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

function mapOutput(
  spec: ReplicateManifestEntry,
  output: unknown
): Record<string, unknown> {
  switch (spec.outputType) {
    case "image":
      return { output: outputToImageRef(output) };
    case "video":
      return { output: outputToVideoRef(output) };
    case "audio":
      return { output: outputToAudioRef(output) };
    case "str":
      return { output: outputToString(output) };
    default:
      return { output };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createReplicateNodeClass(
  spec: ReplicateManifestEntry
): NodeClass {
  const moduleId = spec.moduleName.replace(/-/g, ".");
  const nodeType = `replicate.${moduleId}.${spec.className}`;
  const title = classNameToTitle(spec.className);
  const descFirstLine = spec.docstring || `${spec.className} node`;
  const descSecondLine =
    spec.tags.length > 0 ? spec.tags.join(", ") : "replicate, ai";
  const description = `${descFirstLine}\n${descSecondLine}`;
  // Generative outputs — auto-save assets and auto-show result preview in UI
  const isGenerativeOutput = ["image", "video", "audio"].includes(
    spec.outputType
  );
  const specRef = spec;

  const executePrediction = async (
    instance: BaseNode,
    context?: Parameters<BaseNode["process"]>[0]
  ): Promise<unknown> => {
    const apiKey = getReplicateApiKey(instance._secrets);
    const args = await buildArgs(instance, specRef, apiKey, context);
    const res = await replicateSubmit(apiKey, specRef.endpointId, args);
    return res.output;
  };

  const ReplicateNodeClass = class extends BaseNode {
    async process(
      context?: Parameters<BaseNode["process"]>[0]
    ): Promise<Record<string, unknown>> {
      const output = await executePrediction(this, context);
      return mapOutput(specRef, output);
    }
  };

  Object.defineProperty(ReplicateNodeClass, "name", {
    value: spec.className,
    configurable: true
  });
  Object.defineProperty(ReplicateNodeClass, "nodeType", {
    value: nodeType,
    configurable: true
  });
  Object.defineProperty(ReplicateNodeClass, "title", {
    value: title,
    configurable: true
  });
  Object.defineProperty(ReplicateNodeClass, "description", {
    value: description,
    configurable: true
  });
  Object.defineProperty(ReplicateNodeClass, "requiredSettings", {
    value: ["REPLICATE_API_TOKEN"],
    configurable: true
  });
  if (isGenerativeOutput) {
    Object.defineProperty(ReplicateNodeClass, "autoSaveAsset", {
      value: true,
      configurable: true
    });
    // Media generators render as a content card. Metadata-driven equivalent of
    // the frontend's old "replicate.* namespace + media output" heuristic.
    Object.defineProperty(ReplicateNodeClass, "body", {
      value: "content_card",
      configurable: true
    });
  }
  Object.defineProperty(ReplicateNodeClass, "metadataOutputTypes", {
    value: { output: spec.outputType === "dict" ? "any" : spec.outputType },
    configurable: true
  });

  // Compute and set field classification
  const { inlineFields, inputFields } = computeFieldClassification(spec.inputFields);
  Object.defineProperty(ReplicateNodeClass, "inlineFields", {
    value: inlineFields,
    configurable: true
  });
  Object.defineProperty(ReplicateNodeClass, "inputFields", {
    value: inputFields,
    configurable: true
  });

  // Register declared properties. num_outputs is internal-only (pinned to 1)
  // and not exposed in the UI.
  for (const field of spec.inputFields) {
    if (field.parentField) continue;
    if (field.name === "num_outputs") continue;

    const propOptions: PropOptions = {
      type: field.propType,
      default: field.default ?? defaultForPropType(field.propType)
    };
    if (field.description) propOptions.description = field.description;
    if (field.enumValues?.length) propOptions.values = field.enumValues;
    if (field.min !== undefined) propOptions.min = field.min;
    if (field.max !== undefined) propOptions.max = field.max;

    registerDeclaredProperty(ReplicateNodeClass, field.name, propOptions);
  }

  return ReplicateNodeClass as unknown as NodeClass;
}

export function loadReplicateNodesFromManifest(
  manifest: ReplicateManifestEntry[]
): NodeClass[] {
  return manifest.map(createReplicateNodeClass);
}
