/**
 * The `nodetool://` resource URI scheme.
 *
 * ```
 * nodetool://<kind>/<id>[#<key>=<value>]
 * ```
 *
 * `asset://<id>` is accepted as shorthand for `nodetool://asset/<id>` so that
 * existing tool results keep working.
 *
 * `ResourceKind` is the `UiSurfaceType` union minus `chat` (a chat surface is
 * addressed as `thread`) plus `asset`, `collection`, `model3d`, and `thread`.
 * It is spelled out here rather than derived because the two sets differ.
 */
export type ResourceKind =
  | "asset"
  | "workflow"
  | "timeline"
  | "storyboard"
  | "sketch"
  | "script"
  | "app"
  | "model3d"
  | "collection"
  | "thread";

export const RESOURCE_KINDS: readonly ResourceKind[] = [
  "asset",
  "workflow",
  "timeline",
  "storyboard",
  "sketch",
  "script",
  "app",
  "model3d",
  "collection",
  "thread"
];

export interface ResourceUri {
  kind: ResourceKind;
  id: string;
  /** Kind-specific sub-target, e.g. `{ key: "shot", value: "s3" }`. */
  subTarget?: { key: string; value: string };
}

const NODETOOL_SCHEME = "nodetool://";
const ASSET_SCHEME = "asset://";

const isResourceKind = (value: string): value is ResourceKind =>
  (RESOURCE_KINDS as readonly string[]).includes(value);

const parseFragment = (
  fragment: string
): { key: string; value: string } | null => {
  const separator = fragment.indexOf("=");
  if (separator <= 0) return null;
  const key = fragment.slice(0, separator);
  const value = fragment.slice(separator + 1);
  if (!value || value.includes("=")) return null;
  return { key, value };
};

const buildRef = (
  kind: ResourceKind,
  id: string,
  fragment: string | undefined
): ResourceUri | null => {
  if (!id || id.includes("/")) return null;
  if (fragment === undefined) return { kind, id };
  const subTarget = parseFragment(fragment);
  if (!subTarget) return null;
  return { kind, id, subTarget };
};

export function parseResourceUri(uri: string): ResourceUri | null {
  if (typeof uri !== "string") return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;

  const hashIndex = trimmed.indexOf("#");
  const body = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? undefined : trimmed.slice(hashIndex + 1);

  if (body.startsWith(ASSET_SCHEME)) {
    return buildRef("asset", body.slice(ASSET_SCHEME.length), fragment);
  }

  if (!body.startsWith(NODETOOL_SCHEME)) return null;

  const path = body.slice(NODETOOL_SCHEME.length);
  const slashIndex = path.indexOf("/");
  if (slashIndex <= 0) return null;

  const kind = path.slice(0, slashIndex);
  if (!isResourceKind(kind)) return null;

  return buildRef(kind, path.slice(slashIndex + 1), fragment);
}

export function formatResourceUri(ref: ResourceUri): string {
  const base = `${NODETOOL_SCHEME}${ref.kind}/${ref.id}`;
  return ref.subTarget
    ? `${base}#${ref.subTarget.key}=${ref.subTarget.value}`
    : base;
}

export function isResourceUri(uri: string): boolean {
  return parseResourceUri(uri) !== null;
}
