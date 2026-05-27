/**
 * Dynamic AtlasCloud node-class factory.
 *
 * Generates node classes from `atlascloud-manifest.json` at runtime, mirroring
 * the topaz-nodes and kie-nodes factories. Each manifest entry declares a
 * model id, modality, output type, and the input fields exposed in the node
 * UI. The generated class extends `BaseNode`, so `BaseNode._injectSecrets`
 * resolves `ATLASCLOUD_API_KEY` from `context.getSecret(...)` and surfaces it
 * as `this._secrets.ATLASCLOUD_API_KEY` inside `process()`.
 */

import {
  BaseNode,
  classifyFields,
  classNameToTitle,
  registerDeclaredProperty
} from "@nodetool-ai/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool-ai/node-sdk";
import {
  atlasPoll,
  atlasSubmit,
  getApiKey,
  pickOutputUrl,
  type AtlasModality
} from "./atlascloud-base.js";

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

export type AtlasFieldType =
  | "str"
  | "int"
  | "float"
  | "bool"
  | "enum"
  | "image"
  | "video"
  | "audio"
  | "list[image]"
  | "list[video]"
  | "list[audio]";

export interface AtlasFieldDef {
  name: string;
  type: AtlasFieldType;
  default?: unknown;
  title?: string;
  description?: string;
  values?: Array<string | number>;
  min?: number;
  max?: number;
  required?: boolean;
  /**
   * When true, wraps a single-asset field's resolved value in a one-element
   * array. Used by AtlasCloud `*-edit` endpoints which expect `images: [url]`.
   */
  array?: boolean;
}

export interface AtlasManifestEntry {
  className: string;
  moduleName: string;
  modality: AtlasModality;
  modelId: string;
  outputType: "image" | "video";
  title: string;
  description: string;
  pollInterval: number;
  maxAttempts: number;
  fields: AtlasFieldDef[];
}

// ---------------------------------------------------------------------------
// Asset-ref handling
// ---------------------------------------------------------------------------

const ASSET_TYPES = new Set<AtlasFieldType>(["image", "video", "audio"]);
const LIST_ASSET_RE = /^list\[(image|video|audio)\]$/;

type AssetRef = {
  uri?: string;
  data?: string | Uint8Array;
  mime_type?: string;
  metadata?: { mime_type?: string };
};

type StorageLike = {
  retrieve: (uri: string) => Promise<Uint8Array | null> | Uint8Array | null;
};

type ProcessContext = Parameters<BaseNode["process"]>[0] & {
  storage?: StorageLike | null;
};

function looksLikePublicUrl(s: unknown): s is string {
  if (typeof s !== "string") return false;
  if (!/^https?:\/\//i.test(s)) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)/i.test(s))
    return false;
  return true;
}

function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function guessMime(ref: AssetRef | undefined, fallback: string): string {
  if (ref?.mime_type) return ref.mime_type;
  if (ref?.metadata?.mime_type) return ref.metadata.mime_type;
  const uri = ref?.uri ?? "";
  if (/\.jpe?g(?:[?#]|$)/i.test(uri)) return "image/jpeg";
  if (/\.png(?:[?#]|$)/i.test(uri)) return "image/png";
  if (/\.webp(?:[?#]|$)/i.test(uri)) return "image/webp";
  if (/\.mp4(?:[?#]|$)/i.test(uri)) return "video/mp4";
  if (/\.mov(?:[?#]|$)/i.test(uri)) return "video/quicktime";
  if (/\.wav(?:[?#]|$)/i.test(uri)) return "audio/wav";
  if (/\.mp3(?:[?#]|$)/i.test(uri)) return "audio/mpeg";
  return fallback;
}

function defaultMimeFor(fieldType: "image" | "video" | "audio"): string {
  if (fieldType === "video") return "video/mp4";
  if (fieldType === "audio") return "audio/wav";
  return "image/png";
}

/**
 * Resolve a NodeTool asset ref (ImageRef/VideoRef/AudioRef) to something the
 * AtlasCloud API accepts: either a public HTTPS URL or a `data:<mime>;base64,...`
 * URI. Returns null when the ref is empty/undefined.
 */
export async function resolveAssetForAtlas(
  ref: unknown,
  context: ProcessContext | undefined,
  fieldType: "image" | "video" | "audio"
): Promise<string | null> {
  if (!ref) return null;

  // Bare URL string the user pasted in.
  if (typeof ref === "string") {
    return looksLikePublicUrl(ref) ? ref : null;
  }

  if (typeof ref !== "object") return null;
  const r = ref as AssetRef;

  if (looksLikePublicUrl(r.uri)) return r.uri as string;

  if (typeof r.data === "string" && r.data.length > 0) {
    return `data:${guessMime(r, defaultMimeFor(fieldType))};base64,${r.data}`;
  }
  if (r.data instanceof Uint8Array && r.data.byteLength > 0) {
    return bytesToDataUri(r.data, guessMime(r, defaultMimeFor(fieldType)));
  }

  if (r.uri && context?.storage) {
    try {
      const bytes = await context.storage.retrieve(r.uri);
      if (bytes && bytes.byteLength > 0) {
        return bytesToDataUri(
          new Uint8Array(bytes),
          guessMime(r, defaultMimeFor(fieldType))
        );
      }
    } catch {
      /* fall through to direct fetch */
    }
  }

  if (r.uri && /^https?:\/\//i.test(r.uri)) {
    const res = await fetch(r.uri);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      return bytesToDataUri(bytes, guessMime(r, defaultMimeFor(fieldType)));
    }
  }

  throw new Error(
    `Cannot resolve ${fieldType} asset for AtlasCloud — no usable uri or inline data`
  );
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

/**
 * Coerce a UI-serialized value back to the type AtlasCloud's worker expects.
 * NodeTool serializes numeric dropdowns as strings; AtlasCloud rejects `"5"`
 * when it wants `5`. Coerce here so the user doesn't see opaque worker errors.
 */
function coerceScalar(v: unknown, type: AtlasFieldType): unknown {
  if (v === null || v === undefined) return v;
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

function defaultForType(type: AtlasFieldType): unknown {
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
    case "audio":
      return { type: "audio", uri: "", asset_id: null, data: null, metadata: null };
    case "list[image]":
    case "list[video]":
    case "list[audio]":
      return [];
    default:
      return "";
  }
}

function computeFieldClassification(fields: AtlasFieldDef[]) {
  return classifyFields(fields.map((f) => ({ name: f.name, propType: f.type })));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAtlasNodeClass(spec: AtlasManifestEntry): NodeClass {
  const nodeType = `atlascloud.${spec.moduleName}.${spec.className}`;
  const title = spec.title || classNameToTitle(spec.className);
  const specRef = spec;

  const AtlasNodeClass = class extends BaseNode {
    async process(
      context?: ProcessContext
    ): Promise<Record<string, unknown>> {
      const apiKey = getApiKey(this._secrets);
      const input: Record<string, unknown> = {};

      for (const f of specRef.fields) {
        const v = (this as unknown as Record<string, unknown>)[f.name];
        if (v === undefined || v === null) continue;

        if (ASSET_TYPES.has(f.type)) {
          const inner = f.type as "image" | "video" | "audio";
          const resolved = await resolveAssetForAtlas(v, context, inner);
          if (resolved !== null) {
            input[f.name] = f.array ? [resolved] : resolved;
          }
          continue;
        }

        const listMatch = LIST_ASSET_RE.exec(f.type);
        if (listMatch) {
          const inner = listMatch[1] as "image" | "video" | "audio";
          if (!Array.isArray(v)) continue;
          const resolved: string[] = [];
          for (const item of v) {
            const r = await resolveAssetForAtlas(item, context, inner);
            if (r !== null) resolved.push(r);
          }
          if (resolved.length > 0) input[f.name] = resolved;
          continue;
        }

        if (typeof v === "string" && v === "") continue;
        input[f.name] = coerceScalar(v, f.type);
      }

      const predictionId = await atlasSubmit(
        apiKey,
        specRef.modality,
        specRef.modelId,
        input
      );
      const result = await atlasPoll(apiKey, predictionId, {
        pollInterval: specRef.pollInterval ?? 3000,
        maxAttempts: specRef.maxAttempts ?? 600
      });
      const url = pickOutputUrl(result);

      const dl = await fetch(url);
      if (!dl.ok) {
        throw new Error(
          `AtlasCloud download failed: HTTP ${dl.status} fetching ${url}`
        );
      }
      const bytes = new Uint8Array(await dl.arrayBuffer());

      // Preferred path: hand bytes to NodeTool storage so the result becomes a
      // proper local asset. Falls back to base64 embed if storage is missing
      // or rejects the write — that mirrors the autoSaveAsset contract used
      // by topaz-nodes.
      const isVideo = specRef.outputType === "video";
      const ext = isVideo ? "mp4" : "png";
      const mime = isVideo ? "video/mp4" : "image/png";
      const filename = `atlascloud-${specRef.outputType}-${Date.now()}.${ext}`;

      const storage = context?.storage as
        | { store?: (k: string, b: Uint8Array, m?: string) => Promise<string> }
        | null
        | undefined;
      if (storage?.store) {
        try {
          const storageUri = await storage.store(filename, bytes, mime);
          return { output: { type: specRef.outputType, uri: storageUri } };
        } catch {
          /* fall through to base64 embed */
        }
      }

      return {
        output: {
          type: specRef.outputType,
          uri: "",
          data: Buffer.from(bytes).toString("base64")
        }
      };
    }
  };

  Object.defineProperty(AtlasNodeClass, "name", {
    value: spec.className,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "nodeType", {
    value: nodeType,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "title", {
    value: title,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "description", {
    value: spec.description,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "requiredSettings", {
    value: ["ATLASCLOUD_API_KEY"],
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "exposeAsTool", {
    value: true,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "autoSaveAsset", {
    value: true,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "metadataOutputTypes", {
    value: { output: spec.outputType },
    configurable: true
  });

  const { inlineFields, inputFields } = computeFieldClassification(spec.fields);
  Object.defineProperty(AtlasNodeClass, "inlineFields", {
    value: inlineFields,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "inputFields", {
    value: inputFields,
    configurable: true
  });

  for (const field of spec.fields) {
    // Preserve null defaults verbatim — the AtlasCloud manifests use `null`
    // to mean "field is optional with no preselected value" (e.g. aspect_ratio
    // on Nano Banana models). Coercing those to a type-default empty string
    // can fail enum-values validation, since "" isn't in the values list.
    const propDefault =
      field.default === null ? null : field.default ?? defaultForType(field.type);
    const propOptions: PropOptions = {
      type: field.type,
      default: propDefault
    };
    if (field.title) propOptions.title = field.title;
    if (field.description) propOptions.description = field.description;
    if (field.values?.length) propOptions.values = field.values;
    if (field.min !== undefined) propOptions.min = field.min;
    if (field.max !== undefined) propOptions.max = field.max;
    if (field.required) propOptions.required = true;

    registerDeclaredProperty(AtlasNodeClass, field.name, propOptions);
  }

  return AtlasNodeClass as unknown as NodeClass;
}

export function loadAtlasNodesFromManifest(
  manifest: AtlasManifestEntry[]
): NodeClass[] {
  return manifest.map(createAtlasNodeClass);
}
