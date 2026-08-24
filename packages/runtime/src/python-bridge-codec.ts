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

/** Encode one bridge message to msgpack bytes. */
export function packBridgeMessage(msg: Record<string, unknown>): Buffer {
  return pack(msg);
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
