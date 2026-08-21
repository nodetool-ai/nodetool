import type { PageEntry } from "./types";
import { yearToken } from "./types";
import type { OgAccent } from "../lib/og";

/**
 * Comparison page-data contract, consumed by the `/alternatives/*` route. One
 * competitor record drives one page: a limitation intro, a short tool list, the
 * head-to-head at-a-glance cards, the feature table, the explainer, and a
 * visible FAQ. It drove two near-identical templates until 2026-08-10, when the
 * `/vs/<slug>` twin was folded in (see `alternativesEntries` below).
 *
 * The six original competitors (comfyui, weavy, langflow, n8n, flowise, dify)
 * started as verbatim transcriptions of the hand-built pages they replaced;
 * the prose has since been rewritten for narrative flow and the agent-first
 * positioning (an agent builds, runs, and repairs workflows on the same
 * editors you use). The first-wave additions (`isNew`) follow the same
 * pattern and carry at least one honest concession row.
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

  // --- OG card (the /alternatives opengraph-image route reads this) ---
  og: { image: string; accent: OgAccent; subtitle: string };

  /**
   * Lead paragraph for the at-a-glance section: why this comparison comes up.
   * Was the /vs hero paragraph before that page was folded in.
   */
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
  /** Footer link label override, e.g. to note a product rename. */
  footerName?: string;

  /** Optional search snippet for pages with a distinct, high-volume query intent. */
  seo?: { title: string; description: string };
};

export const competitors: Competitor[] = [
  {
    slug: "comfyui",
    name: "ComfyUI",
    seo: {
      title: "Easier ComfyUI Alternatives for Mac | NodeTool",
      description:
        "Compare easier ComfyUI alternatives for Mac and other platforms. See how NodeTool brings image, video, audio, and text workflows to one open-source canvas.",
    },
    theme: "blue",
    category: "Node editor",
    og: {
      image: "screen_canvas.png",
      accent: "blue",
      subtitle:
        "The studio around the node editor — every medium, every provider.",
    },
    heroParagraph:
      "Ask around the ComfyUI community and the same complaints keep coming back: a workflow that ran fine yesterday throws \"missing custom nodes\" after an update, an extension's pinned PyTorch version quietly breaks a different extension, and a graph that took an afternoon to build turns into a wall of red, disconnected boxes the moment you open it on another machine. That fragility is the tax on ComfyUI's real strength — an open plugin system with deep, node-by-node control over every sampler and VAE. NodeTool ships its editing tools as maintained, first-party nodes instead: image, video, music, and words on one canvas, every major provider on your own keys at provider prices, and an agent that can wire the graph for you. Both are open source.",
    competitorTagline: "Node editor for diffusion images",
    competitorBullets: [
      "Deep control over Stable Diffusion pipelines",
      "Engineer-first, graph-based UX",
      "Local model focused",
      "Hundreds of community custom nodes — quality and maintenance vary",
    ],
    nodetoolTagline: "The studio around the canvas",
    nodetoolBullets: [
      "Image, video, audio, and text on one canvas",
      "Every major model from every major provider",
      "Editing tools: masks, inpaint, relight, layers",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Your own keys at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Media types", competitor: "Diffusion images", nodetool: "Image, video, audio, text" },
      { label: "Models", competitor: "Stable Diffusion / diffusion", nodetool: "Every major provider and media type" },
      { label: "Your own API keys", competitor: false, nodetool: true },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Local models", competitor: true, nodetool: true },
      { label: "Desktop + browser", competitor: false, nodetool: true },
      { label: "Open source", competitor: true, nodetool: true },
      { label: "Custom-node stability", competitor: "Third-party, versions can conflict", nodetool: "Built-in, one maintained codebase" },
      { label: "Workflow portability across machines", competitor: "Can fail on missing custom nodes", nodetool: "Opens the same way everywhere" },
    ],
    explainerHeading: "One canvas for everything, not just images",
    explainerParagraph:
      "If your work starts and ends with Stable Diffusion images, ComfyUI gives you fine-grained control, and nothing here will pry it from your hands. But the same plugin architecture that makes it powerful is what makes it brittle: custom nodes pin their own PyTorch versions and step on each other, an update to the core app or its frontend can turn a working graph into a wall of red error nodes overnight, and a workflow built on one machine often won't open on another until you've tracked down every missing custom node by hand. Big graphs also mean big VRAM bills — spill past what your card holds and ComfyUI falls back to slow system-memory swapping or an out-of-memory crash mid-render. NodeTool keeps every editing tool — masks, inpaint, outpaint, relight, upscale, layers, compositing — as a first-party node maintained in one codebase, so a workflow that runs today keeps running, and one you share opens the same way on any machine. You don't have to place every node yourself either — NodeTool is agent-first, so you can describe the pipeline and an agent authors the graph, picks the models, and repairs what fails, leaving behind a workflow you can inspect and rerun. You call every major model with your own keys at provider prices, and run locally via Ollama, MLX, and llama.cpp.",
    ctaHeading: "Open, complete, and yours.",
    ctaParagraph:
      "Download Studio and build across image, video, audio, and text in one place.",
    faq: [
      {
        question: "What is the difference between NodeTool and ComfyUI?",
        answer:
          "ComfyUI is a node editor focused on Stable Diffusion and diffusion image generation with an interface built for engineers. NodeTool is the studio around it: image, video, music, and text on one visual canvas, a much wider list of models across providers and media types, and editing tools creatives actually use — called with your own keys at provider prices. Both are open source, and both work by connecting blocks on a canvas.",
      },
      {
        question: "Why do ComfyUI workflows break after sharing or updating?",
        answer:
          "Two separate things usually collide. Sharing: a workflow file references custom nodes by name, and if the machine opening it doesn't have that exact extension installed, ComfyUI shows \"missing custom nodes\" errors and won't load the graph until you track each one down — ComfyUI Manager's \"Install Missing Nodes\" automates the search, but it's a fix per workflow, not a guarantee it stays fixed. Updating: the core app, its frontend, and every third-party extension version independently, so a core update can outrun a node that hasn't caught up, and a node update can pin a PyTorch version that breaks a different extension. NodeTool ships its editing tools as first-party nodes in one maintained codebase, so there's no extension compatibility matrix to manage.",
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
          "NodeTool runs on your own keys — you bring your own API keys and pay each provider their list price. There are no credits, no markup, and no hand-picked list of models. You can also run local models with Ollama, MLX, or llama.cpp in the desktop app.",
      },
    ],
    limitation:
      "ComfyUI's open plugin system is also its biggest liability: custom nodes conflict on dependencies, workflows break after updates or when a required custom node goes missing on another machine, and anything past a diffusion image means leaving the graph.",
  },
  {
    slug: "weavy",
    name: "Weavy",
    footerName: "Weavy (Figma Weave)",
    theme: "blue",
    category: "Creative canvas",
    og: {
      image: "screen_canvas.png",
      accent: "violet",
      subtitle: "Open source and your own keys — no credits, no hand-picked list of models, no lock-in.",
    },
    heroParagraph:
      "One morning in October 2025, Weavy users woke up to a new name, a new owner, and the same old credit meter. Figma acquired Weavy, renamed it Figma Weave, and the canvas stayed what it always was: closed, hosted, and billed in credits, with a model list someone else curates. NodeTool takes the opposite bet — open source, your own keys at provider prices, workflows and files you own, and an agent-first workspace where an agent can build the pipeline for you. Cloud is just managed hosting of the same code you can self-host.",
    competitorTagline: "Closed SaaS canvas, now Figma Weave",
    competitorBullets: [
      "Credit system you top up and burn",
      "A hand-picked list of supported models",
      "Closed source, hosted only",
      "Now part of Figma — roadmap follows the platform",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · your keys",
    nodetoolBullets: [
      "Your own keys — pay providers directly at list prices",
      "Every major model from every major provider",
      "Open source under AGPL-3.0, self-hostable",
      "Agent-first: an agent builds, runs, and repairs workflows",
      "You own your workflows and files",
    ],
    rows: [
      { label: "Pricing model", competitor: "Credits", nodetool: "Your keys, provider prices" },
      { label: "Models", competitor: "Hand-picked list", nodetool: "Every provider" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Self-host", competitor: false, nodetool: true },
      { label: "Data ownership", competitor: false, nodetool: true },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "Pay providers, not credits — and keep your work",
    explainerParagraph:
      "Credit systems and curated model lists decide which models you can use and what each call costs — and after an acquisition, someone else's roadmap decides everything else. NodeTool flips that: you add your own API keys and pay each provider their published list price. The workspace is agent-first, so you can describe what you want and an agent authors the workflow, runs it, and repairs what fails on the same canvas you use. All of it is open source under AGPL-3.0 — run it as a desktop app or self-host it, and your workflows and files stay yours. NodeTool Cloud is managed hosting of the same code.",
    ctaHeading: "Own your canvas.",
    ctaParagraph:
      "Download Studio and build with every provider, at provider prices.",
    faq: [
      {
        question: "How is NodeTool different from Weavy?",
        answer:
          "Weavy and similar closed SaaS canvases lock you into a credit system and a curated list of models. NodeTool is open source and runs on your own keys: every provider, your keys, provider prices, and you own your workflows and files. NodeTool Cloud is just managed hosting of the same open-source code you can self-host.",
      },
      {
        question: "What happened to Weavy?",
        answer:
          "Figma acquired Weavy in October 2025 and renamed it Figma Weave. The product runs as a standalone tool at weave.figma.com with its own AI credits and billing, separate from Figma, and is being folded into the Figma platform over time. It remains closed source and hosted-only.",
      },
      {
        question: "Does NodeTool use credits?",
        answer:
          "No. NodeTool runs on your own keys — you bring your own API keys and pay each provider their list price directly. There are no credits, no markup, and no hand-picked model list.",
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
      "Weavy — now Figma Weave after Figma's October 2025 acquisition — is a closed, hosted canvas billed in credits: you can't self-host it, and your work lives on their platform.",
  },
  {
    slug: "figma-weave",
    name: "Figma Weave",
    theme: "violet",
    category: "Creative canvas",
    og: {
      image: "screen_canvas.png",
      accent: "violet",
      subtitle: "The open-source, your own keys alternative to Figma Weave.",
    },
    heroParagraph:
      "Figma Weave — the canvas formerly known as Weavy — is a polished hosted tool with a curated frontier model list, billed in its own AI credits and moving deeper into the Figma platform with every release. That's fine until the day a model you rely on drops off the list, or the credit math changes, or the roadmap bends toward Figma's plans instead of yours. NodeTool covers the same visual media workflows in the open: AGPL-3.0 source, your own keys at provider prices, an agent that can build the pipeline for you, a desktop app that runs offline with local models, and workflows and files that stay yours.",
    competitorTagline: "Hosted AI canvas in the Figma ecosystem",
    competitorBullets: [
      "Billed in Figma Weave AI credits",
      "Curated list of models, chosen for you",
      "Closed source, browser-only, no self-host",
      "Roadmap follows Figma's platform plans",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · your keys",
    nodetoolBullets: [
      "Your own keys — pay providers directly at list prices",
      "Every major model from every major provider",
      "Open source under AGPL-3.0 — desktop app or self-host",
      "Agent-first: an agent builds, runs, and repairs workflows",
      "Local models via Ollama, MLX, and llama.cpp",
    ],
    rows: [
      { label: "Pricing model", competitor: "AI credits", nodetool: "Your keys, provider prices" },
      { label: "Models", competitor: "Hand-picked list", nodetool: "Every provider" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Free tier", competitor: true, nodetool: "Studio is free" },
      { label: "Self-host", competitor: false, nodetool: true },
      { label: "Desktop app / offline", competitor: false, nodetool: true },
      { label: "Local models (Ollama, MLX, llama.cpp)", competitor: false, nodetool: true },
    ],
    explainerHeading: "Own the canvas, not a seat in an ecosystem",
    explainerParagraph:
      "Acquisitions change products: pricing, model lists, and roadmaps for Figma Weave now follow Figma's platform strategy, and your workflows live on their servers either way. NodeTool takes the opposite bet. The whole workspace is open source under AGPL-3.0, workflows are files you own, and models are called with your own API keys at each provider's published price — or run locally with Ollama, MLX, and llama.cpp. It is also agent-first: every editor is exposed to agents as tools, so you can describe a pipeline and an agent wires it, runs it, and repairs what fails. If the tool changes direction, you keep the code, the graphs, and the keys.",
    ctaHeading: "Build on a canvas nobody can acquire.",
    ctaParagraph:
      "Download Studio — open source, your own keys, every provider at provider prices.",
    faq: [
      {
        question: "Is Figma Weave the same as Weavy?",
        answer:
          "Yes. Figma acquired Weavy in October 2025 and renamed it Figma Weave. It runs as a standalone product at weave.figma.com with its own AI credits and billing, separate from Figma, and is being integrated into the Figma platform over time.",
      },
      {
        question: "Is there an open source alternative to Figma Weave?",
        answer:
          "NodeTool is one: an open-source (AGPL-3.0) visual canvas for image, video, audio, and text. It runs on your own keys — you call every major provider with your own keys at provider prices — and runs as a desktop app, in the browser, or self-hosted.",
      },
      {
        question: "Does NodeTool use credits like Figma Weave?",
        answer:
          "No. NodeTool runs on your own keys — you bring your own API keys and pay each provider their list price directly. There are no credits, no markup, and no hand-picked list of models. You can also run local models for no per-call cost at all.",
      },
      {
        question: "When is Figma Weave the better pick?",
        answer:
          "If your team already lives in Figma and wants a managed, hosted canvas with a hand-picked list of models and community workflows — and doesn't need self-hosting, local models, or pricing on your own keys — Figma Weave is a polished choice. NodeTool is for teams that want the same workflows with open source, their own keys, and their own machines.",
      },
    ],
    limitation:
      "Figma Weave is a closed, hosted canvas billed in its own AI credits — you can't self-host it, and its roadmap now follows Figma's platform plans.",
    isNew: true,
  },
  {
    slug: "langflow",
    name: "Langflow",
    theme: "blue",
    category: "Chatbot & agent builder",
    og: {
      image: "screen_workflow.png",
      accent: "emerald",
      subtitle: "Agents plus native image, video, and music generation — on one canvas.",
    },
    heroParagraph:
      "Your Langflow agent can answer from a thousand documents. Now ask it for a storyboard, and watch the flow end at a blank HTTP node waiting for an API you'll wire by hand. Langflow is a capable drag-and-drop builder for chat, document search, and agents, rooted in Python and LangChain — but its agents ship messages, not media. NodeTool covers that same ground and keeps going: native image, video, and music generation with editing tools on the same canvas, and an agent that can build the whole pipeline itself. Open source, your own keys at provider prices, local models included.",
    competitorTagline: "Drag-and-drop builder for chatbot and agent apps",
    competitorBullets: [
      "Visual flows for chatbots, document search, and agents",
      "Python-extensible, LangChain ecosystem",
      "Open source (MIT), self-hostable",
      "Text workflows first",
    ],
    nodetoolTagline: "Agents plus native generation",
    nodetoolBullets: [
      "Agents, document search, and chat on the same canvas",
      "Native image, video, and music generation nodes",
      "Editing tools: masks, inpaint, relight, layers",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Your own keys at provider prices — local models via Ollama, MLX, llama.cpp",
    ],
    rows: [
      { label: "Focus", competitor: "chatbot and agent apps: chat, document search, agents", nodetool: "Agents + image, video, audio, text" },
      { label: "Native media generation (image, video, music)", competitor: "Via external APIs", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Agents & document search", competitor: true, nodetool: true },
      { label: "Local models", competitor: "Text models via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "Your own API keys", competitor: true, nodetool: true },
      { label: "Open source", competitor: "MIT", nodetool: "AGPL-3.0" },
      { label: "Desktop app", competitor: "macOS, Windows", nodetool: "macOS, Windows, Linux" },
    ],
    explainerHeading: "The pipeline and the picture, on one canvas",
    explainerParagraph:
      "If your project ends at a chatbot or document question-answering, Langflow is a solid choice — visual flows, Python extensibility, a mature LangChain community. But the moment an agent needs to produce something you can look at or listen to — a storyboard, a product video, a soundtrack — Langflow hands you an API key form and a blank HTTP node. NodeTool keeps going: generation nodes for image, video, and music from every major provider sit on the same canvas as your agents and retrieval, with masks, inpaint, relight, upscale, and layers built in. And the agents don't just live in the workflow, they build it: NodeTool is agent-first, so you can describe a pipeline and an agent authors the graph, validates it, and repairs what fails. You bring your own keys and pay provider list prices — no credits, no markup — and run local models via Ollama, MLX, and llama.cpp on the desktop.",
    ctaHeading: "Build agents that make things.",
    ctaParagraph:
      "Download Studio and put generation on the same canvas as your agents.",
    faq: [
      {
        question: "What is the difference between NodeTool and Langflow?",
        answer:
          "Langflow is a drag-and-drop visual builder for chatbot and agent apps, covering chat, document question-answering, and agents, rooted in the Python and LangChain ecosystem. NodeTool covers the same agent and document-search ground but treats media as a built-in output: image, video, and music generation run as native nodes on the same canvas, with editing tools like masks, inpaint, and layers built in. Both are open source and self-hostable.",
      },
      {
        question: "Can Langflow generate images and video?",
        answer:
          "Langflow is built for text and text work; generating media means wiring up external APIs yourself. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools — masks, inpaint, outpaint, relight, upscale, layers, and compositing.",
      },
      {
        question: "Is NodeTool open source like Langflow?",
        answer:
          "Yes. Langflow is MIT-licensed; NodeTool is open source under AGPL-3.0. Both can be self-hosted. NodeTool also ships as a desktop app for macOS, Windows, and Linux, and NodeTool Cloud is managed hosting of the same open-source code.",
      },
      {
        question: "Can I run local models in NodeTool?",
        answer:
          "Yes. NodeTool runs local models via Ollama, MLX, and llama.cpp in the desktop app, and connects to every major cloud provider with your own keys — your keys, provider list prices, no credits or markup.",
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
    og: {
      image: "screen_canvas.png",
      accent: "cyan",
      subtitle: "Workflows that create, not just connect — native generation and agents.",
    },
    heroParagraph:
      "n8n is what you reach for when a record has to travel from Salesforce to Slack to a spreadsheet, every night, without fail. But try to make the workflow produce something — a product video, a batch of campaign images, a soundtrack — and the creative step collapses into a generic HTTP node calling an API you configured by hand. NodeTool is built for workflows where the AI work is the point: native image, video, and music generation, agents, and editing tools on one canvas, with an agent that can author the pipeline for you. Open source under AGPL-3.0, your own keys at provider prices, with a desktop app and local models.",
    competitorTagline: "Workflow automation platform",
    competitorBullets: [
      "400+ integrations for business apps",
      "Scheduling, retries, and branching",
      "AI agent nodes built on LangChain",
      "Fair-code: source-available, commercially restricted",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Native image, video, and music generation nodes",
      "Agents and document search on the same canvas as generation",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Open source under AGPL-3.0, desktop app included",
      "Your own keys at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Focus", competitor: "App-to-app automation", nodetool: "AI generation + agents" },
      { label: "Native media generation (image, video, music)", competitor: "Via external APIs", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Business app connectors", competitor: "400+ integrations", nodetool: "AI-focused set" },
      { label: "License", competitor: "Sustainable Use (fair-code)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Local models", competitor: "Text models via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "Pricing model", competitor: "Per-execution plans (cloud)", nodetool: "Your keys, provider prices" },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "Plumbing is solved. Production isn't.",
    explainerParagraph:
      "If the hard part of your workflow is moving records between Salesforce, Slack, and a spreadsheet on a schedule, n8n is built for exactly that. But when the workflow's output is the thing itself — a product video, a batch of campaign images, a soundtrack, an agent's research report — the generation can't live in a generic HTTP node. NodeTool makes it native: image, video, and music models from every major provider as built-in blocks, agents and retrieval on the same canvas, and editing tools — masks, inpaint, relight, upscale, layers — built in. It is also agent-first: describe the pipeline and an agent authors the graph, runs it, and repairs what fails, so the automation can build itself. Open source under AGPL-3.0 rather than fair-code, it runs as a desktop app on macOS, Windows, and Linux and calls models with your own keys at provider list prices.",
    ctaHeading: "Make the workflow the studio.",
    ctaParagraph:
      "Download Studio and generate image, video, and music where your agents already work.",
    faq: [
      {
        question: "What is the difference between NodeTool and n8n?",
        answer:
          "n8n is a workflow automation platform: it moves data between hundreds of business apps, with AI agent nodes built on LangChain. NodeTool is built for workflows where the AI work is the point — native image, video, and music generation, agents, and media editing tools on one visual canvas. If the job is connecting Salesforce to Slack on a schedule, use n8n. If the job is producing something with AI, use NodeTool.",
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
          "When the hard part of your workflow is business-app plumbing: hundreds of connectors, schedules, retries, and branching between SaaS tools. That is what n8n is built for. NodeTool is the better fit when the workflow's output is AI-generated media or agent work, and you want local models, provider pricing on your own keys, and a desktop app.",
      },
    ],
    limitation:
      "n8n is built for app-to-app plumbing; AI generation lands in a generic HTTP node, and it is fair-code, not open source.",
  },
  {
    slug: "flowise",
    name: "Flowise",
    theme: "violet",
    category: "Chatbot & agent builder",
    og: {
      image: "screen_workflow.png",
      accent: "violet",
      subtitle: "chatbots that answer from your documents plus native image, video, and music generation.",
    },
    heroParagraph:
      "Flowise gets you from zero to a document-answering chatbot in an afternoon: vector store, retriever, LLM node, done. Then the client asks for the demo video, the launch images, a voice for the assistant — and every one of those lands outside the flow, in a raw HTTP node or another tool entirely. NodeTool covers the same agent and retrieval ground, then keeps the whole deliverable on one canvas: native image, video, and music generation, editing tools, and an agent that can build the pipeline itself. Open source under AGPL-3.0, your own keys at provider prices, with a desktop app and local models.",
    competitorTagline: "Drag-and-drop LangChain builder",
    competitorBullets: [
      "Fastest path to a chatbot that answers from your documents",
      "Vector store and LangChain node library",
      "Source-available under Apache 2.0",
      "Hosted cloud sold on usage-based credits",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Agents, document search, and native image/video/music generation",
      "Built-in editing tools — masks, inpaint, relight, layers",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Open source under AGPL-3.0, desktop app included",
      "Your own keys at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Focus", competitor: "LangChain chatbots & document search", nodetool: "AI generation + agents" },
      { label: "Native media generation (image, video, music)", competitor: "Via HTTP request nodes", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Vector store / document search nodes", competitor: true, nodetool: true },
      { label: "License", competitor: "Apache 2.0 (source-available)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Local models", competitor: "Text models via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "Pricing model", competitor: "Usage-based credits (cloud)", nodetool: "Your keys, provider prices" },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "A chatbot is often just the front door.",
    explainerParagraph:
      "Flowise is genuinely fast at what it's built for: wire a vector store, a retriever, and a language model node into a working chatbot that answers from your documents in minutes. But the moment the workflow needs to produce something — a rendered image, a video cut, a voice line — that step lands in a generic HTTP node calling an external API by hand. In NodeTool, image, video, and music models from every major provider sit on the same canvas as the agent and retrieval nodes, with masks, inpaint, relight, upscale, and layers built in. The workspace is agent-first too: describe what the chatbot and its media pipeline should do, and an agent wires the graph, validates it, and repairs what fails. Every call runs on your own keys at list price, no credit tiers on top.",
    ctaHeading: "Build the chatbot. Ship the media too.",
    ctaParagraph:
      "Download Studio and put generation on the same canvas as your agents and retrieval.",
    faq: [
      {
        question: "What is the difference between NodeTool and Flowise?",
        answer:
          "Flowise is a drag-and-drop builder for LangChain-based chatbot and agent apps — its fastest path is a chatbot that answers from your documents backed by a vector store. NodeTool covers the same agent and retrieval ground, then adds native image, video, and music generation nodes, plus editing tools (masks, inpaint, relight, layers), on the same canvas. If the deliverable is a chatbot, Flowise gets there fastest. If the deliverable includes generated media, NodeTool is built for the whole pipeline.",
      },
      {
        question: "Is Flowise open source?",
        answer:
          "Flowise is source-available under the Apache 2.0 license, with a hosted Flowise Cloud sold on usage-based credit tiers. NodeTool is open source under AGPL-3.0 and your own keys: you connect your own provider keys and pay providers directly at their list prices, with no credit markup on either self-hosted or NodeTool Cloud usage.",
      },
      {
        question: "Can Flowise generate images or video?",
        answer:
          "Only by wiring a generic HTTP request node to an external API. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools, as built-in blocks on the same canvas as its agent and document search nodes.",
      },
      {
        question: "When should I pick Flowise instead of NodeTool?",
        answer:
          "When the job is strictly a LangChain-flavored chatbot or assistant over a document set, and you want the fastest drag-and-drop path to that specific shape. NodeTool is the better fit once the workflow also needs to produce image, video, or audio, or you want a desktop app with local-model support and pricing on your own keys across everything, not just the language model calls.",
      },
    ],
    limitation:
      "Flowise nails the LangChain chatbot that answers from your documents, but generating media drops you into a raw HTTP node, and its cloud is billed in credits.",
  },
  {
    slug: "dify",
    name: "Dify",
    theme: "amber",
    category: "Chatbot & agent builder",
    og: {
      image: "screen_llms.png",
      accent: "amber",
      subtitle: "Agents and document search, plus native image, video, and music generation.",
    },
    heroParagraph:
      "Dify earns its reputation on the text side: prompt management, knowledge bases, agent debugging — everything a support bot or internal copilot needs. But the day the deliverable includes a rendered image, a video cut, or a synthesized voice, the work has to leave the platform. NodeTool starts from the same agent and document-search ground and keeps the whole job on one canvas: native image, video, and music generation, editing tools, and an agent that can build the pipeline for you. Open source under AGPL-3.0, your own keys at provider prices, with a desktop app and local models.",
    competitorTagline: "language model app development platform",
    competitorBullets: [
      "Prompt management and app-store-style deployment",
      "Built-in knowledge bases and agent debugging",
      "Modified Apache 2.0 license with commercial limits",
      "Cloud sold on seat/usage plans",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Agents, document search, and native image/video/music generation",
      "Built-in editing tools — masks, inpaint, relight, layers",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Open source under AGPL-3.0, desktop app included",
      "Your own keys at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Focus", competitor: "Text-first chatbot and agent apps & knowledge bases", nodetool: "AI generation + agents" },
      { label: "Native media generation (image, video, music)", competitor: "Via tool/plugin calls", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Agent debugging & tracing", competitor: true, nodetool: true },
      { label: "License", competitor: "Modified Apache 2.0 (commercial limits)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Local models", competitor: "language models via self-hosted endpoints", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "Pricing model", competitor: "Seat/usage plans (cloud)", nodetool: "Your keys, provider prices" },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "Great for the chatbot. Not built for the render.",
    explainerParagraph:
      "Dify earns its reputation on debugging and knowledge-base tooling for text-first chatbot and agent apps — a support bot, an internal copilot, a document Q&A assistant. But when the deliverable includes a generated image, a video cut, or a synthesized voice line, that step has to leave the platform. NodeTool puts image, video, and music models from every major provider on the same canvas as its agent and retrieval nodes, with masks, inpaint, relight, upscale, and layers built in. And because the workspace is agent-first, an agent can author that canvas itself — build the workflow, run it, and repair what fails — with every call on your own keys at list price.",
    ctaHeading: "Build past the chatbot.",
    ctaParagraph:
      "Download Studio and put generation on the same canvas as your agents and knowledge base.",
    faq: [
      {
        question: "What is the difference between NodeTool and Dify?",
        answer:
          "Dify is a language model app development platform focused on prompt management, knowledge bases, and agent debugging for text-first products like chatbots and copilots. NodeTool covers the same agent and document-search ground on a visual canvas, then adds native image, video, and music generation and editing tools — masks, inpaint, relight, layers — as built-in blocks, so a workflow can produce media, not just text and structured output.",
      },
      {
        question: "Is Dify open source?",
        answer:
          "Dify's source is published under a modified Apache 2.0 license that adds commercial-use conditions above certain usage thresholds — check Dify's own license file for the current terms before relying on it for a commercial deployment. NodeTool is open source under AGPL-3.0, an OSI-approved license, and is fully your own keys on both self-hosted and NodeTool Cloud deployments.",
      },
      {
        question: "Can Dify generate images or video?",
        answer:
          "Dify can call image-generation APIs through its tool/plugin system, but it is not built around media generation the way it is built around text and document search. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools, on the same canvas as its agent and knowledge-base nodes.",
      },
      {
        question: "When should I pick Dify instead of NodeTool?",
        answer:
          "When the product is a text-first language model app — a support chatbot, an internal copilot, a knowledge-base assistant — and you want Dify's prompt-management interface, built-in observability, and app-store-style deployment. NodeTool is the better fit when the workflow needs to produce image, video, or audio alongside the agent and document search work, or when you want a desktop app with local-model support and pricing on your own keys throughout.",
      },
    ],
    limitation:
      "Dify is built around text-first chatbot and agent apps; media generation happens through plugins, and its license adds commercial limits.",
  },

  // --- First wave of new competitors (drafted from the same pattern) ---
  {
    slug: "flora",
    name: "Flora",
    theme: "rose",
    category: "Creative canvas",
    isNew: true,
    og: {
      image: "screen_canvas.png",
      accent: "rose",
      subtitle: "A creative AI canvas that's open source and runs on your own keys — not credit-metered.",
    },
    heroParagraph:
      "Flora is a beautifully designed hosted canvas for AI image and video — and every render on it burns credits, on a model list someone else curates, on servers where your work lives. NodeTool is the open version of that idea: image, video, music, and text on one visual canvas, every model called with your own keys at provider prices, an agent that can build the pipeline for you, and workflows and files you own and can self-host.",
    competitorTagline: "Hosted infinite canvas",
    competitorBullets: [
      "Polished, purpose-built creative canvas UX",
      "Curated image and video model selection",
      "Closed source, hosted only",
      "Billed in credits you top up",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · your keys",
    nodetoolBullets: [
      "Image, video, audio, and text on one canvas",
      "Every major model from every major provider",
      "Open source under AGPL-3.0, self-hostable",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Your own keys at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Design / onboarding polish", competitor: "Purpose-built creative interface", nodetool: "A visual canvas built for depth" },
      { label: "Media types", competitor: "Image, video", nodetool: "Image, video, audio, text" },
      { label: "Models", competitor: "Hand-picked list", nodetool: "Every major provider" },
      { label: "Pricing model", competitor: "Credits", nodetool: "Your keys, provider prices" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Self-host / data ownership", competitor: false, nodetool: true },
      { label: "Desktop app + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "A canvas you can take with you",
    explainerParagraph:
      "Flora is genuinely pleasant to use — the onboarding and the canvas feel designed, and for a quick hosted image or video it's fast to reach for. But it's closed and credit-metered: the model list is curated, each render burns credits, and your work lives on their platform. NodeTool trades some of that turnkey polish for control. Image, video, music, and text share one canvas, every provider is called at list price with your own keys, and local models run via Ollama, MLX, and llama.cpp. It's agent-first too — describe what you want and an agent wires the graph and runs it — and the whole thing is open source under AGPL-3.0, so you can self-host it and keep your files.",
    ctaHeading: "Create on a canvas you own.",
    ctaParagraph:
      "Download Studio and build across image, video, audio, and text — your keys, your files.",
    faq: [
      {
        question: "What is the difference between NodeTool and Flora?",
        answer:
          "Flora is a hosted, closed-source creative canvas for AI image and video, billed in credits. NodeTool is an open-source (AGPL-3.0) visual canvas, run on your own keys, that spans image, video, audio, and text, connects to every major provider at list price, and can be self-hosted or run as a desktop app with local models.",
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
    og: {
      image: "screen_canvas.png",
      accent: "cyan",
      subtitle: "An open canvas that runs on your own keys, built for the whole process rather than one instant render.",
    },
    heroParagraph:
      "Krea's party trick is real: sketch, and the image resolves under your cursor. For a single instant render, it's hard to beat. But a finished piece is rarely a single render — it's a pipeline of steps across image, video, music, and text, and that's where a hosted, credit-billed studio runs out of canvas. NodeTool is the open-source, bring-your-own-key workspace for the pipeline: every model at provider prices, editing built in, an agent that can wire the steps for you, and the whole thing self-hostable.",
    competitorTagline: "Hosted real-time studio",
    competitorBullets: [
      "Real-time, instant image generation and enhance",
      "Slick hosted UX, no setup",
      "Closed source, subscription + credits",
      "Curated model selection",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · your keys",
    nodetoolBullets: [
      "Image, video, audio, and text on one canvas",
      "Compose and edit — masks, inpaint, relight, layers",
      "Every major model from every major provider",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Your own keys at provider prices — self-hostable, local models",
    ],
    rows: [
      { label: "Real-time / instant generation", competitor: "Built-in, real-time", nodetool: "Batch & workflow, not real-time" },
      { label: "Media types", competitor: "Image, video", nodetool: "Image, video, audio, text" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: "Enhance / upscale", nodetool: "Full editing on canvas" },
      { label: "Models", competitor: "Hand-picked list", nodetool: "Every major provider" },
      { label: "Pricing model", competitor: "Subscription + credits", nodetool: "Your keys, provider prices" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Self-host + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "Speed at one step, or control across all of them",
    explainerParagraph:
      "Krea's real-time canvas is legitimately great: type or sketch and watch the image resolve instantly, then enhance and upscale — all hosted, nothing to install. If a fast, interactive single render is the job, Krea is hard to beat. NodeTool optimizes for the opposite end: composing multi-step pipelines that mix image, video, music, and text, editing on the same canvas with masks and layers, calling every provider with your own keys at list price, and running local models. It's agent-first, so an agent can author those pipelines from a description, run them, and repair what fails — and it's open source and self-hostable, so the whole pipeline is yours.",
    ctaHeading: "Own the whole pipeline.",
    ctaParagraph:
      "Download Studio and compose image, video, audio, and text on one open canvas.",
    faq: [
      {
        question: "What is the difference between NodeTool and Krea?",
        answer:
          "Krea is a hosted, closed-source studio built around real-time image generation and enhancement, sold on subscription and credits. NodeTool is an open-source (AGPL-3.0) visual canvas that runs on your own keys for multi-step pipelines across image, video, audio, and text, with editing tools built in, every major provider at list price, and self-hosting plus local models.",
      },
      {
        question: "Does NodeTool do real-time generation like Krea?",
        answer:
          "Not in the same instant, interactive way — Krea is purpose-built for real-time renders. NodeTool is built for composing and editing workflows: you wire up multi-step pipelines across different media and run them, rather than watching a single image resolve live.",
      },
      {
        question: "Is NodeTool cheaper than Krea?",
        answer:
          "NodeTool runs on your own keys — you pay each provider their list price with your own keys, with no subscription or credit markup, and Studio itself is free and open source. Whether that's cheaper depends on your usage, but there's no platform margin on top of the model cost.",
      },
    ],
    limitation:
      "Krea is a closed, credit-based hosted studio focused on real-time renders — no self-hosting, no your own keys, and it's image/video only.",
  },
  {
    slug: "lm-studio",
    name: "LM Studio",
    seo: {
      title: "LM Studio Alternatives for Local AI Workflows | NodeTool",
      description:
        "Compare local and open-source LM Studio alternatives for Windows and other platforms. See how NodeTool connects local models to agents, documents, and media workflows.",
    },
    theme: "emerald",
    category: "Local language model runtime",
    isNew: true,
    og: {
      image: "screen_llms.png",
      accent: "emerald",
      subtitle: "Run local models, then build the whole workflow around them.",
    },
    heroParagraph:
      "LM Studio nails the first hour of local AI: browse a model, download it, chat with it, serve it over an OpenAI-compatible endpoint. The question is the second hour — when you want that model to read your documents, drive an agent, or feed a prompt into image and video generation, and the chat window has no answer. NodeTool runs local models too, via Ollama, MLX, and llama.cpp, but on a visual canvas that builds whole workflows around them — with an agent that can do the building.",
    competitorTagline: "Desktop local-language model runtime",
    competitorBullets: [
      "Polished model browser and one-click local language models",
      "OpenAI-compatible local server",
      "Great chat UI for a single model",
      "Proprietary (free), text-language model focused",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Local models via Ollama, MLX, and llama.cpp",
      "Plus native image, video, and music generation",
      "Agents, document search, and multi-step workflows on one canvas",
      "Agent-first: describe the workflow and an agent builds and runs it",
      "Open source under AGPL-3.0, your own keys for cloud models",
    ],
    rows: [
      { label: "Local language model chat & model browser", competitor: "Purpose-built, polished", nodetool: "Supported via Ollama/MLX/llama.cpp" },
      { label: "OpenAI-compatible local server", competitor: true, nodetool: "Via provider integrations" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Agents, document search, multi-step workflows", competitor: false, nodetool: true },
      { label: "Cloud providers (your own keys)", competitor: false, nodetool: true },
      { label: "Source", competitor: "Proprietary (free)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Visual canvas", competitor: false, nodetool: true },
    ],
    explainerHeading: "The runtime, and the workflow around it",
    explainerParagraph:
      "For downloading a local model and chatting with it, LM Studio is excellent — the model browser is best in class, and the OpenAI-compatible server makes it easy to point other tools at a local endpoint. If that's the whole job, LM Studio is more specialized than NodeTool and a great pick. But once you want the model to do something in a pipeline — retrieve from your documents, drive an agent, feed a prompt into image or video generation — you need a canvas. NodeTool runs the same class of local models via Ollama, MLX, and llama.cpp and puts them next to native generation nodes, agents, and document search. It's agent-first, so you can describe the workflow and an agent wires it and runs it — open source, with your own keys for any cloud models you add.",
    ctaHeading: "From local chat to full workflow.",
    ctaParagraph:
      "Download Studio and put your local models on a canvas with generation, agents, and document search.",
    faq: [
      {
        question: "What is the difference between NodeTool and LM Studio?",
        answer:
          "LM Studio is a desktop app specialized in running local GGUF language models — model browser, chat UI, and an OpenAI-compatible local server. NodeTool is an open source visual canvas that also runs local models (via Ollama, MLX, and llama.cpp) and additionally generates image, video, and music and builds agents and document search workflows around them.",
      },
      {
        question: "Should I use LM Studio or NodeTool for local models?",
        answer:
          "If you mainly want to download a local language model and chat with it, or serve it over an OpenAI-compatible endpoint, LM Studio is the more specialized tool. If you want to build workflows around local (and cloud) models — retrieval, agents, media generation — NodeTool is the canvas for that.",
      },
      {
        question: "Is NodeTool open source?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0 and runs as a desktop app on macOS, Windows, and Linux. LM Studio is free but proprietary.",
      },
    ],
    limitation:
      "LM Studio is a specialized local-language model runtime — no media generation, no agents or document search workflows, and it's proprietary.",
  },
  {
    slug: "jan",
    name: "Jan",
    theme: "blue",
    category: "Local language model runtime",
    isNew: true,
    og: {
      image: "screen_chat.png",
      accent: "blue",
      subtitle: "Open and local-first — plus generation, agents, and document search on one canvas.",
    },
    heroParagraph:
      "Jan makes one promise and keeps it: a private, offline chat with a local model, in an app that's fully open source. NodeTool shares the open, local-first values and asks a bigger question — what happens after the chat? On its canvas the same local models, run via Ollama, MLX, and llama.cpp, drive image, video, and music generation, agents, and document search on one graph, and an agent can build that graph for you.",
    competitorTagline: "Open source local chat app",
    competitorBullets: [
      "Offline-first, private local language model chat",
      "Clean local ChatGPT-style UI",
      "Open source and self-hostable",
      "Text and language model chat focused",
    ],
    nodetoolTagline: "The open AI canvas",
    nodetoolBullets: [
      "Local models via Ollama, MLX, and llama.cpp",
      "Native image, video, and music generation",
      "Agents, document search, and multi-step workflows on one canvas",
      "Agent-first: describe the workflow and an agent builds and runs it",
      "Open source under AGPL-3.0, your own keys for cloud models",
    ],
    rows: [
      { label: "Local language model chat", competitor: "Purpose-built, offline-first", nodetool: "Supported, plus workflows" },
      { label: "Offline / privacy focus", competitor: "Offline-first by design", nodetool: "Local models supported" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Agents, document search, multi-step workflows", competitor: false, nodetool: true },
      { label: "Cloud providers (your own keys)", competitor: "Optional", nodetool: "Every major provider" },
      { label: "Open source", competitor: true, nodetool: true },
      { label: "Visual canvas", competitor: false, nodetool: true },
    ],
    explainerHeading: "A great chat app, or a whole canvas",
    explainerParagraph:
      "Jan does one thing well and openly: private, offline-first chat with local models, with a UI that feels like a local ChatGPT. If that's what you want, Jan is a lovely, focused choice and fully open source. NodeTool aims wider: it runs the same local models via Ollama, MLX, and llama.cpp, but puts them on a visual canvas alongside native image, video, and music generation, agents, and document search — so a local model can drive a whole workflow, not just a chat window. It's agent-first too: describe the workflow and an agent builds it, runs it, and repairs what fails. Both are open source; the difference is scope.",
    ctaHeading: "Take local models past the chat window.",
    ctaParagraph:
      "Download Studio and build workflows around your local and cloud models.",
    faq: [
      {
        question: "What is the difference between NodeTool and Jan?",
        answer:
          "Jan is an open source, offline-first desktop app focused on chatting with local language models. NodeTool is an open source (AGPL-3.0) visual canvas that runs local models too, and additionally generates image, video, and music and builds agents and document search workflows around them.",
      },
      {
        question: "Are both NodeTool and Jan open source?",
        answer:
          "Yes. Jan is open source and offline-first; NodeTool is open source under AGPL-3.0 and runs as a desktop app on macOS, Windows, and Linux with local-model support plus your own keys cloud providers.",
      },
      {
        question: "Can NodeTool run fully offline like Jan?",
        answer:
          "NodeTool can run local models via Ollama, MLX, and llama.cpp for offline language model and media work. Cloud provider nodes need network access, but you choose which models are local and which are cloud.",
      },
    ],
    limitation:
      "Jan is a focused local chat app — no media generation and no multi-step agent or document search workflows.",
  },
  {
    slug: "lindy",
    name: "Lindy",
    theme: "violet",
    category: "Agent automation",
    isNew: true,
    og: {
      image: "screen_workflow.png",
      accent: "violet",
      subtitle: "When the agent's job is to create — image, video, music — not just plumb ops.",
    },
    heroParagraph:
      "Lindy's agents live in your inbox, your calendar, and your CRM, quietly handling the operations work nobody wants. But ask one for the campaign itself — the images, the video, the soundtrack — and you've left what the platform is built for. NodeTool is an open-source, bring-your-own-key canvas where the AI work is the deliverable: native image, video, and music generation, agents, and document search on one visual canvas, with an agent that builds the pipeline from your description.",
    competitorTagline: "Hosted business-ops agents",
    competitorBullets: [
      "Assistants for operations work, built without code",
      "Deep business-app integrations",
      "Hosted, closed source",
      "Billed in tasks/credits + seats",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Native image, video, and music generation",
      "Agents and document search on the same canvas as generation",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Open source under AGPL-3.0, desktop app included",
      "Your own keys at provider prices — local models supported",
    ],
    rows: [
      { label: "Focus", competitor: "Business-ops automation", nodetool: "AI generation + agents" },
      { label: "Business-app integrations", competitor: "Deep, prebuilt", nodetool: "AI-focused set" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0 (open source)" },
      { label: "Pricing model", competitor: "Tasks/credits + seats", nodetool: "Your keys, provider prices" },
      { label: "Desktop app + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "Ops plumbing, or creative production",
    explainerParagraph:
      "Lindy is strong where its integrations are strong: wiring an assistant into your inbox, calendar, and CRM to handle repetitive operations, all hosted and built without code. If the job is ops automation across business apps, that prebuilt depth is a real advantage. NodeTool is built for a different job — producing things with AI. Image, video, and music models sit on the same canvas as agents and document search, with editing tools built in, and the workspace is agent-first: describe the pipeline and an agent authors it, runs it, and repairs what fails. Every call is made with your own keys at provider prices, and the whole workspace is open source under AGPL-3.0 with local-model support and a desktop app.",
    ctaHeading: "Put creation on the canvas.",
    ctaParagraph:
      "Download Studio and build agents that generate image, video, and music.",
    faq: [
      {
        question: "What is the difference between NodeTool and Lindy?",
        answer:
          "Lindy is a hosted, closed-source platform for AI assistants that automate business operations like email, scheduling, and CRM. NodeTool is an open-source (AGPL-3.0) visual canvas, run on your own keys, focused on AI generation — image, video, and music — plus agents and document search, with a desktop app and local-model support.",
      },
      {
        question: "When should I pick Lindy instead of NodeTool?",
        answer:
          "When the job is automating business operations with deep prebuilt integrations into your inbox, calendar, and CRM. That's what Lindy is built for. NodeTool is the better fit when the workflow's output is AI-generated media or creative agent work.",
      },
      {
        question: "Is NodeTool open source, and does it run on your own keys?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0 and your own keys — you connect your own provider keys and pay list prices, with no per-task credits or platform markup, and you can run local models on your own hardware.",
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
    og: {
      image: "screen_workflow.png",
      accent: "amber",
      subtitle: "When the workflow's output is generated media — not a business process.",
    },
    heroParagraph:
      "Gumloop will move your data through a business process without a line of code — prebuilt nodes, broad SaaS integrations, all hosted. But a process that ends in a spreadsheet is a different job from a workflow that ends in a finished video. NodeTool is an open-source, bring-your-own-key canvas built for the second job: native image, video, and music generation, agents, and document search on one visual canvas, with an agent that builds the pipeline from your description.",
    competitorTagline: "Hosted automation, no code required",
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
      "Agents and document search on the same canvas as generation",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Open source under AGPL-3.0, desktop app included",
      "Your own keys at provider prices — local models supported",
    ],
    rows: [
      { label: "Focus", competitor: "Business-process automation", nodetool: "AI generation + agents" },
      { label: "Prebuilt integrations", competitor: "Broad SaaS library", nodetool: "AI-focused set" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0 (open source)" },
      { label: "Pricing model", competitor: "Credits + seats", nodetool: "Your keys, provider prices" },
      { label: "Desktop app + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "Process automation, or media production",
    explainerParagraph:
      "Gumloop is good at what it's built for: automating business processes without writing code, with prebuilt nodes and broad SaaS integrations that get an ops workflow running fast and hosted. If that's the job, its integration library is a real edge. NodeTool is built to produce, not just process — image, video, and music models on the same canvas as agents and document search, editing tools built in, and an agent-first workspace where an agent authors the workflow, runs it, and repairs what fails. Every call is made with your own keys at provider prices, and the whole workspace is open source under AGPL-3.0 with local models and a desktop app.",
    ctaHeading: "Automate the creation itself.",
    ctaParagraph:
      "Download Studio and build workflows that generate image, video, and music.",
    faq: [
      {
        question: "What is the difference between NodeTool and Gumloop?",
        answer:
          "Gumloop is a hosted, closed-source platform for business-process automation with prebuilt nodes and SaaS integrations. NodeTool is an open-source (AGPL-3.0) visual canvas, run on your own keys, focused on AI generation — image, video, and music — plus agents and document search, with a desktop app and local-model support.",
      },
      {
        question: "When should I pick Gumloop instead of NodeTool?",
        answer:
          "When the job is automating a business process across SaaS tools with ready-made integrations that need no code. That's Gumloop's strength. NodeTool is the better fit when the workflow's output is AI-generated media or creative agent work you want to own and self-host.",
      },
      {
        question: "Is NodeTool open source and self-hostable?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0, self-hostable, and your own keys — you pay providers directly at list prices with no credits or platform markup, and you can run local models on your own hardware.",
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
 * The two-sentence answer that opens a `/vs` or `/alternatives` page, directly
 * under the H1: what the other tool is, then what NodeTool is. Built from the
 * record's own fields so it never states more than the page already claims,
 * and short enough to be quoted whole.
 */
export function shortAnswer(c: Competitor): string {
  const article = /^[aeiou]/i.test(c.competitorTagline) ? "an" : "a";
  const tagline =
    c.competitorTagline.charAt(0).toLowerCase() + c.competitorTagline.slice(1);
  return `${c.name} is ${article} ${tagline}. NodeTool is the open-source, agent-first creative workspace: image, video, audio, and text on one canvas, every major model called with your own keys at provider prices, as a desktop app or self-hosted.`;
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
      ? `An open-source canvas for image, video, audio, and text that runs on your own keys — the ${current.category.toLowerCase()} alternative you can host yourself.`
      : "An open-source canvas for image, video, audio, and text that runs on your own keys.",
    isNodetool: true,
  };
  const rivals = siblings(slug)
    .slice(0, 5)
    .map((c) => ({
      name: c.name,
      href: `/alternatives/${c.slug}`,
      note: c.competitorTagline,
      isNodetool: false,
    }));
  return [nodetool, ...rivals];
}

const YEAR = yearToken();

/**
 * `/alternatives/*` page entries for the registry, sitemap, and smoke suite.
 *
 * One record, one page. The `/vs/<slug>` twin this engine used to emit is gone
 * (2026-08-10): both routes generated from this same array, so they competed for
 * one query set, and `/alternatives` won 11 of the 12 head-to-head pairs — 4,817
 * impressions to 1,117 (SEO_STRATEGY.md § 0.10, finding 3). `/vs/<slug>` now
 * 301s here from `next.config.mjs`, and the head-to-head copy it owned (the
 * at-a-glance cards and the explainer) is rendered on this page instead, so the
 * "NodeTool vs X" queries keep their on-page support. The `vs*` fields below are
 * still the source of that copy — they name the section, not a route.
 */
export const alternativesEntries: PageEntry[] = competitors.map((c) => ({
  route: `/alternatives/${c.slug}`,
  title: `${c.name} alternatives (${YEAR}) — why teams choose NodeTool`,
  description: `${c.limitation} Compare NodeTool and other ${c.category.toLowerCase()} alternatives — open source, your own keys, one canvas for image, video, audio, and text.`,
  priority: c.isNew ? 0.6 : 0.7,
  changeFrequency: "monthly",
  indexable: true,
}));

/** The comparison engine's contribution to the registry. */
export const competitorEntries: PageEntry[] = alternativesEntries;

/**
 * Footer "Compare" column, derived from the data module. The established
 * competitors (not first-wave additions) keep the footer tidy.
 */
export const footerCompareLinks: { name: string; href: string }[] = competitors
  .filter((c) => !c.isNew)
  .map((c) => ({
    name: `vs ${c.footerName ?? c.name}`,
    href: `/alternatives/${c.slug}`,
  }));
