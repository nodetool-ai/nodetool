/**
 * Lineage links between graph nodes. A link carries no value and implies no
 * execution order, so these helpers work on `graph.links` alone and never touch
 * `nodes` or `edges`.
 */

import type { GraphLink } from "./graph.js";

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

/** Remove one link by id. */
export function removeGraphLink(
  links: readonly GraphLink[],
  linkId: string
): LinkResult<GraphLink[]> {
  if (!links.some((l) => l.id === linkId)) {
    return { ok: false, error: `Link ${linkId} was not found.` };
  }
  return { ok: true, value: links.filter((l) => l.id !== linkId) };
}

/** Drop links whose endpoints are no longer in the graph, as after a node delete. */
export function pruneGraphLinks(
  nodeIds: ReadonlySet<string>,
  links: readonly GraphLink[]
): GraphLink[] {
  return links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
}
