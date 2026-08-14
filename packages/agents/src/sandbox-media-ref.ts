/**
 * The `media.*` sandbox bridge: media refs in, media refs out.
 *
 * A `nodetool.code.Code` node receives a document/image/audio/video input as a
 * bare ref object — `{type, uri, asset_id, data, metadata}` — whose `uri` may be
 * `asset://<id>`, `/api/storage/<key>`, a signed https URL, `package://…`, a
 * `data:` URI, or a plain file path. Host nodes resolve all of those through
 * `loadMediaRefBytes`; the guest had no equivalent and could only look at the
 * object. These bridges give it the same resolver, and the reverse direction:
 * bytes the body computed become a ref the node can emit as an output.
 *
 * Both directions are capped (see {@link MAX_MEDIA_REF_BYTES}) and both need a
 * `ProcessingContext`, the way `workspace.*` does.
 */

import { importNodeBuiltin } from "@nodetool-ai/config";
import { loadMediaRefBytes, type MediaRefValue } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { toGuestBytes } from "./sandbox-bytes.js";

/**
 * Largest payload `media.*` moves in either direction.
 *
 * Host → guest, bytes cross as base64 and are then rebuilt as a `Uint8Array`,
 * so the guest briefly holds ~2.3× the payload. At 16 MB that is ~37 MB against
 * the 64 MB default guest heap, which leaves room for the program itself; the
 * 25 MB `image.*` ceiling would not. Guest → host the same number bounds what
 * one run can push into storage.
 */
export const MAX_MEDIA_REF_BYTES = 16 * 1024 * 1024;

/**
 * Largest payload a builder inlines as a `data:` URI.
 *
 * A data URI rides inside every graph message that carries the ref, gets
 * MsgPack'd on the wire, and is copied by every downstream node — a
 * multi-megabyte video there is a real cost. So a builder writes to storage
 * whenever the context has it, and only falls back to a data URI for a small
 * payload in a storage-less context. Past this size with no storage, the call
 * fails instead of inlining.
 */
export const MAX_DATA_URI_BYTES = 4 * 1024 * 1024;

/** The media kinds a ref builder can produce. */
export type MediaRefKind = "document" | "image" | "audio" | "video";

/** What `media.info` answers. */
export interface MediaRefInfo {
  type: string;
  mimeType: string;
  uri: string;
  size: number;
}

/** The host side of the guest's `media` namespace. */
export interface MediaRefBridge {
  bytes(ref: unknown): Promise<unknown>;
  text(ref: unknown, options?: unknown): Promise<string>;
  info(ref: unknown): Promise<MediaRefInfo>;
  toDocument(
    bytes: unknown,
    options?: unknown
  ): Promise<Record<string, unknown>>;
  toImage(bytes: unknown, options?: unknown): Promise<Record<string, unknown>>;
  toAudio(bytes: unknown, options?: unknown): Promise<Record<string, unknown>>;
  toVideo(bytes: unknown, options?: unknown): Promise<Record<string, unknown>>;
}

export const DEFAULT_MIME: Record<MediaRefKind, string> = {
  document: "application/octet-stream",
  image: "image/png",
  audio: "audio/mpeg",
  video: "video/mp4"
};

const MIME_TO_EXT: Record<string, string> = {
  "application/json": "json",
  "application/octet-stream": "bin",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "text/csv": "csv",
  "text/html": "html",
  "text/markdown": "md",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm"
};

const EXT_TO_MIME: Record<string, string> = Object.entries(MIME_TO_EXT).reduce<
  Record<string, string>
>((acc, [mime, ext]) => {
  if (!(ext in acc)) acc[ext] = mime;
  return acc;
}, {});

function extForMime(mime: string): string {
  return MIME_TO_EXT[mime.toLowerCase()] ?? "bin";
}

function mimeForPath(path: string): string | undefined {
  const match = /\.([A-Za-z0-9]+)(?:[?#].*)?$/.exec(path);
  return match ? EXT_TO_MIME[match[1].toLowerCase()] : undefined;
}

function mimeFromDataUri(uri: string): string | undefined {
  const match = /^data:([^;,]+)[;,]/.exec(uri);
  return match ? match[1] : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(
  options: Record<string, unknown>,
  key: string,
  where: string
): string | undefined {
  const value = options[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${where}: ${key} must be a string`);
  }
  return value;
}

/**
 * Locator fields on a generation result, in the order a chat action may read.
 * `uri` is last: a generation also carries a host filesystem path there, and
 * the guest must not follow it.
 */
export const MEDIA_LOCATOR_KEYS = [
  "asset_uri",
  "asset_id",
  "url",
  "uri"
] as const;

/**
 * The one string `read_media_bytes` / `image.*` should load for a value.
 * Accepts a generation result, its `asset_uri`, a bare asset id, or a URI.
 *
 * A remapped ref keeps both `uri` (the preferred locator) and `asset_id`.
 * Prefer a non-filesystem URI so a bare id does not win over `asset://…`.
 */
export function mediaLocatorFrom(value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const values: string[] = [];
    for (const key of MEDIA_LOCATOR_KEYS) {
      const locator = record[key];
      if (typeof locator === "string" && locator.trim() !== "") {
        values.push(locator.trim());
      }
    }
    const safeUri = values.find(
      (candidate) =>
        (candidate.includes("://") || candidate.startsWith("/api/")) &&
        filesystemPathForUri(candidate) === null
    );
    if (safeUri) return safeUri;
    if (typeof record.asset_id === "string" && record.asset_id.trim() !== "") {
      return record.asset_id.trim();
    }
    if (values[0]) return values[0];
  }
  throw new Error(
    "pass what a generation returned (its asset_uri), an asset id, " +
      "a /api/storage/ key, or a data:/http(s) URL"
  );
}

/** A string that names media, not an option like `"png"` or `"cover"`. */
export function isMediaLocatorString(value: string): boolean {
  const locator = value.trim();
  return locator.includes("://") || locator.startsWith("/api/");
}

/** Whether `image.*` should treat the value as a media ref, not as nested data. */
export function looksLikeMediaRef(value: unknown): boolean {
  if (typeof value === "string") {
    return isMediaLocatorString(value);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.uri === "string" ||
    typeof record.asset_id === "string" ||
    typeof record.asset_uri === "string" ||
    record.data !== undefined
  );
}

/**
 * Flatten a generation result (or a bare locator) to the ref `loadMediaRefBytes`
 * understands. Prefers `asset_uri` so a host `file://` on the same object is
 * never the path that is read.
 */
export function remapMediaRef(value: unknown): MediaRefValue {
  if (typeof value === "string") {
    const locator = value.trim();
    return locator.includes("://") || locator.startsWith("/api/")
      ? { uri: locator }
      : { uri: locator, asset_id: locator };
  }
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  let locator: string | undefined;
  try {
    locator = mediaLocatorFrom(value);
  } catch {
    locator = undefined;
  }
  return {
    type: typeof record.type === "string" ? record.type : undefined,
    uri: locator,
    asset_id: typeof record.asset_id === "string" ? record.asset_id : undefined,
    data: record.data
  };
}

/** The ref argument, checked. A guest can pass anything, including `undefined`. */
function requireRef(where: string, ref: unknown): MediaRefValue {
  if (ref === null || typeof ref !== "object" || Array.isArray(ref)) {
    throw new Error(
      `${where}: expected a media ref object ({type, uri, asset_id, data})`
    );
  }
  return ref as MediaRefValue;
}

/** How the ref reads in an error message, so the failure names what failed. */
function describeRef(ref: MediaRefValue): string {
  if (typeof ref.uri === "string" && ref.uri.length > 0) {
    return ref.uri.length > 200 ? `${ref.uri.slice(0, 200)}…` : ref.uri;
  }
  if (typeof ref.asset_id === "string" && ref.asset_id.length > 0) {
    return `asset ${ref.asset_id}`;
  }
  return `a ${ref.type ?? "media"} ref with no uri, asset_id, or data`;
}

/** URI prefixes that name something other than a file on this host. */
const NON_FILESYSTEM_PREFIXES = ["data:", "asset://", "package://", "/api/"];

/**
 * The filesystem path a ref's `uri` names, or `null` when it names something
 * else (a data URI, an asset, a storage key, an http URL).
 *
 * Every form that reaches disk goes through here — `file://`, an absolute
 * path, a `~`-prefixed path, and a bare relative path — so the caller has one
 * place to apply containment. `loadMediaRefBytes` reads the first two itself
 * with no check at all, which is why a filesystem-shaped uri never reaches it.
 */
export function filesystemPathForUri(uri: unknown): string | null {
  if (typeof uri !== "string" || uri === "") return null;
  const lower = uri.toLowerCase();
  if (NON_FILESYSTEM_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return null;
  }
  if (lower.startsWith("file://")) {
    // Strip the scheme rather than calling fileURLToPath: this feeds a
    // resolver, not an fs call, and a malformed URL should be refused by
    // containment rather than throw a different error here.
    const path = uri.slice("file://".length);
    return path === "" ? null : decodeURIComponent(path);
  }
  // Any other scheme (http, https, memory, s3, …) is not a path.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) return null;
  return uri;
}

/**
 * Read a path the run is allowed to read.
 *
 * `resolvePath` is the sandbox's own `resolveGuestPath`, so this honors the
 * run's `filesystemAccess` scope: workspace mode resolves under the workspace
 * root and refuses an escape, host mode expands `~` and reads anywhere. A run
 * built without a resolver reads no files at all — failing closed matters more
 * than serving a caller that never passed one.
 */
async function readContainedPath(
  where: string,
  path: string,
  resolvePath?: (path: string) => Promise<string>
): Promise<Uint8Array | null> {
  if (!resolvePath) {
    throw new Error(
      `${where}: reading a filesystem path is not available in this run`
    );
  }
  const fullPath = await resolvePath(path);
  const fs =
    await importNodeBuiltin<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
  if (!fs) return null;
  try {
    return new Uint8Array(await fs.readFile(fullPath));
  } catch {
    return null;
  }
}

/**
 * Read the bytes a media ref names, with this run's containment applied.
 *
 * Exported because media transforms accept refs anywhere they accept bytes.
 * The guest passes a generator's `asset://…` result straight into the next
 * operation, and the bytes stay on the host. `maxBytes` remains 16 MB for
 * `media.*`, whose bytes enter the guest, while handle-based transforms use
 * the larger per-run media budget.
 */
export async function resolveRefBytes(
  where: string,
  ref: MediaRefValue,
  context: ProcessingContext,
  resolvePath?: (path: string) => Promise<string>,
  maxBytes: number = MAX_MEDIA_REF_BYTES
): Promise<Uint8Array> {
  // A filesystem-shaped uri is withheld from `loadMediaRefBytes`, whose own
  // absolute and `file://` branches read any path this process can reach. The
  // ref's inline data, asset id and storage key still resolve there; only the
  // path is ours to contain.
  const path = filesystemPathForUri(ref.uri);
  const safeRef = path === null ? ref : { ...ref, uri: undefined };
  const resolved =
    (await loadMediaRefBytes(safeRef, context)) ??
    (path === null ? null : await readContainedPath(where, path, resolvePath));
  if (!resolved) {
    throw new Error(`${where}: could not read ${describeRef(ref)}`);
  }
  if (resolved.length > maxBytes) {
    throw new Error(
      `${where}: ${describeRef(ref)} is ${resolved.length} bytes, over the ${maxBytes} byte limit`
    );
  }
  return resolved;
}

/** The ref's mime type, from the ref itself, its data URI header, or its path. */
export function mimeForRef(ref: MediaRefValue, fallback: string): string {
  const declared = (ref as { mimeType?: unknown }).mimeType;
  if (typeof declared === "string" && declared.length > 0) return declared;
  const uri = typeof ref.uri === "string" ? ref.uri : "";
  if (uri.startsWith("data:")) {
    return mimeFromDataUri(uri) ?? fallback;
  }
  return mimeForPath(uri) ?? fallback;
}

/** The bytes argument of an output builder, checked against the ceiling. */
function requireOutputBytes(where: string, value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Error(
      `${where}: bytes must be a Uint8Array (e.g. from media.bytes or workspace.readBytes)`
    );
  }
  if (value.length === 0) {
    throw new Error(`${where}: bytes is empty`);
  }
  if (value.length > MAX_MEDIA_REF_BYTES) {
    throw new Error(
      `${where}: ${value.length} bytes is over the ${MAX_MEDIA_REF_BYTES} byte limit`
    );
  }
  return value;
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  const chunks: string[] = [];
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(chunks.join(""));
}

/**
 * Turn bytes into a portable locator.
 *
 * `createAsset` wins: the ref is `asset://<id>` plus `asset_id`, which any
 * host can resolve. Otherwise the bytes go to storage under a sandbox key
 * and the locator is `/api/storage/<key>` — never the `file://` path
 * `store()` returns on the local adapter. Without storage a small payload
 * becomes a `data:` URI and a large one is refused.
 */
async function storeOrInline(
  where: string,
  bytes: Uint8Array,
  mimeType: string,
  filename: string | undefined,
  context: ProcessingContext
): Promise<{ uri: string; asset_id: string | null }> {
  if (context.hasModelInterface?.("createAsset")) {
    const ext = extForMime(mimeType);
    const name = filename ?? `sandbox-${crypto.randomUUID()}.${ext}`;
    const created = (await context.createAsset({
      name,
      contentType: mimeType,
      content: bytes
    })) as { id?: unknown };
    if (typeof created?.id === "string" && created.id.length > 0) {
      return { uri: `asset://${created.id}`, asset_id: created.id };
    }
  }
  if (context.storage) {
    const key = `sandbox/${crypto.randomUUID()}.${extForMime(mimeType)}`;
    await context.storage.store(key, bytes, mimeType);
    return { uri: `/api/storage/${key}`, asset_id: null };
  }
  if (bytes.length > MAX_DATA_URI_BYTES) {
    throw new Error(
      `${where}: ${bytes.length} bytes needs storage, which this run has none of; a data URI is capped at ${MAX_DATA_URI_BYTES} bytes`
    );
  }
  return {
    uri: `data:${mimeType};base64,${encodeBase64(bytes)}`,
    asset_id: null
  };
}

async function buildRef(
  kind: MediaRefKind,
  where: string,
  rawBytes: unknown,
  rawOptions: unknown,
  context: ProcessingContext
): Promise<Record<string, unknown>> {
  const bytes = requireOutputBytes(where, rawBytes);
  const options = asRecord(rawOptions);
  const filename = optionalString(options, "filename", where);
  const mimeType =
    optionalString(options, "mimeType", where) ??
    (filename ? mimeForPath(filename) : undefined) ??
    DEFAULT_MIME[kind];
  const { uri, asset_id } = await storeOrInline(
    where,
    bytes,
    mimeType,
    filename,
    context
  );
  const ref: Record<string, unknown> = { type: kind, uri, asset_id };
  if (kind !== "document") {
    ref.mimeType = mimeType;
  }
  if (filename) {
    ref.metadata = { filename };
  }
  return ref;
}

function withoutContext(member: string): never {
  throw new Error(`media.${member} is not available without a context`);
}

/** What a host supplies alongside the context when it builds the bridge. */
export interface MediaRefBridgeOptions {
  /**
   * Resolve a guest-supplied filesystem path to the one path this run may
   * read, or throw. The sandbox passes its own `resolveGuestPath`, so
   * `media.*` and `workspace.*` are contained by one rule rather than two.
   */
  resolvePath?: (path: string) => Promise<string>;
}

/**
 * Build the guest's `media` namespace. Every member is async, and every one
 * fails with a named error when the run has no `ProcessingContext` — the same
 * contract `workspace.*` follows, so nothing half-works.
 */
export function createMediaRefBridge(
  context?: ProcessingContext,
  options: MediaRefBridgeOptions = {}
): MediaRefBridge {
  if (!context) {
    return {
      bytes: async () => withoutContext("bytes"),
      text: async () => withoutContext("text"),
      info: async () => withoutContext("info"),
      toDocument: async () => withoutContext("toDocument"),
      toImage: async () => withoutContext("toImage"),
      toAudio: async () => withoutContext("toAudio"),
      toVideo: async () => withoutContext("toVideo")
    };
  }

  return {
    bytes: async (ref: unknown): Promise<unknown> => {
      const where = "media.bytes";
      return toGuestBytes(
        await resolveRefBytes(
          where,
          requireRef(where, ref),
          context,
          options.resolvePath
        )
      );
    },

    text: async (ref: unknown, opts?: unknown): Promise<string> => {
      const where = "media.text";
      const bytes = await resolveRefBytes(
        where,
        requireRef(where, ref),
        context,
        options.resolvePath
      );
      const encoding =
        optionalString(asRecord(opts), "encoding", where) ?? "utf-8";
      try {
        return new TextDecoder(encoding).decode(bytes);
      } catch {
        throw new Error(`${where}: unsupported encoding "${encoding}"`);
      }
    },

    info: async (ref: unknown): Promise<MediaRefInfo> => {
      const where = "media.info";
      const value = requireRef(where, ref);
      const bytes = await resolveRefBytes(
        where,
        value,
        context,
        options.resolvePath
      );
      const kind = typeof value.type === "string" ? value.type : "document";
      const fallback =
        DEFAULT_MIME[kind as MediaRefKind] ?? DEFAULT_MIME.document;
      return {
        type: kind,
        mimeType: mimeForRef(value, fallback),
        uri: typeof value.uri === "string" ? value.uri : "",
        size: bytes.length
      };
    },

    toDocument: (bytes: unknown, options?: unknown) =>
      buildRef("document", "media.toDocument", bytes, options, context),
    toImage: (bytes: unknown, options?: unknown) =>
      buildRef("image", "media.toImage", bytes, options, context),
    toAudio: (bytes: unknown, options?: unknown) =>
      buildRef("audio", "media.toAudio", bytes, options, context),
    toVideo: (bytes: unknown, options?: unknown) =>
      buildRef("video", "media.toVideo", bytes, options, context)
  };
}

/** Member names, in the order the guest prelude re-wraps them. */
export const MEDIA_REF_MEMBERS = [
  "bytes",
  "text",
  "info",
  "toDocument",
  "toImage",
  "toAudio",
  "toVideo"
] as const;
