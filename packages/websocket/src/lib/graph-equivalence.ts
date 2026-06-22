/**
 * Graph equivalence — decides whether two workflow graphs represent the same
 * meaningful content for the purpose of autosave version deduplication.
 *
 * Autosave fires on an interval and persists a snapshot every time it runs.
 * Without a content check it produces a stream of near-identical versions (the
 * client's dirty flag stays set, and transient UI state such as which node is
 * selected leaks into the serialized graph). This compares two graphs while
 * ignoring that transient UI state so we only snapshot real changes.
 */

import type { WorkflowGraph } from "@nodetool-ai/models";

/** UI-only node properties that should not count as a meaningful change. */
const IGNORED_UI_PROPERTIES = new Set(["selected", "zIndex"]);

/** Deep, key-order-independent structural equality. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;

  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

function normalizeNode(node: Record<string, unknown>): Record<string, unknown> {
  const ui = node.ui_properties;
  if (!ui || typeof ui !== "object") return node;
  const cleanedUi: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ui as Record<string, unknown>)) {
    if (IGNORED_UI_PROPERTIES.has(key)) continue;
    cleanedUi[key] = value;
  }
  return { ...node, ui_properties: cleanedUi };
}

function normalizeGraph(graph: WorkflowGraph | null | undefined): {
  nodes: Record<string, unknown>[];
  edges: unknown[];
} {
  const nodes = Array.isArray(graph?.nodes) ? graph!.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph!.edges : [];
  return {
    nodes: nodes.map((n) => normalizeNode(n as Record<string, unknown>)),
    edges
  };
}

/**
 * Returns true when two graphs are equivalent ignoring transient UI state
 * (node selection, z-index). Used to skip redundant autosave versions.
 */
export function graphsEquivalent(
  a: WorkflowGraph | null | undefined,
  b: WorkflowGraph | null | undefined
): boolean {
  return deepEqual(normalizeGraph(a), normalizeGraph(b));
}
