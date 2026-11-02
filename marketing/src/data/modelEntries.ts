/**
 * Model pages (`/models/<slug>`). Hand-written per model: the capability blurb
 * and FAQ are the intent-match, so they don't come from a generator. Provider
 * coverage, by contrast, IS generated — `modelProviderCoverage.generated.ts`
 * (built by `scripts/generate-model-coverage.mjs`) maps each slug to the
 * runtime providers that serve it, from the same manifests
 * `generate --list-models` reads.
 *
 * Launch set: Seedance, Veo 3, Kling, Sora, Hailuo, Wan (video), Seedream,
 * FLUX, GPT-Image, Imagen (image) — all verified present in `packages/*-nodes`.
 *
 * Image families added from the model-watch backlog: Nano Banana, Ideogram,
 * Recraft, Qwen Image, Z-Image, Grok Imagine, Krea 2, Hunyuan Image, ERNIE
 * Image, Sana, Reve, MAI Image, Bria FIBO, Luma Photon, HiDream, Stable Diffusion 3, Luma Uni-1, Meta Muse Image.
 */
import type { PageEntry } from "./types";
import { yearToken } from "./types";
import { modelProviderCoverage } from "./modelProviderCoverage.generated";

export type Modality =
  | "text-to-video"
  | "image-to-video"
  | "text-to-image"
  | "image-to-image";

const MODALITY_LABEL: Record<Modality, string> = {
  "text-to-video": "Text-to-video",
  "image-to-video": "Image-to-video",
  "text-to-image": "Text-to-image",
  "image-to-image": "Image-to-image",
};

export function modalityLabel(m: Modality): string {
  return MODALITY_LABEL[m];
}

export type Accent = "blue" | "violet" | "emerald" | "rose" | "amber" | "cyan";

interface ModelFact {
  label: string;
  value: string;
}

export interface ModelFaq {
  q: string;
  a: string;
}

export interface ModelEntry extends PageEntry {
  slug: string;
  name: string;
  vendor: string;
  modality: Modality;
  /** Hero subtitle — one line. */
  tagline: string;
  /** Capability blurb, 2–3 paragraphs. */
  blurb: string[];
  /** Capability facts (max duration/resolution, audio, aspect ratios, …). */
  facts: ModelFact[];
  faq: ModelFaq[];
  /**
   * Showcase `modelSlug`s whose entries belong on this page. The page also
   * matches any showcase slug that starts with the page slug, so a seeder run
   * with a finer-grained `--models` id (e.g. `flux-schnell`) still lands here.
   */
  showcaseSlugs: string[];
  /** Featured template slug — linked now, embedded once PR-2's renderer lands. */
  templateSlug?: string;
  /** Runtime provider ids that serve this model (from generated coverage). */
  providers: string[];
  accent: Accent;
}

type ModelContent = Omit<
  ModelEntry,
  keyof PageEntry | "providers"
> & { priority?: number };

/** Fill the shared PageEntry fields + generated provider coverage. */
function model(c: ModelContent): ModelEntry {
  const route = `/models/${c.slug}`;
  return {
    ...c,
    route,
    title: `${c.name} in NodeTool — run it in a visual AI workflow (${yearToken()})`,
    description: c.tagline,
    priority: c.priority ?? 0.7,
    changeFrequency: "monthly",
    indexable: true,
    providers: modelProviderCoverage[c.slug] ?? [],
  };
}

export const modelEntries: ModelEntry[] = [
  model({
    slug: "veo-3",
    name: "Veo 3",
    vendor: "Google DeepMind",
    modality: "text-to-video",
    accent: "blue",
    tagline:
      "Run Google DeepMind's Veo 3 in a visual AI workflow — cinematic text-to-video with native audio, called with your own key at provider prices.",
    blurb: [
      "Veo 3 is Google DeepMind's flagship text-to-video model. It turns a written prompt into a short cinematic clip with coherent motion, consistent subjects, and — the headline feature — a synchronized audio track: dialogue, ambient sound, and music generated alongside the picture rather than dubbed on afterward.",
      "In NodeTool, Veo 3 is a node on the canvas. Wire a prompt into it, connect its output to an upscaler, a captioner, or a timeline, and you have a repeatable pipeline instead of a one-off generation. The same graph runs on your desktop or in NodeTool Cloud, and you can swap Veo 3 for another video model by changing one node.",
      "Because NodeTool is bring-your-own-key, you call Veo 3 through whichever provider you already have access to and pay that provider's list price — no credits, no markup. Below is which providers currently serve it and the exact model ids their `--list-models` reports.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-video (image-to-video variants)" },
      { label: "Native audio", value: "Yes — dialogue, SFX, and music" },
      { label: "Clip length", value: "Up to ~8s per generation" },
      { label: "Resolution", value: "720p / 1080p" },
    ],
    faq: [
      {
        q: "Does Veo 3 generate audio?",
        a: "Yes. Veo 3's defining feature is native audio — it produces synchronized dialogue, sound effects, and music with the video instead of requiring a separate track. In a NodeTool graph the audio comes back with the clip.",
      },
      {
        q: "How do I run Veo 3 in NodeTool?",
        a: "Add the Veo 3 video node to a workflow, connect a text prompt, and run it. NodeTool routes the call to a provider you have a key for and streams the result back onto the canvas.",
      },
      {
        q: "What does Veo 3 cost in NodeTool?",
        a: "NodeTool is BYOK — you pay the provider that serves Veo 3 at their list price. NodeTool adds no per-generation fee.",
      },
    ],
    showcaseSlugs: ["veo-3", "veo3", "veo-3-fast", "veo3-fast"],
    templateSlug: "movie-trailer-generator",
  }),
  model({
    slug: "sora",
    name: "Sora 2",
    vendor: "OpenAI",
    modality: "text-to-video",
    accent: "violet",
    tagline:
      "Run OpenAI's Sora 2 in a visual AI workflow — prompt-to-video with sound and strong physical realism, BYOK at provider prices.",
    blurb: [
      "Sora 2 is OpenAI's text-to-video model, known for physically plausible motion, stable multi-shot scenes, and a synchronized audio track. It handles prompts that describe camera moves and staging, not just subjects, which makes it a natural fit for storyboarding and short narrative pieces.",
      "NodeTool exposes Sora 2 as a video node with text- and image-to-video entry points. Drop it into a graph alongside a prompt writer, a reference image, or a duel against another model, and the whole pipeline is reusable and shareable as a single workflow file.",
      "Sora 2 is BYOK in NodeTool: bring the key for a provider that serves it and pay their price directly. The provider table below is generated from the node manifests, so it matches what each provider actually lists.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-video and image-to-video" },
      { label: "Native audio", value: "Yes" },
      { label: "Clip length", value: "Up to ~20s (pro tiers)" },
      { label: "Strengths", value: "Physical realism, multi-shot consistency" },
    ],
    faq: [
      {
        q: "Can Sora 2 do image-to-video?",
        a: "Yes. Providers expose Sora 2 text-to-video and image-to-video endpoints, both available as nodes in NodeTool.",
      },
      {
        q: "Is Sora 2 available without a ChatGPT subscription?",
        a: "In NodeTool you call Sora 2 through a provider that serves the API and pay that provider directly. See the provider table for the current options.",
      },
      {
        q: "How is Sora 2 different from Veo 3?",
        a: "Both are audio-capable text-to-video models. Sora 2 is often preferred for physical realism and longer multi-shot clips; Veo 3 for tightly synchronized native audio. NodeTool's model-vs-model pages put the same prompt through both.",
      },
    ],
    showcaseSlugs: ["sora", "sora-2", "sora2", "sora-2-pro"],
    templateSlug: "movie-trailer-generator",
  }),
  model({
    slug: "kling",
    name: "Kling",
    vendor: "Kuaishou",
    modality: "image-to-video",
    accent: "cyan",
    tagline:
      "Run Kuaishou's Kling in a visual AI workflow — expressive image-to-video and text-to-video with strong motion, BYOK at provider prices.",
    blurb: [
      "Kling, from Kuaishou, is a video model with a reputation for fluid, expressive motion and reliable image-to-video — animate a still frame and it keeps the subject coherent while adding believable movement. It ships in several tiers (standard and pro) plus specialized modes like start/end-frame control.",
      "In NodeTool, Kling's endpoints are nodes you compose: feed it a generated or uploaded image, chain it after an image model to build an image-then-video pipeline, or extend clips with its continuation modes. One graph, edited freely, re-run on demand.",
      "Kling is BYOK — pick a provider from the generated table below, use your own key, and pay list price. Swapping Kling for Hailuo or Wan is a single node change.",
    ],
    facts: [
      { label: "Modality", value: "Image-to-video and text-to-video" },
      { label: "Clip length", value: "Up to ~10s, extendable" },
      { label: "Resolution", value: "Up to 1080p" },
      { label: "Modes", value: "Standard / pro, start-end frame" },
    ],
    faq: [
      {
        q: "Is Kling good for image-to-video?",
        a: "Yes — image-to-video is one of Kling's strengths. Give it a still and it animates the subject while keeping it recognizable across the clip.",
      },
      {
        q: "Which Kling version does NodeTool use?",
        a: "NodeTool surfaces whatever Kling endpoints your provider ships as separate nodes, including standard and pro tiers. The provider table lists the exact model ids.",
      },
      {
        q: "Can I extend a Kling clip?",
        a: "Yes. Kling's continuation and start/end-frame modes are available as nodes, so you can chain segments into a longer sequence inside one workflow.",
      },
    ],
    showcaseSlugs: ["kling", "kling-2", "kling-pro", "kling-o3"],
    templateSlug: "movie-trailer-generator",
  }),
  model({
    slug: "seedance",
    name: "Seedance",
    vendor: "ByteDance",
    modality: "text-to-video",
    accent: "rose",
    tagline:
      "Run ByteDance's Seedance in a visual AI workflow — fast, high-motion text- and image-to-video, BYOK at provider prices.",
    blurb: [
      "Seedance is ByteDance's video model, built for lively motion and quick turnaround. Its lite and pro tiers trade speed against fidelity, and it handles both text-to-video and image-to-video, which makes it a practical default for iterating on a shot before committing to a slower model.",
      "As a NodeTool node, Seedance slots into the same graph as your prompt writer, reference images, and post-processing. Because every model here shares one interface, you can A/B Seedance against Veo or Kling on the same prompt without rebuilding the pipeline.",
      "Seedance is BYOK. The table below — generated from the node manifests — shows which providers serve it and under which ids.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-video and image-to-video" },
      { label: "Tiers", value: "Lite (fast) and pro (higher fidelity)" },
      { label: "Clip length", value: "~5–10s" },
      { label: "Resolution", value: "Up to 1080p" },
    ],
    faq: [
      {
        q: "What is Seedance best at?",
        a: "High-motion clips generated quickly. The lite tier is fast enough for rapid iteration; the pro tier raises fidelity for a final render.",
      },
      {
        q: "Does Seedance support image-to-video?",
        a: "Yes. Both text-to-video and image-to-video endpoints are available as nodes in NodeTool.",
      },
      {
        q: "How do I compare Seedance to other video models?",
        a: "Use NodeTool's model-vs-model pages, which run the same prompt through Seedance and a rival and show the two outputs side by side.",
      },
    ],
    showcaseSlugs: ["seedance", "seedance-pro", "seedance-lite", "seedance-1"],
    templateSlug: "movie-trailer-generator",
  }),
  model({
    slug: "hailuo",
    name: "Hailuo",
    vendor: "MiniMax",
    modality: "image-to-video",
    accent: "amber",
    tagline:
      "Run MiniMax's Hailuo in a visual AI workflow — punchy image-to-video and text-to-video with strong subject motion, BYOK at provider prices.",
    blurb: [
      "Hailuo, MiniMax's video model, is known for energetic subject motion and solid image-to-video — hand it a portrait or product still and it produces movement that stays on-model. Its fast and pro variants let you trade latency for quality.",
      "In NodeTool, Hailuo is a node you can chain after any image generator or asset, then feed forward into upscaling, captioning, or a timeline. The workflow is portable: the same graph runs locally or in the cloud.",
      "Hailuo is BYOK — bring your own provider key and pay list price. The provider coverage below is generated straight from the manifests.",
    ],
    facts: [
      { label: "Modality", value: "Image-to-video and text-to-video" },
      { label: "Variants", value: "Fast and pro (2.x series)" },
      { label: "Clip length", value: "~6–10s" },
      { label: "Resolution", value: "Up to 1080p" },
    ],
    faq: [
      {
        q: "Is Hailuo good for animating a photo?",
        a: "Yes. Image-to-video is a Hailuo strength — it adds motion to a still while keeping the subject consistent.",
      },
      {
        q: "What's the difference between Hailuo's fast and pro modes?",
        a: "Fast trades some fidelity for lower latency; pro raises quality for final renders. Both are separate nodes in NodeTool.",
      },
      {
        q: "Can I use Hailuo in a batch pipeline?",
        a: "Yes. Wire it into a NodeTool workflow with a list input and it runs across every item, emitting one clip per row.",
      },
    ],
    showcaseSlugs: ["hailuo", "hailuo-2", "hailuo-02", "minimax-hailuo"],
    templateSlug: "movie-trailer-generator",
  }),
  model({
    slug: "wan",
    name: "Wan",
    vendor: "Alibaba",
    modality: "text-to-video",
    accent: "emerald",
    tagline:
      "Run Alibaba's Wan in a visual AI workflow — open-weights text- and image-to-video with a deep toolkit of control modes, BYOK at provider prices.",
    blurb: [
      "Wan is Alibaba's open-weights video family. Beyond plain text- and image-to-video it ships an unusually deep set of control modes — pose, depth, inpainting, outpainting, reframing — which makes it the video model to reach for when you need to steer motion, not just prompt it.",
      "NodeTool exposes those modes as distinct nodes, so a Wan graph can be as simple as prompt-to-clip or as involved as a pose-guided, inpainted, reframed pipeline. Being open weights, Wan also runs on infrastructure you control when a provider isn't the right fit.",
      "Wan is BYOK through the hosted providers below, or self-hosted. The provider table is generated from the manifests.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-video, image-to-video, video-to-video" },
      { label: "Weights", value: "Open — self-hostable" },
      { label: "Control modes", value: "Pose, depth, inpaint, outpaint, reframe" },
      { label: "Resolution", value: "Up to 720p (provider-dependent)" },
    ],
    faq: [
      {
        q: "Is Wan open source?",
        a: "Wan ships open weights, so you can run it on your own hardware in addition to calling it through a hosted provider. NodeTool supports both.",
      },
      {
        q: "What control modes does Wan support?",
        a: "Pose, depth, inpainting, outpainting, and reframing, among others — each available as its own node in NodeTool for precise, steerable motion.",
      },
      {
        q: "Can I run Wan locally?",
        a: "Yes. Because the weights are open, Wan can run self-hosted; in NodeTool you point the node at your endpoint instead of a hosted provider.",
      },
    ],
    showcaseSlugs: ["wan", "wan-2", "wan-22", "wan2"],
    templateSlug: "movie-trailer-generator",
  }),
  model({
    slug: "flux",
    name: "FLUX",
    vendor: "Black Forest Labs",
    modality: "text-to-image",
    accent: "blue",
    tagline:
      "Run Black Forest Labs' FLUX in a visual AI workflow — sharp, prompt-faithful text-to-image with a full editing family, BYOK at provider prices.",
    blurb: [
      "FLUX, from Black Forest Labs, is a text-to-image family prized for prompt fidelity, clean typography, and a coherent look across a scene. It spans fast (schnell), balanced (dev), and high-fidelity (pro / ultra) tiers, plus Kontext editing and fill/redux variants for image-to-image work.",
      "In NodeTool every FLUX variant is a node. Generate with schnell while you iterate, switch to pro for the final, then chain into inpaint, upscale, or a compositing step — all in one graph you can re-run and share. Because the interface is shared, swapping FLUX for Seedream or Imagen is a single node change.",
      "FLUX is BYOK: pick a provider from the generated table, use your key, pay list price. NodeTool adds no markup.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image-to-image" },
      { label: "Tiers", value: "Schnell, dev, pro / ultra, Kontext" },
      { label: "Resolution", value: "Up to ~2K, wide aspect range" },
      { label: "Strengths", value: "Prompt fidelity, legible text" },
    ],
    faq: [
      {
        q: "Which FLUX version should I use?",
        a: "Schnell for fast iteration, dev for a balance of speed and quality, pro or ultra for final fidelity, and Kontext for prompt-based image editing. Each is a separate node in NodeTool.",
      },
      {
        q: "Can FLUX edit an existing image?",
        a: "Yes. FLUX Kontext and the fill/redux variants do image-to-image and inpainting, available as nodes you can chain after a generation step.",
      },
      {
        q: "What does FLUX cost in NodeTool?",
        a: "You pay the provider that serves the FLUX variant at their list price — NodeTool is bring-your-own-key with no per-image fee.",
      },
    ],
    showcaseSlugs: [
      "flux",
      "flux-schnell",
      "flux-dev",
      "flux-pro",
      "flux-1.1-pro",
      "flux-2",
      "flux-kontext",
    ],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "seedream",
    name: "Seedream",
    vendor: "ByteDance",
    modality: "text-to-image",
    accent: "rose",
    tagline:
      "Run ByteDance's Seedream in a visual AI workflow — high-resolution, bilingual text-to-image with strong photoreal output, BYOK at provider prices.",
    blurb: [
      "Seedream is ByteDance's text-to-image model, strong on photoreal detail, high native resolution, and bilingual (English/Chinese) prompts. Later versions add editing endpoints, so it covers both first-pass generation and targeted revision.",
      "As a NodeTool node, Seedream drops into any image pipeline — feed prompts from an LLM node, fan out variations, then route into upscaling or a poster template. The graph is portable and re-runnable, and Seedream can be swapped for FLUX or Imagen without rewiring.",
      "Seedream is BYOK. The provider table below is generated from the node manifests and matches each provider's `--list-models`.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image-to-image (v4+)" },
      { label: "Resolution", value: "Up to 4K native" },
      { label: "Prompts", value: "Bilingual (English / Chinese)" },
      { label: "Strengths", value: "Photoreal detail, high resolution" },
    ],
    faq: [
      {
        q: "How high a resolution does Seedream produce?",
        a: "Recent Seedream versions generate up to 4K natively, which is why it's a common choice for print-scale and detail-heavy work.",
      },
      {
        q: "Can Seedream edit images?",
        a: "Yes — Seedream v4 and later expose edit endpoints for image-to-image revision, available as nodes in NodeTool.",
      },
      {
        q: "Does Seedream handle non-English prompts?",
        a: "Yes. Seedream is bilingual and handles Chinese prompts as well as English.",
      },
    ],
    showcaseSlugs: ["seedream", "seedream-3", "seedream-4", "seedream-4.5"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "gpt-image",
    name: "GPT-Image",
    vendor: "OpenAI",
    modality: "text-to-image",
    accent: "emerald",
    tagline:
      "Run OpenAI's GPT-Image in a visual AI workflow — instruction-following text-to-image and precise editing, BYOK at provider prices.",
    blurb: [
      "GPT-Image is OpenAI's image model, notable for how well it follows detailed instructions and renders legible text and diagrams. Its edit endpoints make it strong at revision — change one element of an existing image while leaving the rest intact.",
      "In NodeTool, GPT-Image and its edit variants are nodes. Compose them with an LLM prompt writer for tight instruction-following, or chain generate → edit → upscale into a single reusable graph. Swap it for FLUX or Imagen with one node change.",
      "GPT-Image is BYOK — bring your provider key, pay list price. The coverage table below is generated from the manifests.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      { label: "Resolution", value: "1024–4096 px, common aspect ratios" },
      { label: "Strengths", value: "Instruction following, legible text" },
      { label: "Editing", value: "Yes — targeted, mask-aware edits" },
    ],
    faq: [
      {
        q: "Is GPT-Image good at rendering text in images?",
        a: "Yes — legible text and diagrams are a GPT-Image strength, which makes it a good fit for posters, UI mockups, and infographics.",
      },
      {
        q: "Can GPT-Image edit part of an image?",
        a: "Yes. Its edit endpoints do targeted, mask-aware revisions, available as nodes you can chain after a generation step in NodeTool.",
      },
      {
        q: "How do I use GPT-Image in NodeTool?",
        a: "Add the GPT-Image node, connect a prompt, and run. NodeTool routes the call to a provider you have a key for.",
      },
    ],
    showcaseSlugs: ["gpt-image", "gpt-image-1", "gpt-image-1.5", "gpt-image-mini"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "imagen",
    name: "Imagen",
    vendor: "Google",
    modality: "text-to-image",
    accent: "cyan",
    tagline:
      "Run Google's Imagen in a visual AI workflow — photoreal text-to-image with clean typography, BYOK at provider prices.",
    blurb: [
      "Imagen is Google's text-to-image model, strong on photorealism, accurate typography, and faithful rendering of detailed prompts. Its fast and ultra tiers let you trade latency against fidelity for a final render.",
      "NodeTool exposes Imagen's tiers as nodes that drop into any image pipeline — prompt writer in front, upscaler or poster template behind. The workflow runs the same locally or in the cloud, and Imagen swaps for FLUX or Seedream without rewiring the graph.",
      "Imagen is BYOK. The provider table below is generated from the node manifests.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Tiers", value: "Fast and ultra" },
      { label: "Resolution", value: "Up to ~2K, multiple aspect ratios" },
      { label: "Strengths", value: "Photorealism, accurate typography" },
    ],
    faq: [
      {
        q: "What is Imagen best at?",
        a: "Photoreal images and accurate typography from detailed prompts. The ultra tier pushes fidelity; the fast tier lowers latency for iteration.",
      },
      {
        q: "How do I run Imagen in NodeTool?",
        a: "Add the Imagen node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Imagen cost?",
        a: "You pay the serving provider's list price — NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["imagen", "imagen-3", "imagen-4", "imagen4"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "nano-banana",
    name: "Nano Banana",
    vendor: "Google",
    modality: "text-to-image",
    accent: "amber",
    tagline:
      "Run Google's Nano Banana image models in a visual AI workflow: text-to-image and conversational editing, BYOK at provider prices.",
    blurb: [
      "Nano Banana is Google's Gemini image family. The first release is listed as Gemini 2.5 Flash Image, Nano Banana 2 is Gemini 3.1 Flash Image, and Nano Banana Pro is listed alongside Gemini 3 Pro Image Preview. Each tier has a text-to-image endpoint and an edit endpoint that takes a source image.",
      "Nano Banana Lite is the efficiency tier. Its listing gives sub-2 second latency, fast multi-turn local edits, and 14 supported aspect ratios. In a graph you can run Lite for drafts, then send the chosen frame to Pro for the final render.",
      "Nano Banana is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      { label: "Tiers", value: "Nano Banana, Nano Banana 2, Nano Banana Pro, Lite" },
      { label: "Also listed as", value: "Gemini 2.5 Flash Image, Gemini 3.1 Flash Image, Gemini 3 Pro Image Preview" },
      { label: "Lite latency", value: "Sub-2 seconds per the provider listing" },
    ],
    faq: [
      {
        q: "Are Nano Banana and Gemini image the same model?",
        a: "Yes for the tiers that carry both names. Nano Banana is the Gemini 2.5 Flash Image release, and Nano Banana 2 is listed as Gemini 3.1 Flash Image. NodeTool shows both ids, and the provider table below lists the exact ids each provider reports.",
      },
      {
        q: "How do I run Nano Banana in NodeTool?",
        a: "Add the Nano Banana node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Nano Banana cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["nano-banana", "nano-banana-2", "nano-banana-pro", "gemini-25-flash-image"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "ideogram",
    name: "Ideogram",
    vendor: "Ideogram",
    modality: "text-to-image",
    accent: "rose",
    tagline:
      "Run Ideogram in a visual AI workflow: text-to-image with typography, logos, posters, and transparent backgrounds, BYOK at provider prices.",
    blurb: [
      "Ideogram generates images, posters, and logos with accurate text rendering. The version history runs from V2 and V2A through V3 to V4 and V4.5, and V2, V2A, and V4 also have turbo, fast, or instant tiers.",
      "Around the generators sit editing endpoints: edit with a mask, remix, reframe, replace background, remove background, upscale, object removal, and text layerizing for flat graphics. V3 adds transparent-background generation. V4 adds LoRA, a trainer for custom LoRAs, and tiling for seamless repeating textures.",
      "Ideogram is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image, editing, and texture tiling" },
      { label: "Versions", value: "V2, V2A, V3, V4, V4.5" },
      { label: "Strengths", value: "Text rendering, posters, logos" },
      { label: "Customization", value: "Custom models and V4 LoRA training" },
    ],
    faq: [
      {
        q: "Can Ideogram make images with a transparent background?",
        a: "Yes. The V3 transparent endpoint returns an image with a transparent background, which suits logos and stickers. Wire it into a compositing or poster template in the same graph.",
      },
      {
        q: "How do I run Ideogram in NodeTool?",
        a: "Add the Ideogram node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Ideogram cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["ideogram", "ideogram-v3", "ideogram-v4"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "recraft",
    name: "Recraft",
    vendor: "Recraft",
    modality: "text-to-image",
    accent: "emerald",
    tagline:
      "Run Recraft in a visual AI workflow: brand-ready text-to-image and editable SVG vector output, BYOK at provider prices.",
    blurb: [
      "Recraft is built for design work. V4 was developed with designers for brand systems. V4.1 adds sharper prompt control and cleaner composition, and V4.1 Pro reaches 2048×2048 and ultra-wide formats. A Flash tier and a Utility tier trade fidelity for speed in high-volume runs.",
      "Recraft also returns vectors. The text-to-vector endpoints produce editable SVGs with structured layers, and a vectorize endpoint converts an existing raster image. V4 Styles keep a consistent look across a batch from a style id or reference images, and create-style builds that id from your references.",
      "Recraft is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and text-to-vector (SVG)" },
      { label: "Versions", value: "20b, V3, V4, V4.1" },
      { label: "Max size", value: "2048×2048 on V4.1 Pro" },
      { label: "Consistency", value: "Reusable styles from reference images" },
    ],
    faq: [
      {
        q: "Does Recraft output vector files?",
        a: "Yes. The text-to-vector endpoints return editable SVG, and a separate vectorize endpoint turns a raster image into SVG. Pipe the result into a design handoff or a print step.",
      },
      {
        q: "How do I run Recraft in NodeTool?",
        a: "Add the Recraft node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Recraft cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["recraft", "recraft-v3", "recraft-v4"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "qwen-image",
    name: "Qwen Image",
    vendor: "Alibaba",
    modality: "text-to-image",
    accent: "violet",
    tagline:
      "Run Alibaba's Qwen Image in a visual AI workflow: text-to-image with multilingual text rendering and instruction-based editing, BYOK at provider prices.",
    blurb: [
      "Qwen Image is Alibaba's image family. Qwen-Image-2.0 is a unified generation and editing model, with a Pro tier. Qwen Image Max is a separate premium model. Qwen Image 3 is listed with strong multilingual text rendering and an edit endpoint that changes text inside an image.",
      "The earlier 2509, 2511, and 2512 releases are also available. They include LoRA endpoints for custom models, a layered endpoint for layer-based editing, and a multiple-angles endpoint that renders one input image from different viewpoints.",
      "Qwen Image is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      { label: "Generations", value: "Qwen Image, 2512, 2.0, Max, 3" },
      { label: "Text rendering", value: "Multilingual on Qwen Image 3" },
      { label: "Customization", value: "LoRA on 2512 and the edit models" },
    ],
    faq: [
      {
        q: "What does Qwen Image 3 add?",
        a: "Its listing gives strong multilingual text rendering, and its edit endpoint changes existing text in an image from a written instruction. Use it for posters and packaging that carry copy in more than one language.",
      },
      {
        q: "How do I run Qwen Image in NodeTool?",
        a: "Add the Qwen Image node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Qwen Image cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["qwen-image", "qwen-image-2512", "qwen-image-2"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "z-image",
    name: "Z-Image",
    vendor: "Alibaba Tongyi Lab",
    modality: "text-to-image",
    accent: "cyan",
    tagline:
      "Run Z-Image in a visual AI workflow: fast text-to-image with LoRA and seamless tiling, BYOK at provider prices.",
    blurb: [
      "Z-Image comes in two tiers. Turbo is listed for maximum speed, aimed at rapid iteration and prototyping. Base is listed for quality images with efficient processing.",
      "Both tiers have a LoRA endpoint for custom-trained models. Turbo also has a tiling endpoint that generates seamless photorealistic tiles from text, with its own LoRA variant. That makes it a fit for texture and pattern work inside a larger graph.",
      "Z-Image is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Tiers", value: "Turbo and Base" },
      { label: "Customization", value: "LoRA on both tiers" },
      { label: "Special mode", value: "Seamless tiling on Turbo" },
    ],
    faq: [
      {
        q: "When should I use Turbo and when Base?",
        a: "Use Turbo to iterate on prompts, because the listing positions it for speed. Use Base when you want the quality tier. Both take a LoRA if you have trained one.",
      },
      {
        q: "How do I run Z-Image in NodeTool?",
        a: "Add the Z-Image node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Z-Image cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["z-image", "z-image-turbo"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "grok-imagine",
    name: "Grok Imagine",
    vendor: "xAI",
    modality: "text-to-image",
    accent: "blue",
    tagline:
      "Run xAI's Grok Imagine image models in a visual AI workflow: text-to-image and editing, BYOK at provider prices.",
    blurb: [
      "Grok Imagine Image is xAI's image generation model, listed for highly aesthetic output. The lineup has a standard tier, a quality tier, and a 2.0 release, each with text-to-image and edit endpoints.",
      "In NodeTool each endpoint is a node. Generate with the standard tier while you iterate, then switch the node to the quality tier for the final render without rewiring the graph.",
      "Grok Imagine is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      { label: "Tiers", value: "Standard, Quality, 2.0" },
      { label: "Vendor", value: "xAI" },
      { label: "Edit", value: "Edit endpoint on each tier" },
    ],
    faq: [
      {
        q: "Does Grok Imagine edit existing images?",
        a: "Yes. The standard, quality, and 2.0 releases each list an edit endpoint that takes a source image and an instruction.",
      },
      {
        q: "How do I run Grok Imagine in NodeTool?",
        a: "Add the Grok Imagine node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Grok Imagine cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["grok-imagine", "grok-imagine-image"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "krea",
    name: "Krea 2",
    vendor: "Krea",
    modality: "text-to-image",
    accent: "rose",
    tagline:
      "Run Krea 2 in a visual AI workflow: text-to-image with style references and LoRA, BYOK at provider prices.",
    blurb: [
      "Krea 2 is Krea's image model. Large is the high-fidelity tier. Medium is the middle tier and Medium Turbo generates extremely fast. Krea 2 Turbo is described as the speed-optimized open-source version that keeps the aesthetic range of Krea 2.",
      "The Medium and Large endpoints take aspect ratio, creativity, and seed controls, plus optional style references. Turbo also has a style endpoint that guides the look from a reference image and a LoRA endpoint that carries a learned subject, character, or style into new generations.",
      "Krea 2 is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Tiers", value: "Turbo, Medium Turbo, Medium, Large" },
      { label: "Controls", value: "Aspect ratio, creativity, seed" },
      { label: "Guidance", value: "Style reference images and LoRA" },
    ],
    faq: [
      {
        q: "Is Krea 2 the same as FLUX Krea?",
        a: "No. FLUX.1 Krea [dev] is a FLUX model tuned with Krea, and it is covered on the FLUX page. Krea 2 is Krea's own model family.",
      },
      {
        q: "How do I run Krea 2 in NodeTool?",
        a: "Add the Krea 2 node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Krea 2 cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["krea", "krea-2"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "hunyuan-image",
    name: "Hunyuan Image",
    vendor: "Tencent",
    modality: "text-to-image",
    accent: "blue",
    tagline:
      "Run Tencent's Hunyuan Image in a visual AI workflow: text-to-image with instruction understanding, BYOK at provider prices.",
    blurb: [
      "Hunyuan Image is Tencent's image family, available as V2.1 and V3. V3 Instruct is listed for advanced instruction understanding, which suits long and structured prompts.",
      "Each version is a text-to-image node. Put a language model in front to expand a short brief into the long prompt V3 Instruct reads well, and send the result to an upscaler or a poster template behind it.",
      "Hunyuan Image is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Versions", value: "V2.1, V3, V3 Instruct" },
      { label: "Strengths", value: "Instruction following on V3 Instruct" },
      { label: "Vendor", value: "Tencent" },
    ],
    faq: [
      {
        q: "What is the Instruct variant?",
        a: "V3 Instruct is listed for advanced instruction understanding. Use it when the prompt is long or carries several separate requirements.",
      },
      {
        q: "How do I run Hunyuan Image in NodeTool?",
        a: "Add the Hunyuan Image node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Hunyuan Image cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["hunyuan-image", "hunyuan-image-v3"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "ernie-image",
    name: "ERNIE Image",
    vendor: "Baidu",
    modality: "text-to-image",
    accent: "cyan",
    tagline:
      "Run Baidu's ERNIE Image in a visual AI workflow: text-to-image with a faster Turbo tier and LoRA, BYOK at provider prices.",
    blurb: [
      "ERNIE Image is Baidu's text-to-image model. The Turbo tier is listed as faster ERNIE text-to-image generation.",
      "Both the standard and Turbo tiers have a LoRA endpoint that takes custom weights. In NodeTool the four endpoints are interchangeable nodes, so you can compare them on one prompt in a single graph.",
      "ERNIE Image is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Tiers", value: "Standard and Turbo" },
      { label: "Customization", value: "LoRA on both tiers" },
      { label: "Vendor", value: "Baidu" },
    ],
    faq: [
      {
        q: "Can I use my own LoRA with ERNIE Image?",
        a: "Yes. Both the standard and Turbo tiers list a LoRA endpoint that accepts custom weights.",
      },
      {
        q: "How do I run ERNIE Image in NodeTool?",
        a: "Add the ERNIE Image node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does ERNIE Image cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["ernie-image"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "sana",
    name: "Sana",
    vendor: "NVIDIA",
    modality: "text-to-image",
    accent: "emerald",
    tagline:
      "Run Sana in a visual AI workflow: efficient high-resolution text-to-image, BYOK at provider prices.",
    blurb: [
      "Sana is an efficient image model that balances quality and speed. Sana Sprint is listed as generating 4K images with exceptional speed.",
      "Sana v1.5 comes in two sizes. The 1.6B model is listed as lightweight with 4K output. The 4.8B model is listed for ultra-high quality 4K images with remarkable detail. Swap between them on one node to trade cost for detail.",
      "Sana is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Variants", value: "Sana, Sprint, v1.5 1.6B, v1.5 4.8B" },
      { label: "Output", value: "4K on Sprint and v1.5" },
      { label: "Vendor", value: "NVIDIA" },
    ],
    faq: [
      {
        q: "Which Sana variant is fastest?",
        a: "Sana Sprint is the variant listed for speed. The v1.5 4.8B model is the one listed for the highest detail.",
      },
      {
        q: "How do I run Sana in NodeTool?",
        a: "Add the Sana node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Sana cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["sana", "sana-sprint"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "reve",
    name: "Reve",
    vendor: "Reve",
    modality: "text-to-image",
    accent: "violet",
    tagline:
      "Run Reve in a visual AI workflow: text-to-image with strong prompt adherence and accurate text, BYOK at provider prices.",
    blurb: [
      "Reve 2.1 is listed for strong prompt adherence, layout intelligence, and accurate text rendering. It generates from text prompts.",
      "As a node it sits in front of the same downstream steps as any other image model: an upscaler, a caption step, or a poster template. Swap it for another image model by changing one node.",
      "Reve is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Versions", value: "Reve and Reve 2.1" },
      { label: "Strengths", value: "Prompt adherence, layout, text rendering" },
      { label: "Vendor", value: "Reve" },
    ],
    faq: [
      {
        q: "What is Reve 2.1 best at?",
        a: "Its listing names prompt adherence, layout intelligence, and accurate text rendering. Try it for posters and layouts that carry copy.",
      },
      {
        q: "How do I run Reve in NodeTool?",
        a: "Add the Reve node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Reve cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["reve", "reve-2-1"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "mai-image",
    name: "MAI Image",
    vendor: "Microsoft",
    modality: "text-to-image",
    accent: "blue",
    tagline:
      "Run Microsoft's MAI Image in a visual AI workflow: photorealistic generation and editing, BYOK at provider prices.",
    blurb: [
      "MAI-Image-2.5 is Microsoft's photorealistic image generation and editing model. It turns text prompts or uploaded images into design-ready visuals with fine-grained, pixel-level control. MAI Image 2.5 Pro is the high-end text-to-image tier for photorealistic generation.",
      "The lineup has an edit endpoint on the Pro tier. Use the standard tier for drafts and Pro for the final render in the same graph.",
      "MAI Image is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      { label: "Tiers", value: "MAI-Image-2.5 and 2.5 Pro" },
      { label: "Strengths", value: "Photorealism, pixel-level control" },
      { label: "Vendor", value: "Microsoft" },
    ],
    faq: [
      {
        q: "What is the difference between MAI-Image-2.5 and the Pro tier?",
        a: "Pro is listed as the high-end text-to-image tier for photorealistic generation. The standard model generates and edits from text or uploaded images.",
      },
      {
        q: "How do I run MAI Image in NodeTool?",
        a: "Add the MAI Image node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does MAI Image cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["mai-image", "mai-image-2-5"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "bria",
    name: "Bria FIBO",
    vendor: "Bria",
    modality: "text-to-image",
    accent: "amber",
    tagline:
      "Run Bria's FIBO image models in a visual AI workflow: text-to-image trained on licensed data, BYOK at provider prices.",
    blurb: [
      "Bria FIBO generates images from text or JSON-structured prompts. FIBO Gen 1.5 is listed as trained on licensed data for commercial use. FIBO Lite is the lighter tier, and FIBO Edit endpoints are listed for changing an existing image.",
      "Bria also lists earlier text-to-image endpoints in base, HD, and fast tiers. Structured-prompt endpoints are listed for FIBO, so an upstream node can fill fields instead of writing prose.",
      "Bria FIBO is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      { label: "Prompts", value: "Text or JSON-structured" },
      { label: "Tiers", value: "FIBO, FIBO Lite, Gen 1.5, base, HD, fast" },
      { label: "Training data", value: "Licensed data per the Gen 1.5 listing" },
    ],
    faq: [
      {
        q: "Can I pass structured JSON to FIBO?",
        a: "Yes. FIBO Gen 1.5 accepts text or JSON-structured prompts. A code or LLM node upstream can fill the fields.",
      },
      {
        q: "How do I run Bria FIBO in NodeTool?",
        a: "Add the Bria FIBO node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Bria FIBO cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["bria", "fibo", "bria-fibo"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "luma-photon",
    name: "Luma Photon",
    vendor: "Luma AI",
    modality: "text-to-image",
    accent: "violet",
    tagline:
      "Run Luma Photon in a visual AI workflow: low-cost text-to-image with a Flash tier, BYOK at provider prices.",
    blurb: [
      "Luma Photon is Luma's image model. Photon Flash is described as creative, personalizable, and aimed at lowering the cost of high-quality image generation.",
      "Run Flash for volume work such as variation grids, and the standard Photon for the pick you plan to publish. Both are nodes with the same prompt input.",
      "Luma Photon is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Tiers", value: "Photon and Photon Flash" },
      { label: "Positioning", value: "Lower cost per image on Flash" },
      { label: "Vendor", value: "Luma AI" },
    ],
    faq: [
      {
        q: "What is Photon Flash for?",
        a: "Its listing positions it as a step change in the cost of high-quality image generation. Use it for batches and exploration.",
      },
      {
        q: "How do I run Luma Photon in NodeTool?",
        a: "Add the Luma Photon node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Luma Photon cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["luma-photon", "photon"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "hidream",
    name: "HiDream",
    vendor: "HiDream",
    modality: "text-to-image",
    accent: "cyan",
    tagline:
      "Run HiDream-O1 in a visual AI workflow: one model for text-to-image, editing, and custom subjects, BYOK at provider prices.",
    blurb: [
      "HiDream-O1-Image is a unified image model. Its listing says a single native model handles text-to-image, editing, and custom subjects without external components, with output up to 2K.",
      "A dev tier sits beside the main model. In a graph, one HiDream node can generate the first frame and a second HiDream node can edit it, so you do not chain two different vendors.",
      "HiDream is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image, editing, custom subjects" },
      { label: "Max resolution", value: "Up to 2K per the listing" },
      { label: "Tiers", value: "HiDream-O1-Image and dev" },
      { label: "Architecture", value: "Single native model" },
    ],
    faq: [
      {
        q: "Does HiDream-O1 need separate models for editing?",
        a: "No. The listing says one native model handles text-to-image, editing, and custom subjects without external components.",
      },
      {
        q: "How do I run HiDream in NodeTool?",
        a: "Add the HiDream node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does HiDream cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["hidream", "hidream-o1"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "stable-diffusion",
    name: "Stable Diffusion 3",
    vendor: "Stability AI",
    modality: "text-to-image",
    accent: "blue",
    tagline:
      "Run Stable Diffusion 3 and 3.5 in a visual AI workflow: open-weight text-to-image, BYOK at provider prices.",
    blurb: [
      "Stable Diffusion 3 Medium is a Multimodal Diffusion Transformer (MMDiT) text-to-image model, listed with improved image quality, typography, prompt understanding, and efficiency. Stable Diffusion 3.5 Medium carries the same architecture, and 3.5 Large is listed as an open-weight model with excellent prompt adherence and diverse output.",
      "Because the weights are open, the same family also runs on local hardware. In NodeTool you can build the graph against a hosted endpoint and move it to a local node later without rewiring the rest.",
      "Stable Diffusion 3 is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Variants", value: "3 Medium, 3.5 Medium, 3.5 Large" },
      { label: "Architecture", value: "Multimodal Diffusion Transformer" },
      { label: "Weights", value: "Open" },
    ],
    faq: [
      {
        q: "Which Stable Diffusion variant is the largest?",
        a: "Stable Diffusion 3.5 Large is the largest listed variant, and its listing names prompt adherence and diverse output.",
      },
      {
        q: "How do I run Stable Diffusion 3 in NodeTool?",
        a: "Add the Stable Diffusion 3 node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Stable Diffusion 3 cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["stable-diffusion", "stable-diffusion-3", "stable-diffusion-3-5"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "uni-1",
    name: "Luma Uni-1",
    vendor: "Luma AI",
    modality: "text-to-image",
    accent: "violet",
    tagline:
      "Run Luma Uni-1 in a visual AI workflow: high-fidelity text-to-image with style control and reference guidance, BYOK at provider prices.",
    blurb: [
      "Luma Uni-1 turns a text prompt into a single high-fidelity image. It takes aspect ratio and visual style controls, plus optional web-sourced and reference-image guidance.",
      "Uni-1 Max is the top tier. Its listing says it generates a single image at the model's highest fidelity, with richer detail and stronger prompt adherence than the base tier, for hero-quality stills.",
      "Luma Uni-1 is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Tiers", value: "Uni-1 and Uni-1 Max" },
      { label: "Controls", value: "Aspect ratio and visual style" },
      { label: "Guidance", value: "Optional web-sourced and reference images" },
    ],
    faq: [
      {
        q: "When should I use Uni-1 Max?",
        a: "Use it for the final hero still. The listing places it above the base tier for detail and prompt adherence. Draft on the base tier first.",
      },
      {
        q: "How do I run Luma Uni-1 in NodeTool?",
        a: "Add the Luma Uni-1 node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Luma Uni-1 cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["uni-1", "luma-uni-1"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "muse-image",
    name: "Meta Muse Image",
    vendor: "Meta",
    modality: "text-to-image",
    accent: "emerald",
    tagline:
      "Run Meta's Muse Image in a visual AI workflow: text-to-image that reasons about the request first, BYOK at provider prices.",
    blurb: [
      "Meta Muse Image generates images from text. Its listing says it reasons about the request before rendering, composing scenes with strong prompt adherence.",
      "As a node it takes a prompt and returns an image, so it drops into the same graphs as any other image model. Compare it with another model by running both nodes on one prompt.",
      "Meta Muse Image is BYOK. The provider table below is generated from the node manifests, so it lists only the providers that serve it today.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Approach", value: "Reasons about the request before rendering" },
      { label: "Strengths", value: "Prompt adherence, scene composition" },
      { label: "Vendor", value: "Meta" },
    ],
    faq: [
      {
        q: "What does it mean that Muse Image reasons first?",
        a: "The listing says the model reasons about the request before rendering. That helps with prompts that describe a scene with several parts.",
      },
      {
        q: "How do I run Meta Muse Image in NodeTool?",
        a: "Add the Meta Muse Image node to a workflow, connect a text prompt, and run. NodeTool calls a provider you have a key for and returns the image to the canvas.",
      },
      {
        q: "What does Meta Muse Image cost in NodeTool?",
        a: "You pay the serving provider's list price. NodeTool is bring-your-own-key with no markup.",
      },
    ],
    showcaseSlugs: ["muse-image", "meta-muse-image"],
    templateSlug: "movie-posters",
  }),
];

/** Page-registry contribution: one entry per model page + the hub. */
export const entries: PageEntry[] = [
  {
    route: "/models",
    title: `AI model directory — run any model in a NodeTool workflow (${yearToken()})`,
    description:
      "Every top image and video model — Veo 3, Sora, Kling, FLUX, Seedream, Imagen and more — as a node you can run, chain, and compare in a visual AI workflow. BYOK at provider prices.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
  },
  ...modelEntries.map(
    (m): PageEntry => ({
      route: m.route,
      title: m.title,
      description: m.description,
      priority: m.priority,
      changeFrequency: m.changeFrequency,
      indexable: m.indexable,
    })
  ),
];

export function modelBySlug(slug: string): ModelEntry | undefined {
  return modelEntries.find((m) => m.slug === slug);
}
