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
  toDocument(bytes: unknown, options?: unknown): Promise<Record<string, unknown>>;
  toImage(bytes: unknown, options?: unknown): Promise<Record<string, unknown>>;
  toAudio(bytes: unknown, options?: unknown): Promise<Record<string, unknown>>;
  toVideo(bytes: unknown, options?: unknown): Promise<Record<string, unknown>>;
}

const DEFAULT_MIME: Record<MediaRefKind, string> = {
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

/**
 * The filesystem fallback `resolveDocumentBytes` has: `loadMediaRefBytes`
 * deliberately reads only absolute and `file://` paths, so a relative or
 * `~`-prefixed path — what the `lib.os` nodes and a hand-written workflow
 * produce — resolves to nothing without this.
 */
async function readFallbackPath(uri: string): Promise<Uint8Array | null> {
  if (!uri || /^[a-z][a-z0-9+.-]*:\/\//i.test(uri) || uri.startsWith("data:")) {
    return null;
  }
  const fs =
    await importNodeBuiltin<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
  const os = await importNodeBuiltin<typeof import("node:os")>("node:os");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!fs || !os || !path) return null;
  const expanded =
    uri === "~"
      ? os.homedir()
      : uri.startsWith("~/")
        ? path.join(os.homedir(), uri.slice(2))
        : uri;
  try {
    return new Uint8Array(await fs.readFile(expanded));
  } catch {
    return null;
  }
}

async function resolveRefBytes(
  where: string,
  ref: MediaRefValue,
  context: ProcessingContext
): Promise<Uint8Array> {
  const resolved =
    (await loadMediaRefBytes(ref, context)) ??
    (typeof ref.uri === "string" ? await readFallbackPath(ref.uri) : null);
  if (!resolved) {
    throw new Error(`${where}: could not read ${describeRef(ref)}`);
  }
  if (resolved.length > MAX_MEDIA_REF_BYTES) {
    throw new Error(
      `${where}: ${describeRef(ref)} is ${resolved.length} bytes, over the ${MAX_MEDIA_REF_BYTES} byte limit`
    );
  }
  return resolved;
}

/** The ref's mime type, from the ref itself, its data URI header, or its path. */
function mimeForRef(ref: MediaRefValue, fallback: string): string {
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
 * Turn bytes into the ref's `uri`.
 *
 * Storage wins whenever the context has it: the ref then carries a short
 * `/api/storage/<key>` URI that `loadMediaRefBytes` reads back, and the bytes
 * stay out of every graph message. Without storage a small payload becomes a
 * `data:` URI and a large one is refused.
 */
async function storeOrInline(
  where: string,
  bytes: Uint8Array,
  mimeType: string,
  context: ProcessingContext
): Promise<string> {
  if (context.storage) {
    const key = `sandbox/${crypto.randomUUID()}.${extForMime(mimeType)}`;
    return context.storage.store(key, bytes, mimeType);
  }
  if (bytes.length > MAX_DATA_URI_BYTES) {
    throw new Error(
      `${where}: ${bytes.length} bytes needs storage, which this run has none of; a data URI is capped at ${MAX_DATA_URI_BYTES} bytes`
    );
  }
  return `data:${mimeType};base64,${encodeBase64(bytes)}`;
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
  const uri = await storeOrInline(where, bytes, mimeType, context);
  const ref: Record<string, unknown> = { type: kind, uri, asset_id: null };
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

/**
 * Build the guest's `media` namespace. Every member is async, and every one
 * fails with a named error when the run has no `ProcessingContext` — the same
 * contract `workspace.*` follows, so nothing half-works.
 */
export function createMediaRefBridge(
  context?: ProcessingContext
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
        await resolveRefBytes(where, requireRef(where, ref), context)
      );
    },

    text: async (ref: unknown, options?: unknown): Promise<string> => {
      const where = "media.text";
      const bytes = await resolveRefBytes(
        where,
        requireRef(where, ref),
        context
      );
      const encoding =
        optionalString(asRecord(options), "encoding", where) ?? "utf-8";
      try {
        return new TextDecoder(encoding).decode(bytes);
      } catch {
        throw new Error(`${where}: unsupported encoding "${encoding}"`);
      }
    },

    info: async (ref: unknown): Promise<MediaRefInfo> => {
      const where = "media.info";
      const value = requireRef(where, ref);
      const bytes = await resolveRefBytes(where, value, context);
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
