/**
 * Dynamic Replicate node class factory.
 *
 * Creates node classes from manifest data at runtime instead of codegen.
 * Each class extends BaseNode with the correct static metadata and
 * declared properties, backed by a generic process() that calls Replicate.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool/node-sdk";
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

function toTitle(className: string): string {
  return className.replace(/([A-Z])/g, " $1").trim();
}

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

function castValue(value: unknown, propType: string): unknown {
  if (value === null || value === undefined) return value;
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

async function buildArgs(
  instance: BaseNode,
  spec: ReplicateManifestEntry,
  apiKey: string
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = {};

  for (const field of spec.inputFields) {
    if (field.parentField) continue;
    if (EXCLUDED_FIELDS.has(field.name)) continue;

    const value = (instance as unknown as Record<string, unknown>)[field.name];
    const apiName = field.apiParamName ?? field.name;
    const kind = assetKind(field.propType);

    if (kind !== "none") {
      const ref = value as Record<string, unknown> | undefined;
      if (isRefSet(ref)) {
        const url = await assetToUrl(ref!, apiKey);
        if (url) args[apiName] = url;
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
  const title = toTitle(spec.className);
  const descFirstLine = spec.docstring || `${spec.className} node`;
  const descSecondLine =
    spec.tags.length > 0 ? spec.tags.join(", ") : "replicate, ai";
  const description = `${descFirstLine}\n${descSecondLine}`;
  const specRef = spec;

  const ReplicateNodeClass = class extends BaseNode {
    async process(): Promise<Record<string, unknown>> {
      const apiKey = getReplicateApiKey(this._secrets);
      const args = await buildArgs(this, specRef, apiKey);
      const res = await replicateSubmit(apiKey, specRef.endpointId, args);
      return mapOutput(specRef, res.output);
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
  Object.defineProperty(ReplicateNodeClass, "metadataOutputTypes", {
    value: { output: spec.outputType === "dict" ? "any" : spec.outputType },
    configurable: true
  });

  // Register declared properties
  for (const field of spec.inputFields) {
    if (field.parentField) continue;

    const propOptions: PropOptions = {
      type: field.propType,
      default:
        field.default ??
        (field.propType === "bool"
          ? false
          : field.propType === "int" || field.propType === "float"
            ? 0
            : field.propType.startsWith("list[")
              ? []
              : "")
    };
    if (field.description) propOptions.description = field.description;
    if (field.enumValues?.length) propOptions.values = field.enumValues;

    registerDeclaredProperty(ReplicateNodeClass, field.name, propOptions);
  }

  return ReplicateNodeClass as unknown as NodeClass;
}

export function loadReplicateNodesFromManifest(
  manifest: ReplicateManifestEntry[]
): NodeClass[] {
  return manifest.map(createReplicateNodeClass);
}
