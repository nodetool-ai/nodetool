/**
 * Landing-matrix page-data (PR-6). Each entry drives one `/solutions/<slug>`
 * page: a swappable hero + a featured template embed (the graph rendered from
 * that template's JSON via WorkflowGraphFromJson) + shared body sections.
 *
 * Two kinds share the same shape:
 *  - `use-case` — a concrete outcome ("make a music video")
 *  - `persona`  — an audience ("local-first", "researchers")
 *
 * Existing hand-built pages under `/use-cases/*` stay reachable; this matrix is
 * the data-driven layer that grows without a new folder per page. A landing
 * entry extends PR-1's `PageEntry`, so it folds into the sitemap and smoke walk
 * with no special-casing (see registry.ts).
 */
import type { OgAccent } from "@/lib/og";
import type { PageEntry } from "./types";
import { templateEntries, type TemplateEntry } from "./templates";

export type LandingKind = "use-case" | "persona";

/** A shared body section to render under the hero, in order. */
export type LandingSection = "features" | "use-cases";

export interface LandingEntry extends PageEntry {
  slug: string;
  kind: LandingKind;
  /** Chip label above the H1, e.g. "Use case" or "For researchers". */
  eyebrow: string;
  /** H1 text. */
  headline: string;
  /** Hero paragraph. */
  subhead: string;
  /** Slug of the template whose graph is embedded as the featured workflow. */
  featuredTemplate: string;
  /** Hero value bullets. */
  highlights: string[];
  /** Which shared body components to render, in order. */
  sections: LandingSection[];
  /** FAQ pairs — emitted as FAQPage JSON-LD and rendered on the page. */
  faqs: { q: string; a: string }[];
  accent: OgAccent;
}

const BASE = "https://nodetool.ai";
const title = (headline: string) => `${headline} — NodeTool`;

export const landingEntries: LandingEntry[] = [
  // ---- Use cases (first wave — the former "coming soon" set) ----
  {
    route: "/solutions/music-video",
    title: title("AI Music Video Generator"),
    description:
      "Turn a track into a synced music video. NodeTool storyboards scenes, renders key art, and animates each shot to the beat — on one open canvas with your own keys.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
    slug: "music-video",
    kind: "use-case",
    eyebrow: "Use case",
    headline: "AI Music Video Generator",
    subhead:
      "Drop in a track and a concept. An agent breaks the song into scenes, renders each as key art, and animates them into a cut that moves with the music.",
    featuredTemplate: "music-video-visualizer",
    highlights: [
      "Beat-aware scene breakdown from one prompt",
      "Key art per scene, then animated to video",
      "Swap any image or video model for your own look",
    ],
    sections: ["features"],
    faqs: [
      {
        q: "Can I use my own song?",
        a: "Yes. Feed any audio file into the workflow. The graph reads the track and drives the scene breakdown and pacing from it.",
      },
      {
        q: "Which models does it use?",
        a: "It defaults to a text-to-image model for key art and an image-to-video model for motion, but every node is swappable — bring your own keys and pick any provider.",
      },
      {
        q: "Do I need to code?",
        a: "No. Open the template in NodeTool Studio, connect your keys, and run it. Rewire nodes on the canvas to change the look.",
      },
    ],
    accent: "violet",
  },
  {
    route: "/solutions/social-content",
    title: title("AI Social Media Content Generator"),
    description:
      "Fill a content calendar in one run. NodeTool plans posts, writes copy, and renders matching visuals for every slot — batched on one canvas with your own keys.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
    slug: "social-content",
    kind: "use-case",
    eyebrow: "Use case",
    headline: "AI Social Media Content Generator",
    subhead:
      "Describe a campaign and a cadence. An agent plans the calendar, a list generator writes each post, and matching visuals render for every slot.",
    featuredTemplate: "social-media-calendar-filler",
    highlights: [
      "A full calendar of posts from one brief",
      "Copy and visuals generated together, on-brand",
      "Export the batch or wire it into your scheduler",
    ],
    sections: ["features", "use-cases"],
    faqs: [
      {
        q: "How many posts can it make at once?",
        a: "The list generator fans out to as many posts as you ask for — the graph batches each one through the same copy and image nodes.",
      },
      {
        q: "Can I keep it on-brand?",
        a: "Yes. Set the brand voice and visual style in the prompt nodes once, and every post in the batch inherits it.",
      },
      {
        q: "Where do the assets go?",
        a: "Preview them on the canvas, then export the batch. You bring your own model keys and pay providers directly.",
      },
    ],
    accent: "cyan",
  },
  {
    route: "/solutions/youtube-thumbnails",
    title: title("AI YouTube Thumbnail Generator"),
    description:
      "Generate click-worthy YouTube thumbnails from a title. NodeTool drafts concepts, renders variants, and composes text — all on one open canvas with your own keys.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
    slug: "youtube-thumbnails",
    kind: "use-case",
    eyebrow: "Use case",
    headline: "AI YouTube Thumbnail Generator",
    subhead:
      "Give it a video title and a hook. The canvas drafts thumbnail concepts, renders a batch of variants, and lays in the text so you can pick a winner.",
    featuredTemplate: "youtube-thumbnail-pipeline",
    highlights: [
      "A batch of thumbnail variants per title",
      "Concept, key art, and text composed in one pass",
      "A/B a few looks without opening an image editor",
    ],
    sections: ["features"],
    faqs: [
      {
        q: "Can it match my channel's style?",
        a: "Yes — describe the style in the prompt node, or feed a reference image, and the batch follows it.",
      },
      {
        q: "How many variants do I get?",
        a: "As many as you set on the batch node. Render a handful, compare them on the canvas, and export the best.",
      },
      {
        q: "Is it free?",
        a: "NodeTool Studio is free and open source. You bring your own image-model key and pay that provider directly.",
      },
    ],
    accent: "rose",
  },
  {
    route: "/solutions/photo-restoration",
    title: title("AI Photo Restoration & Enhancement"),
    description:
      "Restore and enhance photos with AI. NodeTool denoises, sharpens, upscales, and color-corrects in one workflow — on your own machine with your own keys.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
    slug: "photo-restoration",
    kind: "use-case",
    eyebrow: "Use case",
    headline: "AI Photo Restoration & Enhancement",
    subhead:
      "Bring old or low-quality photos back to life. The workflow denoises, sharpens, upscales, and color-corrects in one pass you can tune node by node.",
    featuredTemplate: "photo-enhancement-suite",
    highlights: [
      "Denoise, sharpen, upscale, and correct in one graph",
      "Batch a whole folder of images at once",
      "Run it locally — your photos never leave your machine",
    ],
    sections: ["features"],
    faqs: [
      {
        q: "Can I process a whole folder?",
        a: "Yes. Point the workflow at a folder and it runs every image through the same enhancement chain.",
      },
      {
        q: "Do my photos leave my computer?",
        a: "Not unless you choose a cloud model. NodeTool Studio runs locally, so you can keep the whole pipeline on your own hardware.",
      },
      {
        q: "Can I control how strong the enhancement is?",
        a: "Every step is a node with its own settings — dial the denoise, sharpen, and upscale strength independently.",
      },
    ],
    accent: "emerald",
  },

  // ---- Personas (first wave — the two missing audiences) ----
  {
    route: "/solutions/local-first",
    title: title("Local-First AI Workflows"),
    description:
      "Run AI workflows entirely on your own hardware. NodeTool Studio executes open-weight models locally — no account, no data leaving your machine, no per-token bill.",
    priority: 0.7,
    changeFrequency: "monthly",
    indexable: true,
    slug: "local-first",
    kind: "persona",
    eyebrow: "For local-first builders",
    headline: "Local-First AI Workflows",
    subhead:
      "Your models, your machine, your data. NodeTool Studio runs open-weight image, video, audio, and LLM workflows locally — no account to start, nothing sent to a server you don't control.",
    featuredTemplate: "image-enhance",
    highlights: [
      "Open-weight models on Apple Silicon, NVIDIA, or CPU",
      "No account required, nothing phones home",
      "Add cloud APIs only when you want them — BYOK",
    ],
    sections: ["features", "use-cases"],
    faqs: [
      {
        q: "Does NodeTool work fully offline?",
        a: "Yes for local models. Download the weights once and run image, audio, and LLM workflows with no network. Cloud providers are opt-in per node.",
      },
      {
        q: "What hardware do I need?",
        a: "NodeTool Studio runs on Apple Silicon, NVIDIA GPUs, or CPU. Heavier models want a GPU; many text and audio workflows run comfortably on a laptop.",
      },
      {
        q: "Where is my data stored?",
        a: "On your machine. Assets, workflows, and keys stay local unless you deliberately call a cloud model or deploy to your own server.",
      },
    ],
    accent: "emerald",
  },
  {
    route: "/solutions/researchers",
    title: title("AI Workflows for Researchers"),
    description:
      "Automate literature review and research synthesis. NodeTool fetches papers, summarizes findings, and builds structured outputs — a visual, reproducible pipeline you own.",
    priority: 0.7,
    changeFrequency: "monthly",
    indexable: true,
    slug: "researchers",
    kind: "persona",
    eyebrow: "For researchers",
    headline: "AI Workflows for Researchers",
    subhead:
      "Turn a stack of papers into structured findings. Fetch sources, summarize with an agent, and extract structured data — a pipeline you can inspect, rerun, and share.",
    featuredTemplate: "research-paper-summarizer",
    highlights: [
      "Fetch and summarize papers in one reproducible graph",
      "Structured extraction into tables you can query",
      "Local models for private data, cloud for scale — your call",
    ],
    sections: ["features"],
    faqs: [
      {
        q: "Can I keep sensitive data private?",
        a: "Yes. Run the summarization and extraction on local models so nothing leaves your machine, and add cloud providers only where you want them.",
      },
      {
        q: "Is the pipeline reproducible?",
        a: "The whole workflow is an explicit graph you can save, version, and rerun — every step is visible, not hidden behind a prompt.",
      },
      {
        q: "Can it handle many papers at once?",
        a: "The list and batch nodes fan out over as many sources as you feed in, running each through the same summarize-and-extract chain.",
      },
    ],
    accent: "blue",
  },
];

/** Hub entry for the `/solutions` index — kept in the registry too. */
export const solutionsHubEntry: PageEntry = {
  route: "/solutions",
  title: "AI Workflow Solutions — NodeTool",
  description:
    "Outcome and audience landing pages for NodeTool: music video, social content, photo restoration, local-first, researchers, and more — each with a runnable workflow.",
  priority: 0.7,
  changeFrequency: "weekly",
  indexable: true,
};

/** Everything this engine contributes to the registry (hub first). */
export const solutionRegistryEntries: PageEntry[] = [
  solutionsHubEntry,
  ...landingEntries,
];

export function getLanding(slug: string): LandingEntry | undefined {
  return landingEntries.find((e) => e.slug === slug);
}

export function featuredTemplateFor(entry: LandingEntry): TemplateEntry | undefined {
  return templateEntries.find((t) => t.slug === entry.featuredTemplate);
}

export function landingCanonical(entry: LandingEntry): string {
  return `${BASE}${entry.route}`;
}
