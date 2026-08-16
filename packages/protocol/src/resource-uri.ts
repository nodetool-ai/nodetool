/**
 * Resource URI scheme: the kind is the scheme.
 *
 * ```
 * <kind>://<id>[#<key>=<value>]        e.g. asset://as_1, timeline://tl_7#clip=cl_2
 * ```
 *
 * The legacy long form `nodetool://<kind>/<id>[#…]` is accepted on parse so
 * links persisted in older threads keep resolving; `formatResourceUri` always
 * emits the short form. The `nodetool://` scheme is otherwise avoided — the
 * mobile app claims it for OS deep links.
 *
 * `ResourceKind` is the `UiSurfaceType` union minus `chat` (a chat surface is
 * addressed as `thread`) plus `asset`, `collection`, `model3d`, and `thread`.
 * It is spelled out here rather than derived because the two sets differ.
 */
import { isString } from "./predicates.js";

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

const LEGACY_SCHEME = "nodetool://";

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
  if (!isString(uri)) return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;

  const hashIndex = trimmed.indexOf("#");
  const body = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? undefined : trimmed.slice(hashIndex + 1);

  if (body.startsWith(LEGACY_SCHEME)) {
    const path = body.slice(LEGACY_SCHEME.length);
    const slashIndex = path.indexOf("/");
    if (slashIndex <= 0) return null;
    const kind = path.slice(0, slashIndex);
    if (!isResourceKind(kind)) return null;
    return buildRef(kind, path.slice(slashIndex + 1), fragment);
  }

  const schemeIndex = body.indexOf("://");
  if (schemeIndex <= 0) return null;
  const kind = body.slice(0, schemeIndex);
  if (!isResourceKind(kind)) return null;

  return buildRef(kind, body.slice(schemeIndex + 3), fragment);
}

export function formatResourceUri(ref: ResourceUri): string {
  const base = `${ref.kind}://${ref.id}`;
  return ref.subTarget
    ? `${base}#${ref.subTarget.key}=${ref.subTarget.value}`
    : base;
}

export function isResourceUri(uri: string): boolean {
  return parseResourceUri(uri) !== null;
}
