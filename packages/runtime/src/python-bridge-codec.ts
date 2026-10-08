/**
 * The msgpack codec both Python-bridge transports share.
 *
 * Python's msgpack encodes any integer above 2^32 as a `uint64` (wire type
 * 0xcf), and msgpackr decodes a `uint64` to a **BigInt** by default. That
 * silently breaks the bridge's own typed contract: `ModelDownloadUpdate`
 * declares `total_bytes: number`, so every consumer does plain arithmetic on
 * it — and a BigInt makes `downloaded / total` throw `TypeError: Cannot mix
 * BigInt and other types`, `Math.trunc()` throw, and `z.number()` reject the
 * frame. A remote model download over 4 GiB (most diffusion models) hit all
 * three, and the failure surfaced as an undecodable frame.
 *
 * Nothing on this wire needs more than 2^53: the values that cross the 2^32
 * line are byte counts and millisecond timestamps. So the decoder reads int64
 * as a number, and the declared types become true again.
 *
 * `mapsAsObjects` is NOT a preference — it restores a default. msgpackr's
 * module-level `unpack` sets it; a hand-built `Unpackr` does not, and would
 * hand every caller a `Map` instead of a frame object.
 */

import { pack, Unpackr } from "msgpackr";

const unpackr = new Unpackr({
  int64AsType: "number",
  mapsAsObjects: true
});

/**
 * Drop object properties whose value is `undefined`, at any depth.
 *
 * msgpackr encodes `undefined` as ext type 0, which the Python worker decodes
 * as `None`. A TS caller that leaves an option out (`speed`, `max_tokens`,
 * `temperature`) would otherwise send an explicit `None` that replaces the
 * Python default. An absent key keeps the default. Array elements are kept,
 * because their position carries meaning. Binary payloads and other
 * non-plain objects pass through untouched. Returns the input itself when
 * nothing was removed, so large frames are not copied.
 */
export function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    let copy: unknown[] | null = null;
    for (let i = 0; i < value.length; i++) {
      const item: unknown = value[i];
      if (typeof item !== "object" || item === null) continue;
      const stripped = stripUndefined(item);
      if (stripped !== item) {
        copy ??= value.slice();
        copy[i] = stripped;
      }
    }
    return copy ?? value;
  }
  if (typeof value !== "object" || value === null) return value;
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const strippedValues = keys.map((key) => {
    const item = record[key];
    return item === undefined ? undefined : stripUndefined(item);
  });
  if (
    keys.every(
      (key, i) => strippedValues[i] === record[key] && record[key] !== undefined
    )
  ) {
    return value;
  }
  // defineProperty, not assignment: a key named "__proto__" must stay an own
  // property instead of reaching the prototype setter.
  const copy = Object.create(proto as object | null) as Record<string, unknown>;
  keys.forEach((key, i) => {
    if (strippedValues[i] === undefined) return;
    Object.defineProperty(copy, key, {
      value: strippedValues[i],
      enumerable: true,
      writable: true,
      configurable: true
    });
  });
  return copy;
}

/**
 * Encode one bridge message to msgpack bytes. Properties set to `undefined`
 * are omitted (see {@link stripUndefined}).
 */
export function packBridgeMessage(msg: Record<string, unknown>): Buffer {
  return pack(stripUndefined(msg));
}

/**
 * Decode one msgpack payload into a bridge message, reading int64 as a number
 * rather than a BigInt (see the module comment).
 */
export function unpackBridgeMessage(
  payload: Buffer | Uint8Array
): Record<string, unknown> {
  // SAFETY: every frame on this wire is a msgpack map; a worker that sends
  // anything else is a protocol desync the callers already handle.
  return unpackr.unpack(payload) as Record<string, unknown>;
}
