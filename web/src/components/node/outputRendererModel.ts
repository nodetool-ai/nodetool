/**
 * Pure rules behind `OutputRenderer`: stable React keys for output values,
 * bounded text concatenation for streamed chunks, and the byte handling for
 * inline documents and HTML.
 */
import type { Chunk } from "../../stores/ApiTypes";
import {
  isBoolean,
  isNonEmptyString,
  isNumber,
  isString
} from "../../utils/typePredicates";
import { isRecord } from "./outputValueResolvers";

// Keep this large for UX (big LLM outputs), but bounded to avoid browser OOM /
// `RangeError: Invalid string length` when streams run away.
export const MAX_RENDERED_TEXT_CHARS = 5_000_000;

export const hashStringBounded = (input: string, sampleSize = 2048): string => {
  const len = input.length;
  const head = input.slice(0, sampleSize);
  const tail =
    len > sampleSize ? input.slice(Math.max(0, len - sampleSize)) : "";
  // djb2-ish, bounded to avoid O(n) over huge strings
  const hashPart = (s: string): number => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = (h * 33) ^ s.charCodeAt(i);
    }
    return h >>> 0;
  };
  const h1 = hashPart(head).toString(36);
  const h2 = tail ? hashPart(tail).toString(36) : "";
  return h2 ? `${h1}-${h2}-${len}` : `${h1}-${len}`;
};

export const hashBytesBounded = (
  input: ArrayLike<number>,
  sampleSize = 2048
): string => {
  const len = input.length ?? 0;
  const headLen = Math.min(len, sampleSize);
  const tailStart = len > sampleSize ? Math.max(0, len - sampleSize) : 0;

  const hashPart = (start: number, end: number): number => {
    let h = 5381;
    for (let i = start; i < end; i++) {
      h = (h * 33) ^ (input[i] ?? 0);
    }
    return h >>> 0;
  };

  const h1 = hashPart(0, headLen).toString(36);
  const h2 = len > sampleSize ? hashPart(tailStart, len).toString(36) : "";
  return h2 ? `${h1}-${h2}-${len}` : `${h1}-${len}`;
};

export const withOccurrenceSuffix = (
  base: string,
  seen: Map<string, number>
): string => {
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
};

export const stableKeyForOutputValue = (v: unknown): string => {
  if (v === null) {
    return "null";
  }
  if (v === undefined) {
    return "undefined";
  }
  if (isString(v)) {
    return `str:${hashStringBounded(v)}`;
  }
  if (isNumber(v) || isBoolean(v) || typeof v === "bigint") {
    return `${typeof v}:${String(v)}`;
  }
  if (v instanceof Uint8Array) {
    return `u8:${hashBytesBounded(v)}`;
  }
  if (Array.isArray(v)) {
    return `arr:${hashBytesBounded(v)}`;
  }
  if (isRecord(v)) {
    const obj = v;
    const id = obj.id;
    if (isString(id) || isNumber(id)) {
      return `id:${String(id)}`;
    }
    const uri = obj.uri;
    if (isNonEmptyString(uri)) {
      return `uri:${uri}`;
    }
    const type = obj.type;
    const name = obj.name;
    if (isString(type) && isString(name)) {
      return `type-name:${type}:${name}`;
    }
    if (isString(type)) {
      return `type:${type}:${hashStringBounded(
        JSON.stringify(Object.keys(obj).slice(0, 50))
      )}`;
    }
    try {
      return `json:${hashStringBounded(JSON.stringify(v))}`;
    } catch {
      return "object";
    }
  }
  return `other:${String(v)}`;
};

export const concatTextChunksSafely = (
  chunks: Chunk[]
) => {
  const parts: string[] = [];
  let used = 0;
  let currentLen = 0;

  for (const c of chunks) {
    if (!c) {
      continue;
    }
    const piece = isString(c.content) ? c.content : "";
    if (!piece) {
      used++;
      continue;
    }

    const remaining = MAX_RENDERED_TEXT_CHARS - currentLen;
    if (remaining <= 0) {
      return {
        text: parts.join(""),
        truncated: true,
        totalChunks: chunks.length,
        usedChunks: used
      };
    }

    if (piece.length <= remaining) {
      parts.push(piece);
      currentLen += piece.length;
      used++;
      continue;
    }

    parts.push(piece.slice(0, remaining));
    currentLen += remaining;
    used++;

    return {
      text: parts.join(""),
      truncated: true,
      totalChunks: chunks.length,
      usedChunks: used
    };
  }

  return {
    text: parts.join(""),
    truncated: false,
    totalChunks: chunks.length,
    usedChunks: used
  };
};

export const formatAudioChunkTimestamp = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00.000";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${secs
      .toFixed(3)
      .padStart(6, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${secs
    .toFixed(3)
    .padStart(6, "0")}`;
};

/**
 * The bytes of an inline document's `data`: a `Uint8Array`, a number array,
 * or the `{ "0": n, "1": n }` object a `Uint8Array` becomes after JSON.
 * Returns null when there are none.
 */
export function documentBytes(data: unknown): Uint8Array | null {
  let bytes: Uint8Array | null = null;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (Array.isArray(data)) {
    bytes = new Uint8Array(data);
  } else if (isRecord(data)) {
    const numericEntries = Object.entries(data)
      .filter(([k, v]) => /^\d+$/.test(k) && isNumber(v))
      .sort((a, b) => Number(a[0]) - Number(b[0]));
    if (numericEntries.length > 0) {
      bytes = new Uint8Array(numericEntries.map(([, v]) => Number(v)));
    }
  }
  return bytes && bytes.length > 0 ? bytes : null;
}

/** True when `bytes` starts with the `%PDF` magic number. */
export function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

/** The markup of an inline HTML value, decoded from bytes when needed. */
export function htmlFromData(data: unknown): string {
  if (isString(data)) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return new TextDecoder("utf-8").decode(data);
  }
  if (Array.isArray(data)) {
    return new TextDecoder("utf-8").decode(new Uint8Array(data as number[]));
  }
  return "";
}

export type ChunkGroup =
  | { kind: "text"; chunks: Chunk[] }
  | { kind: "other"; chunk: Chunk };

/**
 * Group consecutive text chunks together while keeping non-text chunks
 * (a tool call, say) in their original position.
 */
export function groupTextChunks(
  chunks: Chunk[],
  isText: (chunk: Chunk) => boolean
): ChunkGroup[] {
  const groups: ChunkGroup[] = [];
  for (const chunk of chunks) {
    if (!isText(chunk)) {
      groups.push({ kind: "other", chunk });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && last.kind === "text") {
      last.chunks.push(chunk);
    } else {
      groups.push({ kind: "text", chunks: [chunk] });
    }
  }
  return groups;
}
