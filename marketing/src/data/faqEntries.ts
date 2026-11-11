import type { PageEntry } from "./types";

/**
 * FAQ + light glossary, one source rendered on two surfaces.
 *
 * Each row is authored once here and shows up in three places:
 *   1. the `/faq` hub (grouped by category),
 *   2. its own standalone `/faq/<slug>` page, and
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
  | "cloud"
  | "comparison"
  | "developers"
  | "models"
  | "pricing"
  | "studio";

export interface FaqEntry extends PageEntry {
  /** URL slug, e.g. "what-is-byok" → /faq/what-is-byok. */
  slug: string;
  /** The question, verbatim. Used as the <h1>. */
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
      "NodeTool is an open-source AI video editor with tools for images, audio, text and node workflows. Ask the agent to create or edit a project, then make changes yourself. Sign in with your ChatGPT or Claude plan, use your own provider keys, or run supported models locally.",
    category: "general",
    relatedRoute: "/",
    surfaces: ["landing", "comparison"],
  },
  {
    slug: "is-nodetool-open-source",
    question: "Is NodeTool open source?",
    answerMd:
      "Yes. NodeTool’s source is available under **AGPL-3.0** on [GitHub](https://github.com/nodetool-ai/nodetool). Studio and Cloud share the same source, and you can host NodeTool yourself.",
    category: "general",
    relatedRoute: "/studio",
    surfaces: ["comparison", "developers", "landing"],
  },
  {
    slug: "what-is-byok",
    question: "What does \"bring your own keys\" mean for me?",
    answerMd:
      "**BYOK** means you connect your own provider API keys. Requests go to those providers, and you pay them directly at their published rates. NodeTool adds no markup or credit system.",
    category: "byok",
    relatedRoute: "/pricing",
    surfaces: ["cloud", "comparison", "models", "pricing"],
  },
  {
    slug: "use-chatgpt-claude-gemini-subscription",
    question: "Can I use my ChatGPT, Claude, or Gemini subscription?",
    answerMd:
      "Yes, in Studio. Sign in with ChatGPT or Claude, and the agent runs on that subscription instead of an API key. With the [NodeTool Chrome extension](https://docs.nodetool.ai/chrome-extension), NodeTool also uses the ChatGPT or Gemini tab you are signed in to: ChatGPT generates images, and Gemini runs chat, images, and video. Those runs count against your plan's limits, so you get no pay-per-call bill for them. Every run shows up in your ChatGPT or Gemini history.",
    category: "byok",
    relatedRoute: "/pricing",
    surfaces: ["landing", "pricing"],
  },
  {
    slug: "how-much-does-nodetool-cost",
    question: "How much does NodeTool cost?",
    answerMd:
      "Studio is free and open source. Cloud is free during alpha; future Cloud pricing has not been announced. Provider API charges are separate, and subscription-based use counts against your plan’s limits. Local models use your hardware and electricity without a provider fee per call. See [pricing](/pricing) for details.",
    category: "byok",
    relatedRoute: "/pricing",
    surfaces: ["landing", "pricing", "comparison"],
  },
  {
    slug: "does-nodetool-mark-up-model-pricing",
    question: "Does NodeTool mark up model pricing?",
    answerMd:
      "No. When you connect your own API keys, you pay the provider directly at its published rates. NodeTool adds no markup.",
    category: "byok",
    relatedRoute: "/pricing",
    surfaces: ["comparison", "models", "pricing"],
  },
  {
    slug: "studio-or-cloud",
    question: "Studio or Cloud — which should I use?",
    answerMd:
      "Choose **Studio** for ongoing work: it saves projects on your computer and supports online providers and local models on macOS, Windows and Linux. Choose **Cloud** to try NodeTool in your browser without installing it. Cloud is in alpha, and project transfer between editions is not yet complete. Check that the files and features you need transfer correctly.",
    category: "editions",
    relatedRoute: "/cloud",
    surfaces: ["cloud", "pricing", "studio"],
  },
  {
    slug: "is-nodetool-local-first",
    question: "Is NodeTool local-first and private?",
    answerMd:
      "NodeTool Studio stores the workspace, workflows, files, and configured credentials on your machine. Supported open-weight models can run locally through MLX, Ollama, llama.cpp, vLLM, and LM Studio. When you call a hosted model, the request leaves your machine for that provider. Cloud uses hosted project storage; review the current [privacy policy](/privacy) and [terms](/terms) before using sensitive material.",
    category: "general",
    relatedRoute: "/studio",
    surfaces: ["cloud", "landing", "comparison", "studio"],
  },
  {
    slug: "which-models-are-supported",
    question: "Which models are supported?",
    answerMd:
      "The leading models, including Flux, Seedance, Wan, Veo, Kling, Hailuo, Qwen Image, Whisper, ElevenLabs, and Suno, reached through providers such as FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, and HuggingFace. Models can also run on your own computer through MLX, Ollama, llama.cpp, vLLM, and LM Studio.",
    category: "models",
    relatedRoute: "/studio",
    surfaces: ["landing", "models"],
  },
  {
    slug: "can-i-run-models-locally",
    question: "Can I run models locally?",
    answerMd:
      "Yes. Studio supports local models through Ollama, MLX (Apple Silicon), llama.cpp, vLLM and LM Studio. Model availability and speed depend on your hardware. Local model requests run on your computer; online providers still receive any requests you send to them.",
    category: "models",
    relatedRoute: "/studio",
    surfaces: ["models", "pricing"],
  },
  {
    slug: "how-is-nodetool-different-from-comfyui",
    question: "How is NodeTool different from ComfyUI?",
    answerMd:
      "ComfyUI is a node editor for image and video generation. NodeTool is the studio around it: image, video, music, and words on one canvas, every major model a click away, and editing tools such as masks, inpaint, relight, and layers built in. Both are open source and both work by connecting blocks on a canvas.",
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
      "A node workflow connects steps such as loading an image, running a model and cropping a video. Connections pass results between steps. You can inspect outputs, change settings and run the workflow again with new inputs.",
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
      "The agent edits the same projects you open in NodeTool, including storyboards, timelines and workflows. You can inspect its tool calls, results and errors, then take over yourself. External coding agents can also use NodeTool through **MCP**.",
    category: "general",
    relatedRoute: "/agents",
    surfaces: ["landing", "agents"],
  },
  {
    slug: "use-nodetool-from-claude-code",
    question: "Can I use NodeTool from Claude Code, Codex, or Cursor?",
    answerMd:
      "Yes. NodeTool runs as an MCP server. Run `npx -y --package=@nodetool-ai/cli-mcp nodetool-mcp install` and restart the agent. The command registers NodeTool with Claude Code, Codex, and OpenCode, and `nodetool-mcp config` prints a config block for Cursor, Claude Desktop, and other clients. The agent gets workflows, image, video, and audio generation, and your asset library as tools. Studio is optional. When Studio runs, the agent's changes appear in the open editor.",
    category: "general",
    relatedRoute: "/developers",
    surfaces: ["developers"],
  },
  {
    slug: "what-is-a-creative-harness",
    question: "What is a creative harness?",
    answerMd:
      "A creative harness gives an AI agent tools, editors, model access and a record of its actions. NodeTool provides these to its built-in agent and coding agents connected through **MCP**. Their work is saved as projects and workflows you can edit.",
    category: "general",
    relatedRoute: "/agents",
    surfaces: ["agents"],
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
      "No. Studio can use hosted providers, where the model runs on the provider's hardware. A GPU matters only when you choose to run supported open-weight models on your computer. The requirement then depends on the model and runtime; smaller models may run on CPU at lower speed.",
    category: "models",
    relatedRoute: "/solutions/local-first",
    surfaces: ["developers", "landing", "models", "studio"],
  },
  {
    slug: "what-should-i-expect-from-cloud-alpha",
    question: "What should I expect from the Cloud alpha?",
    answerMd:
      "Cloud is an early version for trying NodeTool in a browser. Features, storage and availability may change, and project transfer is not yet complete. Use Studio for client work. Check the [Cloud page](/cloud) and [terms](/terms) before relying on a feature.",
    category: "editions",
    relatedRoute: "/cloud",
    surfaces: ["cloud"],
  },
  {
    slug: "where-does-cloud-store-projects",
    question: "Where does Cloud store my projects?",
    answerMd:
      "Cloud uses hosted project storage. The current [privacy policy](/privacy) and [terms](/terms) are the source for retention and access rules. If material must remain on your device, use Studio and avoid remote providers for the affected steps.",
    category: "editions",
    relatedRoute: "/cloud",
    surfaces: ["cloud"],
  },
  {
    slug: "does-studio-work-offline",
    question: "Does Studio work without an internet connection?",
    answerMd:
      "Studio can keep working without a network when the project uses local files and supported local models already installed on the machine. Remote providers, model downloads, online documentation, and other hosted services still require a connection.",
    category: "editions",
    relatedRoute: "/studio",
    surfaces: ["studio"],
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

/** Short homepage answers link to the full FAQ entries. */
const HOMEPAGE_FAQ_COPY: Record<string, { question: string; answerMd: string }> = {
  "how-much-does-nodetool-cost": {
    question: "How much does NodeTool cost?",
    answerMd: "Studio is free and open source. Cloud is free during alpha, with future pricing still unannounced. Provider API charges are separate, and subscription use counts against your plan’s limits. [Pricing details](/pricing).",
  },
  "studio-or-cloud": {
    question: "Studio or Cloud — which should I use?",
    answerMd: "Choose Studio to save projects on your computer and use online or local models. Choose Cloud to try NodeTool in your browser without installing it. Cloud is in alpha, and project transfer between editions is not yet complete. [Compare Studio and Cloud](/faq#editions-title).",
  },
  "do-i-need-a-gpu": {
    question: "Do I need a powerful computer?",
    answerMd: "No dedicated GPU is needed when you use online AI providers. Running models locally depends on the model and your hardware. [Local model setup](/solutions/local-first).",
  },
  "use-chatgpt-claude-gemini-subscription": {
    question: "Which accounts can I use?",
    answerMd: "In Studio, connect supported provider API keys or use supported ChatGPT, Claude and Gemini sign-in options. Available features and setup differ by provider, and provider charges or plan limits apply. [Accounts and pricing](/pricing).",
  },
  "what-does-agent-first-mean": {
    question: "Can I edit what the agent creates?",
    answerMd: "Yes. The agent works in the same storyboards, timelines and workflows you can open yourself. Change a shot, trim a clip or adjust a node, then continue with or without the agent. [How the agent works](/agents).",
  },
};
const homepageFaq = seeds
  .filter((entry) => entry.slug in HOMEPAGE_FAQ_COPY)
  .map((entry) => toPageEntry({ ...entry, ...HOMEPAGE_FAQ_COPY[entry.slug] }));

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
  return surface === "landing"
    ? homepageFaq
    : faqEntries.filter((e) => e.surfaces.includes(surface));
}

/**
 * Page entries for the registry: the `/faq` hub plus every standalone
 * `/faq/<slug>` page.
 */
export const faqPageEntries: PageEntry[] = [
  {
    route: FAQ_BASE,
    title: "NodeTool FAQ — agent-first creative workspace",
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
