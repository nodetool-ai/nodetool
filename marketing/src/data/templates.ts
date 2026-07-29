/**
 * Template page-data contract, consumed by the `/templates/*` routes.
 *
 * `templateEntries.generated.ts` is written by
 * `marketing/scripts/generate-template-entries.mjs` from the shipped example
 * workflows (packages/base-nodes/nodetool/examples/nodetool-base/*.json). Do not
 * edit the generated file by hand — run `npm run gen:templates`.
 *
 * A `TemplateEntry` extends PR-1's `PageEntry` contract, so it folds into the
 * sitemap and smoke walk with no special-casing.
 */
import type { PageEntry } from "./types";

/** One node in a template's graph, laid out from its editor `ui_properties`. */
export interface TemplateGraphNode {
  id: string;
  /** Full node type, e.g. "nodetool.image.TextToImage". */
  type: string;
  /** Humanized title, e.g. "Text To Image". */
  title: string;
  /** Short text preview (input value, prompt, model id, or comment text). */
  subtitle?: string;
  /** Editor canvas x/y. */
  x: number;
  y: number;
  /** Node width in canvas pixels. */
  width: number;
  /** Annotation node — rendered as a text card with no handles. */
  isComment?: boolean;
}

/** A connection between two node handles. */
export interface TemplateGraphEdge {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  /** Flow-palette data type for the edge/handle color. */
  color: string;
}

export interface TemplateGraph {
  nodes: TemplateGraphNode[];
  edges: TemplateGraphEdge[];
}

/** A node type used in a template, with how many times it appears. */
export interface TemplateNodeType {
  type: string;
  label: string;
  count: number;
}

export interface TemplateEntry extends PageEntry {
  slug: string;
  /** Human name, e.g. "Movie Posters". */
  name: string;
  /** The workflow's own description (may be empty). */
  summary: string;
  tags: string[];
  /** Hub grouping, e.g. "Image & Design". */
  category: string;
  nodeTypes: TemplateNodeType[];
  nodeCount: number;
  /** Public path to card art (`/templates/<slug>.jpg`) or null. */
  thumbnail: string | null;
  graph: TemplateGraph;
}

export { templateEntries } from "./templateEntries.generated";

/** Templates sharing the most tags with `entry`, best first. */
export function relatedTemplates(
  entry: TemplateEntry,
  all: TemplateEntry[],
  limit = 9,
): TemplateEntry[] {
  const tags = new Set(entry.tags);
  return all
    .filter((t) => t.slug !== entry.slug)
    .map((t) => ({
      t,
      score:
        t.tags.filter((tag) => tags.has(tag)).length +
        (t.category === entry.category ? 0.5 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name))
    .slice(0, limit)
    .map((x) => x.t);
}
