import { isPackageAssetUri, isRawRgbaImage } from "@nodetool-ai/protocol";
import { importNodeBuiltin } from "@nodetool-ai/config";
import type { ProcessingContext } from "./context.js";
import { encodeRawRgbaToPng } from "./image-codec.js";

const _nodeFsP = await importNodeBuiltin<typeof import("node:fs/promises")>(
  "node:fs/promises"
);
const _nodeUrl = await importNodeBuiltin<typeof import("node:url")>("node:url");
// These guards only fire in a non-Node runtime (browser/edge), which the test
// environment never is — so their fallback branches and messages are
// unreachable here and their mutants equivalent.
// Stryker disable all
const readFile = (
  ...args: Parameters<typeof import("node:fs/promises").readFile>
): Promise<Buffer> =>
  _nodeFsP
    ? (_nodeFsP.readFile(...args) as Promise<Buffer>)
    : Promise.reject(new Error("node:fs/promises.readFile requires Node"));
const fileURLToPath = (u: string | URL): string => {
  if (!_nodeUrl) throw new Error("node:url.fileURLToPath requires Node");
  return _nodeUrl.fileURLToPath(u);
};
// Stryker restore all

/** Minimal media ref shape for byte resolution (Python bridge + TS nodes). */
export type MediaRefValue = {
  uri?: string;
  type?: string;
  asset_id?: string | null;
  data?: unknown;
  width?: number;
  height?: number;
};

const ASSET_ID_EXTENSION_CANDIDATES: Record<string, string[]> = {
  image: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"],
  audio: ["wav", "mp3", "ogg", "m4a", "aac", "flac"],
  video: ["mp4", "webm", "mov", "avi", "mpeg", "mkv"],
  model3d: ["glb", "gltf", "obj", "fbx"]
};

export function isAbsoluteFilePath(uri: string): boolean {
  return (
    /^[A-Za-z]:[\\/]/.test(uri) || uri.startsWith("\\\\") || uri.startsWith("/")
  );
}

async function tryReadFile(path: string): Promise<Uint8Array | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

async function readUriBytes(uri: string): Promise<Uint8Array | null> {
  if (uri.startsWith("data:")) {
    const parts = uri.split(",", 2);
    if (parts.length !== 2) {
      return null;
    }
    const [header, data] = parts;
    const bytes = header.includes(";base64")
      ? Buffer.from(data, "base64")
      : // Stryker disable next-line StringLiteral: Node decodes "" as utf-8, so "utf-8" vs "" is byte-identical.
        Buffer.from(decodeURIComponent(data), "utf-8");
    return new Uint8Array(bytes);
  }

  if (uri.startsWith("file://")) {
    return tryReadFile(fileURLToPath(uri));
  }

  // Stryker disable next-line ConditionalExpression: forcing this true only makes tryReadFile attempt a non-absolute path, which ENOENTs to null — same as skipping.
  if (isAbsoluteFilePath(uri)) {
    return tryReadFile(uri);
  }

  return null;
}

/**
 * Resolve bytes for an image/audio/video/model ref.
 * Shared by the Python bridge and TS nodes (e.g. Save Image).
 */
export async function loadMediaRefBytes(
  value: MediaRefValue,
  context?: ProcessingContext
): Promise<Uint8Array | null> {
  if (isRawRgbaImage(value)) {
    return encodeRawRgbaToPng(value.data, value.width, value.height);
  }

  const data = value.data;
  if (typeof data === "string" && data.length > 0) {
    // base64 never contains a comma, so for a bare payload `indexOf(",")` is
    // always -1 and the slice is a no-op; the prefix/`>= 0` guards therefore
    // only matter for an actual `data:...,` URI, which the data: tests pin.
    // Stryker disable ConditionalExpression,EqualityOperator,StringLiteral
    const comma = data.startsWith("data:") ? data.indexOf(",") : -1;
    const b64 = comma >= 0 ? data.slice(comma + 1) : data;
    // Stryker restore ConditionalExpression,EqualityOperator,StringLiteral
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  if (data instanceof Uint8Array && data.length > 0) {
    return data;
  }

  const uri = value.uri;
  if (!uri) {
    return null;
  }

  if ((uri.startsWith("asset://") || isPackageAssetUri(uri)) && context) {
    const { bytes } = await context.resolveAssetBytes(uri);
    if (bytes) {
      return bytes;
    }
  }

  if (context?.storage) {
    const candidates = new Set<string>();
    candidates.add(uri);

    if (value.asset_id) {
      // Stryker disable next-line StringLiteral: an undefined type and any other unknown string both miss ASSET_ID_EXTENSION_CANDIDATES and fall to ["bin"].
      const refType = (value.type ?? "").toLowerCase();
      const extensions = ASSET_ID_EXTENSION_CANDIDATES[refType] ?? ["bin"];
      for (const extension of extensions) {
        candidates.add(`/api/storage/${value.asset_id}.${extension}`);
      }
    }

    for (const candidate of candidates) {
      const stored = await context.storage.retrieve(candidate);
      if (stored !== null) {
        return stored;
      }
    }
  }

  const fromUri = await readUriBytes(uri);
  if (fromUri !== null) {
    return fromUri;
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    try {
      const response = await fetch(uri);
      if (response.ok) {
        return new Uint8Array(await response.arrayBuffer());
      }
    } catch {
      // fall through
    }
  }

  return null;
}
