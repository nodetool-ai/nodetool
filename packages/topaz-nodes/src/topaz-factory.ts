/**
 * Dynamic Topaz node class factory.
 *
 * Generates node classes from `topaz-manifest.json` at runtime, mirroring the
 * kie-nodes factory. Image nodes upload bytes directly to the Topaz image API;
 * the video node probes source metadata locally (ffprobe) before driving the
 * multi-step video upload pipeline.
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
  probeVideoMetadata,
  refToBytes,
  sourceContainerFromRef,
  topazExecuteImageTask,
  topazExecuteVideoTask,
  topazImageRef,
  type TopazImageSpec,
  type TopazVideoKind,
  type TopazVideoSpec
} from "./topaz-base.js";

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

export interface TopazFieldDef {
  name: string;
  type: "str" | "int" | "float" | "bool" | "enum" | "image" | "video";
  default?: unknown;
  title?: string;
  description?: string;
  values?: string[];
  min?: number;
  max?: number;
  required?: boolean;
  uploadField?: boolean;
}

export interface TopazManifestEntry {
  className: string;
  moduleName: string;
  modelId: string;
  title: string;
  description: string;
  outputType: "image" | "video";
  videoKind?: TopazVideoKind;
  requiredRuntimes?: string[];
  submitEndpoint: string;
  statusEndpoint: string;
  downloadEndpoint?: string;
  acceptEndpoint?: string;
  completeEndpoint?: string;
  pollInterval: number;
  maxAttempts: number;
  fields: TopazFieldDef[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAssetType(type: string): boolean {
  return type === "image" || type === "video";
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

function defaultForType(type: string): unknown {
  switch (type) {
    case "bool":
      return false;
    case "int":
    case "float":
      return 0;
    case "image":
      return { type: "image", uri: "", asset_id: null, data: null, metadata: null };
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
    default:
      return "";
  }
}

function computeFieldClassification(fields: TopazFieldDef[]) {
  return classifyFields(fields.map((f) => ({ name: f.name, propType: f.type })));
}

function collectScalarFields(
  instance: BaseNode,
  spec: TopazManifestEntry
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const field of spec.fields) {
    if (field.uploadField || isAssetType(field.type)) continue;
    const raw = (instance as unknown as Record<string, unknown>)[field.name];
    const value = raw ?? field.default ?? defaultForType(field.type);
    fields[field.name] = castValue(value, field.type);
  }
  return fields;
}

function uploadFieldName(spec: TopazManifestEntry): string {
  const upload = spec.fields.find((f) => f.uploadField);
  return upload?.name ?? (spec.outputType === "video" ? "video" : "image");
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTopazNodeClass(spec: TopazManifestEntry): NodeClass {
  const nodeType = `topaz.${spec.moduleName}.${spec.className}`;
  const title = spec.title || classNameToTitle(spec.className);
  const isVideo = spec.outputType === "video";
  const assetField = uploadFieldName(spec);
  const specRef = spec;

  const TopazNodeClass = class extends BaseNode {
    async process(
      context?: Parameters<BaseNode["process"]>[0]
    ): Promise<Record<string, unknown>> {
      const apiKey = getApiKey(this._secrets);
      const fields = collectScalarFields(this, specRef);
      const asset = (this as unknown as Record<string, unknown>)[assetField];

      if (isVideo) {
        const sourceContainer = sourceContainerFromRef(asset);
        const videoBytes = await refToBytes(asset, context);
        const sourceMeta = await probeVideoMetadata(videoBytes, sourceContainer);
        const videoSpec: TopazVideoSpec = {
          submitEndpoint: specRef.submitEndpoint,
          acceptEndpoint: specRef.acceptEndpoint ?? "",
          completeEndpoint: specRef.completeEndpoint ?? "",
          statusEndpoint: specRef.statusEndpoint,
          pollInterval: specRef.pollInterval,
          maxAttempts: specRef.maxAttempts,
          videoKind: specRef.videoKind ?? "upscale"
        };
        const out = await topazExecuteVideoTask(
          apiKey,
          videoSpec,
          fields,
          videoBytes,
          sourceMeta
        );
        return {
          output: {
            type: "video",
            uri: "",
            data: Buffer.from(out).toString("base64")
          }
        };
      }

      const imageBytes = await refToBytes(asset, context);
      const imageSpec: TopazImageSpec = {
        submitEndpoint: specRef.submitEndpoint,
        statusEndpoint: specRef.statusEndpoint,
        downloadEndpoint: specRef.downloadEndpoint ?? "",
        pollInterval: specRef.pollInterval,
        maxAttempts: specRef.maxAttempts
      };
      const out = await topazExecuteImageTask(
        apiKey,
        imageSpec,
        fields,
        imageBytes
      );
      return { output: await topazImageRef(out) };
    }
  };

  Object.defineProperty(TopazNodeClass, "name", {
    value: spec.className,
    configurable: true
  });
  Object.defineProperty(TopazNodeClass, "nodeType", {
    value: nodeType,
    configurable: true
  });
  Object.defineProperty(TopazNodeClass, "title", {
    value: title,
    configurable: true
  });
  Object.defineProperty(TopazNodeClass, "description", {
    value: spec.description,
    configurable: true
  });
  Object.defineProperty(TopazNodeClass, "requiredSettings", {
    value: ["TOPAZ_API_KEY"],
    configurable: true
  });
  if (spec.requiredRuntimes?.length) {
    Object.defineProperty(TopazNodeClass, "requiredRuntimes", {
      value: spec.requiredRuntimes,
      configurable: true
    });
  }
  Object.defineProperty(TopazNodeClass, "autoSaveAsset", {
    value: true,
    configurable: true
  });
  Object.defineProperty(TopazNodeClass, "metadataOutputTypes", {
    value: { output: spec.outputType },
    configurable: true
  });

  const { inlineFields, inputFields } = computeFieldClassification(spec.fields);
  Object.defineProperty(TopazNodeClass, "inlineFields", {
    value: inlineFields,
    configurable: true
  });
  Object.defineProperty(TopazNodeClass, "inputFields", {
    value: inputFields,
    configurable: true
  });

  for (const field of spec.fields) {
    const propOptions: PropOptions = {
      type: field.type,
      default: field.default ?? defaultForType(field.type)
    };
    if (field.title) propOptions.title = field.title;
    if (field.description) propOptions.description = field.description;
    if (field.values?.length) propOptions.values = field.values;
    if (field.min !== undefined) propOptions.min = field.min;
    if (field.max !== undefined) propOptions.max = field.max;

    registerDeclaredProperty(TopazNodeClass, field.name, propOptions);
  }

  return TopazNodeClass as unknown as NodeClass;
}

export function loadTopazNodesFromManifest(
  manifest: TopazManifestEntry[]
): NodeClass[] {
  return manifest.map(createTopazNodeClass);
}
