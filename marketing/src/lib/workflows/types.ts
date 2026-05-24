/**
 * Workflow marketplace types.
 *
 * Each workflow becomes a static page at /workflows/[slug] with
 * full SEO metadata, a ReactFlow preview, demo video, and JSON-LD
 * HowTo structured data so it can be surfaced in Google overviews,
 * Perplexity GEO results, and social previews.
 */

export type WorkflowCategory =
  | "image"
  | "video"
  | "audio"
  | "agents"
  | "rag"
  | "social";

export type NodeHue =
  | "sky"
  | "teal"
  | "emerald"
  | "amber"
  | "rose"
  | "blue"
  | "violet"
  | "orange";

export interface PreviewNode {
  id: string;
  /** Position in a 0..100 normalized space; ReactFlow places it at x*scale, y*scale. */
  x: number;
  y: number;
  title: string;
  /** Short label under the title (e.g. provider/model). */
  subtitle?: string;
  /** Icon name from lucide-react. */
  icon: string;
  hue: NodeHue;
  /** Optional badge text (e.g. "FAL", "Anthropic"). */
  badge?: string;
}

export interface PreviewEdge {
  source: string;
  target: string;
  /** Animated edges look alive on the marketing site. */
  animated?: boolean;
  /** Optional human label rendered on the edge. */
  label?: string;
}

export interface WorkflowStep {
  title: string;
  detail: string;
}

export interface WorkflowMarketplaceEntry {
  slug: string;
  title: string;
  /** One-liner used on the card and as social/meta description prefix. */
  tagline: string;
  /** 2-3 sentences for the detail page hero and meta description. */
  description: string;
  category: WorkflowCategory;
  /** Searchable / filterable tags. */
  tags: string[];
  /** Models the workflow uses; rendered as chips, fed into structured data. */
  models: string[];
  /** Providers (FAL, OpenAI, ElevenLabs, …) — chips + GEO keywords. */
  providers: string[];
  /** Estimated end-to-end runtime, e.g. "~40s". */
  runtime: string;
  /** "Beginner" | "Intermediate" | "Advanced". */
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  /** Demo video. Either a YouTube ID or an MP4 URL. */
  video?:
    | { kind: "youtube"; id: string; poster?: string }
    | { kind: "mp4"; src: string; poster?: string };
  /** Hero image / OpenGraph card. Path under /public. */
  ogImage?: string;
  /** Outcomes the workflow produces — feeds bullets + HowTo schema steps. */
  steps: WorkflowStep[];
  /** Marketing-friendly use cases. */
  useCases: string[];
  /** ReactFlow preview graph. */
  preview: {
    nodes: PreviewNode[];
    edges: PreviewEdge[];
  };
  /** Optional published date for sitemap lastmod / Article schema. */
  published?: string;
}
