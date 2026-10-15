import path from "node:path";

import { fetchExternalMedia, loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { resolveModelBytes } from "@nodetool-ai/nodes-utils";

import type {
  JsonResourceRef,
  JsonResources,
  Model3DRefLike
} from "./types.js";
import {
  isNonEmptyString,
  isObjectLike
} from "@nodetool-ai/node-sdk";

export function toBytes(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return Uint8Array.from(Buffer.from(data, "base64"));
}

export function modelBytes(model: unknown): Uint8Array {
  if (!isObjectLike(model)) return new Uint8Array();
  return toBytes((model as Model3DRefLike).data);
}

export async function modelRefToBytes(
  model: unknown,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (!isObjectLike(model)) return new Uint8Array();
  return resolveModelBytes(model as Model3DRefLike, context);
}

/**
 * Resolve an image-ref-shaped value (`{uri, data, asset_id, ...}`) to raw
 * image bytes through the shared media-ref resolver: inline `data`, a
 * `data:` URI, an `asset://` URI or bare `asset_id`, a storage URI, a
 * `file://` URI, or an http(s) URL.
 *
 * Throws when nothing resolvable is present so the caller can surface a
 * clear "missing image" error rather than silently sending zero bytes.
 */
export async function imageRefToBytes(
  ref: unknown,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (!isObjectLike(ref)) {
    throw new Error("Image input is empty");
  }
  const obj = ref as {
    data?: unknown;
    uri?: string;
    asset_id?: string | null;
  };
  const uri = obj.uri ?? "";
  if (
    !uri &&
    !obj.asset_id &&
    !(obj.data instanceof Uint8Array && obj.data.length > 0) &&
    !isNonEmptyString(obj.data)
  ) {
    throw new Error("Image input has no data or uri");
  }

  const bytes = await loadMediaRefBytes(
    { data: obj.data, uri, asset_id: obj.asset_id, type: "image" },
    context,
    {
      fetchHttp: async (url) => {
        // Same policy as every other caller-supplied media uri.
        const res = await fetchExternalMedia(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch image (${res.status}): ${url}`);
        }
        return new Uint8Array(await res.arrayBuffer());
      }
    }
  );
  if (bytes && bytes.length > 0) return bytes;
  throw new Error(
    `Unable to resolve image uri: ${uri || `asset://${obj.asset_id ?? ""}`}`
  );
}

export function modelRef(
  data: Uint8Array,
  extras: Record<string, unknown> = {}
) {
  return {
    ...extras,
    type: "model_3d",
    asset_id: null,
    metadata: null,
    data: Buffer.from(data).toString("base64")
  };
}

export function filePath(uriOrPath: string): string {
  if (uriOrPath.startsWith("file://")) return uriOrPath.slice("file://".length);
  return uriOrPath;
}

export function dateName(name: string): string {
  const now = new Date();
  const pad = (v: number): string => String(v).padStart(2, "0");
  return name
    .replaceAll("%Y", String(now.getFullYear()))
    .replaceAll("%m", pad(now.getMonth() + 1))
    .replaceAll("%d", pad(now.getDate()))
    .replaceAll("%H", pad(now.getHours()))
    .replaceAll("%M", pad(now.getMinutes()))
    .replaceAll("%S", pad(now.getSeconds()));
}

export function extFormat(filename: string): string {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  return ext || "glb";
}

export function pad4(length: number): number {
  return (4 - (length % 4)) % 4;
}

export function replaceExtension(uriOrPath: string, format: string): string {
  if (!uriOrPath) return "";
  const isFileUri = uriOrPath.startsWith("file://");
  const rawPath = isFileUri ? filePath(uriOrPath) : uriOrPath;
  const ext = path.extname(rawPath);
  const nextPath = ext
    ? `${rawPath.slice(0, -ext.length)}.${format}`
    : `${rawPath}.${format}`;
  return isFileUri ? `file://${nextPath}` : nextPath;
}

export function modelFormat(model: Model3DRefLike): string {
  const explicit = String(model.format ?? "").toLowerCase();
  if (explicit) return explicit;
  const uri = model.uri ?? "";
  return uri ? extFormat(uri) : "glb";
}

export function mimeTypeForResource(uri: string): string {
  const ext = path.extname(uri).replace(".", "").toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "ktx2":
      return "image/ktx2";
    case "bin":
    default:
      return "application/octet-stream";
  }
}

export function bytesToDataUri(bytes: Uint8Array, uri: string): string {
  const mimeType = mimeTypeForResource(uri);
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function embedJsonResourceUris(
  refs: JsonResourceRef[] | undefined,
  resources: JsonResources
): void {
  for (const ref of refs ?? []) {
    if (!ref.uri) continue;
    const resource = resources[ref.uri];
    if (!resource) continue;
    ref.uri = bytesToDataUri(resource, ref.uri);
  }
}

export function passthroughModel(model: Model3DRefLike) {
  const bytes = modelBytes(model);
  return {
    output: modelRef(bytes, {
      uri: model.uri ?? "",
      format: model.format ?? "glb"
    })
  };
}
