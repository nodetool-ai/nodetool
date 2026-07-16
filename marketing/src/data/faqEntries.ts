import type { PageEntry } from "./types";

/**
 * FAQ + light glossary, one source rendered on two surfaces.
 *
 * Each row is authored once here and shows up in three places:
 *   1. the `/faq` hub (grouped by category),
 *   2. its own standalone `/faq/<slug>` page (with `QAPage` JSON-LD), and
 *   3. as an inline FAQ block on landing / comparison / model pages — any page
 *      that renders `<FaqBlock surface="…" />` (see components/FaqBlock.tsx).
 *
 * The `surfaces` field is what wires a row onto those inline blocks. Glossary
 * terms ship here as the `glossary` category (What is BYOK / RAG / a node-based
 * workflow / a diffusion model) rather than duplicating the docs-site glossary
 * wholesale — that would create cross-domain duplicate content between
 * nodetool.ai and docs.nodetool.ai.
 */

export type FaqCategory =
  | "general"
  | "byok"
  | "editions"
  | "models"
  | "comparison"
  | "glossary";

/**
 * Named marketing surfaces an FAQ row can be pinned to. A page renders
 * `<FaqBlock surface="agents" />` and gets every row that lists `"agents"`.
 * `"models"` is consumed by PR-4's model pages; the rows are ready for it.
 */
export type FaqSurface = "agents" | "comparison" | "models";

export interface FaqEntry extends PageEntry {
  /** URL slug, e.g. "what-is-byok" → /faq/what-is-byok. */
  slug: string;
  /** The question, verbatim. Used as the <h1> and the JSON-LD question name. */
  question: string;
  /** The answer as Markdown (short paragraphs, links, emphasis). */
  answerMd: string;
  category: FaqCategory;
  /** A related route on the site, linked below the answer when set. */
  relatedRoute?: string;
  /** Inline surfaces this row also renders on (besides /faq). */
  surfaces: FaqSurface[];
}

const CATEGORY_ORDER: FaqCategory[] = [
  "general",
  "byok",
  "editions",
  "models",
  "comparison",
  "glossary",
];

export const FAQ_CATEGORY_LABELS: Record<FaqCategory, string> = {
  general: "About NodeTool",
  byok: "Keys & pricing",
  editions: "Studio & Cloud",
  models: "Models & providers",
  comparison: "How it compares",
  glossary: "Glossary",
};

type FaqSeed = Omit<
  FaqEntry,
  "route" | "title" | "description" | "priority" | "changeFrequency" | "indexable"
>;

/**
 * The authored rows. Page-level fields (route/title/description/…) are derived
 * below so each row is edited in one place.
 */
const seeds: FaqSeed[] = [
  {
    slug: "what-is-nodetool",
    question: "What is NodeTool?",
    answerMd:
      "NodeTool is the open creative AI workspace. Every major model from every major provider — FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, and more — wired into one node-based canvas you run on your own machine or in the browser. Image, video, music, and text live on the same canvas, alongside planning agents that run multi-step jobs.",
    category: "general",
    relatedRoute: "/",
    surfaces: ["agents", "comparison"],
  },
  {
    slug: "is-nodetool-open-source",
    question: "Is NodeTool open source?",
    answerMd:
      "Yes. The full codebase is **AGPL-3.0** on [GitHub](https://github.com/nodetool-ai/nodetool). Studio and Cloud share the same source — no closed-source layer, no \"pro\" tier hiding the good features. Self-host any time.",
    category: "general",
    relatedRoute: "/studio",
    surfaces: ["comparison"],
  },
  {
    slug: "what-is-byok",
    question: "What is BYOK, and what does it mean for me?",
    answerMd:
      "BYOK is **bring your own keys**. You connect your own provider accounts and pay each provider directly at their list price. NodeTool never marks up model calls, never issues proprietary credits, and never runs inference on its own servers. Your keys, your bill, your data.",
    category: "byok",
    relatedRoute: "/pricing",
    surfaces: ["agents", "comparison", "models"],
  },
  {
    slug: "does-nodetool-mark-up-model-pricing",
    question: "Does NodeTool mark up model pricing?",
    answerMd:
      "No. There are no credits and no markup. You bring your own API keys and pay each provider their list price directly. You can also run local models with Ollama, MLX, or llama.cpp in the desktop app for no per-call cost at all.",
    category: "byok",
    relatedRoute: "/pricing",
    surfaces: ["comparison", "models"],
  },
  {
    slug: "studio-or-cloud",
    question: "Studio or Cloud — which should I use?",
    answerMd:
      "Studio is the desktop app: free, open source, runs on your machine, and supports local models via MLX, Ollama, and GGUF. Cloud is the same workspace in the browser — zero setup, no GPU required, and your keys still go to providers directly. Same workflows either way.",
    category: "editions",
    relatedRoute: "/cloud",
    surfaces: [],
  },
  {
    slug: "which-models-are-supported",
    question: "Which models are supported?",
    answerMd:
      "Frontier models including Flux, Seedance, Wan, Veo, Kling, Hailuo, Qwen Image, Whisper, ElevenLabs, and Suno — called through providers like FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, and HuggingFace. Local inference runs via MLX, Ollama, llama.cpp, vLLM, and LM Studio.",
    category: "models",
    relatedRoute: "/studio",
    surfaces: ["agents", "models"],
  },
  {
    slug: "can-i-run-models-locally",
    question: "Can I run models locally?",
    answerMd:
      "Yes. NodeTool Studio runs open-weight models on your own hardware through MLX (Apple Silicon), Ollama, llama.cpp, vLLM, and LM Studio. Nothing leaves your machine unless you call a cloud provider yourself.",
    category: "models",
    relatedRoute: "/studio",
    surfaces: ["models"],
  },
  {
    slug: "how-is-nodetool-different-from-comfyui",
    question: "How is NodeTool different from ComfyUI?",
    answerMd:
      "ComfyUI is a node editor for diffusion models. NodeTool is the studio around it: image, video, music, and words on one canvas, every major model a click away, and editing tools — masks, inpaint, relight, layers — built in. Both are node-based and open source.",
    category: "comparison",
    relatedRoute: "/vs/comfyui",
    surfaces: ["comparison"],
  },
  {
    slug: "how-is-nodetool-different-from-closed-canvases",
    question:
      "How is NodeTool different from Weavy (now Figma Weave) and other closed canvases?",
    answerMd:
      "Closed canvases lock you into a credit system and a curated model roster. NodeTool is open source and BYOK. Your workflows, files, and keys belong to you, and you can switch providers the moment a better model ships.",
    category: "comparison",
    relatedRoute: "/vs/weavy",
    surfaces: ["comparison"],
  },
  {
    slug: "open-source-figma-weave-alternative",
    question: "Is there an open source alternative to Figma Weave?",
    answerMd:
      "Yes. Figma Weave (formerly Weavy, acquired by Figma in October 2025) is closed source, hosted-only, and billed in its own AI credits. NodeTool covers the same node-based media workflows as an **AGPL-3.0** open-source workspace: image, video, audio, and text on one canvas, BYOK at provider prices, running as a desktop app, in the browser, or self-hosted.",
    category: "comparison",
    relatedRoute: "/vs/figma-weave",
    surfaces: ["comparison"],
  },
  // --- Glossary (search-demand terms only; not a copy of the docs glossary) ---
  {
    slug: "what-is-a-node-based-workflow",
    question: "What is a node-based workflow?",
    answerMd:
      "A node-based workflow is a pipeline you build by connecting boxes (nodes) on a canvas instead of writing code. Each node does one thing — load an image, call a model, crop a video — and edges carry data from one node's output to the next node's input. The whole graph runs top to bottom, so you can see and rewire every step.",
    category: "glossary",
    relatedRoute: "/",
    surfaces: [],
  },
  {
    slug: "what-is-a-diffusion-model",
    question: "What is a diffusion model?",
    answerMd:
      "A diffusion model generates images (or video, or audio) by starting from random noise and removing it step by step until a coherent result emerges, guided by your prompt. Flux, Stable Diffusion, and most image generators are diffusion models. In NodeTool you run them as nodes alongside everything else.",
    category: "glossary",
    relatedRoute: "/creatives",
    surfaces: [],
  },
  {
    slug: "what-is-rag",
    question: "What is RAG (retrieval-augmented generation)?",
    answerMd:
      "RAG is **retrieval-augmented generation**: before a language model answers, it retrieves relevant chunks from your own documents and feeds them in as context, so the answer is grounded in your data instead of only the model's training. NodeTool has built-in vector search and document nodes to build RAG pipelines on the canvas.",
    category: "glossary",
    relatedRoute: "/developers",
    surfaces: [],
  },
  {
    slug: "what-is-a-planning-agent",
    question: "What is a planning agent?",
    answerMd:
      "A planning agent takes a goal, breaks it into steps, picks a model or tool for each step, and executes them in order — adjusting as it goes. In NodeTool an agent is a node on the canvas, so you can wire its output into the rest of your workflow.",
    category: "glossary",
    relatedRoute: "/agents",
    surfaces: ["agents"],
  },
];

const FAQ_BASE = "/faq";

function toPageEntry(seed: FaqSeed): FaqEntry {
  return {
    ...seed,
    route: `${FAQ_BASE}/${seed.slug}`,
    title: `${seed.question} — NodeTool`,
    // Meta description: first sentence-ish of the answer, stripped of Markdown.
    description: stripMarkdown(seed.answerMd).slice(0, 155),
    priority: 0.5,
    changeFrequency: "monthly",
    indexable: true,
  };
}

function stripMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every FAQ row, authored order preserved. */
export const faqEntries: FaqEntry[] = seeds.map(toPageEntry);

/** FAQ rows grouped by category, in display order (empty groups dropped). */
export const faqByCategory: { category: FaqCategory; label: string; items: FaqEntry[] }[] =
  CATEGORY_ORDER.map((category) => ({
    category,
    label: FAQ_CATEGORY_LABELS[category],
    items: faqEntries.filter((e) => e.category === category),
  })).filter((g) => g.items.length > 0);

export function getFaq(slug: string): FaqEntry | undefined {
  return faqEntries.find((e) => e.slug === slug);
}

/** Rows pinned to a given inline surface (landing, comparison, model pages). */
export function faqForSurface(surface: FaqSurface): FaqEntry[] {
  return faqEntries.filter((e) => e.surfaces.includes(surface));
}

/**
 * Page entries for the registry: the `/faq` hub plus every standalone
 * `/faq/<slug>` page.
 */
export const faqPageEntries: PageEntry[] = [
  {
    route: FAQ_BASE,
    title: "NodeTool FAQ — open creative AI workspace",
    description:
      "Answers about NodeTool: BYOK pricing, Studio vs Cloud, supported models, how it compares, and a short glossary.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
  },
  ...faqEntries.map(
    (e): PageEntry => ({
      route: e.route,
      title: e.title,
      description: e.description,
      priority: e.priority,
      changeFrequency: e.changeFrequency,
      indexable: e.indexable,
    })
  ),
];
