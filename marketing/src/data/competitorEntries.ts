import type { PageEntry } from "./types";
import { yearToken } from "./types";
import type { OgAccent } from "../lib/og";

/**
 * Comparison page-data contract, consumed by the `/vs/*` and `/alternatives/*`
 * routes (PR-5). One competitor record drives two templates: the head-to-head
 * `/vs/<slug>` page (hero, at-a-glance cards, feature table, explainer, CTA)
 * and the listicle-style `/alternatives/<slug>` page (limitation intro, a short
 * tool list, the same feature table, and a visible FAQ).
 *
 * The six original competitors (comfyui, weavy, langflow, n8n, flowise, dify)
 * are transcribed verbatim from the hand-built pages they replaced — content
 * parity was the review bar. The first-wave additions (`isNew`) are drafted
 * from the same pattern and carry at least one honest concession row.
 */

/** Page accent — full literal Tailwind fragments so the JIT compiler keeps them. */
export type CompetitorTheme =
  | "blue"
  | "violet"
  | "amber"
  | "cyan"
  | "emerald"
  | "rose";

type ThemeSpec = {
  /** Eyebrow chip color classes (border/bg/text). */
  chip: string;
  /** Background glow blobs. */
  glowA: string;
  glowB: string;
  /** CTA button color classes. */
  button: string;
};

export const THEMES: Record<CompetitorTheme, ThemeSpec> = {
  blue: {
    chip: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    glowA: "bg-blue-500/15",
    glowB: "bg-fuchsia-500/10",
    button: "bg-blue-600 hover:bg-blue-500 shadow-blue-900/40",
  },
  violet: {
    chip: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    glowA: "bg-violet-500/15",
    glowB: "bg-cyan-500/10",
    button: "bg-violet-600 hover:bg-violet-500 shadow-violet-900/40",
  },
  amber: {
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    glowA: "bg-amber-500/15",
    glowB: "bg-rose-500/10",
    button: "bg-amber-600 hover:bg-amber-500 shadow-amber-900/40",
  },
  cyan: {
    chip: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    glowA: "bg-cyan-500/15",
    glowB: "bg-blue-500/10",
    button: "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/40",
  },
  emerald: {
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    glowA: "bg-emerald-500/15",
    glowB: "bg-cyan-500/10",
    button: "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40",
  },
  rose: {
    chip: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    glowA: "bg-rose-500/15",
    glowB: "bg-fuchsia-500/10",
    button: "bg-rose-600 hover:bg-rose-500 shadow-rose-900/40",
  },
};

/** A single feature-table row. String cells render as text; booleans as ✓ / –. */
export type FeatureRow = {
  label: string;
  competitor: string | boolean;
  nodetool: string | boolean;
};

export type FaqItem = { question: string; answer: string };

export type Competitor = {
  slug: string;
  /** Display name, e.g. "ComfyUI". */
  name: string;
  theme: CompetitorTheme;
  /** Grouping label used by the alternatives template, e.g. "Node editor". */
  category: string;

  // --- /vs metadata ---
  vsTitle: string;
  vsDescription: string;
  vsOgTitle: string;
  vsOgDescription: string;
  og: { image: string; accent: OgAccent; subtitle: string };

  // --- /vs hero ---
  heroHeading: string;
  heroParagraph: string;

  // --- at-a-glance cards ---
  competitorTagline: string;
  competitorBullets: string[];
  /** "negative" renders the competitor bullets with a minus icon (lock-in framing). */
  competitorBulletTone?: "neutral" | "negative";
  nodetoolTagline: string;
  nodetoolBullets: string[];

  // --- feature table ---
  rows: FeatureRow[];

  // --- explainer ---
  explainerHeading: string;
  explainerParagraph: string;

  // --- closing CTA ---
  ctaHeading: string;
  ctaParagraph: string;

  // --- FAQ (JSON-LD on /vs, rendered on /alternatives) ---
  faq: FaqItem[];

  // --- /alternatives template ---
  /** One-line reason people go looking for an alternative. */
  limitation: string;

  /** First-wave addition (drives footer curation and index gating). */
  isNew?: boolean;
};

export const competitors: Competitor[] = [
  {
    slug: "comfyui",
    name: "ComfyUI",
    theme: "blue",
    category: "Node editor",
    vsTitle: "NodeTool vs ComfyUI — the open creative AI workspace",
    vsDescription:
      "ComfyUI is an engineer-first node editor for Stable Diffusion. NodeTool is the studio around it: image, video, music, and text on one node-based canvas, a far wider model roster across providers, and built-in editing tools — all BYOK at provider prices. Both are open source.",
    vsOgTitle: "NodeTool vs ComfyUI — the open creative AI workspace",
    vsOgDescription:
      "Beyond diffusion images: NodeTool puts image, video, audio, and text on one node-based canvas with editing tools built in. Open source, BYOK, provider prices.",
    og: {
      image: "screen_canvas.png",
      accent: "blue",
      subtitle:
        "The studio around the node editor — every modality, every provider.",
    },
    heroHeading: "The open creative AI workspace, not just a diffusion editor.",
    heroParagraph:
      "ComfyUI is a node editor for Stable Diffusion, built with an engineer-first UX. NodeTool is the studio around it: image, video, music, and words on one canvas, a far wider model roster, and the editing tools creatives reach for — called with your own keys at provider prices. Both are node-based and open source.",
    competitorTagline: "Node editor for diffusion images",
    competitorBullets: [
      "Deep control over Stable Diffusion pipelines",
      "Engineer-first, graph-based UX",
      "Local model focused",
      "Open source community",
    ],
    nodetoolTagline: "The studio around the canvas",
    nodetoolBullets: [
      "Image, video, audio, and text on one canvas",
      "Every major model from every major provider",
      "Editing tools: masks, inpaint, relight, layers",
      "BYOK at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Modalities", competitor: "Diffusion images", nodetool: "Image, video, audio, text" },
      { label: "Model roster", competitor: "Stable Diffusion / diffusion", nodetool: "Every major provider & modality" },
      { label: "BYOK / provider billing", competitor: false, nodetool: true },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Local models", competitor: true, nodetool: true },
      { label: "Desktop + browser", competitor: false, nodetool: true },
      { label: "Open source", competitor: true, nodetool: true },
    ],
    explainerHeading: "One canvas for everything, not just images",
    explainerParagraph:
      "If your work starts and ends with Stable Diffusion images, ComfyUI gives you fine-grained control. But most creative projects span modalities — image into video, voice and music into a cut, words into everything. NodeTool keeps all of it on one node-based canvas with masks, inpaint, outpaint, relight, upscale, layers, and compositing built in. You call every major model with your own keys at provider prices, and run locally via Ollama, MLX, and llama.cpp.",
    ctaHeading: "Open, multimodal, and yours.",
    ctaParagraph:
      "Download Studio and build across image, video, audio, and text in one place.",
    faq: [
      {
        question: "What is the difference between NodeTool and ComfyUI?",
        answer:
          "ComfyUI is a node editor focused on Stable Diffusion and diffusion image generation with an engineer-first UX. NodeTool is the studio around it: image, video, music, and text on one node-based canvas, a much wider model roster across providers and modalities, and editing tools creatives actually use — called with your own keys at provider prices. Both are node-based and open source.",
      },
      {
        question: "Is NodeTool open source like ComfyUI?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0. You can run it as a desktop app on macOS, Windows, or Linux, or in the browser via NodeTool Cloud, which is managed hosting of the same open-source code.",
      },
      {
        question: "Can NodeTool do more than image generation?",
        answer:
          "Yes. NodeTool works across image, video, audio, and text on one canvas, with editing tools built in — masks, inpaint, outpaint, relight, upscale, layers, and compositing. ComfyUI is centered on diffusion image generation.",
      },
      {
        question: "How does NodeTool handle model pricing?",
        answer:
          "NodeTool is BYOK — you bring your own API keys and pay each provider their list price. There are no credits, no markup, and no curated roster. You can also run local models with Ollama, MLX, or llama.cpp in the desktop app.",
      },
    ],
    limitation:
      "ComfyUI is centered on Stable Diffusion, so anything past diffusion images — video, audio, agents — means leaving the graph.",
  },
  {
    slug: "weavy",
    name: "Weavy",
    theme: "blue",
    category: "Creative canvas",
    vsTitle: "NodeTool vs Weavy — open source, BYOK, no credits",
    vsDescription:
      "Weavy and similar closed SaaS canvases lock you into credits and a curated model roster. NodeTool is open source (AGPL-3.0) and BYOK: every provider, your keys, provider prices, and you own your workflows and files. Cloud is just managed hosting of the same self-hostable code.",
    vsOgTitle: "NodeTool vs Weavy — open source, BYOK, no credits",
    vsOgDescription:
      "No credits, no curated roster, no lock-in. NodeTool is open source and BYOK: every provider at provider prices, with workflows and files you own.",
    og: {
      image: "screen_canvas.png",
      accent: "violet",
      subtitle: "Open source and BYOK — no credits, no curated roster, no lock-in.",
    },
    heroHeading: "Open source and BYOK. No credits, no lock-in.",
    heroParagraph:
      "Weavy and similar closed SaaS canvases lock you into a credit system and a curated model roster. NodeTool is open source and BYOK: every provider, your keys, provider prices, and you own your workflows and files. Cloud is just managed hosting of the same open-source code you can self-host.",
    competitorTagline: "Closed SaaS canvas",
    competitorBullets: [
      "Credit system you top up and burn",
      "Curated roster of supported models",
      "Closed source, hosted only",
      "Work lives on their platform",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · BYOK",
    nodetoolBullets: [
      "BYOK — pay providers directly at list prices",
      "Every major model from every major provider",
      "Open source under AGPL-3.0, self-hostable",
      "You own your workflows and files",
    ],
    rows: [
      { label: "Pricing model", competitor: "Credits", nodetool: "BYOK / provider prices" },
      { label: "Model roster", competitor: "Curated roster", nodetool: "Every provider" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Self-host", competitor: false, nodetool: true },
      { label: "Data ownership", competitor: false, nodetool: true },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "Pay providers, not credits — and keep your work",
    explainerParagraph:
      "Credit systems and curated rosters decide which models you can use and what each call costs. NodeTool flips that: you add your own API keys and pay each provider their published list price. The whole workspace is open source under AGPL-3.0, so you can run it as a desktop app or self-host it, and your workflows and files stay yours. NodeTool Cloud is managed hosting of the same code.",
    ctaHeading: "Own your canvas.",
    ctaParagraph:
      "Download Studio and build with every provider, at provider prices.",
    faq: [
      {
        question: "How is NodeTool different from Weavy?",
        answer:
          "Weavy and similar closed SaaS canvases lock you into a credit system and a curated model roster. NodeTool is open source and BYOK: every provider, your keys, provider prices, and you own your workflows and files. NodeTool Cloud is just managed hosting of the same open-source code you can self-host.",
      },
      {
        question: "Does NodeTool use credits?",
        answer:
          "No. NodeTool is BYOK — you bring your own API keys and pay each provider their list price directly. There are no credits, no markup, and no curated roster of models.",
      },
      {
        question: "Can I self-host NodeTool?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0. You can run it as a desktop app on macOS, Windows, or Linux, or self-host the same code that powers NodeTool Cloud.",
      },
      {
        question: "Who owns my workflows and files in NodeTool?",
        answer:
          "You do. In the desktop app your workflows and files stay on your machine. NodeTool does not lock your work behind a proprietary platform — the code is open source and self-hostable.",
      },
    ],
    limitation:
      "Weavy is a closed, hosted canvas billed in credits — you can't self-host it, and your work lives on their platform.",
  },
  {
    slug: "langflow",
    name: "Langflow",
    theme: "blue",
    category: "LLM app builder",
    vsTitle: "NodeTool vs Langflow — agents plus native media generation",
    vsDescription:
      "Langflow is a low-code builder for LLM apps: chatbots, RAG, agents. NodeTool covers the same agent and RAG ground and adds what Langflow leaves to external APIs: native image, video, and music generation with editing tools on the same canvas — open source, BYOK, local models included.",
    vsOgTitle: "NodeTool vs Langflow — agents plus native media generation",
    vsOgDescription:
      "Both build agents and RAG pipelines. Only one renders image, video, and music natively on the same canvas. Open source, BYOK, local models.",
    og: {
      image: "screen_workflow.png",
      accent: "emerald",
      subtitle: "Agents plus native image, video, and music generation — on one canvas.",
    },
    heroHeading: "Agents that ship media, not just messages.",
    heroParagraph:
      "Langflow is a low-code builder for LLM apps — chatbots, RAG, agents — rooted in Python and LangChain. NodeTool covers that same ground and adds what Langflow leaves to external APIs: native image, video, and music generation with editing tools on the same canvas. Open source, BYOK at provider prices, local models included.",
    competitorTagline: "Low-code builder for LLM apps",
    competitorBullets: [
      "Visual flows for chatbots, RAG, and agents",
      "Python-extensible, LangChain ecosystem",
      "Open source (MIT), self-hostable",
      "Text and LLM pipelines first",
    ],
    nodetoolTagline: "Agents plus native generation",
    nodetoolBullets: [
      "Agents, RAG, and chat on the same canvas",
      "Native image, video, and music generation nodes",
      "Editing tools: masks, inpaint, relight, layers",
      "BYOK at provider prices — local models via Ollama, MLX, llama.cpp",
    ],
    rows: [
      { label: "Focus", competitor: "LLM apps: chat, RAG, agents", nodetool: "Agents + image, video, audio, text" },
      { label: "Native media generation (image, video, music)", competitor: "Via external APIs", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Agents & RAG", competitor: true, nodetool: true },
      { label: "Local models", competitor: "LLMs via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "BYOK / provider billing", competitor: true, nodetool: true },
      { label: "Open source", competitor: "MIT", nodetool: "AGPL-3.0" },
      { label: "Desktop app", competitor: "macOS, Windows", nodetool: "macOS, Windows, Linux" },
    ],
    explainerHeading: "The pipeline and the picture, on one canvas",
    explainerParagraph:
      "If your project ends at a chatbot or a RAG pipeline, Langflow is a solid choice — visual flows, Python extensibility, a mature LangChain ecosystem. But the moment an agent needs to produce something you can look at or listen to — a storyboard, a product video, a soundtrack — Langflow hands you an API key form and a blank HTTP node. NodeTool keeps going: generation nodes for image, video, and music from every major provider sit on the same canvas as your agents and retrieval, with masks, inpaint, relight, upscale, and layers built in. You bring your own keys and pay provider list prices — no credits, no markup — and run local models via Ollama, MLX, and llama.cpp on the desktop.",
    ctaHeading: "Build agents that make things.",
    ctaParagraph:
      "Download Studio and put generation on the same canvas as your agents.",
    faq: [
      {
        question: "What is the difference between NodeTool and Langflow?",
        answer:
          "Langflow is a low-code visual builder for LLM applications — chatbots, RAG pipelines, and agents — rooted in the Python and LangChain ecosystem. NodeTool covers the same agent and RAG ground but treats media as a first-class output: image, video, and music generation run as native nodes on the same canvas, with editing tools like masks, inpaint, and layers built in. Both are open source and self-hostable.",
      },
      {
        question: "Can Langflow generate images and video?",
        answer:
          "Langflow is built for text and LLM workloads; generating media means wiring up external APIs yourself. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools — masks, inpaint, outpaint, relight, upscale, layers, and compositing.",
      },
      {
        question: "Is NodeTool open source like Langflow?",
        answer:
          "Yes. Langflow is MIT-licensed; NodeTool is open source under AGPL-3.0. Both can be self-hosted. NodeTool also ships as a desktop app for macOS, Windows, and Linux, and NodeTool Cloud is managed hosting of the same open-source code.",
      },
      {
        question: "Can I run local models in NodeTool?",
        answer:
          "Yes. NodeTool runs local models via Ollama, MLX, and llama.cpp in the desktop app, and connects to every major cloud provider BYOK — your keys, provider list prices, no credits or markup.",
      },
    ],
    limitation:
      "Langflow is text-first: generating image, video, or audio means wiring up external APIs by hand.",
  },
  {
    slug: "n8n",
    name: "n8n",
    theme: "blue",
    category: "Workflow automation",
    vsTitle: "NodeTool vs n8n — when the workflow creates, not just connects",
    vsDescription:
      "n8n moves data between hundreds of business apps. NodeTool is built for workflows where the AI work is the point: native image, video, and music generation, agents, and editing tools on one canvas — open source under AGPL-3.0 (not fair-code), BYOK at provider prices, with a desktop app and local models.",
    vsOgTitle: "NodeTool vs n8n — when the workflow creates, not just connects",
    vsOgDescription:
      "n8n connects apps. NodeTool generates — image, video, music, and agents on one canvas. Open source (AGPL-3.0), BYOK, desktop app, local models.",
    og: {
      image: "screen_canvas.png",
      accent: "cyan",
      subtitle: "Workflows that create, not just connect — native generation and agents.",
    },
    heroHeading: "Workflows that create, not just connect.",
    heroParagraph:
      "n8n moves data between hundreds of business apps — schedules, retries, branching. NodeTool is built for workflows where the AI work is the point: native image, video, and music generation, agents, and editing tools on one canvas. Open source under AGPL-3.0, BYOK at provider prices, with a desktop app and local models.",
    competitorTagline: "Workflow automation platform",
    competitorBullets: [
      "400+ integrations for business apps",
      "Orchestration: schedules, retries, branching",
      "AI agent nodes built on LangChain",
      "Fair-code: source-available, commercially restricted",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Native image, video, and music generation nodes",
      "Agents and RAG on the same canvas as generation",
      "Open source under AGPL-3.0, desktop app included",
      "BYOK at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Focus", competitor: "App-to-app automation", nodetool: "AI generation + agents" },
      { label: "Native media generation (image, video, music)", competitor: "Via external APIs", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Business app connectors", competitor: "400+ integrations", nodetool: "AI-focused set" },
      { label: "License", competitor: "Sustainable Use (fair-code)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Local models", competitor: "LLMs via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "Pricing model", competitor: "Per-execution plans (cloud)", nodetool: "BYOK / provider prices" },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "Plumbing is solved. Production isn't.",
    explainerParagraph:
      "If the hard part of your workflow is moving records between Salesforce, Slack, and a spreadsheet on a schedule, n8n is built for exactly that. But when the workflow's output is the thing itself — a product video, a batch of campaign images, a soundtrack, an agent's research report — the generation can't live in a generic HTTP node. NodeTool makes it native: image, video, and music models from every major provider as first-class nodes, agents and retrieval on the same canvas, and editing tools — masks, inpaint, relight, upscale, layers — built in. It's open source under AGPL-3.0 rather than fair-code, runs as a desktop app on macOS, Windows, and Linux, and calls models with your own keys at provider list prices.",
    ctaHeading: "Make the workflow the studio.",
    ctaParagraph:
      "Download Studio and generate image, video, and music where your agents already work.",
    faq: [
      {
        question: "What is the difference between NodeTool and n8n?",
        answer:
          "n8n is a workflow automation platform: it moves data between hundreds of business apps, with AI agent nodes built on LangChain. NodeTool is built for workflows where the AI work is the point — native image, video, and music generation, agents, and media editing tools on one node-based canvas. If the job is connecting Salesforce to Slack on a schedule, use n8n. If the job is producing something with AI, use NodeTool.",
      },
      {
        question: "Is n8n open source?",
        answer:
          "n8n is fair-code under its Sustainable Use License: the source is available, but commercial use is restricted. NodeTool is open source under AGPL-3.0, an OSI-approved license — you can self-host it, modify it, and build on it, and NodeTool Cloud is managed hosting of the same code.",
      },
      {
        question: "Can n8n generate images or video?",
        answer:
          "Only by calling external APIs from generic HTTP or integration nodes. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools — masks, inpaint, outpaint, relight, upscale, layers, and compositing.",
      },
      {
        question: "When should I pick n8n instead of NodeTool?",
        answer:
          "When the hard part of your workflow is business-app plumbing: hundreds of connectors, schedules, retries, and branching between SaaS tools. That is what n8n is built for. NodeTool is the better fit when the workflow's output is AI-generated media or agent work, and you want local models, BYOK provider pricing, and a desktop app.",
      },
    ],
    limitation:
      "n8n is built for app-to-app plumbing; AI generation lands in a generic HTTP node, and it is fair-code, not open source.",
  },
  {
    slug: "flowise",
    name: "Flowise",
    theme: "violet",
    category: "LLM app builder",
    vsTitle: "NodeTool vs Flowise — RAG chatbots plus native media generation",
    vsDescription:
      "Flowise is the fastest drag-and-drop path to a LangChain-based RAG chatbot. NodeTool covers the same agent and retrieval ground, then adds native image, video, and music generation and editing tools on the same canvas — BYOK at provider prices, no hosted-credit tiers.",
    vsOgTitle: "NodeTool vs Flowise — RAG chatbots plus native media generation",
    vsOgDescription:
      "Flowise builds RAG chatbots fast. NodeTool builds the chatbot and the image, video, and music pipeline around it — one canvas, BYOK.",
    og: {
      image: "screen_workflow.png",
      accent: "violet",
      subtitle: "RAG chatbots plus native image, video, and music generation.",
    },
    heroHeading: "The chatbot, plus everything it needs to produce.",
    heroParagraph:
      "Flowise is the fastest drag-and-drop path to a LangChain RAG chatbot. NodeTool covers the same agent and retrieval ground, then adds native image, video, and music generation and editing tools on the same canvas — open source under AGPL-3.0, BYOK at provider prices, with a desktop app and local models.",
    competitorTagline: "Drag-and-drop LangChain builder",
    competitorBullets: [
      "Fastest path to a RAG chatbot",
      "Vector store and LangChain node library",
      "Source-available under Apache 2.0",
      "Hosted cloud sold on usage-based credits",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Agents, RAG, and native image/video/music generation",
      "Built-in editing tools — masks, inpaint, relight, layers",
      "Open source under AGPL-3.0, desktop app included",
      "BYOK at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Focus", competitor: "LangChain chatbots & RAG", nodetool: "AI generation + agents" },
      { label: "Native media generation (image, video, music)", competitor: "Via HTTP request nodes", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Vector store / RAG nodes", competitor: true, nodetool: true },
      { label: "License", competitor: "Apache 2.0 (source-available)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Local models", competitor: "LLMs via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "Pricing model", competitor: "Usage-based credits (cloud)", nodetool: "BYOK / provider prices" },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "A chatbot is often just the front door.",
    explainerParagraph:
      "Flowise is genuinely fast at what it's built for: wire a vector store, a retriever, and an LLM node into a working RAG chatbot in minutes. But the moment the workflow needs to produce something — a rendered image, a video cut, a voice line — that step lands in a generic HTTP node calling an external API by hand. In NodeTool, image, video, and music models from every major provider sit on the same canvas as the agent and retrieval nodes, with masks, inpaint, relight, upscale, and layers built in — every call on your own keys at list price, no credit tiers on top.",
    ctaHeading: "Build the chatbot. Ship the media too.",
    ctaParagraph:
      "Download Studio and put generation on the same canvas as your agents and retrieval.",
    faq: [
      {
        question: "What is the difference between NodeTool and Flowise?",
        answer:
          "Flowise is a drag-and-drop builder for LangChain-based LLM apps — its fastest path is a RAG chatbot backed by a vector store. NodeTool covers the same agent and retrieval ground, then adds native image, video, and music generation nodes, plus editing tools (masks, inpaint, relight, layers), on the same canvas. If the deliverable is a chatbot, Flowise gets there fastest. If the deliverable includes generated media, NodeTool is built for the whole pipeline.",
      },
      {
        question: "Is Flowise open source?",
        answer:
          "Flowise is source-available under the Apache 2.0 license, with a hosted Flowise Cloud sold on usage-based credit tiers. NodeTool is open source under AGPL-3.0 and BYOK: you connect your own provider keys and pay providers directly at their list prices, with no credit markup on either self-hosted or NodeTool Cloud usage.",
      },
      {
        question: "Can Flowise generate images or video?",
        answer:
          "Only by wiring a generic HTTP request node to an external API. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools, as first-class citizens on the same canvas as its agent and RAG nodes.",
      },
      {
        question: "When should I pick Flowise instead of NodeTool?",
        answer:
          "When the job is strictly a LangChain-flavored chatbot or assistant over a document set, and you want the fastest drag-and-drop path to that specific shape. NodeTool is the better fit once the workflow also needs to produce image, video, or audio, or you want a desktop app with local-model support and BYOK pricing across everything, not just the LLM calls.",
      },
    ],
    limitation:
      "Flowise nails the LangChain RAG chatbot, but generating media drops you into a raw HTTP node, and its cloud is billed in credits.",
  },
  {
    slug: "dify",
    name: "Dify",
    theme: "amber",
    category: "LLM app builder",
    vsTitle: "NodeTool vs Dify — an LLM app platform vs a media-generation canvas",
    vsDescription:
      "Dify is a strong LLM app platform: prompt orchestration, knowledge bases, and agent debugging for text-first products. NodeTool starts from the same agent and RAG ground, then puts native image, video, and music generation and editing tools on the same canvas — BYOK at provider prices, no vendor-hosted markup.",
    vsOgTitle: "NodeTool vs Dify — an LLM app platform vs a media-generation canvas",
    vsOgDescription:
      "Dify is built for text-first LLM apps. NodeTool adds native image, video, and music generation on the same canvas as agents and RAG — BYOK.",
    og: {
      image: "screen_llms.png",
      accent: "amber",
      subtitle: "Agents and RAG, plus native image, video, and music generation.",
    },
    heroHeading: "Text apps are the floor, not the ceiling.",
    heroParagraph:
      "Dify is a strong platform for text-first LLM apps — prompt orchestration, knowledge bases, agent debugging. NodeTool starts from the same agent and RAG ground, then puts native image, video, and music generation and editing tools on the same canvas — open source under AGPL-3.0, BYOK at provider prices, with a desktop app and local models.",
    competitorTagline: "LLM app development platform",
    competitorBullets: [
      "Prompt orchestration and app-store-style deployment",
      "Built-in knowledge bases and agent debugging",
      "Modified Apache 2.0 license with commercial limits",
      "Cloud sold on seat/usage plans",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Agents, RAG, and native image/video/music generation",
      "Built-in editing tools — masks, inpaint, relight, layers",
      "Open source under AGPL-3.0, desktop app included",
      "BYOK at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Focus", competitor: "Text-first LLM apps & knowledge bases", nodetool: "AI generation + agents" },
      { label: "Native media generation (image, video, music)", competitor: "Via tool/plugin calls", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Agent debugging & tracing", competitor: true, nodetool: true },
      { label: "License", competitor: "Modified Apache 2.0 (commercial limits)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Local models", competitor: "LLMs via self-hosted endpoints", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "Pricing model", competitor: "Seat/usage plans (cloud)", nodetool: "BYOK / provider prices" },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "Great for the chatbot. Not built for the render.",
    explainerParagraph:
      "Dify earns its reputation on debugging and knowledge-base tooling for text-first LLM apps — a support bot, an internal copilot, a document Q&A assistant. But when the deliverable includes a generated image, a video cut, or a synthesized voice line, that step has to leave the platform. NodeTool puts image, video, and music models from every major provider on the same canvas as its agent and retrieval nodes, with masks, inpaint, relight, upscale, and layers built in — every call on your own keys at list price.",
    ctaHeading: "Build past the chatbot.",
    ctaParagraph:
      "Download Studio and put generation on the same canvas as your agents and knowledge base.",
    faq: [
      {
        question: "What is the difference between NodeTool and Dify?",
        answer:
          "Dify is an LLM app development platform focused on prompt orchestration, knowledge bases, and agent debugging for text-first products like chatbots and copilots. NodeTool covers the same agent and RAG ground on a node-based canvas, then adds native image, video, and music generation and editing tools — masks, inpaint, relight, layers — as first-class nodes, so a workflow can produce media, not just text and structured output.",
      },
      {
        question: "Is Dify open source?",
        answer:
          "Dify's source is published under a modified Apache 2.0 license that adds commercial-use conditions above certain usage thresholds — check Dify's own license file for the current terms before relying on it for a commercial deployment. NodeTool is open source under AGPL-3.0, an OSI-approved license, and is fully BYOK on both self-hosted and NodeTool Cloud deployments.",
      },
      {
        question: "Can Dify generate images or video?",
        answer:
          "Dify can call image-generation APIs through its tool/plugin system, but it is not built around media generation the way it is built around text and RAG. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools, on the same canvas as its agent and knowledge-base nodes.",
      },
      {
        question: "When should I pick Dify instead of NodeTool?",
        answer:
          "When the product is a text-first LLM app — a support chatbot, an internal copilot, a knowledge-base assistant — and you want Dify's prompt-orchestration UI, built-in observability, and app-store-style deployment. NodeTool is the better fit when the workflow needs to produce image, video, or audio alongside the agent and RAG work, or when you want a desktop app with local-model support and BYOK pricing throughout.",
      },
    ],
    limitation:
      "Dify is built around text-first LLM apps; media generation happens through plugins, and its license adds commercial limits.",
  },

  // --- First wave of new competitors (drafted from the same pattern) ---
  {
    slug: "flora",
    name: "Flora",
    theme: "rose",
    category: "Creative canvas",
    isNew: true,
    vsTitle: "NodeTool vs Flora — an open canvas you own",
    vsDescription:
      "Flora is a polished, hosted infinite canvas for AI image and video, billed in credits. NodeTool is the open source, BYOK version of that idea: image, video, music, and text on one node-based canvas, every provider at list price, and workflows and files you keep. Both put creation on a canvas — only one is yours to self-host.",
    vsOgTitle: "NodeTool vs Flora — an open canvas you own",
    vsOgDescription:
      "Flora is a hosted, credit-based creative canvas. NodeTool is open source and BYOK — every provider at list price, workflows you own.",
    og: {
      image: "screen_canvas.png",
      accent: "rose",
      subtitle: "A creative AI canvas that's open source and BYOK — not credit-metered.",
    },
    heroHeading: "The creative canvas, open source and yours.",
    heroParagraph:
      "Flora is a beautifully designed hosted canvas for AI image and video, sold on credits. NodeTool is the open version of that idea: image, video, music, and text on one node-based canvas, every model called with your own keys at provider prices, and workflows and files you own and can self-host.",
    competitorTagline: "Hosted infinite canvas",
    competitorBullets: [
      "Polished, purpose-built creative canvas UX",
      "Curated image and video model selection",
      "Closed source, hosted only",
      "Billed in credits you top up",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · BYOK",
    nodetoolBullets: [
      "Image, video, audio, and text on one canvas",
      "Every major model from every major provider",
      "Open source under AGPL-3.0, self-hostable",
      "BYOK at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Design / onboarding polish", competitor: "Purpose-built creative UX", nodetool: "Node-based, power-user first" },
      { label: "Modalities", competitor: "Image, video", nodetool: "Image, video, audio, text" },
      { label: "Model roster", competitor: "Curated roster", nodetool: "Every major provider" },
      { label: "Pricing model", competitor: "Credits", nodetool: "BYOK / provider prices" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Self-host / data ownership", competitor: false, nodetool: true },
      { label: "Desktop app + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "A canvas you can take with you",
    explainerParagraph:
      "Flora is genuinely pleasant to use — the onboarding and the canvas feel designed, and for a quick hosted image or video it's fast to reach for. But it's closed and credit-metered: the model roster is curated, each render burns credits, and your work lives on their platform. NodeTool trades some of that turnkey polish for control — image, video, music, and text on one canvas, every provider at list price with your own keys, local models via Ollama, MLX, and llama.cpp, and the whole thing open source under AGPL-3.0 so you can self-host it and keep your files.",
    ctaHeading: "Create on a canvas you own.",
    ctaParagraph:
      "Download Studio and build across image, video, audio, and text — your keys, your files.",
    faq: [
      {
        question: "What is the difference between NodeTool and Flora?",
        answer:
          "Flora is a hosted, closed-source creative canvas for AI image and video, billed in credits. NodeTool is an open source (AGPL-3.0), BYOK node-based canvas that spans image, video, audio, and text, connects to every major provider at list price, and can be self-hosted or run as a desktop app with local models.",
      },
      {
        question: "Is NodeTool a free alternative to Flora?",
        answer:
          "NodeTool Studio is free to download and open source; you pay only the providers you call, at their list prices, using your own API keys. There are no credits or platform markup. You can also run local models for free on your own hardware.",
      },
      {
        question: "Can I self-host NodeTool instead of using a hosted canvas?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0 and self-hostable, and NodeTool Cloud is managed hosting of the same code. Your workflows and files stay yours either way.",
      },
    ],
    limitation:
      "Flora is a closed, credit-metered hosted canvas — you can't self-host it or bring your own keys.",
  },
  {
    slug: "krea",
    name: "Krea",
    theme: "cyan",
    category: "Creative canvas",
    isNew: true,
    vsTitle: "NodeTool vs Krea — real-time generation, or an open pipeline",
    vsDescription:
      "Krea is a hosted studio known for real-time image generation and enhancement, sold on subscription and credits. NodeTool is an open source, BYOK canvas for the whole pipeline: image, video, music, and text on one graph, every provider at list price, self-hostable. Krea is faster to a single instant render; NodeTool is built to compose, edit, and own the result.",
    vsOgTitle: "NodeTool vs Krea — real-time generation, or an open pipeline",
    vsOgDescription:
      "Krea shines at instant, real-time renders. NodeTool is the open, BYOK pipeline around them — image, video, music, and text on one canvas.",
    og: {
      image: "screen_canvas.png",
      accent: "cyan",
      subtitle: "An open, BYOK canvas for the whole pipeline — not just instant renders.",
    },
    heroHeading: "Instant renders, or the whole pipeline?",
    heroParagraph:
      "Krea is a hosted studio built around real-time image generation and enhancement, sold on subscription and credits. NodeTool is the open source, BYOK canvas around that: image, video, music, and text on one node-based graph, every model at provider prices, self-hostable, with editing built in.",
    competitorTagline: "Hosted real-time studio",
    competitorBullets: [
      "Real-time, instant image generation and enhance",
      "Slick hosted UX, no setup",
      "Closed source, subscription + credits",
      "Curated model selection",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · BYOK",
    nodetoolBullets: [
      "Image, video, audio, and text on one canvas",
      "Compose and edit — masks, inpaint, relight, layers",
      "Every major model from every major provider",
      "BYOK at provider prices — self-hostable, local models",
    ],
    rows: [
      { label: "Real-time / instant generation", competitor: "Built-in, real-time", nodetool: "Batch & workflow, not real-time" },
      { label: "Modalities", competitor: "Image, video", nodetool: "Image, video, audio, text" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: "Enhance / upscale", nodetool: "Full editing on canvas" },
      { label: "Model roster", competitor: "Curated roster", nodetool: "Every major provider" },
      { label: "Pricing model", competitor: "Subscription + credits", nodetool: "BYOK / provider prices" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Self-host + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "Speed at one step, or control across all of them",
    explainerParagraph:
      "Krea's real-time canvas is legitimately great: type or sketch and watch the image resolve instantly, then enhance and upscale — all hosted, nothing to install. If a fast, interactive single render is the job, Krea is hard to beat. NodeTool optimizes for the opposite end: composing multi-step pipelines that mix image, video, music, and text, editing on the same canvas with masks and layers, calling every provider with your own keys at list price, and running local models — open source and self-hostable so the whole pipeline is yours.",
    ctaHeading: "Own the whole pipeline.",
    ctaParagraph:
      "Download Studio and compose image, video, audio, and text on one open canvas.",
    faq: [
      {
        question: "What is the difference between NodeTool and Krea?",
        answer:
          "Krea is a hosted, closed-source studio built around real-time image generation and enhancement, sold on subscription and credits. NodeTool is an open source (AGPL-3.0), BYOK node-based canvas for multi-step pipelines across image, video, audio, and text, with editing tools built in, every major provider at list price, and self-hosting plus local models.",
      },
      {
        question: "Does NodeTool do real-time generation like Krea?",
        answer:
          "Not in the same instant, interactive way — Krea is purpose-built for real-time renders. NodeTool is built for composing and editing workflows: you wire up multi-step pipelines across modalities and run them, rather than watching a single image resolve live.",
      },
      {
        question: "Is NodeTool cheaper than Krea?",
        answer:
          "NodeTool is BYOK — you pay each provider their list price with your own keys, with no subscription or credit markup, and Studio itself is free and open source. Whether that's cheaper depends on your usage, but there's no platform margin on top of the model cost.",
      },
    ],
    limitation:
      "Krea is a closed, credit-based hosted studio focused on real-time renders — no self-hosting, no BYOK, and it's image/video only.",
  },
  {
    slug: "lm-studio",
    name: "LM Studio",
    theme: "emerald",
    category: "Local LLM runtime",
    isNew: true,
    vsTitle: "NodeTool vs LM Studio — local LLMs, plus everything after them",
    vsDescription:
      "LM Studio is an excellent desktop app for running local GGUF LLMs with a chat UI and an OpenAI-compatible local server. NodeTool runs local models too — via Ollama, MLX, and llama.cpp — but on a node-based canvas that also generates image, video, and music and builds agents and RAG. For pure local-LLM chat and serving, LM Studio is more specialized; for building workflows around those models, NodeTool is the canvas.",
    vsOgTitle: "NodeTool vs LM Studio — local LLMs, plus everything after them",
    vsOgDescription:
      "LM Studio runs local LLMs beautifully. NodeTool runs local models too, then builds image, video, music, agents, and RAG around them.",
    og: {
      image: "screen_llms.png",
      accent: "emerald",
      subtitle: "Run local models, then build the whole workflow around them.",
    },
    heroHeading: "Run local models — then build the workflow.",
    heroParagraph:
      "LM Studio is a superb desktop runtime for local GGUF LLMs: a clean chat UI, a great model browser, and an OpenAI-compatible local server. NodeTool runs local models too — via Ollama, MLX, and llama.cpp — but on a node-based canvas that also generates image, video, and music and builds agents and RAG around them.",
    competitorTagline: "Desktop local-LLM runtime",
    competitorBullets: [
      "Polished model browser and one-click local LLMs",
      "OpenAI-compatible local server",
      "Great chat UI for a single model",
      "Proprietary (free), text-LLM focused",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Local models via Ollama, MLX, and llama.cpp",
      "Plus native image, video, and music generation",
      "Agents, RAG, and multi-step workflows on one canvas",
      "Open source under AGPL-3.0, BYOK for cloud models",
    ],
    rows: [
      { label: "Local LLM chat & model browser", competitor: "Purpose-built, polished", nodetool: "Supported via Ollama/MLX/llama.cpp" },
      { label: "OpenAI-compatible local server", competitor: true, nodetool: "Via provider integrations" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Agents, RAG, multi-step workflows", competitor: false, nodetool: true },
      { label: "Cloud providers (BYOK)", competitor: false, nodetool: true },
      { label: "Source", competitor: "Proprietary (free)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Node-based canvas", competitor: false, nodetool: true },
    ],
    explainerHeading: "The runtime, and the workflow around it",
    explainerParagraph:
      "For downloading a local model and chatting with it, LM Studio is excellent — the model browser is the best in class, and the OpenAI-compatible server makes it easy to point other tools at a local endpoint. If that's the whole job, LM Studio is more specialized than NodeTool and a great pick. But once you want the model to do something in a pipeline — retrieve from your documents, drive an agent, feed a prompt into image or video generation — you need a canvas. NodeTool runs the same class of local models via Ollama, MLX, and llama.cpp and puts them next to native generation nodes, agents, and RAG, open source and BYOK for any cloud models you add.",
    ctaHeading: "From local chat to full workflow.",
    ctaParagraph:
      "Download Studio and put your local models on a canvas with generation, agents, and RAG.",
    faq: [
      {
        question: "What is the difference between NodeTool and LM Studio?",
        answer:
          "LM Studio is a desktop app specialized in running local GGUF LLMs — model browser, chat UI, and an OpenAI-compatible local server. NodeTool is an open source node-based canvas that also runs local models (via Ollama, MLX, and llama.cpp) and additionally generates image, video, and music and builds agents and RAG workflows around them.",
      },
      {
        question: "Should I use LM Studio or NodeTool for local models?",
        answer:
          "If you mainly want to download a local LLM and chat with it, or serve it over an OpenAI-compatible endpoint, LM Studio is the more specialized tool. If you want to build workflows around local (and cloud) models — retrieval, agents, media generation — NodeTool is the canvas for that.",
      },
      {
        question: "Is NodeTool open source?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0 and runs as a desktop app on macOS, Windows, and Linux. LM Studio is free but proprietary.",
      },
    ],
    limitation:
      "LM Studio is a specialized local-LLM runtime — no media generation, no agents or RAG workflows, and it's proprietary.",
  },
  {
    slug: "jan",
    name: "Jan",
    theme: "blue",
    category: "Local LLM runtime",
    isNew: true,
    vsTitle: "NodeTool vs Jan — an open local chat app vs an open AI canvas",
    vsDescription:
      "Jan is an open source, offline-first desktop app for chatting with local LLMs — a clean local ChatGPT alternative. NodeTool is open source too, but a node-based canvas: it runs local models and adds image, video, and music generation, agents, and RAG. Both are open and local-friendly; Jan is a focused chat app, NodeTool is the workflow builder around the models.",
    vsOgTitle: "NodeTool vs Jan — an open local chat app vs an open AI canvas",
    vsOgDescription:
      "Jan is an open, offline-first local chat app. NodeTool is an open node-based canvas — local models plus generation, agents, and RAG.",
    og: {
      image: "screen_chat.png",
      accent: "blue",
      subtitle: "Open and local-first — plus generation, agents, and RAG on one canvas.",
    },
    heroHeading: "Open and local — plus everything past chat.",
    heroParagraph:
      "Jan is an open source, offline-first desktop app for chatting with local LLMs — a clean, private local ChatGPT alternative. NodeTool is open source too, but a node-based canvas: it runs local models via Ollama, MLX, and llama.cpp and adds native image, video, and music generation, agents, and RAG on the same graph.",
    competitorTagline: "Open source local chat app",
    competitorBullets: [
      "Offline-first, private local LLM chat",
      "Clean local ChatGPT-style UI",
      "Open source and self-hostable",
      "Text and LLM chat focused",
    ],
    nodetoolTagline: "The open AI canvas",
    nodetoolBullets: [
      "Local models via Ollama, MLX, and llama.cpp",
      "Native image, video, and music generation",
      "Agents, RAG, and multi-step workflows on one canvas",
      "Open source under AGPL-3.0, BYOK for cloud models",
    ],
    rows: [
      { label: "Local LLM chat", competitor: "Purpose-built, offline-first", nodetool: "Supported, plus workflows" },
      { label: "Offline / privacy focus", competitor: "Offline-first by design", nodetool: "Local models supported" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Agents, RAG, multi-step workflows", competitor: false, nodetool: true },
      { label: "Cloud providers (BYOK)", competitor: "Optional", nodetool: "Every major provider" },
      { label: "Open source", competitor: true, nodetool: true },
      { label: "Node-based canvas", competitor: false, nodetool: true },
    ],
    explainerHeading: "A great chat app, or a whole canvas",
    explainerParagraph:
      "Jan does one thing well and openly: private, offline-first chat with local models, with a UI that feels like a local ChatGPT. If that's what you want, Jan is a lovely, focused choice and fully open source. NodeTool aims wider: it runs the same local models via Ollama, MLX, and llama.cpp, but puts them on a node-based canvas alongside native image, video, and music generation, agents, and RAG — so a local model can drive a whole workflow, not just a chat window. Both are open source; the difference is scope.",
    ctaHeading: "Take local models past the chat window.",
    ctaParagraph:
      "Download Studio and build workflows around your local and cloud models.",
    faq: [
      {
        question: "What is the difference between NodeTool and Jan?",
        answer:
          "Jan is an open source, offline-first desktop app focused on chatting with local LLMs. NodeTool is an open source (AGPL-3.0) node-based canvas that runs local models too, and additionally generates image, video, and music and builds agents and RAG workflows around them.",
      },
      {
        question: "Are both NodeTool and Jan open source?",
        answer:
          "Yes. Jan is open source and offline-first; NodeTool is open source under AGPL-3.0 and runs as a desktop app on macOS, Windows, and Linux with local-model support plus BYOK cloud providers.",
      },
      {
        question: "Can NodeTool run fully offline like Jan?",
        answer:
          "NodeTool can run local models via Ollama, MLX, and llama.cpp for offline LLM and media work. Cloud provider nodes need network access, but you choose which models are local and which are cloud.",
      },
    ],
    limitation:
      "Jan is a focused local chat app — no media generation and no multi-step agent or RAG workflows.",
  },
  {
    slug: "lindy",
    name: "Lindy",
    theme: "violet",
    category: "Agent automation",
    isNew: true,
    vsTitle: "NodeTool vs Lindy — business-ops agents vs an AI generation canvas",
    vsDescription:
      "Lindy is a hosted no-code platform for AI assistants that automate business operations — email, scheduling, CRM. NodeTool is an open source, BYOK canvas where the AI work is the output: native image, video, and music generation, agents, and RAG. Lindy is built for ops plumbing; NodeTool is built to produce media and run creative agent workflows.",
    vsOgTitle: "NodeTool vs Lindy — business-ops agents vs an AI generation canvas",
    vsOgDescription:
      "Lindy automates business ops with hosted agents. NodeTool is the open, BYOK canvas for AI generation, agents, and RAG.",
    og: {
      image: "screen_workflow.png",
      accent: "violet",
      subtitle: "When the agent's job is to create — image, video, music — not just plumb ops.",
    },
    heroHeading: "Agents that produce, not just operate.",
    heroParagraph:
      "Lindy is a polished hosted platform for no-code AI assistants that automate business operations — inbox, scheduling, CRM. NodeTool is an open source, BYOK canvas where the AI work is the deliverable: native image, video, and music generation, agents, and RAG on one node-based graph.",
    competitorTagline: "Hosted business-ops agents",
    competitorBullets: [
      "No-code assistants for ops automation",
      "Deep business-app integrations",
      "Hosted, closed source",
      "Billed in tasks/credits + seats",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Native image, video, and music generation",
      "Agents and RAG on the same canvas as generation",
      "Open source under AGPL-3.0, desktop app included",
      "BYOK at provider prices — local models supported",
    ],
    rows: [
      { label: "Focus", competitor: "Business-ops automation", nodetool: "AI generation + agents" },
      { label: "Business-app integrations", competitor: "Deep, prebuilt", nodetool: "AI-focused set" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0 (open source)" },
      { label: "Pricing model", competitor: "Tasks/credits + seats", nodetool: "BYOK / provider prices" },
      { label: "Desktop app + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "Ops plumbing, or creative production",
    explainerParagraph:
      "Lindy is strong where its integrations are strong: wiring an assistant into your inbox, calendar, and CRM to handle repetitive operations, all no-code and hosted. If the job is ops automation across business apps, that prebuilt depth is a real advantage. NodeTool is built for a different job — producing things with AI. Image, video, and music models sit on the same canvas as agents and RAG, with editing tools built in, every call BYOK at provider prices, and the whole workspace open source under AGPL-3.0 with local-model support and a desktop app.",
    ctaHeading: "Put creation on the canvas.",
    ctaParagraph:
      "Download Studio and build agents that generate image, video, and music.",
    faq: [
      {
        question: "What is the difference between NodeTool and Lindy?",
        answer:
          "Lindy is a hosted, closed-source no-code platform for AI assistants that automate business operations like email, scheduling, and CRM. NodeTool is an open source (AGPL-3.0), BYOK node-based canvas focused on AI generation — image, video, and music — plus agents and RAG, with a desktop app and local-model support.",
      },
      {
        question: "When should I pick Lindy instead of NodeTool?",
        answer:
          "When the job is automating business operations with deep prebuilt integrations into your inbox, calendar, and CRM. That's what Lindy is built for. NodeTool is the better fit when the workflow's output is AI-generated media or creative agent work.",
      },
      {
        question: "Is NodeTool open source and BYOK?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0 and BYOK — you connect your own provider keys and pay list prices, with no per-task credits or platform markup, and you can run local models on your own hardware.",
      },
    ],
    limitation:
      "Lindy is a closed, hosted ops-automation platform — no native media generation, and billed in tasks and seats.",
  },
  {
    slug: "gumloop",
    name: "Gumloop",
    theme: "amber",
    category: "Workflow automation",
    isNew: true,
    vsTitle: "NodeTool vs Gumloop — no-code ops automation vs an AI generation canvas",
    vsDescription:
      "Gumloop is a hosted no-code platform for AI-powered business automation, with prebuilt nodes and integrations. NodeTool is an open source, BYOK canvas where the AI work is the point: native image, video, and music generation, agents, and RAG. Gumloop automates business processes; NodeTool produces media and runs creative workflows you can self-host.",
    vsOgTitle: "NodeTool vs Gumloop — no-code ops automation vs an AI generation canvas",
    vsOgDescription:
      "Gumloop automates business processes, hosted and no-code. NodeTool is the open, BYOK canvas for AI generation, agents, and RAG.",
    og: {
      image: "screen_workflow.png",
      accent: "amber",
      subtitle: "When the workflow's output is generated media — not a business process.",
    },
    heroHeading: "Automation that generates, not just processes.",
    heroParagraph:
      "Gumloop is a hosted no-code platform for AI-powered business automation, with a deep library of prebuilt nodes and integrations. NodeTool is an open source, BYOK canvas built for the case where the AI work is the deliverable: native image, video, and music generation, agents, and RAG on one node-based graph.",
    competitorTagline: "Hosted no-code automation",
    competitorBullets: [
      "Prebuilt nodes for business automation",
      "Broad SaaS integrations",
      "Hosted, closed source",
      "Billed in credits + seats",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Native image, video, and music generation",
      "Agents and RAG on the same canvas as generation",
      "Open source under AGPL-3.0, desktop app included",
      "BYOK at provider prices — local models supported",
    ],
    rows: [
      { label: "Focus", competitor: "Business-process automation", nodetool: "AI generation + agents" },
      { label: "Prebuilt integrations", competitor: "Broad SaaS library", nodetool: "AI-focused set" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0 (open source)" },
      { label: "Pricing model", competitor: "Credits + seats", nodetool: "BYOK / provider prices" },
      { label: "Desktop app + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "Process automation, or media production",
    explainerParagraph:
      "Gumloop is good at what it's built for: no-code automation of business processes, with prebuilt nodes and broad SaaS integrations that get an ops workflow running fast and hosted. If that's the job, its integration library is a real edge. NodeTool is built to produce, not just process — image, video, and music models on the same canvas as agents and RAG, editing tools built in, every call BYOK at provider prices, and the whole workspace open source under AGPL-3.0 with local models and a desktop app.",
    ctaHeading: "Automate the creation itself.",
    ctaParagraph:
      "Download Studio and build workflows that generate image, video, and music.",
    faq: [
      {
        question: "What is the difference between NodeTool and Gumloop?",
        answer:
          "Gumloop is a hosted, closed-source no-code platform for AI-powered business-process automation with prebuilt nodes and SaaS integrations. NodeTool is an open source (AGPL-3.0), BYOK node-based canvas focused on AI generation — image, video, and music — plus agents and RAG, with a desktop app and local-model support.",
      },
      {
        question: "When should I pick Gumloop instead of NodeTool?",
        answer:
          "When the job is automating a business process across SaaS tools with prebuilt, no-code integrations. That's Gumloop's strength. NodeTool is the better fit when the workflow's output is AI-generated media or creative agent work you want to own and self-host.",
      },
      {
        question: "Is NodeTool open source and self-hostable?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0, self-hostable, and BYOK — you pay providers directly at list prices with no credits or platform markup, and you can run local models on your own hardware.",
      },
    ],
    limitation:
      "Gumloop is a closed, hosted process-automation platform — no native media generation, and billed in credits and seats.",
  },
];

/** Look up a competitor by slug. */
export function getCompetitor(slug: string): Competitor | undefined {
  return competitors.find((c) => c.slug === slug);
}

/**
 * Sibling comparison links for the in-content ComparisonMesh — every competitor
 * except the current one, so each page links 11 siblings (≥ 8 required). Same
 * category first, so the most relevant comparisons lead.
 */
export function siblings(slug: string): Competitor[] {
  const current = getCompetitor(slug);
  const others = competitors.filter((c) => c.slug !== slug);
  if (!current) return others;
  return [...others].sort((a, b) => {
    const aSame = a.category === current.category ? 0 : 1;
    const bSame = b.category === current.category ? 0 : 1;
    return aSame - bSame;
  });
}

/**
 * The tool list for an `/alternatives/<slug>` page: NodeTool first (the
 * recommended alternative), then same-category rivals, capped at six entries.
 */
export function alternativesFor(slug: string): {
  name: string;
  href: string | null;
  note: string;
  isNodetool: boolean;
}[] {
  const current = getCompetitor(slug);
  const nodetool = {
    name: "NodeTool",
    href: null,
    note: current
      ? `Open source, BYOK canvas for image, video, audio, and text — the ${current.category.toLowerCase()} alternative you can self-host.`
      : "Open source, BYOK canvas for image, video, audio, and text.",
    isNodetool: true,
  };
  const rivals = siblings(slug)
    .slice(0, 5)
    .map((c) => ({
      name: c.name,
      href: `/vs/${c.slug}`,
      note: c.competitorTagline,
      isNodetool: false,
    }));
  return [nodetool, ...rivals];
}

const YEAR = yearToken();

/** `/vs/*` page entries for the registry, sitemap, and smoke suite. */
export const vsEntries: PageEntry[] = competitors.map((c) => ({
  route: `/vs/${c.slug}`,
  title: `${c.vsTitle} (${YEAR})`,
  description: c.vsDescription,
  priority: c.isNew ? 0.6 : 0.7,
  changeFrequency: "monthly",
  indexable: true,
}));

/** `/alternatives/*` page entries for the registry, sitemap, and smoke suite. */
export const alternativesEntries: PageEntry[] = competitors.map((c) => ({
  route: `/alternatives/${c.slug}`,
  title: `${c.name} alternatives (${YEAR}) — why teams choose NodeTool`,
  description: `${c.limitation} Compare NodeTool and other ${c.category.toLowerCase()} alternatives — open source, BYOK, one canvas for image, video, audio, and text.`,
  priority: c.isNew ? 0.55 : 0.6,
  changeFrequency: "monthly",
  indexable: true,
}));

/** Both comparison templates, folded into one engine contribution. */
export const competitorEntries: PageEntry[] = [
  ...vsEntries,
  ...alternativesEntries,
];

/**
 * Footer "Compare" column, derived from the data module. The established
 * competitors (not first-wave additions) keep the footer tidy.
 */
export const footerCompareLinks: { name: string; href: string }[] = competitors
  .filter((c) => !c.isNew)
  .map((c) => ({ name: `vs ${c.name}`, href: `/vs/${c.slug}` }));
