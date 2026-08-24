/**
 * JSON reporting for a finished run.
 *
 * A run that reaches here has already executed and been paid for, so reporting
 * must not be able to fail it. Two things sit between a run result and a JSON
 * string. GPU image nodes emit raw-RGBA bytes as their in-flight format so
 * chained shader ops skip the codec, and every boundary that hands out a
 * portable image encodes them first (`packages/runtime/src/image-codec.ts`) —
 * this is that boundary for the CLI. And three 1024² frames in one
 * `JSON.stringify(…, null, 2)` exceed what a single JS string can hold.
 *
 * So binary payloads at or over `maxInlineBytes` are written next to the run
 * and replaced by a `$file` pointer, and a stringify that still overflows
 * degrades to a summary instead of throwing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isRawRgbaImage } from "@nodetool-ai/protocol";
import { encodeRawImageRef } from "@nodetool-ai/runtime";
import {
  isFunctionValue,
  isObjectLike,
  isRecord,
  isString
} from "./predicates.js";

/**
 * Above this many bytes a payload is written to disk. A byte array in JSON is
 * one number per byte, so even a modest buffer costs megabytes of text and is
 * unusable to whatever reads it.
 */
const DEFAULT_MAX_INLINE_BYTES = 64 * 1024;

export interface RunJsonOptions {
  /**
   * Where oversized payloads are written, created on the first spill. Callers
   * with a run id should scope this per run so a later run does not overwrite
   * files the printed JSON still points at.
   */
  outputDir?: string;
  /** Binary payloads of at least this many bytes go to disk instead. */
  maxInlineBytes?: number;
}

/** What replaces a binary payload that was written to disk. */
interface BinaryPointer {
  $file: string;
  bytes: number;
  mimeType?: string;
}

interface Spill {
  dir: string;
  limit: number;
  files: string[];
}

/** The file extension for `mimeType`, or `bin` when it names nothing usable. */
function extensionFor(mimeType: string | undefined): string {
  const subtype = mimeType?.split("/")[1]?.split(";")[0]?.replace(/\+.*$/, "");
  return subtype && /^[a-z0-9.-]+$/i.test(subtype) ? subtype : "bin";
}

function writeBinary(
  data: Uint8Array,
  mimeType: string | undefined,
  spill: Spill
): BinaryPointer {
  if (spill.files.length === 0) {
    mkdirSync(spill.dir, { recursive: true });
  }
  const file = join(
    spill.dir,
    `payload-${spill.files.length}.${extensionFor(mimeType)}`
  );
  writeFileSync(file, data);
  spill.files.push(file);
  const pointer: BinaryPointer = { $file: file, bytes: data.byteLength };
  if (mimeType) {
    pointer.mimeType = mimeType;
  }
  return pointer;
}

async function encodeImage(
  ref: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const encoded = await encodeRawImageRef(ref);
    return isObjectLike(encoded) ? encoded : ref;
  } catch {
    // No codec on this install (sharp missing). Keep the raw ref: its bytes
    // still spill to disk below rather than being dropped.
    return ref;
  }
}

/**
 * Walk `value`, PNG-encoding raw-RGBA images and spilling large binaries.
 * `mimeType` is the one declared by the nearest enclosing object, so a ref's
 * `data` is named by its own `mimeType`.
 */
async function prepare(
  value: unknown,
  mimeType: string | undefined,
  spill: Spill
): Promise<unknown> {
  if (value instanceof Uint8Array) {
    return value.byteLength >= spill.limit
      ? writeBinary(value, mimeType, spill)
      : value;
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => prepare(item, mimeType, spill)));
  }
  if (!isObjectLike(value)) {
    return value;
  }
  // A value with its own serializer (a `Date`, say) decides its own JSON.
  // Decomposing it into own enumerable properties turns a timestamp into `{}`.
  if (isFunctionValue(value.toJSON)) {
    return value;
  }

  const record = isRawRgbaImage(value) ? await encodeImage(value) : value;
  const childMime = isString(record.mimeType) ? record.mimeType : mimeType;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    out[key] = await prepare(item, childMime, spill);
  }
  return out;
}

/** The JSON text for a run result, plus every payload file it points at. */
export async function formatRunJson(
  value: unknown,
  opts: RunJsonOptions = {}
): Promise<{ json: string; files: string[] }> {
  const spill: Spill = {
    dir: opts.outputDir ?? resolve(process.cwd(), "nodetool-output"),
    limit: opts.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES,
    files: []
  };
  try {
    const prepared = await prepare(value, undefined, spill);
    return { json: JSON.stringify(prepared, null, 2), files: spill.files };
  } catch (e) {
    // Whatever went wrong here, the run itself is done. Report the failure as
    // JSON on the JSON channel instead of raising it over a finished run.
    const summary = {
      error: `Result could not be serialized as JSON: ${String(e)}`,
      keys: isRecord(value) ? Object.keys(value) : [],
      files: spill.files
    };
    return { json: JSON.stringify(summary, null, 2), files: spill.files };
  }
}

/** Print a run result as JSON, noting on stderr where any payloads landed. */
export async function printRunJson(
  value: unknown,
  opts: RunJsonOptions = {}
): Promise<void> {
  const { json, files } = await formatRunJson(value, opts);
  console.log(json);
  const first = files[0];
  if (first) {
    console.error(`Wrote ${files.length} payload file(s) to ${dirname(first)}`);
  }
}

/**
 * One-line rendering of a value for the human-readable output. Byte arrays are
 * described rather than expanded, so a 4 MB frame does not cost tens of
 * megabytes of text on its way to being truncated to `maxChars`.
 */
export function previewJson(value: unknown, maxChars?: number): string {
  // `JSON.stringify` is typed `string` but returns undefined for an undefined
  // or non-serializable root.
  const text: string | undefined = JSON.stringify(value, (_key, item: unknown) =>
    item instanceof Uint8Array ? `<${item.byteLength} bytes>` : item
  );
  if (text === undefined) return "undefined";
  if (maxChars === undefined || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}
