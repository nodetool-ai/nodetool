/**
 * Dynamic FAL node class factory.
 *
 * Creates node classes from manifest data at runtime instead of codegen.
 * Each class extends BaseNode with the correct static metadata and
 * declared properties, backed by a generic process() that calls falSubmit.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import {
  getFalApiKey,
  falSubmit,
  falImageToRef,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl
} from "./fal-base.js";

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

function isListAsset(propType: string): boolean {
  return propType.startsWith("list[") && isAssetPropType(propType);
}

function assetKind(
  propType: string
): "image" | "video" | "audio" | "none" {
  if (propType === "image" || propType === "list[image]") return "image";
  if (propType === "video" || propType === "list[video]") return "video";
  if (propType === "audio" || propType === "list[audio]") return "audio";
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

async function buildArgs(
  instance: BaseNode,
  spec: FalManifestEntry,
  apiKey: string
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = {};

  for (const field of spec.inputFields) {
    if (field.parentField) continue;
    const value = (instance as unknown as Record<string, unknown>)[field.name];
    const apiName = field.apiParamName ?? field.name;
    const kind = assetKind(field.propType);

    if (kind !== "none") {
      if (isListAsset(field.propType)) {
        const list = value as Record<string, unknown>[] | undefined;
        if (list?.length) {
          const urls: string[] = [];
          for (const ref of list) {
            if (isRefSet(ref)) {
              const u = await assetToFalUrl(apiKey, ref);
              if (u) urls.push(u);
            }
          }
          if (urls.length) args[apiName] = urls;
        }
      } else {
        const ref = value as Record<string, unknown> | undefined;
        if (isRefSet(ref)) {
          const url =
            kind === "image"
              ? ((await imageToDataUrl(ref!)) ??
                (await assetToFalUrl(apiKey, ref!)))
              : await assetToFalUrl(apiKey, ref!);
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
  spec: FalManifestEntry,
  res: Record<string, unknown>
): Record<string, unknown> {
  switch (spec.outputType) {
    case "video":
      return {
        output: {
          type: "video",
          uri: (res.video as Record<string, unknown>)?.url ?? ""
        }
      };
    case "audio":
      return {
        output: {
          type: "audio",
          uri: (res.audio as Record<string, unknown>)?.url ?? ""
        }
      };
    case "model_3d": {
      const ref =
        (res as Record<string, unknown>).model_glb ??
        (res as Record<string, unknown>).model_mesh;
      return {
        output: {
          type: "model_3d",
          uri: (ref as Record<string, unknown>)?.url ?? ""
        }
      };
    }
    case "str":
      return { output: (res as Record<string, unknown>).output ?? "" };
    default:
      if (spec.outputFields.length > 0) return res;
      return { output: res };
  }
}

export function createFalNodeClass(spec: FalManifestEntry): NodeClass {
  const nodeType = `fal.${spec.moduleName}.${spec.className}`;
  const title = toTitle(spec.className);
  const descFirstLine = spec.docstring || `${spec.className} node`;
  const descSecondLine =
    spec.tags.length > 0 ? spec.tags.join(", ") : "fal, ai";
  const description = `${descFirstLine}\n${descSecondLine}`;
  const isImageOutput = spec.outputType === "image";

  // Capture spec in closure for process/genProcess
  const endpointId = spec.endpointId;
  const specRef = spec;

  const FalNodeClass = class extends BaseNode {
    async process(
      context?: ProcessingContext
    ): Promise<Record<string, unknown>> {
      if (isImageOutput) return {};
      const apiKey = getFalApiKey(this._secrets);
      const args = await buildArgs(this, specRef, apiKey);
      const res = await falSubmit(apiKey, endpointId, args);
      return mapOutput(specRef, res);
    }

    async *genProcess(
      context?: ProcessingContext
    ): AsyncGenerator<Record<string, unknown>> {
      if (!isImageOutput) {
        yield await this.process(context);
        return;
      }
      const apiKey = getFalApiKey(this._secrets);
      const args = await buildArgs(this, specRef, apiKey);
      const res = await falSubmit(apiKey, endpointId, args);
      const images = res.images as Array<{
        url: string;
        width?: number;
        height?: number;
        content_type?: string;
      }>;
      if (images?.length) {
        for (const img of images) {
          yield { output: falImageToRef(img) };
        }
      } else {
        yield mapOutput(specRef, res);
      }
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

  if (isImageOutput) {
    Object.defineProperty(FalNodeClass, "metadataOutputTypes", {
      value: { output: "image" },
      configurable: true
    });
    Object.defineProperty(FalNodeClass, "isStreamingOutput", {
      value: true,
      configurable: true
    });
  } else if (spec.outputType === "audio") {
    Object.defineProperty(FalNodeClass, "metadataOutputTypes", {
      value: { output: "audio" },
      configurable: true
    });
    Object.defineProperty(FalNodeClass, "isStreamingOutput", {
      value: true,
      configurable: true
    });
  } else if (spec.outputType === "video") {
    Object.defineProperty(FalNodeClass, "metadataOutputTypes", {
      value: { output: "video" },
      configurable: true
    });
    Object.defineProperty(FalNodeClass, "isStreamingOutput", {
      value: true,
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
    for (const f of spec.outputFields) entries[f.name] = f.propType;
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

  // Register declared properties (equivalent to @prop decorator)
  for (const field of spec.inputFields) {
    if (field.parentField) continue;

    const propOptions: PropOptions = {
      type: field.propType,
      default: field.default ?? defaultForPropType(field.propType)
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
