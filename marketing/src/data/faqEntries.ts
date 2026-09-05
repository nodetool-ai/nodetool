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
 * terms ship here as the `glossary` category (node-based workflow, diffusion
 * model, RAG, planning agent) rather than duplicating the docs-site glossary
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
 *
 * A row pinned to a surface is *rendered* there, which is what lets the block
 * emit `FAQPage` schema for it: the schema only ever repeats visible text.
 */
export type FaqSurface =
  | "landing"
  | "agents"
  | "comparison"
  | "models"
  | "pricing";

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
      "NodeTool is the open AI production studio. You direct the vision and the agent builds the film: it drafts the script, boards every scene, generates the footage, and cuts a multi-track timeline you can still edit. Every major model from every major provider, including FAL, KIE, OpenAI, Anthropic, Gemini, and Replicate, sits on one visual canvas that you run on your own machine or in the browser.",
    category: "general",
    relatedRoute: "/",
    surfaces: ["landing", "agents", "comparison"],
  },
  {
    slug: "is-nodetool-open-source",
    question: "Is NodeTool open source?",
    answerMd:
      "Yes. The whole project is **AGPL-3.0** on [GitHub](https://github.com/nodetool-ai/nodetool). Studio and Cloud are built from the same source, and nothing is held back for a paid tier. You can host it yourself at any time.",
    category: "general",
    relatedRoute: "/studio",
    surfaces: ["landing", "comparison"],
  },
  {
    slug: "what-is-byok",
    question: "What does \"bring your own keys\" mean for me?",
    answerMd:
      "It means you connect your own provider accounts and pay each provider directly at their list price. NodeTool never adds a markup, never sells its own credits, and never runs models on its own servers. Your keys, your bill, your data. You will sometimes see this written as **BYOK**.",
    category: "byok",
    relatedRoute: "/pricing",
    surfaces: ["agents", "comparison", "models", "pricing"],
  },
  {
    slug: "how-much-does-nodetool-cost",
    question: "How much does NodeTool cost?",
    answerMd:
      "NodeTool Studio, the desktop app, is free and open source. NodeTool Cloud is free while it is in alpha. At full release a subscription covers hosting, at a price announced before anyone is charged. In both editions you bring your own API keys and pay each provider their list price directly, so what a run costs is whatever the provider charges for it. Local models through Ollama, MLX, or llama.cpp cost nothing per call.",
    category: "byok",
    relatedRoute: "/pricing",
    surfaces: ["landing", "pricing", "comparison"],
  },
  {
    slug: "does-nodetool-mark-up-model-pricing",
    question: "Does NodeTool mark up model pricing?",
    answerMd:
      "No. There are no credits and no markup. You bring your own API keys and pay each provider their list price directly. You can also run local models with Ollama, MLX, or llama.cpp in the desktop app for no per-call cost at all.",
    category: "byok",
    relatedRoute: "/pricing",
    surfaces: ["comparison", "models", "pricing"],
  },
  {
    slug: "studio-or-cloud",
    question: "Studio or Cloud — which should I use?",
    answerMd:
      "Studio, unless you cannot install software. Studio is the desktop app: free, open source, running on your machine, with local models through MLX, Ollama, and GGUF, and it is the finished edition — the one to use for work you are being paid for. Cloud is the same workspace in the browser, with nothing to install and no graphics card needed, and your keys still go straight to the providers. It is in alpha, so expect breaking changes and occasional downtime. The workflows are the same either way and move between the two.",
    category: "editions",
    relatedRoute: "/cloud",
    surfaces: ["pricing"],
  },
  {
    slug: "is-nodetool-local-first",
    question: "Is NodeTool local-first and private?",
    answerMd:
      "NodeTool Studio runs on your own machine: the workspace, your workflows, your files, and your API keys stay there, and open-weight models can run locally through MLX, Ollama, llama.cpp, vLLM, and LM Studio. When you call a hosted model, that request goes from your machine straight to the provider you chose, on your key — it does not pass through NodeTool servers. Cloud is the same open-source app hosted in the browser, and your keys still call the providers directly.",
    category: "general",
    relatedRoute: "/studio",
    surfaces: ["landing", "comparison"],
  },
  {
    slug: "which-models-are-supported",
    question: "Which models are supported?",
    answerMd:
      "The leading models, including Flux, Seedance, Wan, Veo, Kling, Hailuo, Qwen Image, Whisper, ElevenLabs, and Suno, reached through providers such as FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, and HuggingFace. Models can also run on your own computer through MLX, Ollama, llama.cpp, vLLM, and LM Studio.",
    category: "models",
    relatedRoute: "/studio",
    surfaces: ["landing", "agents", "models"],
  },
  {
    slug: "can-i-run-models-locally",
    question: "Can I run models locally?",
    answerMd:
      "Yes. NodeTool Studio runs open-weight models on your own hardware through MLX (Apple Silicon), Ollama, llama.cpp, vLLM, and LM Studio. Nothing leaves your machine unless you call a cloud provider yourself.",
    category: "models",
    relatedRoute: "/studio",
    surfaces: ["models", "pricing"],
  },
  {
    slug: "how-is-nodetool-different-from-comfyui",
    question: "How is NodeTool different from ComfyUI?",
    answerMd:
      "ComfyUI is an editor for image models. NodeTool is the studio around it: image, video, music, and words on one canvas, every major model a click away, and editing tools such as masks, inpaint, relight, and layers built in. Both are open source and both work by connecting blocks on a canvas.",
    category: "comparison",
    relatedRoute: "/alternatives/comfyui",
    surfaces: ["comparison"],
  },
  {
    slug: "how-is-nodetool-different-from-closed-canvases",
    question:
      "How is NodeTool different from Weavy (now Figma Weave) and other closed canvases?",
    answerMd:
      "Closed tools tie you to a credit system and a hand-picked list of models. NodeTool is open source and runs on your own provider keys. Your workflows, files, and keys belong to you, and you can switch providers the moment a better model appears.",
    category: "comparison",
    relatedRoute: "/alternatives/weavy",
    surfaces: ["comparison"],
  },
  {
    slug: "how-is-nodetool-different-from-n8n-and-flowise",
    question: "How is NodeTool different from n8n or Flowise?",
    answerMd:
      "n8n connects business apps and Flowise builds chatbots that answer from your documents; in both, generating an image, a video, or a soundtrack means an HTTP node you configure by hand. NodeTool makes that work native: image, video, music, and text models, agents, and editing tools on one canvas, with an agent that can author the pipeline. NodeTool is **AGPL-3.0** open source rather than fair-code, runs as a desktop app, and calls every provider on your own keys.",
    category: "comparison",
    relatedRoute: "/alternatives/n8n",
    surfaces: ["comparison"],
  },
  {
    slug: "open-source-figma-weave-alternative",
    question: "Is there an open source alternative to Figma Weave?",
    answerMd:
      "Yes. Figma Weave (formerly Weavy, acquired by Figma in October 2025) is closed source, hosted only, and billed in its own AI credits. NodeTool covers the same kind of media work as an **AGPL-3.0** open-source workspace: image, video, audio, and text on one canvas, run with your own keys at provider prices, as a desktop app, in the browser, or on your own server.",
    category: "comparison",
    relatedRoute: "/alternatives/figma-weave",
    surfaces: ["comparison"],
  },
  // --- Glossary (search-demand terms only; not a copy of the docs glossary) ---
  {
    slug: "what-is-a-node-based-workflow",
    question: "What is a node-based workflow?",
    answerMd:
      "A node-based workflow is one you build by connecting boxes on a canvas instead of writing code. Each box does one thing, such as loading an image, running a model, or cropping a video, and the lines between them carry the result of one step into the next. The whole thing runs from start to finish, so you can watch every step and rearrange it whenever you like.",
    category: "glossary",
    relatedRoute: "/",
    surfaces: [],
  },
  {
    slug: "what-is-a-diffusion-model",
    question: "What is a diffusion model?",
    answerMd:
      "A diffusion model makes an image, video, or sound by starting from random noise and clearing it away step by step, guided by your prompt, until a clear result appears. Flux, Stable Diffusion, and most image generators work this way. In NodeTool you run them as blocks alongside everything else.",
    category: "glossary",
    relatedRoute: "/studio",
    surfaces: [],
  },
  {
    slug: "what-is-rag",
    question: "How can a model answer from my own documents?",
    answerMd:
      "Before the model answers, NodeTool searches your documents and passes the most relevant passages along with your question, so the answer comes from your material rather than the model's general training. The search and document blocks are built in, so you can put this together on the canvas. The technique is often called **RAG**, short for retrieval-augmented generation.",
    category: "glossary",
    relatedRoute: "/developers",
    surfaces: [],
  },
  {
    slug: "what-does-agent-first-mean",
    question: "What does it mean that NodeTool is agent-first?",
    answerMd:
      "Every editor in NodeTool — the node canvas, sketch pad, storyboard, video timeline, script editor, 3D scene, and app builder — is exposed to agents as tools, around 120 in all. An agent doesn't describe what you could do; it builds the workflow, runs it, and repairs what fails, on the same surfaces you use. The same tools are exposed over **MCP**, so outside agents such as Claude Desktop and Claude Code can drive NodeTool too.",
    category: "general",
    relatedRoute: "/agents",
    surfaces: ["landing", "agents"],
  },
  {
    slug: "what-is-a-planning-agent",
    question: "What is a planning agent?",
    answerMd:
      "A planning agent takes a goal, breaks it into steps, picks a model or tool for each step, and works through them in order, adjusting as it goes. In NodeTool an agent is a block on the canvas, so its results feed into the rest of your workflow.",
    category: "glossary",
    relatedRoute: "/agents",
    surfaces: ["agents"],
  },
  {
    slug: "do-i-need-a-gpu",
    question: "Do I need a GPU to run NodeTool?",
    answerMd:
      "No. NodeTool works entirely with cloud providers — bring your own API key, and the model runs on the provider's hardware with nothing to install locally. A GPU only matters if you choose to run open-weight models yourself through Ollama, MLX, or llama.cpp: it speeds those up, but many smaller local models run fine on CPU too, just slower.",
    category: "models",
    relatedRoute: "/solutions/local-first",
    surfaces: ["landing", "models"],
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
      "Answers about NodeTool: pricing with your own keys, Studio compared with Cloud, supported models, comparisons, and a short glossary.",
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
