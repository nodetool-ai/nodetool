/**
 * Shorten resource ids in what the model reads.
 *
 * A capability answers with full 32-hex row ids — `id`, `workflow_id`,
 * `asset://<id>.png` — and each costs the model about 30 tokens to read and
 * again to write back. `DBModel.get` accepts the 12-char prefix
 * (`resource-id.ts` in protocol), so what the model sees can be the short form
 * without any capability changing what it accepts.
 *
 * Rewriting is keyed by field name, never by shape alone: an md5 etag or a
 * content hash is also 32 hex, and truncating one would corrupt it. `id`,
 * `*_id`, `*_ids`, and `asset://` uris under `uri` / `*_uri` / `uris` are the
 * places an id lives. `user_id` is dropped outright: it is always the caller.
 *
 * Applied where host values enter the guest (the capability dispatcher and
 * the belt bridge), so guest variables and the observation agree, and where
 * host text enters the prompt directly (direct tool results, the memory
 * block).
 */

import { isFullResourceId, shortResourceId } from "@nodetool-ai/protocol";
import { isRecord, isString } from "../utils/type-guards.js";

const ASSET_URI = /asset:\/\/([0-9a-f]{32})(?=[./?#]|$)/g;

/** Every `asset://<full id>` in a string, shortened; the rest untouched. */
export function compactAssetUris(text: string): string {
  return text.replace(ASSET_URI, (_, id: string) => `asset://${shortResourceId(id)}`);
}

function isIdKey(key: string): boolean {
  return key === "id" || key.endsWith("_id");
}

function isIdListKey(key: string): boolean {
  return key === "ids" || key.endsWith("_ids");
}

function isUriKey(key: string): boolean {
  return key === "uri" || key.endsWith("_uri") || key === "uris";
}

function compactIdValue(value: unknown): unknown {
  return isString(value) && isFullResourceId(value)
    ? shortResourceId(value)
    : value;
}

function compactUriValue(value: unknown): unknown {
  if (isString(value)) return compactAssetUris(value);
  if (Array.isArray(value)) return value.map(compactUriValue);
  return value;
}

/**
 * The value with every resource id in an id-named field shortened and
 * `user_id` removed, recursively. Arrays and nested records are walked;
 * strings outside id fields are not touched.
 */
export function compactResourceIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactResourceIds);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "user_id") continue;
    if (isIdKey(key)) {
      out[key] = compactIdValue(entry);
    } else if (isIdListKey(key) && Array.isArray(entry)) {
      out[key] = entry.map(compactIdValue);
    } else if (isUriKey(key)) {
      out[key] = compactUriValue(entry);
    } else {
      out[key] = compactResourceIds(entry);
    }
  }
  return out;
}
