/**
 * Lineage links between graph nodes. A link carries no value and implies no
 * execution order, so these helpers work on `graph.links` alone and never touch
 * `nodes` or `edges`.
 */

import type { GraphLink } from "./graph.js";
import { isShortResourceId } from "./resource-id.js";

export interface LinkInput {
  source: string;
  target: string;
  label?: string | null;
  kind?: string | null;
}

export type LinkResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Add a link between two existing nodes. A repeat of source, target and kind returns the existing link. */
export function addGraphLink(
  nodeIds: ReadonlySet<string>,
  links: readonly GraphLink[],
  input: LinkInput,
  newId: () => string
): LinkResult<{ links: GraphLink[]; link: GraphLink }> {
  if (input.source === input.target) {
    return { ok: false, error: "A link needs two different nodes." };
  }
  for (const end of [input.source, input.target]) {
    if (!nodeIds.has(end)) {
      return { ok: false, error: `Node ${end} is not in the graph.` };
    }
  }
  const kind = input.kind ?? null;
  const existing = links.find(
    (l) =>
      l.source === input.source &&
      l.target === input.target &&
      (l.kind ?? null) === kind
  );
  if (existing) return { ok: true, value: { links: [...links], link: existing } };
  const link: GraphLink = {
    id: newId(),
    source: input.source,
    target: input.target,
    label: input.label ?? null,
    kind
  };
  return { ok: true, value: { links: [...links, link], link } };
}

/**
 * Remove one link by id. Agents see link ids shortened to 12 characters, so an
 * exact 12-character prefix with a single match is accepted too.
 */
export function removeGraphLink(
  links: readonly GraphLink[],
  linkId: string
): LinkResult<GraphLink[]> {
  let target = links.find((l) => l.id === linkId);
  if (!target && isShortResourceId(linkId)) {
    // isShortResourceId fixes the prefix to exactly 12 hex characters, and
    // more than one match is refused below.
    const matches = links.filter((l) => l.id.startsWith(linkId)); // key-boundary-ok
    if (matches.length > 1) {
      return {
        ok: false,
        error: `Link id ${linkId} matches ${matches.length} links; pass the full id.`
      };
    }
    target = matches[0];
  }
  if (!target) {
    return { ok: false, error: `Link ${linkId} was not found.` };
  }
  const removedId = target.id;
  return { ok: true, value: links.filter((l) => l.id !== removedId) };
}

/** Drop links whose endpoints are no longer in the graph, as after a node delete. */
export function pruneGraphLinks(
  nodeIds: ReadonlySet<string>,
  links: readonly GraphLink[]
): GraphLink[] {
  return links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
}

/**
 * Three-way merge of link lists by id: start from `local`, drop links the
 * remote side deleted since `base`, and append links the remote side added.
 */
export function mergeGraphLinks(
  base: readonly GraphLink[],
  local: readonly GraphLink[],
  remote: readonly GraphLink[]
): GraphLink[] {
  const baseIds = new Set(base.map((l) => l.id));
  const remoteIds = new Set(remote.map((l) => l.id));
  const localIds = new Set(local.map((l) => l.id));
  return [
    ...local.filter((l) => !baseIds.has(l.id) || remoteIds.has(l.id)),
    ...remote.filter((l) => !baseIds.has(l.id) && !localIds.has(l.id))
  ];
}
