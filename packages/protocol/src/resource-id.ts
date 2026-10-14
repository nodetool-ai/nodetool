/**
 * Short resource ids: the first {@link SHORT_RESOURCE_ID_LENGTH} hex chars of
 * a 32-hex row id.
 *
 * A full row id costs about 30 tokens every time a model reads or writes it,
 * and a list result carries several per row. The short form is stateless — no
 * alias table, the same string in every thread, in memory, over REST and
 * after a restart — and at 48 bits a per-user collision is not a practical
 * concern. Resolution is one indexed prefix query in `DBModel.get`, which
 * refuses an ambiguous prefix rather than guessing.
 *
 * Both forms are accepted everywhere a row is loaded; only what the model
 * sees is shortened, at the sandbox and prompt boundaries.
 */

export const SHORT_RESOURCE_ID_LENGTH = 12;

const FULL_ID = /^[0-9a-f]{32}$/;
const SHORT_ID = new RegExp(`^[0-9a-f]{${SHORT_RESOURCE_ID_LENGTH}}$`);

/** A 32-hex row id as the models generate them. */
export function isFullResourceId(value: string): boolean {
  return FULL_ID.test(value);
}

/** Exactly the short form — a prefix, never a full id or a shorter string. */
export function isShortResourceId(value: string): boolean {
  return SHORT_ID.test(value);
}

/** The short form of a full id; anything else comes back unchanged. */
export function shortResourceId(value: string): string {
  return isFullResourceId(value)
    ? value.slice(0, SHORT_RESOURCE_ID_LENGTH)
    : value;
}

const ASSET_SCHEME = "asset://";
const HEX_ID_WITH_EXTENSION = /^([0-9a-f]{12,32})\.[A-Za-z0-9]{1,8}$/;

/**
 * The bare asset id an asset reference names, for every form an agent or a
 * shipped document hands over: `asset://<id>.<ext>`, `asset://<id>`, a bare
 * id, or a bare hex id with an extension. The id may still be a 12-character
 * prefix; resolving it to the full id needs the caller's asset table.
 *
 * Any other scheme (`package://`, `http(s)://`, `data:`) is a locator, not an
 * id, and comes back unchanged.
 */
export function assetIdFromRef(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed.startsWith(ASSET_SCHEME)) {
    const rest = trimmed.slice(ASSET_SCHEME.length).split(/[?#]/)[0];
    const withoutExt = rest.replace(/\.[A-Za-z0-9]{1,8}$/, "");
    return withoutExt || rest;
  }
  const hexWithExt = HEX_ID_WITH_EXTENSION.exec(trimmed);
  return hexWithExt ? hexWithExt[1] : trimmed;
}
