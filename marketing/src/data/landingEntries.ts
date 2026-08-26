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

interface LandingEntry extends PageEntry {
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
      "Drop in a track and a concept. The agent breaks the song into scenes, renders each as key art, and cuts them to the beat on a timeline you can still edit.",
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
      "Pitch a campaign and a cadence. The agent plans the calendar, writes each post, and renders matching visuals for every slot.",
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
      "Give it a video title and a hook. The agent drafts thumbnail concepts, renders a batch of variants, and lays in the text so you can pick a winner.",
    featuredTemplate: "hook-and-thumbnail-factory",
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
      "Your models, your machine, your data. NodeTool Studio runs image, video, audio, and text workflows on your own computer using open models. There is no account to create and nothing is sent to a server you do not control.",
    featuredTemplate: "image-enhance",
    highlights: [
      "Open-weight models on Apple Silicon, NVIDIA, or CPU",
      "No account required, nothing phones home",
      "Add cloud providers only when you want them, using your own keys",
    ],
    sections: ["features", "use-cases"],
    faqs: [
      {
        q: "Does NodeTool work fully offline?",
        a: "Yes, with local models. Download them once and run image, audio, and text workflows with no internet connection. Cloud providers are only used where you choose to add them.",
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
  {
    route: "/solutions/privacy-first",
    title: title("Privacy-First AI Workflow Builder"),
    description:
      "Keep your data on your own machine. NodeTool Studio runs image, video, audio, and text workflows on local models with no account and nothing sent to a third-party server unless you choose to.",
    priority: 0.7,
    changeFrequency: "monthly",
    indexable: true,
    slug: "privacy-first",
    kind: "persona",
    eyebrow: "For privacy-first teams",
    headline: "Privacy-First AI Workflow Builder",
    subhead:
      "Cloud AI tools send your prompts, files, and outputs through someone else's server by default. NodeTool Studio runs entirely on your own hardware with open-weight models — nothing leaves your machine unless you explicitly wire in a cloud provider.",
    featuredTemplate: "image-enhance",
    highlights: [
      "Local models by default — no data ever leaves your machine",
      "No account, no telemetry, no server NodeTool controls",
      "Cloud providers are opt-in per node, on your own keys",
    ],
    sections: ["features", "use-cases"],
    faqs: [
      {
        q: "Does any of my data leave my machine?",
        a: "Not with local models. NodeTool Studio runs open-weight models on your own hardware, and assets, workflows, and keys stay on disk. Data only leaves when you deliberately wire a node to a cloud provider.",
      },
      {
        q: "How is this different from cloud-only AI tools?",
        a: "Most AI canvases route every prompt and file through their own servers before you see a result. NodeTool has no server in that path by default — the graph executes locally, and a cloud call happens only where you add one.",
      },
      {
        q: "Can I mix local and cloud models in one workflow?",
        a: "Yes. Run the sensitive steps on local models and send only the parts you choose to a cloud provider, node by node, in the same graph.",
      },
    ],
    accent: "emerald",
  },
  {
    route: "/solutions/self-hosted",
    title: title("Self-Hosted AI Workflows"),
    description:
      "Run NodeTool on your own server with Docker. Full control over data, uptime, and cost — no vendor lock-in and no per-seat SaaS bill.",
    priority: 0.7,
    changeFrequency: "monthly",
    indexable: true,
    slug: "self-hosted",
    kind: "persona",
    eyebrow: "For self-hosters",
    headline: "Self-Hosted AI Workflows",
    subhead:
      "Deploy NodeTool on infrastructure you own. The same open-source app that runs on your laptop starts from one `docker-compose.yml`, so a team can run workflows, models, and data behind its own firewall instead of a SaaS vendor's.",
    featuredTemplate: "chat-with-your-documents",
    highlights: [
      "One Docker Compose file to stand up your own server",
      "Your database, your storage, your uptime — no vendor lock-in",
      "AGPL-3.0 open source, so nothing is held back for a paid tier",
    ],
    sections: ["features", "use-cases"],
    faqs: [
      {
        q: "How do I self-host NodeTool?",
        a: "Run it with the reference `docker-compose.yml` in the repository, or the `packages/deploy` tooling for more control. It's the same open-source app you'd run on the desktop, pointed at your own storage and database.",
      },
      {
        q: "Do I still bring my own model keys when self-hosting?",
        a: "Yes. Self-hosting NodeTool controls where the app and your data live; you still connect your own provider keys, or run local/open-weight models on the host's own hardware.",
      },
      {
        q: "Why self-host instead of using a SaaS workflow tool?",
        a: "You own the data, the uptime, and the deployment. There is no per-seat bill, no vendor deciding what changes next, and the same AGPL-3.0 source runs whether it's on your laptop or your server.",
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
