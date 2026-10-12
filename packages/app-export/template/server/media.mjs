/**
 * Rewrites the media inside a run message into URLs the browser can load.
 *
 * A node emits a media ref in one of four shapes: inline bytes (`data`), a
 * `file://` URI inside this server's storage folder, an `asset://` reference
 * to a file the local store saved, or a URL some provider already hosts. The
 * first three mean nothing to a browser, so inline bytes are written to
 * storage and all three become `/api/storage/<key>`. Provider URLs and
 * `data:` URIs pass through unchanged.
 *
 * Run params go the other way: a file the browser uploaded arrives as
 * `/api/storage/<key>` and becomes the `file://` URI of the stored file.
 */
import { randomUUID } from "node:crypto";
import { join, normalize as normalizePath, sep } from "node:path";
import { pathToFileURL } from "node:url";

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "model_3d", "model3d"]);

const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "model/gltf-binary": "glb"
};

const DEFAULT_EXTENSIONS = {
  image: "png",
  audio: "mp3",
  video: "mp4",
  document: "bin",
  model_3d: "glb",
  model3d: "glb"
};

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Inline bytes as a Uint8Array, or null when `data` holds none. */
const bytesOf = (data) => {
  if (data instanceof Uint8Array) return data.length > 0 ? data : null;
  if (typeof data === "string" && data.length > 0) {
    // Raw base64 (never a data: URI) is the protocol's other inline form.
    return Buffer.from(data, "base64");
  }
  if (isRecord(data) && data.type === "Buffer" && Array.isArray(data.data)) {
    return Uint8Array.from(data.data);
  }
  return null;
};

export function createMediaNormalizer(storage, assetKey = () => null) {
  const storagePrefix = `${pathToFileURL(storage.rootDir).toString()}/`;

  const storageUrl = (key) =>
    `/api/storage/${key.split("/").map(encodeURIComponent).join("/")}`;

  async function normalizeRef(ref) {
    const next = { ...ref };
    const bytes = bytesOf(ref.data);
    if (bytes) {
      const contentType = ref.content_type ?? ref.mime_type ?? undefined;
      const ext = EXTENSIONS[contentType] ?? DEFAULT_EXTENSIONS[ref.type] ?? "bin";
      const key = `outputs/${randomUUID()}.${ext}`;
      await storage.store(key, bytes, contentType);
      next.uri = storageUrl(key);
      delete next.data;
    } else if (typeof ref.uri === "string" && ref.uri.startsWith(storagePrefix)) {
      next.uri = storageUrl(decodeURIComponent(ref.uri.slice(storagePrefix.length)));
    } else if (typeof ref.uri === "string" && ref.uri.startsWith("asset://")) {
      const key = assetKey(ref.uri);
      if (key) next.uri = storageUrl(key);
    } else if (!ref.uri && typeof ref.asset_id === "string") {
      const key = assetKey(`asset://${ref.asset_id}`);
      if (key) next.uri = storageUrl(key);
    }
    return next;
  }

  async function normalize(value, depth = 0) {
    if (depth > 32 || value == null) return value;
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => normalize(item, depth + 1)));
    }
    if (value instanceof Uint8Array) {
      return Buffer.from(value).toString("base64");
    }
    if (!isRecord(value)) return value;
    const record =
      typeof value.type === "string" && MEDIA_TYPES.has(value.type)
        ? await normalizeRef(value)
        : value;
    const out = {};
    for (const [key, entry] of Object.entries(record)) {
      out[key] = await normalize(entry, depth + 1);
    }
    return out;
  }

  return normalize;
}

/**
 * Turns the `/api/storage/<key>` URIs of uploaded files inside run params back
 * into `file://` URIs a node can read. A key that leaves the storage folder is
 * dropped rather than resolved.
 */
export function createInputResolver(storage) {
  const root = normalizePath(storage.rootDir);
  const PREFIX = "/api/storage/";

  const resolveUri = (uri) => {
    const key = uri.slice(PREFIX.length).split("/").map(decodeURIComponent).join("/");
    const path = normalizePath(join(root, key));
    return path.startsWith(root + sep) ? pathToFileURL(path).toString() : "";
  };

  function resolve(value, depth = 0) {
    if (depth > 32 || value == null) return value;
    if (Array.isArray(value)) return value.map((item) => resolve(item, depth + 1));
    if (!isRecord(value)) return value;
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] =
        key === "uri" && typeof entry === "string" && entry.startsWith(PREFIX)
          ? resolveUri(entry)
          : resolve(entry, depth + 1);
    }
    return out;
  }

  return resolve;
}
