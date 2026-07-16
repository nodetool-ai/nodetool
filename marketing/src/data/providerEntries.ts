/**
 * Provider pages (`/providers/<slug>`).
 *
 * Two kinds of provider:
 *  - **Aggregators** (fal.ai, Replicate, Kie, Together AI, AtlasCloud, Topaz)
 *    ship a node manifest, so their supported-model catalog — counts, modality
 *    breakdown, and model ids — is GENERATED from the same manifests
 *    `nodetool generate <provider> --list-models` reads
 *    (`providerCatalog.generated.ts`).
 *  - **Direct APIs** (Anthropic, OpenAI, Gemini, …) fetch their model list live
 *    at runtime, so there's no build-time manifest. Their pages use curated
 *    model highlights + capabilities instead.
 *
 * Each provider's logo is fetched into `public/providers/<id>.png` by
 * `scripts/fetch-provider-logos.mjs`. Keep the provider → domain map there in
 * sync with the entries below.
 */
import type { PageEntry } from "./types";
import { yearToken } from "./types";
import {
  providerCatalog,
  type ProviderCatalog,
  type ProviderModelKind,
} from "./providerCatalog.generated";

export type Accent = "blue" | "violet" | "emerald" | "rose" | "amber" | "cyan";

export type ProviderCategory = "aggregator" | "llm" | "media";

export const CATEGORY_LABEL: Record<ProviderCategory, string> = {
  aggregator: "Model aggregators",
  llm: "LLM & AI APIs",
  media: "Media & 3D",
};

export const CATEGORY_ORDER: ProviderCategory[] = ["aggregator", "llm", "media"];

export const KIND_LABEL: Record<ProviderModelKind, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  "3d": "3D",
  text: "Text",
};

export const KIND_ORDER: ProviderModelKind[] = [
  "image",
  "video",
  "audio",
  "3d",
  "text",
];

export interface ProviderFaq {
  q: string;
  a: string;
}

export interface ProviderHighlight {
  name: string;
  /** One-line description of the model / family. */
  desc: string;
  /** Short kind tag, e.g. "Chat", "Image", "Reasoning". */
  kind: string;
}

export interface ProviderEntry extends PageEntry {
  slug: string;
  providerId: string;
  category: ProviderCategory;
  name: string;
  /** Provider home page. */
  url: string;
  /** BYOK env var NodeTool reads. */
  byokEnv: string;
  /** Logo asset path under /public. */
  logo: string;
  /** Hero subtitle — one line. */
  tagline: string;
  /** Positioning blurb, 2–3 paragraphs. */
  blurb: string[];
  /** Modalities / traits for the hero chips. */
  strengths: string[];
  faq: ProviderFaq[];
  accent: Accent;
  /** Aggregators: manifest-derived catalog. */
  catalog?: ProviderCatalog;
  /** Direct APIs: curated model highlights. */
  highlights?: ProviderHighlight[];
  /** Direct APIs: capability tags (Chat, Vision, Tools, …). */
  capabilities?: string[];
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

interface Common {
  slug: string;
  providerId: string;
  name: string;
  url: string;
  byokEnv: string;
  tagline: string;
  blurb: string[];
  strengths: string[];
  faq: ProviderFaq[];
  accent: Accent;
  priority?: number;
}

function base(c: Common): Omit<ProviderEntry, "category"> {
  return {
    slug: c.slug,
    providerId: c.providerId,
    name: c.name,
    url: c.url,
    byokEnv: c.byokEnv,
    logo: `/providers/${c.providerId}.png`,
    tagline: c.tagline,
    blurb: c.blurb,
    strengths: c.strengths,
    faq: c.faq,
    accent: c.accent,
    route: `/providers/${c.slug}`,
    title: "",
    description: c.tagline,
    priority: c.priority ?? 0.7,
    changeFrequency: "monthly",
    indexable: true,
  };
}

/** Aggregator: pulls the manifest-derived catalog. */
function aggregator(c: Common): ProviderEntry {
  const catalog = providerCatalog[c.providerId];
  if (!catalog) {
    throw new Error(
      `No catalog for aggregator "${c.providerId}" — run npm run seo:provider-catalog.`
    );
  }
  return {
    ...base(c),
    category: "aggregator",
    catalog,
    title: `${c.name} in NodeTool — run ${catalog.total}+ models in a visual AI workflow (${yearToken()})`,
  };
}

/** Direct API: curated highlights + capabilities, no manifest catalog. */
function direct(
  category: Exclude<ProviderCategory, "aggregator">,
  c: Common & { highlights: ProviderHighlight[]; capabilities: string[] }
): ProviderEntry {
  return {
    ...base(c),
    category,
    highlights: c.highlights,
    capabilities: c.capabilities,
    title: `${c.name} in NodeTool — run its models in a visual AI workflow (${yearToken()})`,
  };
}

// ---------------------------------------------------------------------------
// Aggregators (manifest-backed)
// ---------------------------------------------------------------------------

const aggregators: ProviderEntry[] = [
  aggregator({
    slug: "fal",
    providerId: "fal_ai",
    name: "fal.ai",
    url: "https://fal.ai",
    byokEnv: "FAL_API_KEY",
    accent: "violet",
    tagline:
      "Run fal.ai's image, video, audio, and 3D models in a visual AI workflow — the largest catalog in NodeTool, called with your own key at fal's list price.",
    blurb: [
      "fal.ai is a serving platform for generative media models, with the broadest catalog NodeTool integrates: FLUX and its editing variants, Seedream, Kling, Veo, Wan, Seedance, plus audio and 3D endpoints. Each fal endpoint is exposed as its own node, so the model you pick is the model you run.",
      "In NodeTool you compose fal models on the canvas — generate an image, feed it into an image-to-video node, upscale the result, all in one graph you can re-run and share as a single file. Swapping one fal model for another, or for a model on a different provider, is a single node change.",
      "fal is bring-your-own-key: NodeTool calls it with your `FAL_API_KEY` and you pay fal's list price with no markup. The model list below is generated from the same manifest `nodetool generate fal-ai --list-models` reads, so it matches what fal actually serves.",
    ],
    strengths: ["Image", "Video", "Audio", "3D"],
    faq: [
      {
        q: "How do I use my fal.ai key in NodeTool?",
        a: "Store your fal key as `FAL_API_KEY` in NodeTool settings (or the secret store). Every fal node then calls fal directly with your key — NodeTool never proxies or marks up the request.",
      },
      {
        q: "Which fal models does NodeTool support?",
        a: "Every endpoint in fal's node manifest — over a thousand image, video, audio, and 3D models, each a separate node. The catalog on this page is generated from that manifest.",
      },
      {
        q: "Does NodeTool add a fee on top of fal.ai?",
        a: "No. NodeTool is bring-your-own-key — you pay fal's list price for each generation and NodeTool adds nothing per call.",
      },
    ],
  }),
  aggregator({
    slug: "replicate",
    providerId: "replicate",
    name: "Replicate",
    url: "https://replicate.com",
    byokEnv: "REPLICATE_API_TOKEN",
    accent: "blue",
    tagline:
      "Run Replicate's image, video, and audio models in a visual AI workflow — hundreds of community and first-party models, BYOK at Replicate's list price.",
    blurb: [
      "Replicate hosts a large, fast-moving catalog of open and commercial models behind one API — image, video, and audio generators from FLUX and Stable Diffusion to Kling, Wan, and more. NodeTool surfaces each as a node you can drop onto the canvas.",
      "Chain Replicate models into a pipeline — prompt to image, image to video, transcript to speech — and the whole graph is reusable and shareable. Because every model is a node, comparing two Replicate models on the same prompt is a matter of wiring both into the same input.",
      "Replicate is BYOK in NodeTool: set your `REPLICATE_API_TOKEN` and calls go straight to Replicate at their price. The model list below comes from the Replicate node manifest, so it tracks what the provider ships.",
    ],
    strengths: ["Image", "Video", "Audio"],
    faq: [
      {
        q: "How do I connect Replicate to NodeTool?",
        a: "Add your Replicate token as `REPLICATE_API_TOKEN` in NodeTool. Replicate nodes then call the API directly with your token.",
      },
      {
        q: "Which Replicate models are available?",
        a: "The image, video, and audio models in Replicate's node manifest — several hundred, each a separate node. See the catalog below.",
      },
      {
        q: "What does Replicate cost through NodeTool?",
        a: "Replicate's own list price. NodeTool is bring-your-own-key and adds no per-generation fee.",
      },
    ],
  }),
  aggregator({
    slug: "kie",
    providerId: "kie",
    name: "Kie",
    url: "https://kie.ai",
    byokEnv: "KIE_API_KEY",
    accent: "emerald",
    tagline:
      "Run Kie's image, video, and audio models in a visual AI workflow — Veo, Kling, Seedream, Suno and more, called with your own key at Kie's price.",
    blurb: [
      "Kie serves a curated set of top generative models — video (Veo, Kling, Seedance, Hailuo), image (Seedream, FLUX, GPT-Image), and audio including Suno music generation. NodeTool exposes each Kie model as its own node.",
      "Build a Kie pipeline on the canvas: write a prompt, generate an image, animate it, add a Suno soundtrack — one graph, edited freely and re-run on demand. Any Kie node can be swapped for a model on another provider without rewiring the rest.",
      "Kie is BYOK: NodeTool calls it with your `KIE_API_KEY` at Kie's list price. The catalog below is generated from Kie's node manifest.",
    ],
    strengths: ["Video", "Image", "Audio"],
    faq: [
      {
        q: "How do I use Kie in NodeTool?",
        a: "Store your key as `KIE_API_KEY` in NodeTool settings. Kie nodes then call Kie directly with your key.",
      },
      {
        q: "Can I generate music with Kie in NodeTool?",
        a: "Yes — Kie's Suno endpoints are audio nodes, so you can generate music inside a workflow alongside image and video steps.",
      },
      {
        q: "Does NodeTool mark up Kie pricing?",
        a: "No. You pay Kie's list price with your own key; NodeTool adds no per-call fee.",
      },
    ],
  }),
  aggregator({
    slug: "together-ai",
    providerId: "together",
    name: "Together AI",
    url: "https://together.ai",
    byokEnv: "TOGETHER_API_KEY",
    accent: "cyan",
    tagline:
      "Run Together AI's image and video models in a visual AI workflow — FLUX, Seedream, Kling, Veo and more, BYOK at Together's list price.",
    blurb: [
      "Together AI runs a broad inference platform; NodeTool integrates its image and video generation models — FLUX, Seedream, and popular video models — as nodes on the canvas. (Together also serves open LLMs; those are reachable in chat via the Together provider id.)",
      "Drop a Together model into a graph, chain it with models from other providers, and share the whole pipeline as one file. Because each model is a node, putting two through the same prompt is a wiring change, not a rewrite.",
      "Together is BYOK in NodeTool: set `TOGETHER_API_KEY` and calls go to Together at their price. The model list below is generated from Together's node manifest.",
    ],
    strengths: ["Image", "Video", "LLMs"],
    faq: [
      {
        q: "How do I connect Together AI?",
        a: "Add your key as `TOGETHER_API_KEY` in NodeTool. Together nodes call the API directly with your key.",
      },
      {
        q: "Which Together AI models does NodeTool support?",
        a: "The image and video generation models are nodes (catalog below); Together's open-weight LLMs are available in chat and agent nodes via the Together provider.",
      },
      {
        q: "Is there a NodeTool fee on Together AI?",
        a: "No — bring your own key and pay Together's list price. NodeTool adds nothing per call.",
      },
    ],
  }),
  aggregator({
    slug: "atlascloud",
    providerId: "atlascloud",
    name: "AtlasCloud",
    url: "https://atlascloud.ai",
    byokEnv: "ATLASCLOUD_API_KEY",
    accent: "amber",
    tagline:
      "Run AtlasCloud's image and video models in a visual AI workflow — Seedance, GPT-Image and more, called with your own key at AtlasCloud's price.",
    blurb: [
      "AtlasCloud serves image and video generation models through a single API. NodeTool exposes each AtlasCloud model as a node you can compose with the rest of your graph.",
      "Wire an AtlasCloud image model into a video model, add an upscaler, and you have a repeatable pipeline you can re-run and share. Swapping AtlasCloud for another provider is a single node change.",
      "AtlasCloud is BYOK: NodeTool calls it with your `ATLASCLOUD_API_KEY` at their list price. The catalog below comes from AtlasCloud's node manifest.",
    ],
    strengths: ["Image", "Video"],
    faq: [
      {
        q: "How do I use AtlasCloud in NodeTool?",
        a: "Store your key as `ATLASCLOUD_API_KEY` in NodeTool settings. AtlasCloud nodes then call the API directly.",
      },
      {
        q: "Which AtlasCloud models are supported?",
        a: "The image and video models in AtlasCloud's node manifest, each a separate node. See the catalog below.",
      },
      {
        q: "Does NodeTool add a markup?",
        a: "No. You pay AtlasCloud's list price with your own key.",
      },
    ],
  }),
  aggregator({
    slug: "topaz",
    providerId: "topaz",
    name: "Topaz",
    url: "https://topazlabs.com",
    byokEnv: "TOPAZ_API_KEY",
    accent: "rose",
    tagline:
      "Run Topaz's image and video enhancement models in a visual AI workflow — upscaling and restoration, called with your own key at Topaz's price.",
    blurb: [
      "Topaz Labs specializes in image and video enhancement — upscaling, denoising, and restoration. NodeTool integrates its models as nodes, so you can add a Topaz upscale step to the end of any generation pipeline.",
      "Generate an image or video with any provider, then route it through a Topaz node to sharpen and enlarge it — all in one graph. The pipeline is reusable and shareable as a single file.",
      "Topaz is BYOK in NodeTool: set `TOPAZ_API_KEY` and calls go to Topaz at their price. The model list below is generated from Topaz's node manifest.",
    ],
    strengths: ["Image", "Video", "Upscaling"],
    faq: [
      {
        q: "What does Topaz do in NodeTool?",
        a: "Topaz nodes enhance media — upscaling and restoring images and video. Add one after a generation step to sharpen and enlarge the output inside the same workflow.",
      },
      {
        q: "How do I connect Topaz?",
        a: "Add your key as `TOPAZ_API_KEY` in NodeTool. Topaz nodes then call the API directly with your key.",
      },
      {
        q: "Is Topaz billed through NodeTool?",
        a: "No — bring your own key and pay Topaz's list price. NodeTool adds no per-call fee.",
      },
    ],
  }),
];

// ---------------------------------------------------------------------------
// Direct LLM & AI APIs (curated)
// ---------------------------------------------------------------------------

const llmProviders: ProviderEntry[] = [
  direct("llm", {
    slug: "anthropic",
    providerId: "anthropic",
    name: "Anthropic",
    url: "https://www.anthropic.com",
    byokEnv: "ANTHROPIC_API_KEY",
    accent: "amber",
    tagline:
      "Run Anthropic's Claude models in NodeTool chat and agent nodes — long-context reasoning, vision, and tool use, called with your own Anthropic key.",
    blurb: [
      "Anthropic's Claude family is built for reliable reasoning, long context, and tool use. In NodeTool, Claude powers chat nodes, the planning agent, and any node that calls an LLM — wire it into a workflow to summarize, extract, route, or drive multi-step agents.",
      "Claude is bring-your-own-key: set `ANTHROPIC_API_KEY` and NodeTool calls Anthropic directly at their list price. Switching a workflow from Claude to another model is a single change on the node.",
    ],
    strengths: ["Reasoning", "Long context", "Vision", "Tools"],
    capabilities: ["Chat", "Vision", "Tool use", "Streaming", "Agents"],
    highlights: [
      { name: "Claude Opus", desc: "Anthropic's most capable model for hard reasoning and agentic work.", kind: "Chat" },
      { name: "Claude Sonnet", desc: "Balanced speed and capability — the everyday workhorse.", kind: "Chat" },
      { name: "Claude Haiku", desc: "Fast, low-cost model for high-volume and latency-sensitive tasks.", kind: "Chat" },
    ],
    faq: [
      {
        q: "How do I use Claude in NodeTool?",
        a: "Add your `ANTHROPIC_API_KEY` in settings, then pick an Anthropic model on any chat, agent, or LLM node. NodeTool streams the response back onto the canvas.",
      },
      {
        q: "Does NodeTool support Claude tool use and agents?",
        a: "Yes. Claude drives NodeTool's planning agent and tool-calling nodes, so you can build multi-step agents that call tools and other nodes.",
      },
      {
        q: "What does Claude cost in NodeTool?",
        a: "Anthropic's list price — NodeTool is bring-your-own-key and adds no per-token fee.",
      },
    ],
  }),
  direct("llm", {
    slug: "openai",
    providerId: "openai",
    name: "OpenAI",
    url: "https://openai.com",
    byokEnv: "OPENAI_API_KEY",
    accent: "emerald",
    tagline:
      "Run OpenAI's GPT, reasoning, image, and audio models in NodeTool — chat, vision, GPT-Image, transcription, and TTS, called with your own OpenAI key.",
    blurb: [
      "OpenAI covers the widest span of modalities NodeTool exposes from one key: GPT chat and reasoning models, GPT-Image for generation and editing, Whisper transcription, and text-to-speech. Each is a node you can chain into a workflow.",
      "OpenAI is bring-your-own-key: set `OPENAI_API_KEY` and NodeTool calls OpenAI directly at list price. Build a graph that transcribes audio, reasons over it, and renders an image — all through your one OpenAI key.",
    ],
    strengths: ["Reasoning", "Vision", "Image", "Audio"],
    capabilities: ["Chat", "Reasoning", "Vision", "Image gen", "Transcription", "TTS", "Embeddings"],
    highlights: [
      { name: "GPT (flagship)", desc: "General-purpose chat and vision across the GPT series.", kind: "Chat" },
      { name: "Reasoning models", desc: "Step-by-step reasoning for math, code, and planning.", kind: "Reasoning" },
      { name: "GPT-Image", desc: "Text-to-image and image editing with strong prompt following.", kind: "Image" },
      { name: "Whisper", desc: "Robust speech-to-text transcription.", kind: "Transcription" },
    ],
    faq: [
      {
        q: "Which OpenAI models can I use in NodeTool?",
        a: "GPT chat and reasoning models, GPT-Image, Whisper transcription, and text-to-speech — each surfaced as a node. NodeTool queries your account for the models your key can access.",
      },
      {
        q: "How do I set my OpenAI key?",
        a: "Store `OPENAI_API_KEY` in NodeTool settings. Every OpenAI node then calls OpenAI directly with your key.",
      },
      {
        q: "Does NodeTool mark up OpenAI usage?",
        a: "No — you pay OpenAI's list price. NodeTool is bring-your-own-key.",
      },
    ],
  }),
  direct("llm", {
    slug: "google-gemini",
    providerId: "gemini",
    name: "Google Gemini",
    url: "https://ai.google.dev",
    byokEnv: "GEMINI_API_KEY",
    accent: "blue",
    tagline:
      "Run Google's Gemini models in NodeTool — long-context multimodal chat with image and audio understanding, called with your own Gemini API key.",
    blurb: [
      "Google's Gemini models handle text, images, and audio in a single long-context window, which makes them a strong fit for document understanding, multimodal extraction, and agents. In NodeTool, Gemini is available on chat, agent, and LLM nodes.",
      "Gemini is bring-your-own-key: set `GEMINI_API_KEY` and NodeTool calls Google directly at list price. Related Google media models (Imagen, Veo) are also reachable through the media aggregators NodeTool integrates.",
    ],
    strengths: ["Long context", "Multimodal", "Vision", "Tools"],
    capabilities: ["Chat", "Vision", "Audio input", "Tool use", "Streaming"],
    highlights: [
      { name: "Gemini Pro", desc: "Google's most capable multimodal model for complex tasks.", kind: "Chat" },
      { name: "Gemini Flash", desc: "Fast, cost-efficient multimodal model for high volume.", kind: "Chat" },
      { name: "Imagen", desc: "Google's image generation model (via media providers).", kind: "Image" },
      { name: "Veo", desc: "Google's text-to-video model (via media providers).", kind: "Video" },
    ],
    faq: [
      {
        q: "How do I use Gemini in NodeTool?",
        a: "Add your `GEMINI_API_KEY` in settings and select a Gemini model on any chat or agent node. NodeTool calls Google's API directly.",
      },
      {
        q: "Can Gemini read images and audio in NodeTool?",
        a: "Yes — Gemini is multimodal, so you can wire images or audio into a Gemini node and prompt over them in one long-context call.",
      },
      {
        q: "What does Gemini cost in NodeTool?",
        a: "Google's list price. NodeTool is bring-your-own-key with no added fee.",
      },
    ],
  }),
  direct("llm", {
    slug: "xai-grok",
    providerId: "xai",
    name: "xAI Grok",
    url: "https://x.ai",
    byokEnv: "XAI_API_KEY",
    accent: "violet",
    tagline:
      "Run xAI's Grok models in NodeTool chat and agent nodes — capable reasoning with tool use, called with your own xAI key.",
    blurb: [
      "xAI's Grok models are general-purpose chat and reasoning models with tool-use support. In NodeTool, Grok slots into chat nodes, agents, and any LLM step in a workflow.",
      "Grok is bring-your-own-key: set `XAI_API_KEY` and NodeTool calls xAI directly at list price. Swap Grok for another model on the node whenever you want to compare.",
    ],
    strengths: ["Reasoning", "Tools", "Chat"],
    capabilities: ["Chat", "Reasoning", "Tool use", "Streaming"],
    highlights: [
      { name: "Grok (flagship)", desc: "xAI's most capable reasoning and chat model.", kind: "Chat" },
      { name: "Grok (fast)", desc: "Lower-latency tier for high-volume chat.", kind: "Chat" },
    ],
    faq: [
      {
        q: "How do I connect xAI Grok?",
        a: "Store `XAI_API_KEY` in NodeTool settings and pick a Grok model on a chat or agent node.",
      },
      {
        q: "Does Grok support tools in NodeTool?",
        a: "Yes — Grok's tool calling works with NodeTool's agent and tool nodes.",
      },
      {
        q: "What does Grok cost in NodeTool?",
        a: "xAI's list price — NodeTool adds no per-token fee.",
      },
    ],
  }),
  direct("llm", {
    slug: "mistral",
    providerId: "mistral",
    name: "Mistral AI",
    url: "https://mistral.ai",
    byokEnv: "MISTRAL_API_KEY",
    accent: "amber",
    tagline:
      "Run Mistral's chat, vision, and code models in NodeTool — efficient open-weight and commercial models, called with your own Mistral key.",
    blurb: [
      "Mistral AI ships a family of efficient models: general chat (Mistral Large and smaller tiers), Pixtral for vision, and Codestral for code. In NodeTool they power chat, agent, and LLM nodes.",
      "Mistral is bring-your-own-key: set `MISTRAL_API_KEY` and NodeTool calls Mistral directly at list price.",
    ],
    strengths: ["Efficient", "Vision", "Code"],
    capabilities: ["Chat", "Vision", "Code", "Tool use", "Embeddings"],
    highlights: [
      { name: "Mistral Large", desc: "Mistral's flagship general-purpose chat model.", kind: "Chat" },
      { name: "Pixtral", desc: "Vision-capable model for image understanding.", kind: "Vision" },
      { name: "Codestral", desc: "Specialized model for code generation and completion.", kind: "Code" },
    ],
    faq: [
      {
        q: "How do I use Mistral in NodeTool?",
        a: "Add `MISTRAL_API_KEY` in settings and select a Mistral model on any chat or agent node.",
      },
      {
        q: "Can Mistral handle images or code?",
        a: "Yes — Pixtral adds vision and Codestral targets code, both available as models on Mistral nodes.",
      },
      {
        q: "What does Mistral cost in NodeTool?",
        a: "Mistral's list price. NodeTool is bring-your-own-key.",
      },
    ],
  }),
  direct("llm", {
    slug: "groq",
    providerId: "groq",
    name: "Groq",
    url: "https://groq.com",
    byokEnv: "GROQ_API_KEY",
    accent: "rose",
    tagline:
      "Run open models on Groq's ultra-fast inference in NodeTool — very high tokens-per-second chat, called with your own Groq key.",
    blurb: [
      "Groq runs open-weight models (Llama and others) on custom LPU hardware for very low latency and high throughput. In NodeTool, Groq is the pick when a chat or agent step needs to be fast — the same open models, served quickly.",
      "Groq is bring-your-own-key: set `GROQ_API_KEY` and NodeTool calls Groq directly at list price.",
    ],
    strengths: ["Fast inference", "Open models", "Low latency"],
    capabilities: ["Chat", "Tool use", "Streaming"],
    highlights: [
      { name: "Llama (Groq-served)", desc: "Meta's open Llama models at very high tokens/sec.", kind: "Chat" },
      { name: "Open-weight models", desc: "A rotating set of popular open models on Groq's LPU.", kind: "Chat" },
    ],
    faq: [
      {
        q: "Why use Groq in NodeTool?",
        a: "Speed. Groq serves open models with very low latency, which helps agent loops and high-volume chat nodes finish faster.",
      },
      {
        q: "How do I connect Groq?",
        a: "Store `GROQ_API_KEY` in NodeTool and select a Groq model on a chat or agent node.",
      },
      {
        q: "What does Groq cost in NodeTool?",
        a: "Groq's list price — NodeTool adds no fee.",
      },
    ],
  }),
  direct("llm", {
    slug: "deepseek",
    providerId: "deepseek",
    name: "DeepSeek",
    url: "https://deepseek.com",
    byokEnv: "DEEPSEEK_API_KEY",
    accent: "blue",
    tagline:
      "Run DeepSeek's chat and reasoning models in NodeTool — strong reasoning at low cost, called with your own DeepSeek key.",
    blurb: [
      "DeepSeek's models are known for strong reasoning and coding at a low price point, with a dedicated reasoning variant. In NodeTool they power chat, agent, and LLM nodes.",
      "DeepSeek is bring-your-own-key: set `DEEPSEEK_API_KEY` and NodeTool calls DeepSeek directly at list price.",
    ],
    strengths: ["Reasoning", "Code", "Low cost"],
    capabilities: ["Chat", "Reasoning", "Tool use", "Streaming"],
    highlights: [
      { name: "DeepSeek Chat", desc: "General-purpose chat model with strong coding.", kind: "Chat" },
      { name: "DeepSeek Reasoner", desc: "Reasoning-tuned variant for hard multi-step problems.", kind: "Reasoning" },
    ],
    faq: [
      {
        q: "How do I use DeepSeek in NodeTool?",
        a: "Add `DEEPSEEK_API_KEY` in settings and pick a DeepSeek model on a chat or agent node.",
      },
      {
        q: "Does DeepSeek have a reasoning model?",
        a: "Yes — DeepSeek's reasoner variant is available as a model on DeepSeek nodes for step-by-step problems.",
      },
      {
        q: "What does DeepSeek cost in NodeTool?",
        a: "DeepSeek's list price. NodeTool is bring-your-own-key.",
      },
    ],
  }),
  direct("llm", {
    slug: "cohere",
    providerId: "cohere",
    name: "Cohere",
    url: "https://cohere.com",
    byokEnv: "COHERE_API_KEY",
    accent: "cyan",
    tagline:
      "Run Cohere's Command, Embed, and Rerank models in NodeTool — chat plus best-in-class retrieval for RAG, called with your own Cohere key.",
    blurb: [
      "Cohere focuses on enterprise retrieval: Command for chat, Embed for embeddings, and Rerank for reordering search results. In NodeTool, that makes Cohere a natural backbone for RAG pipelines built on the vector store.",
      "Cohere is bring-your-own-key: set `COHERE_API_KEY` and NodeTool calls Cohere directly at list price.",
    ],
    strengths: ["RAG", "Embeddings", "Rerank", "Chat"],
    capabilities: ["Chat", "Embeddings", "Rerank", "Tool use"],
    highlights: [
      { name: "Command", desc: "Cohere's chat model, tuned for RAG and tool use.", kind: "Chat" },
      { name: "Embed", desc: "High-quality text embeddings for search and clustering.", kind: "Embeddings" },
      { name: "Rerank", desc: "Reorders retrieved passages by relevance to a query.", kind: "Rerank" },
    ],
    faq: [
      {
        q: "Why use Cohere in NodeTool?",
        a: "Retrieval. Cohere's Embed and Rerank models improve RAG pipelines, and Command handles the chat step — all as nodes over NodeTool's vector store.",
      },
      {
        q: "How do I connect Cohere?",
        a: "Store `COHERE_API_KEY` in NodeTool settings; Cohere nodes then call the API directly.",
      },
      {
        q: "What does Cohere cost in NodeTool?",
        a: "Cohere's list price — NodeTool adds no fee.",
      },
    ],
  }),
  direct("llm", {
    slug: "openrouter",
    providerId: "openrouter",
    name: "OpenRouter",
    url: "https://openrouter.ai",
    byokEnv: "OPENROUTER_API_KEY",
    accent: "violet",
    tagline:
      "Run hundreds of models through OpenRouter in NodeTool — one key routed to many providers, called at OpenRouter's price.",
    blurb: [
      "OpenRouter is a unified router: one API and one key that reaches models from dozens of providers, with automatic fallback and a single bill. In NodeTool it's the fastest way to try many models without collecting a key for each.",
      "OpenRouter is bring-your-own-key: set `OPENROUTER_API_KEY` and NodeTool routes chat and agent calls through OpenRouter at their price.",
    ],
    strengths: ["Many models", "One key", "Fallback"],
    capabilities: ["Chat", "Reasoning", "Vision", "Tool use", "Streaming"],
    highlights: [
      { name: "Frontier chat models", desc: "Flagship models from major labs behind one endpoint.", kind: "Chat" },
      { name: "Open-weight models", desc: "A large catalog of open models across hosts.", kind: "Chat" },
      { name: "Automatic routing", desc: "Fallback and price/latency routing across providers.", kind: "Routing" },
    ],
    faq: [
      {
        q: "Why use OpenRouter in NodeTool?",
        a: "Breadth with one key. OpenRouter reaches hundreds of models across providers, so you can compare or fall back without managing many API keys.",
      },
      {
        q: "How do I connect OpenRouter?",
        a: "Add `OPENROUTER_API_KEY` in settings and select an OpenRouter model on a chat or agent node.",
      },
      {
        q: "What does OpenRouter cost in NodeTool?",
        a: "OpenRouter's per-model price. NodeTool is bring-your-own-key.",
      },
    ],
  }),
  direct("llm", {
    slug: "huggingface",
    providerId: "huggingface",
    name: "Hugging Face",
    url: "https://huggingface.co",
    byokEnv: "HF_TOKEN",
    accent: "amber",
    tagline:
      "Run Hugging Face-hosted models in NodeTool — open models across text, image, and audio through Inference, called with your own HF token.",
    blurb: [
      "Hugging Face hosts the open-model ecosystem and serves many of them through its Inference API and partner providers. In NodeTool, that opens a large set of open text, image, and audio models as nodes.",
      "Hugging Face is bring-your-own-key: set `HF_TOKEN` and NodeTool calls Hugging Face directly at their price.",
    ],
    strengths: ["Open models", "Text", "Image", "Audio"],
    capabilities: ["Chat", "Image gen", "Audio", "Embeddings"],
    highlights: [
      { name: "Open LLMs", desc: "Llama, Qwen, Mistral and more served via Inference.", kind: "Chat" },
      { name: "Open image models", desc: "FLUX, Stable Diffusion and other open generators.", kind: "Image" },
      { name: "Audio models", desc: "Open speech and audio models from the Hub.", kind: "Audio" },
    ],
    faq: [
      {
        q: "How do I use Hugging Face in NodeTool?",
        a: "Store `HF_TOKEN` in settings and select a Hugging Face-served model on the relevant node.",
      },
      {
        q: "Which Hugging Face models are available?",
        a: "Open models served through Hugging Face Inference and its partner providers — text, image, and audio.",
      },
      {
        q: "What does Hugging Face cost in NodeTool?",
        a: "Hugging Face's list price. NodeTool is bring-your-own-key.",
      },
    ],
  }),
  direct("llm", {
    slug: "cerebras",
    providerId: "cerebras",
    name: "Cerebras",
    url: "https://cerebras.ai",
    byokEnv: "CEREBRAS_API_KEY",
    accent: "emerald",
    tagline:
      "Run open models on Cerebras' wafer-scale inference in NodeTool — extreme tokens-per-second chat, called with your own Cerebras key.",
    blurb: [
      "Cerebras serves open models on wafer-scale hardware for some of the fastest inference available. In NodeTool it's a low-latency backend for chat and agent nodes that run the same open models.",
      "Cerebras is bring-your-own-key: set `CEREBRAS_API_KEY` and NodeTool calls Cerebras directly at list price.",
    ],
    strengths: ["Fastest inference", "Open models"],
    capabilities: ["Chat", "Tool use", "Streaming"],
    highlights: [
      { name: "Llama (Cerebras-served)", desc: "Open Llama models at extreme tokens/sec.", kind: "Chat" },
      { name: "Open-weight models", desc: "Popular open models on wafer-scale hardware.", kind: "Chat" },
    ],
    faq: [
      {
        q: "Why use Cerebras in NodeTool?",
        a: "Latency. Cerebras serves open models extremely fast, which speeds up agent loops and interactive chat nodes.",
      },
      {
        q: "How do I connect Cerebras?",
        a: "Add `CEREBRAS_API_KEY` in settings and pick a Cerebras model on a chat or agent node.",
      },
      {
        q: "What does Cerebras cost in NodeTool?",
        a: "Cerebras' list price — NodeTool adds no fee.",
      },
    ],
  }),
  direct("llm", {
    slug: "moonshot-kimi",
    providerId: "moonshot",
    name: "Moonshot (Kimi)",
    url: "https://www.moonshot.ai",
    byokEnv: "KIMI_API_KEY",
    accent: "blue",
    tagline:
      "Run Moonshot's Kimi models in NodeTool — long-context chat and agentic coding, called with your own Kimi key.",
    blurb: [
      "Moonshot AI's Kimi models are known for very long context and strong agentic coding. NodeTool speaks to them through the Anthropic-compatible endpoint, so Kimi drives chat, agent, and LLM nodes.",
      "Moonshot is bring-your-own-key: set `KIMI_API_KEY` and NodeTool calls Moonshot directly at list price.",
    ],
    strengths: ["Long context", "Agentic", "Code"],
    capabilities: ["Chat", "Tool use", "Streaming", "Agents"],
    highlights: [
      { name: "Kimi (flagship)", desc: "Moonshot's long-context chat and agent model.", kind: "Chat" },
      { name: "Kimi for coding", desc: "Agentic coding variant with tool use.", kind: "Code" },
    ],
    faq: [
      {
        q: "How do I use Kimi in NodeTool?",
        a: "Store `KIMI_API_KEY` in settings and select a Moonshot/Kimi model on a chat or agent node.",
      },
      {
        q: "Is Kimi good for agents?",
        a: "Yes — Kimi's long context and tool use fit NodeTool's planning agent and multi-step workflows.",
      },
      {
        q: "What does Kimi cost in NodeTool?",
        a: "Moonshot's list price. NodeTool is bring-your-own-key.",
      },
    ],
  }),
];

// ---------------------------------------------------------------------------
// Media & 3D specialists (curated)
// ---------------------------------------------------------------------------

const mediaProviders: ProviderEntry[] = [
  direct("media", {
    slug: "elevenlabs",
    providerId: "elevenlabs",
    name: "ElevenLabs",
    url: "https://elevenlabs.io",
    byokEnv: "ELEVENLABS_API_KEY",
    accent: "rose",
    tagline:
      "Run ElevenLabs' voice models in NodeTool — text-to-speech, voice cloning, dubbing, and sound effects, called with your own ElevenLabs key.",
    blurb: [
      "ElevenLabs is the leading voice AI provider: expressive text-to-speech, voice cloning, dubbing across languages, and generative sound effects. In NodeTool, its models are audio nodes you can chain after a script writer or before a video assembler.",
      "ElevenLabs is bring-your-own-key: set `ELEVENLABS_API_KEY` and NodeTool calls ElevenLabs directly at their price.",
    ],
    strengths: ["Text-to-speech", "Voice cloning", "Dubbing", "SFX"],
    capabilities: ["Text-to-speech", "Voice cloning", "Dubbing", "Sound effects"],
    highlights: [
      { name: "Text-to-Speech", desc: "Expressive, multilingual TTS with many voices.", kind: "Audio" },
      { name: "Voice cloning", desc: "Create a custom voice from a short sample.", kind: "Audio" },
      { name: "Sound effects", desc: "Generate SFX from a text description.", kind: "Audio" },
    ],
    faq: [
      {
        q: "How do I use ElevenLabs in NodeTool?",
        a: "Add `ELEVENLABS_API_KEY` in settings, then add an ElevenLabs node and feed it text. The audio comes back onto the canvas for the next step.",
      },
      {
        q: "Can I clone a voice in a workflow?",
        a: "Yes — ElevenLabs voice models are nodes, so cloning and TTS run inside a pipeline alongside your text and video steps.",
      },
      {
        q: "What does ElevenLabs cost in NodeTool?",
        a: "ElevenLabs' list price. NodeTool is bring-your-own-key.",
      },
    ],
  }),
  direct("media", {
    slug: "reve",
    providerId: "reve",
    name: "Reve",
    url: "https://reve.art",
    byokEnv: "REVE_API_KEY",
    accent: "violet",
    tagline:
      "Run Reve's image models in NodeTool — high-quality generation with strong prompt adherence and text rendering, called with your own Reve key.",
    blurb: [
      "Reve is an image generation model known for prompt adherence and legible in-image text. In NodeTool it's an image node you can drop into a graph and chain with editing, upscaling, or video steps.",
      "Reve is bring-your-own-key: set `REVE_API_KEY` and NodeTool calls Reve directly at their price.",
    ],
    strengths: ["Image", "Prompt adherence", "Text rendering"],
    capabilities: ["Text-to-image", "Image editing"],
    highlights: [
      { name: "Reve Image", desc: "High-fidelity text-to-image with strong prompt following.", kind: "Image" },
    ],
    faq: [
      {
        q: "How do I use Reve in NodeTool?",
        a: "Store `REVE_API_KEY` in settings, add a Reve node, and wire in a prompt. The image returns to the canvas for the next node.",
      },
      {
        q: "Is Reve good at text in images?",
        a: "Yes — legible in-image text is one of Reve's strengths, useful for posters and mockups.",
      },
      {
        q: "What does Reve cost in NodeTool?",
        a: "Reve's list price. NodeTool is bring-your-own-key.",
      },
    ],
  }),
  direct("media", {
    slug: "meshy",
    providerId: "meshy",
    name: "Meshy",
    url: "https://meshy.ai",
    byokEnv: "MESHY_API_KEY",
    accent: "cyan",
    tagline:
      "Run Meshy's 3D models in NodeTool — text-to-3D and image-to-3D with textured meshes, called with your own Meshy key.",
    blurb: [
      "Meshy generates 3D assets from text or images — textured meshes ready for games, AR, and prototyping. In NodeTool, Meshy is a node you can drive from a prompt or an upstream image model.",
      "Meshy is bring-your-own-key: set `MESHY_API_KEY` and NodeTool calls Meshy directly at their price.",
    ],
    strengths: ["Text-to-3D", "Image-to-3D", "Textured meshes"],
    capabilities: ["Text-to-3D", "Image-to-3D", "Texturing"],
    highlights: [
      { name: "Text-to-3D", desc: "Generate a textured 3D mesh from a text prompt.", kind: "3D" },
      { name: "Image-to-3D", desc: "Turn a reference image into a 3D model.", kind: "3D" },
    ],
    faq: [
      {
        q: "How do I use Meshy in NodeTool?",
        a: "Add `MESHY_API_KEY` in settings, then feed a Meshy node a prompt or an image to get a 3D mesh back.",
      },
      {
        q: "Can I chain an image model into Meshy?",
        a: "Yes — generate an image with any provider, then wire it into Meshy's image-to-3D node in the same graph.",
      },
      {
        q: "What does Meshy cost in NodeTool?",
        a: "Meshy's list price. NodeTool is bring-your-own-key.",
      },
    ],
  }),
  direct("media", {
    slug: "rodin",
    providerId: "rodin",
    name: "Rodin (Hyper3D)",
    url: "https://hyper3d.ai",
    byokEnv: "RODIN_API_KEY",
    accent: "amber",
    tagline:
      "Run Hyper3D's Rodin models in NodeTool — image-to-3D generation of production-ready meshes, called with your own Rodin key.",
    blurb: [
      "Rodin, from Hyper3D, turns images and prompts into detailed 3D meshes suited to production pipelines. In NodeTool it's a 3D node you can chain after an image generator.",
      "Rodin is bring-your-own-key: set `RODIN_API_KEY` and NodeTool calls Hyper3D directly at their price.",
    ],
    strengths: ["Image-to-3D", "Detailed meshes"],
    capabilities: ["Image-to-3D", "Text-to-3D"],
    highlights: [
      { name: "Rodin (image-to-3D)", desc: "Generate detailed 3D meshes from an image.", kind: "3D" },
    ],
    faq: [
      {
        q: "How do I use Rodin in NodeTool?",
        a: "Store `RODIN_API_KEY` in settings and feed a Rodin node an image or prompt to get a 3D mesh.",
      },
      {
        q: "How is Rodin different from Meshy?",
        a: "Both do text/image-to-3D; they differ in style and detail. NodeTool exposes both as nodes so you can try each on the same input.",
      },
      {
        q: "What does Rodin cost in NodeTool?",
        a: "Hyper3D's list price. NodeTool is bring-your-own-key.",
      },
    ],
  }),
  direct("media", {
    slug: "minimax",
    providerId: "minimax",
    name: "MiniMax",
    url: "https://www.minimax.io",
    byokEnv: "MINIMAX_API_KEY",
    accent: "blue",
    tagline:
      "Run MiniMax's video, chat, and speech models in NodeTool — including Hailuo video, called with your own MiniMax key.",
    blurb: [
      "MiniMax builds across modalities: the Hailuo video models, capable chat models, and expressive speech. In NodeTool its models are nodes you can compose — script to speech, prompt to video — in one graph.",
      "MiniMax is bring-your-own-key: set `MINIMAX_API_KEY` and NodeTool calls MiniMax directly at their price. Hailuo is also reachable through the media aggregators NodeTool integrates.",
    ],
    strengths: ["Video", "Chat", "Speech"],
    capabilities: ["Text-to-video", "Chat", "Text-to-speech"],
    highlights: [
      { name: "Hailuo (video)", desc: "MiniMax's text- and image-to-video model.", kind: "Video" },
      { name: "MiniMax chat", desc: "Capable long-context chat models.", kind: "Chat" },
      { name: "Speech", desc: "Expressive text-to-speech voices.", kind: "Audio" },
    ],
    faq: [
      {
        q: "How do I use MiniMax in NodeTool?",
        a: "Add `MINIMAX_API_KEY` in settings and select a MiniMax model on the relevant node (video, chat, or speech).",
      },
      {
        q: "Is Hailuo available in NodeTool?",
        a: "Yes — Hailuo video is reachable through MiniMax and through the media aggregators, all as nodes on the canvas.",
      },
      {
        q: "What does MiniMax cost in NodeTool?",
        a: "MiniMax's list price. NodeTool is bring-your-own-key.",
      },
    ],
  }),
];

export const providerEntries: ProviderEntry[] = [
  ...aggregators,
  ...llmProviders,
  ...mediaProviders,
];

/** Page-registry contribution: one entry per provider page + the hub. */
export const entries: PageEntry[] = [
  {
    route: "/providers",
    title: `AI model providers in NodeTool — bring your own key (${yearToken()})`,
    description:
      "Every model provider NodeTool integrates — fal.ai, Replicate, OpenAI, Anthropic, Gemini, ElevenLabs and more — with the models each one serves. Bring your own key at provider prices.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
  },
  ...providerEntries.map(
    (p): PageEntry => ({
      route: p.route,
      title: p.title,
      description: p.description,
      priority: p.priority,
      changeFrequency: p.changeFrequency,
      indexable: p.indexable,
    })
  ),
];

export function providerBySlug(slug: string): ProviderEntry | undefined {
  return providerEntries.find((p) => p.slug === slug);
}

export function providersByCategory(
  category: ProviderCategory
): ProviderEntry[] {
  return providerEntries.filter((p) => p.category === category);
}

export function kindLabel(kind: ProviderModelKind): string {
  return KIND_LABEL[kind];
}
