/**
 * Deterministic Godot identifiers.
 *
 * Godot assigns `uid://` and `ext_resource id` values at random when the
 * editor writes a file. Here they are a hash of (slot_id, asset_id, salt), so
 * re-exporting after a regenerated asset changes only that slot's files and
 * nothing that referenced the old ones.
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

function fnv1a64(text: string): bigint {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

function base36(value: bigint, length: number): string {
  let out = "";
  let rest = value;
  for (let i = 0; i < length; i++) {
    out = BASE36[Number(rest % 36n)] + out;
    rest /= 36n;
  }
  return out;
}

function digest(parts: string[]): bigint {
  return fnv1a64(parts.join(" "));
}

/** `uid://<13 base36 chars>`: a positive int64 the way Godot's ResourceUID encodes it. */
export function resourceUid(slotId: string, assetId: string, salt: string): string {
  const id = digest(["uid", slotId, assetId, salt]) & ((1n << 63n) - 1n);
  return `uid://${base36(id, 13)}`;
}

/** `ext_resource id`, in Godot 4's `<index>_<5 chars>` shape. */
export function extResourceId(
  index: number,
  slotId: string,
  assetId: string,
  salt: string
): string {
  return `${index}_${base36(digest(["ext", slotId, assetId, salt]), 5)}`;
}

/** `sub_resource id`, in Godot 4's `<Type>_<5 chars>` shape. */
export function subResourceId(
  type: string,
  slotId: string,
  assetId: string,
  salt: string
): string {
  return `${type}_${base36(digest(["sub", type, slotId, assetId, salt]), 5)}`;
}
