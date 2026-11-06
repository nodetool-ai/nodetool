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

/** Closing paragraph shared by the image-model pages. */
const BYOK_BLURB = (name: string): string =>
  `NodeTool is bring-your-own-key, so you call ${name} through a provider you already use and pay that provider's list price. The table below lists the providers that serve it and the model ids their \`--list-models\` output reports.`;

/** Cost question shared by the image-model pages. */
const COST_FAQ = (name: string): ModelFaq => ({
  q: `What does ${name} cost in NodeTool?`,
  a: `NodeTool adds no per-image fee. You pay the provider that serves ${name} at its list price, with your own key.`,
});

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
      "Run Google's Nano Banana in a visual AI workflow: text-to-image and conversational editing with reference images, at provider list price.",
    blurb: [
      "Nano Banana is Google's Gemini image model family. The original Nano Banana is Gemini 2.5 Flash Image. Nano Banana 2 adds fast generation, conversational editing, multi-image fusion, and character consistency. Nano Banana 2 Lite is the fastest and lowest-cost tier, and Nano Banana Pro is Google's top-tier generation and editing model.",
      "Every tier takes reference images, so one node covers both generating from text and editing an existing picture. In a NodeTool graph you can feed a reference from an upstream node, chain the result into an upscaler or a layout step, and swap tiers by changing the node.",
      BYOK_BLURB("Nano Banana"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      {
        label: "Tiers",
        value: "Nano Banana, Nano Banana 2, 2 Lite, and Pro",
      },
      { label: "Inputs", value: "Text prompt plus reference images" },
      {
        label: "Nano Banana 2 extras",
        value: "Multi-image fusion, character consistency, search grounding",
      },
    ],
    faq: [
      {
        q: "Is Nano Banana the same as Gemini 2.5 Flash Image?",
        a: "Yes. Nano Banana is the original Gemini 2.5 Flash Image model. Nano Banana 2, 2 Lite, and Pro are later tiers in the same family.",
      },
      {
        q: "Can Nano Banana edit an existing image?",
        a: "Yes. Pass one or more images as reference input with an instruction, and the node returns the edited result.",
      },
      COST_FAQ("Nano Banana"),
    ],
    showcaseSlugs: ["nano-banana"],
  }),
  model({
    slug: "recraft",
    name: "Recraft",
    vendor: "Recraft",
    modality: "text-to-image",
    accent: "violet",
    tagline:
      "Run Recraft V3 and V4 in a visual AI workflow: design-led text-to-image and SVG vector output, at provider list price.",
    blurb: [
      "Recraft builds image models around design work. V3 generates long text and a wide list of styles. V4 and V4.1 add art-directed composition, strong prompt accuracy, and integrated text rendering. The Pro variants render at about 2048px for print-ready and large-scale work, and the Utility variants are lighter and faster for high-volume pipelines.",
      "Recraft also ships SVG variants that return vector graphics such as logotypes and icons, with editable paths and structured layers. In NodeTool the raster and vector models are separate nodes, so a graph can generate a logo as SVG and the same brief as a raster mockup side by side.",
      BYOK_BLURB("Recraft"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and text-to-SVG" },
      { label: "Versions", value: "V3, V4, and V4.1" },
      {
        label: "Variants",
        value: "Standard, Pro (~2048px), Utility, and SVG",
      },
      { label: "Inputs", value: "Prompt, aspect ratio, and size" },
    ],
    faq: [
      {
        q: "Can Recraft generate SVG vector graphics?",
        a: "Yes. The SVG variants of V3, V4, and V4.1 return vector images with editable paths, suited to logos and icons.",
      },
      {
        q: "Which Recraft variant should I pick?",
        a: "Use the standard model for most work, Pro when you need about 2048px output, Utility for high-volume runs, and an SVG variant when you need vectors.",
      },
      COST_FAQ("Recraft"),
    ],
    showcaseSlugs: ["recraft"],
  }),
  model({
    slug: "ideogram",
    name: "Ideogram",
    vendor: "Ideogram",
    modality: "text-to-image",
    accent: "rose",
    tagline:
      "Run Ideogram v3 and v4 in a visual AI workflow: text-to-image with style references and speed tiers, at provider list price.",
    blurb: [
      "Ideogram v3 comes in three tiers. Turbo is the fastest and cheapest, Balanced trades speed against quality and cost, and Quality is the highest-quality tier. Ideogram v4 ships Balanced and Quality tiers. Both generations target realistic images, creative designs, and consistent styles.",
      "The v3 nodes accept style presets, style reference images, and an inpainting mask, so one model handles generation and masked edits. The v4 nodes take a JSON prompt and an optional copyright-detection flag.",
      BYOK_BLURB("Ideogram"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image, with v3 image editing" },
      { label: "Versions", value: "v3 (Turbo, Balanced, Quality), v4 (Balanced, Quality)" },
      {
        label: "v3 inputs",
        value: "Style presets, style reference images, inpainting mask",
      },
      { label: "v4 inputs", value: "JSON prompt, resolution, copyright detection" },
    ],
    faq: [
      {
        q: "What is the difference between the Ideogram tiers?",
        a: "Turbo is the fastest and cheapest v3 tier, Balanced trades speed against quality and cost, and Quality is the highest-quality tier. v4 offers Balanced and Quality.",
      },
      {
        q: "Can Ideogram use a reference style?",
        a: "Yes. The v3 nodes accept style reference images and style presets alongside the prompt.",
      },
      COST_FAQ("Ideogram"),
    ],
    showcaseSlugs: ["ideogram"],
  }),
  model({
    slug: "qwen-image",
    name: "Qwen Image",
    vendor: "Alibaba Qwen",
    modality: "text-to-image",
    accent: "cyan",
    tagline:
      "Run Alibaba's Qwen Image in a visual AI workflow: text-to-image and editing with accurate in-image text, at provider list price.",
    blurb: [
      "Qwen Image is the image family from Alibaba's Qwen team, built around complex text rendering. Qwen Image 2512 improves human realism and fine textures. Qwen Image 2 and 2 Pro generate and edit images, with strong text rendering and particular strength in Chinese. Qwen Image 3 and 3 Pro add dense, accurate text, complex multi-element layouts, and photographic detail.",
      "The original Qwen Image node also accepts LoRA weights, so a fine-tuned style can load inside the graph. In NodeTool the 2 and 3 generations take an input image for editing, which lets one node cover generation and edits.",
      BYOK_BLURB("Qwen Image"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      {
        label: "Versions",
        value: "Qwen Image, 2512, 2 and 2 Pro, 3 and 3 Pro",
      },
      { label: "Strength", value: "Text rendering inside images, including Chinese" },
      { label: "Inputs", value: "Prompt, negative prompt, optional input image" },
    ],
    faq: [
      {
        q: "What is Qwen Image best at?",
        a: "Rendering text inside images, including dense layouts and Chinese. Qwen Image 3 Pro targets the densest text and multi-element layouts.",
      },
      {
        q: "Can Qwen Image edit images?",
        a: "Yes. Qwen Image 2, 2 Pro, 3, and 3 Pro take an input image with an instruction and return an edited image.",
      },
      COST_FAQ("Qwen Image"),
    ],
    showcaseSlugs: ["qwen-image"],
  }),
  model({
    slug: "stable-diffusion-3-5",
    name: "Stable Diffusion 3.5",
    vendor: "Stability AI",
    modality: "text-to-image",
    accent: "emerald",
    tagline:
      "Run Stability AI's Stable Diffusion 3.5 in a visual AI workflow: Large, Large Turbo, and Medium text-to-image, at provider list price.",
    blurb: [
      "Stable Diffusion 3.5 is Stability AI's text-to-image family. Large generates high-resolution images with fine detail across artistic styles and produces varied outputs from the same prompt, thanks to Query-Key Normalization. Large Turbo targets fewer inference steps. Medium is a 2.5 billion parameter model with an improved MMDiT-X architecture.",
      "Each node takes a prompt, a negative prompt, a seed, and a guidance value. An optional input image and prompt strength turn the same node into an image-to-image step.",
      BYOK_BLURB("Stable Diffusion 3.5"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image-to-image" },
      { label: "Models", value: "Large, Large Turbo, and Medium" },
      { label: "Medium size", value: "2.5 billion parameters" },
      { label: "Inputs", value: "Prompt, negative prompt, seed, guidance, optional image" },
    ],
    faq: [
      {
        q: "Which Stable Diffusion 3.5 model should I use?",
        a: "Large for detail, Large Turbo when you want fewer inference steps, and Medium when you want the smaller 2.5 billion parameter model.",
      },
      {
        q: "Does Stable Diffusion 3.5 support negative prompts?",
        a: "Yes. All three nodes take a negative prompt, a seed, and a guidance value.",
      },
      COST_FAQ("Stable Diffusion 3.5"),
    ],
    showcaseSlugs: ["stable-diffusion-3-5", "sd3-5"],
  }),
  model({
    slug: "reve",
    name: "Reve",
    vendor: "Reve",
    modality: "text-to-image",
    accent: "violet",
    tagline:
      "Run Reve in a visual AI workflow: generation, editing, and multi-reference remixing from one model family, at provider list price.",
    blurb: [
      "Reve is an image model family with separate nodes for each job. Create generates from a prompt. Edit changes an existing image from an instruction, and Edit Fast is the quick variant. Remix takes several reference images and combines them. Reve 2.1 generates and edits from text and reference images in one node.",
      "In a NodeTool graph you can chain them: create with Reve, edit the result, then remix it with other references, all in one run you can repeat.",
      BYOK_BLURB("Reve"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      { label: "Nodes", value: "Create, Edit, Edit Fast, Remix, and Reve 2.1" },
      { label: "Inputs", value: "Prompt, optional reference images" },
      { label: "Remix", value: "Takes multiple reference images" },
    ],
    faq: [
      {
        q: "What is the difference between Reve Edit and Remix?",
        a: "Edit changes one image from an instruction. Remix generates a new image from several reference images and a prompt.",
      },
      {
        q: "Which Reve node should I start with?",
        a: "Reve 2.1 if you want generation and editing from text and reference images in one node. Use Create, Edit, or Remix for the earlier single-purpose nodes.",
      },
      COST_FAQ("Reve"),
    ],
    showcaseSlugs: ["reve"],
  }),
  model({
    slug: "krea-2",
    name: "Krea 2",
    vendor: "Krea",
    modality: "text-to-image",
    accent: "rose",
    tagline:
      "Run Krea 2 in a visual AI workflow: expressive text-to-image with style references and moodboards, at provider list price.",
    blurb: [
      "Krea 2 is Krea's foundation image model, in two sizes. Large is the flagship, larger and more flexible, with particular strength in photorealism and expressive artistic styles. Medium is tuned for expressive illustration, anime, and painterly styles, and stays consistent across artistic directions.",
      "Both nodes take style reference images, a moodboard id, and a creativity setting, so a house style can travel with the graph instead of living in the prompt.",
      BYOK_BLURB("Krea 2"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Sizes", value: "Large and Medium" },
      { label: "Large strength", value: "Photorealism and expressive artistic styles" },
      { label: "Medium strength", value: "Illustration, anime, and painterly styles" },
    ],
    faq: [
      {
        q: "Should I use Krea 2 Large or Medium?",
        a: "Large for photorealism and the widest stylistic range. Medium for illustration, anime, and painterly looks.",
      },
      {
        q: "Does Krea 2 support style references?",
        a: "Yes. The nodes take style reference images with a strength value, plus a moodboard id and strength.",
      },
      COST_FAQ("Krea 2"),
    ],
    showcaseSlugs: ["krea-2"],
  }),
  model({
    slug: "hidream",
    name: "HiDream",
    vendor: "HiDream.ai",
    modality: "text-to-image",
    accent: "blue",
    tagline:
      "Run HiDream in a visual AI workflow: Dev, Fast, and Full text-to-image variants, at provider list price.",
    blurb: [
      "HiDream is a text-to-image model family. The Replicate listings run optimised builds from Pruna AI of the Full, Dev, and Fast variants, tuned with the Pruna optimisation toolkit. Newer HiDream models are also served by other providers.",
      "The nodes expose a resolution, a seed, an output format and quality, and a speed mode, so you can trade latency against detail per run.",
      BYOK_BLURB("HiDream"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Variants", value: "L1 Full, L1 Dev, L1 Fast" },
      { label: "Replicate builds", value: "Optimised by Pruna AI" },
      { label: "Inputs", value: "Prompt, resolution, seed, speed mode" },
    ],
    faq: [
      {
        q: "What are the HiDream L1 variants?",
        a: "Full, Dev, and Fast. The Replicate listings are Pruna AI optimised builds of each.",
      },
      {
        q: "Can I change speed per run?",
        a: "Yes. The nodes have a speed mode input along with resolution and seed.",
      },
      COST_FAQ("HiDream"),
    ],
    showcaseSlugs: ["hidream"],
  }),
  model({
    slug: "hunyuan-image",
    name: "Hunyuan Image",
    vendor: "Tencent",
    modality: "text-to-image",
    accent: "emerald",
    tagline:
      "Run Tencent's Hunyuan Image in a visual AI workflow: 2K text-to-image from Hunyuan Image 2.1 and 3, at provider list price.",
    blurb: [
      "Hunyuan Image is Tencent's image family. Hunyuan Image 2.1 generates 2K resolution images from text prompts. Hunyuan Image 3 is a native multimodal model for image generation, and its Replicate listing is a build optimised by Pruna AI.",
      "Providers also list instruct and edit variants of Hunyuan Image 3. In NodeTool each is a node with the same prompt, aspect ratio, and seed inputs.",
      BYOK_BLURB("Hunyuan Image"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Versions", value: "Hunyuan Image 2.1 and 3" },
      { label: "2.1 output", value: "2K resolution" },
      { label: "Inputs", value: "Prompt, aspect ratio, seed, output format" },
    ],
    faq: [
      {
        q: "What is the difference between Hunyuan Image 2.1 and 3?",
        a: "2.1 generates 2K images from text. 3 is a native multimodal model for image generation, and its Replicate listing is a Pruna AI optimised build.",
      },
      {
        q: "Does Hunyuan Image edit images?",
        a: "Some providers list instruct and edit variants of Hunyuan Image 3. The provider table shows which ids each one serves.",
      },
      COST_FAQ("Hunyuan Image"),
    ],
    showcaseSlugs: ["hunyuan-image"],
  }),
  model({
    slug: "grok-imagine-image",
    name: "Grok Imagine Image",
    vendor: "xAI",
    modality: "text-to-image",
    accent: "cyan",
    tagline:
      "Run xAI's Grok Imagine Image in a visual AI workflow: text-to-image and editing with a higher-quality 2K tier, at provider list price.",
    blurb: [
      "Grok Imagine Image is xAI's image model. The Quality tier gives sharper details, better text rendering, and 2K output. Both tiers take an aspect ratio and an optional input image for editing.",
      "In NodeTool it is one node per tier, so a graph can draft with the base tier and render the final with Quality.",
      BYOK_BLURB("Grok Imagine Image"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      { label: "Tiers", value: "Standard and Quality" },
      { label: "Quality output", value: "Up to 2K" },
      { label: "Inputs", value: "Prompt, aspect ratio, optional image" },
    ],
    faq: [
      {
        q: "What does the Quality tier change?",
        a: "Sharper details, better text rendering, and 2K output, according to the model listing.",
      },
      {
        q: "Can Grok Imagine Image edit an existing picture?",
        a: "Yes. The nodes take an input image alongside the prompt.",
      },
      COST_FAQ("Grok Imagine Image"),
    ],
    showcaseSlugs: ["grok-imagine-image"],
  }),
  model({
    slug: "gen4-image",
    name: "Gen-4 Image",
    vendor: "Runway",
    modality: "text-to-image",
    accent: "amber",
    tagline:
      "Run Runway's Gen-4 Image in a visual AI workflow: reference-guided text-to-image with up to three reference images, at provider list price.",
    blurb: [
      "Gen-4 Image is Runway's image model with references. You give it up to three reference images, tag each one, and describe the scene, and it builds the image around those subjects. Gen-4 Image Turbo is cheaper and 2.5 times faster.",
      "References are a good fit for graphs: a character or product image from an upstream node feeds in, and the same references can drive many shots.",
      BYOK_BLURB("Gen-4 Image"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image with reference images" },
      { label: "References", value: "Up to 3, with tags" },
      { label: "Turbo", value: "Cheaper and 2.5x faster" },
      { label: "Inputs", value: "Prompt, aspect ratio, resolution, seed" },
    ],
    faq: [
      {
        q: "How many reference images can Gen-4 Image use?",
        a: "Up to three, each with a tag you can refer to in the prompt.",
      },
      {
        q: "Gen-4 Image or Turbo?",
        a: "Turbo is cheaper and 2.5 times faster. Use Gen-4 Image when you want the full model.",
      },
      COST_FAQ("Gen-4 Image"),
    ],
    showcaseSlugs: ["gen4-image"],
  }),
  model({
    slug: "riverflow",
    name: "Riverflow",
    vendor: "Sourceful",
    modality: "text-to-image",
    accent: "blue",
    tagline:
      "Run Sourceful's Riverflow in a visual AI workflow: agentic image generation with font control, at provider list price.",
    blurb: [
      "Riverflow is Sourceful's agentic image model. Riverflow 2.0 Fast is optimised for fast, high-quality generations and 2.0 Pro for high-precision ones. Riverflow 2.5 adds multi-step reasoning, candidate scoring, and adjustable thinking effort on Pro, with a speed-optimised Fast variant.",
      "The nodes support font control through font texts and font URLs, transparent output, and initial images for editing, which suits design and packaging work.",
      BYOK_BLURB("Riverflow"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      { label: "Versions", value: "2.0 and 2.5, each in Fast and Pro" },
      { label: "Font control", value: "Font texts and font URLs" },
      { label: "2.5 Pro", value: "Candidate scoring, adjustable thinking effort" },
    ],
    faq: [
      {
        q: "What makes Riverflow agentic?",
        a: "Riverflow 2.5 Pro reasons in several steps and scores candidates, with an adjustable thinking level.",
      },
      {
        q: "Can Riverflow use my fonts?",
        a: "Yes. The nodes take font texts and font URLs for font control.",
      },
      COST_FAQ("Riverflow"),
    ],
    showcaseSlugs: ["riverflow"],
  }),
  model({
    slug: "bria",
    name: "Bria",
    vendor: "Bria",
    modality: "text-to-image",
    accent: "emerald",
    tagline:
      "Run Bria's Image 3.2 and FIBO in a visual AI workflow: text-to-image trained on licensed data, at provider list price.",
    blurb: [
      "Bria trains its image models on licensed data. Bria Image 3.2 is a 4B parameter text-to-image model built for commercial use, with strong aesthetics and text rendering. FIBO is an open model that turns intent into structured control, and FIBO Edit applies the same structured prompt approach to image editing.",
      "FIBO takes a structured prompt, and FIBO Edit takes an instruction, an optional mask, and a structured instruction. In NodeTool that makes edits repeatable, because the structure travels with the graph.",
      BYOK_BLURB("Bria"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      { label: "Models", value: "Image 3.2, FIBO, and FIBO Edit" },
      { label: "Training data", value: "Licensed data" },
      { label: "Image 3.2 size", value: "4B parameters" },
    ],
    faq: [
      {
        q: "Is Bria trained on licensed data?",
        a: "Bria describes Image 3.2 as trained entirely on licensed data and FIBO as trained on licensed data.",
      },
      {
        q: "What is FIBO?",
        a: "An open Bria model that uses a structured prompt for precise control. FIBO Edit does the same for editing, with an instruction and optional mask.",
      },
      COST_FAQ("Bria"),
    ],
    showcaseSlugs: ["bria"],
  }),
  model({
    slug: "leonardo-ai",
    name: "Leonardo.Ai",
    vendor: "Leonardo.Ai",
    modality: "text-to-image",
    accent: "violet",
    tagline:
      "Run Leonardo.Ai's Phoenix and Lucid Origin in a visual AI workflow: text-to-image with style and contrast controls, at provider list price.",
    blurb: [
      "Phoenix 1.0 is Leonardo.Ai's first foundational model. It produces images up to 5 megapixels in fast, quality, and ultra modes. Lucid Origin targets artistic, high-quality visuals with better prompt adherence, diversity, and definition.",
      "Both nodes take a style, a contrast setting, a generation mode, and a prompt-enhance toggle, and can return several images per run.",
      BYOK_BLURB("Leonardo.Ai"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Models", value: "Phoenix 1.0 and Lucid Origin" },
      { label: "Phoenix output", value: "Up to 5 megapixels" },
      { label: "Inputs", value: "Prompt, style, contrast, generation mode" },
    ],
    faq: [
      {
        q: "What are the Phoenix generation modes?",
        a: "Fast, quality, and ultra. Higher modes trade latency for fidelity.",
      },
      {
        q: "Phoenix or Lucid Origin?",
        a: "Phoenix is the foundational model with output up to 5 megapixels. Lucid Origin targets artistic visuals with better prompt adherence and definition.",
      },
      COST_FAQ("Leonardo.Ai"),
    ],
    showcaseSlugs: ["leonardo-ai"],
  }),
  model({
    slug: "minimax-image-01",
    name: "MiniMax Image-01",
    vendor: "MiniMax",
    modality: "text-to-image",
    accent: "rose",
    tagline:
      "Run MiniMax Image-01 in a visual AI workflow: text-to-image with character reference, at provider list price.",
    blurb: [
      "Image-01 is MiniMax's first image model. Its distinguishing input is a subject reference, which keeps a character recognisable across generations.",
      "The node also has a prompt optimizer and a count for how many images to return per run. In NodeTool a character image from one node can feed Image-01 and then the video models that animate it.",
      BYOK_BLURB("MiniMax Image-01"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Reference", value: "Subject (character) reference" },
      { label: "Inputs", value: "Prompt, aspect ratio, image count" },
      { label: "Prompt help", value: "Optional prompt optimizer" },
    ],
    faq: [
      {
        q: "Can Image-01 keep a character consistent?",
        a: "Yes. Pass a subject reference image and the model uses it to keep the character recognisable.",
      },
      {
        q: "Does Image-01 rewrite my prompt?",
        a: "Only if you turn on the prompt optimizer input.",
      },
      COST_FAQ("MiniMax Image-01"),
    ],
    showcaseSlugs: ["minimax-image-01"],
  }),
  model({
    slug: "photon",
    name: "Photon",
    vendor: "Luma",
    modality: "text-to-image",
    accent: "cyan",
    tagline:
      "Run Luma's Photon in a visual AI workflow: fast text-to-image with image, style, and character references, at provider list price.",
    blurb: [
      "Photon is Luma's image model. Photon Flash is the accelerated variant that prioritises speed while keeping quality.",
      "The node accepts an image reference, a style reference, and a character reference, each with its own weight for the first two. That lets a graph pin a look or a character and vary only the prompt.",
      BYOK_BLURB("Photon"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image with references" },
      { label: "Variant", value: "Photon Flash, tuned for speed" },
      { label: "References", value: "Image, style, and character" },
      { label: "Weights", value: "Image and style reference weights" },
    ],
    faq: [
      {
        q: "What is Photon Flash?",
        a: "The accelerated variant of Photon. It prioritises speed while maintaining quality.",
      },
      {
        q: "Can Photon use a style reference?",
        a: "Yes, with a style reference image and a weight. It also takes image and character references.",
      },
      COST_FAQ("Photon"),
    ],
    showcaseSlugs: ["photon"],
  }),
  model({
    slug: "p-image",
    name: "P-Image",
    vendor: "Pruna AI",
    modality: "text-to-image",
    accent: "amber",
    tagline:
      "Run Pruna AI's P-Image in a visual AI workflow: sub-second text-to-image and multi-image editing, at provider list price.",
    blurb: [
      "P-Image is a text-to-image model from Pruna AI built for production use, with generation under one second. P-Image Edit handles multi-image editing at the same speed.",
      "Both have LoRA variants that load trained LoRAs from Hugging Face, so a custom style or subject can run through the same fast path.",
      BYOK_BLURB("P-Image"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      { label: "Speed", value: "Under 1 second per generation" },
      { label: "Models", value: "P-Image, Edit, and LoRA variants of both" },
      { label: "Inputs", value: "Prompt, size, seed, LoRA weights" },
    ],
    faq: [
      {
        q: "How fast is P-Image?",
        a: "Pruna AI lists it as a sub-one-second text-to-image model for production use.",
      },
      {
        q: "Can P-Image use my own LoRA?",
        a: "Yes. The LoRA variants load trained weights from Hugging Face, including ones trained with Pruna's trainers.",
      },
      COST_FAQ("P-Image"),
    ],
    showcaseSlugs: ["p-image"],
  }),
  model({
    slug: "z-image",
    name: "Z-Image",
    vendor: "Tongyi-MAI",
    modality: "text-to-image",
    accent: "emerald",
    tagline:
      "Run Z-Image Turbo in a visual AI workflow: a 6B parameter text-to-image model built for speed, at provider list price.",
    blurb: [
      "Z-Image Turbo is a 6B parameter text-to-image model from Tongyi-MAI, listed as super fast. The Replicate node exposes a go-fast switch, a step count, and a guidance value.",
      "Other providers also serve Z-Image, including image-to-image, inpaint, and ControlNet variants. In NodeTool each is its own node.",
      BYOK_BLURB("Z-Image"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Size", value: "6B parameters" },
      { label: "Variants", value: "Turbo, plus provider-specific edit and control variants" },
      { label: "Inputs", value: "Prompt, width, height, steps, guidance" },
    ],
    faq: [
      {
        q: "What is Z-Image Turbo?",
        a: "A 6B parameter text-to-image model from Tongyi-MAI, described as super fast.",
      },
      {
        q: "Can I use ControlNet or inpainting with Z-Image?",
        a: "Some providers list ControlNet and inpaint variants of Z-Image Turbo. The provider table shows which.",
      },
      COST_FAQ("Z-Image"),
    ],
    showcaseSlugs: ["z-image"],
  }),
  model({
    slug: "sana-sprint",
    name: "SANA-Sprint",
    vendor: "NVIDIA",
    modality: "text-to-image",
    accent: "blue",
    tagline:
      "Run NVIDIA's SANA-Sprint in a visual AI workflow: one-step text-to-image diffusion, at provider list price.",
    blurb: [
      "SANA-Sprint is NVIDIA's 1.6B parameter text-to-image model. It uses continuous-time consistency distillation to generate in a single step.",
      "The node exposes inference steps, an intermediate timesteps setting, guidance, width, height, and a seed, so you can move between one-step previews and a few-step render.",
      BYOK_BLURB("SANA-Sprint"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Size", value: "1.6B parameters" },
      { label: "Method", value: "Continuous-time consistency distillation" },
      { label: "Steps", value: "One-step generation" },
    ],
    faq: [
      {
        q: "What does one-step mean?",
        a: "SANA-Sprint is distilled so it can produce an image in a single diffusion step, instead of the dozens a standard model uses.",
      },
      {
        q: "Can I use more than one step?",
        a: "Yes. The node has an inference steps input.",
      },
      COST_FAQ("SANA-Sprint"),
    ],
    showcaseSlugs: ["sana-sprint"],
  }),
  model({
    slug: "dreamina",
    name: "Dreamina 3.1",
    vendor: "ByteDance",
    modality: "text-to-image",
    accent: "rose",
    tagline:
      "Run ByteDance's Dreamina 3.1 in a visual AI workflow: 4MP cinematic text-to-image with precise style control, at provider list price.",
    blurb: [
      "Dreamina 3.1 is ByteDance's text-to-image model. It generates at up to 4MP with cinematic-quality output, precise style control, improved text rendering, and optimisation for commercial design.",
      "The node takes an aspect ratio or explicit width and height, a resolution, a seed, and a `use_pre_llm` toggle.",
      BYOK_BLURB("Dreamina 3.1"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image" },
      { label: "Resolution", value: "Up to 4MP" },
      { label: "Strengths", value: "Style control, text rendering, commercial design" },
      { label: "Inputs", value: "Prompt, aspect ratio or size, resolution, seed" },
    ],
    faq: [
      {
        q: "What resolution does Dreamina 3.1 generate?",
        a: "Up to 4MP, according to the model listing.",
      },
      {
        q: "Can I set exact dimensions?",
        a: "Yes. The node takes an explicit width and height, or an aspect ratio with a resolution.",
      },
      COST_FAQ("Dreamina 3.1"),
    ],
    showcaseSlugs: ["dreamina"],
  }),
  model({
    slug: "bagel",
    name: "BAGEL",
    vendor: "ByteDance Seed",
    modality: "text-to-image",
    accent: "amber",
    tagline:
      "Run ByteDance Seed's BAGEL in a visual AI workflow: one 7B model that generates, edits, and understands images, at provider list price.",
    blurb: [
      "BAGEL is a unified multimodal model from ByteDance Seed. A single 7B parameter model generates images, edits images, and understands images.",
      "The node has a task input to choose between those modes, and a thinking toggle. That makes it a compact option when a graph needs both a generation step and an image understanding step.",
      BYOK_BLURB("BAGEL"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image, editing, and understanding" },
      { label: "Size", value: "7B parameters" },
      { label: "Modes", value: "Chosen with a task input" },
      { label: "Inputs", value: "Prompt, optional image, thinking toggle" },
    ],
    faq: [
      {
        q: "What can BAGEL do?",
        a: "Generate images, edit images, and answer questions about images, all from one 7B parameter model.",
      },
      {
        q: "How do I switch between generating and editing?",
        a: "Set the task input on the node and pass an image when you want to edit or ask about one.",
      },
      COST_FAQ("BAGEL"),
    ],
    showcaseSlugs: ["bagel"],
  }),
  model({
    slug: "retro-diffusion",
    name: "Retro Diffusion",
    vendor: "Retro Diffusion",
    modality: "text-to-image",
    accent: "emerald",
    tagline:
      "Run Retro Diffusion in a visual AI workflow: pixel art and tileset generation with palette control, at provider list price.",
    blurb: [
      "Retro Diffusion generates pixel art. RD Fast is the quick option and RD Plus targets high quality, authentic pixel art. RD Tile generates pixel art tilesets.",
      "The nodes take an input palette, a style, a background removal toggle, and tiling options on the x and y axes, which makes them useful for sprites and game assets.",
      BYOK_BLURB("Retro Diffusion"),
    ],
    facts: [
      { label: "Modality", value: "Text-to-image (pixel art)" },
      { label: "Models", value: "RD Fast, RD Plus, and RD Tile" },
      { label: "Control", value: "Input palette, style, background removal" },
      { label: "Tiling", value: "Tile on x and y axes" },
    ],
    faq: [
      {
        q: "Which Retro Diffusion model should I use?",
        a: "RD Fast for quick drafts, RD Plus for quality, and RD Tile when you need a tileset.",
      },
      {
        q: "Can I force a color palette?",
        a: "Yes. RD Fast and RD Plus accept an input palette image.",
      },
      COST_FAQ("Retro Diffusion"),
    ],
    showcaseSlugs: ["retro-diffusion"],
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
