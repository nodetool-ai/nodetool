/**
 * JSON transport for structured data across the QuickJS boundary.
 *
 * The wrapper marshals a value handle-by-handle: every object node costs four
 * `evalCode` compilations inside the guest plus a `newFunction` allocation, and
 * every property crosses as its own descriptor. Measured on this repo's engine
 * that is ~150 µs per object node out of the guest and ~400 µs per object node
 * into it — a Code node handed 5 000 rows spent 1.9 s reading them and another
 * 0.8 s handing them back, before running a line of its own.
 *
 * Both directions carry JSON-shaped data, so the fast path is to move one
 * string: the guest builds its answer with `JSON.stringify` and the host parses
 * it, and the host encodes its globals here for the init prelude to parse.
 * Measured on the same shapes, 20–25× either way.
 *
 * Two kinds of value would lose by that trade, and both ride *beside* the JSON
 * in a sidecar the marshaler moves in one piece — a typed array (base64 inside
 * the guest costs more than the marshal it replaces) and a string past
 * {@link SIDECAR_STRING_THRESHOLD} (escaping a megabyte to unescape it again is
 * two passes the primitive path never makes). A {@link JSON_SIDECAR_MARKER}
 * holds its place by index.
 *
 * What JSON alone still cannot carry is carried by markers, so the round trip
 * keeps the types the structured path preserved:
 *
 * - **dates** — an ISO string under {@link JSON_DATE_MARKER}, revived as a
 *   `Date`. A `state.lastRun` that survives a Code node's invocations stays a
 *   `Date` rather than degrading to a string on its first round trip.
 * - **non-finite numbers** — `NaN` and the infinities under {@link
 *   JSON_NUMBER_MARKER}. `JSON.stringify` writes them as `null`.
 * - **undefined** — {@link JSON_UNDEFINED_MARKER}, so a property whose value is
 *   `undefined` keeps its key. `JSON.stringify` drops it.
 *
 * Anything else — a function, a symbol, a bigint, a `Map`, a class instance —
 * makes the encoder refuse that value, and its caller falls back to the
 * wrapper's own marshaling, which is slow but total. The fast path never has to
 * guess.
 *
 * A **cycle** is the one thing neither path carries: the wrapper's marshaler
 * recurses until the runtime aborts with `list_empty(&rt->gc_obj_list)`, which
 * kills the run with an assertion instead of an answer. So a cyclic global is
 * refused by name, and a cyclic result becomes `String(value)` — the fallback
 * `serializeResult` already documents for a value `JSON.stringify` rejects.
 *
 * Browser-safe: nothing here imports a Node builtin.
 */

import {
  encodeBase64,
  SANDBOX_BYTES_MARKER,
  SANDBOX_SERIALIZE_MAX_DEPTH
} from "./sandbox-bytes.js";
import { isObjectLike } from "./utils/type-guards.js";

/** Marker key carrying an ISO timestamp for a `Date`. */
export const JSON_DATE_MARKER = "__nodetool_sandbox_date__";

/** Marker key carrying `"NaN"`, `"Infinity"`, or `"-Infinity"`. */
export const JSON_NUMBER_MARKER = "__nodetool_sandbox_number__";

/** Marker key standing in for an `undefined` property value. */
export const JSON_UNDEFINED_MARKER = "__nodetool_sandbox_undefined__";

/** Marker key carrying an index into the payload's sidecar. */
export const JSON_SIDECAR_MARKER = "__nodetool_sandbox_side__";

/**
 * Strings at least this long travel in the sidecar rather than inside the JSON.
 * Below it the escape/unescape pass is noise next to the run's fixed cost; a
 * megabyte of text is where it stops being.
 */
export const SIDECAR_STRING_THRESHOLD = 8192;

/** The global the guest parks its encoder on. */
export const GUEST_MARSHAL_GLOBAL = "__nodetool_marshal__";

/** The global carrying the host's encoded globals for the prelude to read. */
export const GUEST_GLOBALS_JSON_BINDING = "__nodetool_globals_json__";

/** The global carrying the sidecar those encoded globals index into. */
export const GUEST_GLOBALS_SIDECAR_BINDING = "__nodetool_globals_side__";

// ---------------------------------------------------------------------------
// Host → guest
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Returned in place of a value that has no JSON representation. */
const UNREPRESENTABLE = Symbol("unrepresentable");

/**
 * Returned in place of a value that refers back to itself. It is reported apart
 * from {@link UNREPRESENTABLE} because the fallback does not cover it: the
 * wrapper's own marshaler recurses until the runtime aborts, so a caller has to
 * refuse a cycle rather than hand it over.
 */
const CYCLIC = Symbol("cyclic");

function toJsonTree(
  value: unknown,
  sidecar: string[],
  seen: Set<unknown>,
  depth: number
): unknown {
  if (value === null) return null;
  if (value === undefined) return { [JSON_UNDEFINED_MARKER]: true };
  switch (typeof value) {
    case "boolean":
      return value;
    case "string":
      return value.length >= SIDECAR_STRING_THRESHOLD
        ? { [JSON_SIDECAR_MARKER]: sidecar.push(value) - 1 }
        : value;
    case "number":
      return Number.isFinite(value)
        ? value
        : { [JSON_NUMBER_MARKER]: String(value) };
    case "function":
    case "symbol":
    case "bigint":
      return UNREPRESENTABLE;
    default:
      break;
  }
  if (depth >= SANDBOX_SERIALIZE_MAX_DEPTH) return UNREPRESENTABLE;
  if (seen.has(value)) return CYCLIC;
  if (value instanceof Date) {
    return { [JSON_DATE_MARKER]: value.toISOString() };
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    // Bytes cannot ride the sidecar into the guest: a host `Uint8Array` arrives
    // there as a numeric-keyed object, which is the whole reason the base64
    // marker exists.
    const view = value as ArrayBufferView;
    return {
      [SANDBOX_BYTES_MARKER]: encodeBase64(
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      )
    };
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const out: unknown[] = new Array(value.length);
      for (let i = 0; i < value.length; i++) {
        const encoded = toJsonTree(value[i], sidecar, seen, depth + 1);
        if (encoded === UNREPRESENTABLE || encoded === CYCLIC) return encoded;
        out[i] = encoded;
      }
      return out;
    }
    if (!isPlainObject(value)) return UNREPRESENTABLE;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const encoded = toJsonTree(entry, sidecar, seen, depth + 1);
      if (encoded === UNREPRESENTABLE || encoded === CYCLIC) return encoded;
      out[key] = encoded;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/** What one encoded batch of host globals hands the guest prelude. */
export interface HostRecordEncoding {
  /** JSON for the guest to parse: `{name: value}` over the accepted entries. */
  readonly json: string;
  /** Values the JSON refers to by index, moved whole rather than escaped. */
  readonly sidecar: readonly string[];
  /** Entries no JSON representation covers. The caller marshals these itself. */
  readonly skipped: readonly string[];
  /** Entries that refer back to themselves. Neither path can carry these. */
  readonly cyclic: readonly string[];
}

/**
 * Encode a batch of named host values for the guest to `JSON.parse` and revive.
 *
 * One batch means one sidecar and one parse. An entry holding something JSON
 * plus the markers cannot carry is reported in `skipped` instead of failing the
 * batch, so one exotic global costs only itself; an entry that refers back to
 * itself is reported in `cyclic`, which no path can carry.
 */
export function encodeHostRecord(
  values: Record<string, unknown>
): HostRecordEncoding {
  const sidecar: string[] = [];
  const skipped: string[] = [];
  const cyclic: string[] = [];
  const tree: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    const encoded = toJsonTree(value, sidecar, new Set(), 0);
    if (encoded === CYCLIC) {
      cyclic.push(name);
      continue;
    }
    if (encoded === UNREPRESENTABLE) {
      skipped.push(name);
      continue;
    }
    tree[name] = encoded;
  }
  return { json: JSON.stringify(tree), sidecar, skipped, cyclic };
}

// ---------------------------------------------------------------------------
// Guest → host
// ---------------------------------------------------------------------------

function reviveHostTree(value: unknown, sidecar: readonly unknown[]): unknown {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = reviveHostTree(value[i], sidecar);
    }
    return value;
  }
  if (!isObjectLike(value)) return value;
  const sideIndex = value[JSON_SIDECAR_MARKER];
  if (typeof sideIndex === "number") return sidecar[sideIndex];
  const iso = value[JSON_DATE_MARKER];
  if (typeof iso === "string") return new Date(iso);
  const nonFinite = value[JSON_NUMBER_MARKER];
  if (typeof nonFinite === "string") return Number(nonFinite);
  if (value[JSON_UNDEFINED_MARKER] === true) return undefined;
  for (const key of Object.keys(value)) {
    value[key] = reviveHostTree(value[key], sidecar);
  }
  return value;
}

/**
 * Decode what the guest's encoder produced: either a JSON string plus the
 * sidecar its markers index, or a value the guest handed over as-is (a
 * primitive, or something `JSON.stringify` refused) under `raw`.
 *
 * The guest owns this string, so a body that overwrites the encoder can hand
 * back nonsense. That is not an escalation — the guest owned its own result
 * either way — so a payload that will not parse decodes as `undefined` rather
 * than failing the run.
 */
export function decodeGuestPayload(payload: unknown): unknown {
  if (!isObjectLike(payload)) return payload;
  const json = payload.j;
  if (typeof json !== "string") {
    return "raw" in payload ? payload.raw : undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  const sidecar = Array.isArray(payload.b) ? (payload.b as unknown[]) : [];
  if (!isObjectLike(parsed)) return undefined;
  const revived = reviveHostTree(parsed, sidecar);
  return isObjectLike(revived) ? revived.v : undefined;
}

// ---------------------------------------------------------------------------
// Guest-side sources
// ---------------------------------------------------------------------------

/**
 * The guest half, spliced into the init prelude: the encoder the entry module
 * and the sync extractor call, and the parse of whatever globals the host
 * encoded.
 *
 * `__bytesMarker` and `fromBase64` are defined earlier in the prelude, so this
 * source has to follow them.
 */
export const GUEST_JSON_TRANSPORT_SOURCE = `
const __ntSide = [];
globalThis.${GUEST_MARSHAL_GLOBAL} = (value) => {
  // A primitive already crosses as a primitive — stringifying a megabyte of
  // text only to parse it back on the host is the one trade JSON loses.
  if (value === null || (typeof value !== "object" && typeof value !== "string")) {
    return { raw: value };
  }
  __ntSide.length = 0;
  let json;
  try {
    json = JSON.stringify({ v: value }, function (key, encoded) {
      const raw = this[key];
      if (typeof raw === "string") {
        return raw.length >= ${SIDECAR_STRING_THRESHOLD}
          ? { ${JSON.stringify(JSON_SIDECAR_MARKER)}: __ntSide.push(raw) - 1 }
          : raw;
      }
      if (typeof raw === "number" && !Number.isFinite(raw)) {
        return { ${JSON.stringify(JSON_NUMBER_MARKER)}: String(raw) };
      }
      if (raw instanceof Date) {
        return { ${JSON.stringify(JSON_DATE_MARKER)}: raw.toISOString() };
      }
      if (ArrayBuffer.isView(raw) && !(raw instanceof DataView)) {
        return {
          ${JSON.stringify(JSON_SIDECAR_MARKER)}: __ntSide.push(
            raw instanceof Uint8Array
              ? raw
              : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
          ) - 1
        };
      }
      if (raw === undefined && encoded === undefined) {
        return { ${JSON.stringify(JSON_UNDEFINED_MARKER)}: true };
      }
      return encoded;
    });
  } catch (e) {
    // A cycle (or a bigint) has no JSON form, and handing the value to the
    // wrapper's marshaler instead recurses until the runtime aborts. String()
    // is what serializeResult falls back to for the same values.
    __ntSide.length = 0;
    return { raw: String(value) };
  }
  // An empty sidecar is left off: an empty array still costs the wrapper a
  // whole object node to marshal, which is most of a small payload's cost.
  return __ntSide.length === 0 ? { j: json } : { j: json, b: __ntSide.slice() };
};
const __ntReviveHost = (value, side) => {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = __ntReviveHost(value[i], side);
    return value;
  }
  if (!value || typeof value !== "object") return value;
  const index = value[${JSON.stringify(JSON_SIDECAR_MARKER)}];
  if (typeof index === "number") return side[index];
  const bytes = value[__bytesMarker];
  if (typeof bytes === "string") return globalThis.fromBase64(bytes);
  const iso = value[${JSON.stringify(JSON_DATE_MARKER)}];
  if (typeof iso === "string") return new Date(iso);
  const num = value[${JSON.stringify(JSON_NUMBER_MARKER)}];
  if (typeof num === "string") return Number(num);
  if (value[${JSON.stringify(JSON_UNDEFINED_MARKER)}] === true) return undefined;
  for (const key of Object.keys(value)) value[key] = __ntReviveHost(value[key], side);
  return value;
};
if (typeof globalThis.${GUEST_GLOBALS_JSON_BINDING} === "string") {
  const __ntHostSide = globalThis.${GUEST_GLOBALS_SIDECAR_BINDING} || [];
  const __ntGlobals = JSON.parse(globalThis.${GUEST_GLOBALS_JSON_BINDING});
  delete globalThis.${GUEST_GLOBALS_JSON_BINDING};
  delete globalThis.${GUEST_GLOBALS_SIDECAR_BINDING};
  for (const __ntKey of Object.keys(__ntGlobals)) {
    globalThis[__ntKey] = __ntReviveHost(__ntGlobals[__ntKey], __ntHostSide);
  }
}
`;
