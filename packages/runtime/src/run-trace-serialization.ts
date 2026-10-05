import { redactTraceText } from "@nodetool-ai/config";
import { TRACE_CONTENT_BYTE_LIMIT, TRACE_STRING_LIMIT } from "@nodetool-ai/protocol";
import { getRunTraceScope, markTraceContentTruncated } from "./run-trace-context.js";

const MEDIA_TYPES = new Set(["image", "audio", "video", "model3d"]);
const NO_SECRETS: ReadonlySet<string> = new Set();
const BUFFER_JSON = /\{\s*"type"\s*:\s*"Buffer"\s*,\s*"data"\s*:\s*\[[\d,\s]*\]\s*\}/g;

function containsMedia(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 12) { return false; }
  if ("type" in value && (value.type === "Buffer" || (typeof value.type === "string" && MEDIA_TYPES.has(value.type) && "data" in value))) { return true; }
  return Object.values(value).slice(0, 1_000).some((child) => containsMedia(child, depth + 1));
}

/** Encode trace content without turning inline media buffers into stored JSON byte arrays. */
export function stringifyTraceContent(value: unknown, secrets: ReadonlySet<string> = getRunTraceScope()?.secretValues ?? NO_SECRETS): string {
  const ancestors = new WeakSet<object>();
  let textBytes = 0;
  const walk = (item: unknown, depth: number): unknown => {
    if (depth > 12 || textBytes >= TRACE_CONTENT_BYTE_LIMIT) { markTraceContentTruncated(); return "[truncated]"; }
    if (typeof item === "string") {
      let text = item;
      if (item.length * 2 <= TRACE_CONTENT_BYTE_LIMIT && /^\s*[[{]/.test(item)) {
        try {
          const parsed: unknown = JSON.parse(item);
          if (containsMedia(parsed)) { text = JSON.stringify(walk(parsed, depth + 1)); }
        } catch { /* Ordinary text remains text. */ }
      }
      const redacted = redactTraceText(text.replace(BUFFER_JSON, "[media omitted]"), secrets);
      if (redacted.length > TRACE_STRING_LIMIT) { markTraceContentTruncated(); }
      const clean = redacted.slice(0, TRACE_STRING_LIMIT);
      textBytes += clean.length * 2;
      return clean;
    }
    if (item === null || typeof item === "number" || typeof item === "boolean") { return item; }
    if (item instanceof ArrayBuffer || ArrayBuffer.isView(item)) { return "[media omitted]"; }
    if (typeof item !== "object") { return "[unsupported value]"; }
    if (ancestors.has(item)) { return "[circular]"; }
    if ("type" in item && item.type === "Buffer") { return "[media omitted]"; }
    ancestors.add(item);
    try {
      if (item instanceof Error) { return walk({ name: item.name, message: item.message, stack: item.stack }, depth + 1); }
      if (Array.isArray(item)) {
        if (item.length > 1_000) { markTraceContentTruncated(); }
        return item.slice(0, 1_000).map((entry) => walk(entry, depth + 1));
      }
      const output: Record<string, unknown> = {};
      const media = "type" in item && typeof item.type === "string" && MEDIA_TYPES.has(item.type);
      const entries = Object.entries(item);
      if (entries.length > 1_000) { markTraceContentTruncated(); }
      for (const [key, entry] of entries.slice(0, 1_000)) {
        if (media && key === "data") { output[key] = "[media omitted]"; }
        else if ((key === "asset_id" || key === "generation_id") && typeof entry === "string" && /^[0-9a-f]{32}$/.test(entry)) { output[key] = entry; }
        else if (key === "uri" && typeof entry === "string" && /^(?:asset|generation):\/\/[0-9a-f]{32}$/.test(entry)) { output[key] = entry; }
        else { output[key] = walk(entry, depth + 1); }
      }
      return output;
    } finally { ancestors.delete(item); }
  };
  try {
    const serialized = JSON.stringify(walk(value, 0));
    if (serialized.length * 2 > TRACE_CONTENT_BYTE_LIMIT) { markTraceContentTruncated(); return '"[truncated]"'; }
    return serialized;
  } catch { return '"[unserializable]"'; }
}

/** Clean an existing text body, including recognizable pre-encoded media objects. */
export function sanitizeTraceContentText(value: string, secrets: ReadonlySet<string> = getRunTraceScope()?.secretValues ?? NO_SECRETS): string {
  const clean: unknown = JSON.parse(stringifyTraceContent(value, secrets));
  return typeof clean === "string" ? clean : "[omitted]";
}
