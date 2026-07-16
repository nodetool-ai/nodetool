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
 * Added later: Nano Banana (image) and Grok Imagine (image/video) — both
 * verified present in `packages/*-nodes` manifests and wired into `MODELS` in
 * `scripts/generate-model-coverage.mjs`. New slugs need a keyword entry there
 * plus `npm run seo:model-coverage`, or their pages render with an empty
 * provider list.
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

export interface ModelFact {
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
      { label: "Resolution", value: "Up to 4K (Kling 3.0)" },
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
      "Seedance is ByteDance's video model, built for lively motion and quick turnaround. Its lite and pro tiers trade speed against fidelity, and it handles both text-to-video and image-to-video, which makes it a practical default for iterating on a shot before committing to a slower model. Seedance 2.0 adds native audio — dialogue, sound effects, and music generated with the clip — plus a reference-to-video mode that takes multiple reference images, videos, or audio clips in one prompt.",
      "As a NodeTool node, Seedance slots into the same graph as your prompt writer, reference images, and post-processing. Because every model here shares one interface, you can A/B Seedance against Veo or Kling on the same prompt without rebuilding the pipeline.",
      "Seedance is BYOK. The table below — generated from the node manifests — shows which providers serve it and under which ids.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-video and image-to-video" },
      { label: "Tiers", value: "Lite (fast), pro (higher fidelity), 2.0 (native audio)" },
      { label: "Clip length", value: "~5–15s" },
      { label: "Resolution", value: "Up to 1080p" },
      { label: "Native audio", value: "Yes, in Seedance 2.0" },
    ],
    faq: [
      {
        q: "What is Seedance best at?",
        a: "High-motion clips generated quickly. The lite tier is fast enough for rapid iteration, the pro tier raises fidelity for a final render, and 2.0 adds synchronized native audio.",
      },
      {
        q: "Does Seedance support image-to-video?",
        a: "Yes. Text-to-video, image-to-video, and — in 2.0 — a reference-to-video mode that accepts multiple images, videos, or audio clips are all available as nodes in NodeTool.",
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
    vendor: "Google DeepMind",
    modality: "text-to-image",
    accent: "amber",
    tagline:
      "Run Google DeepMind's Nano Banana in a visual AI workflow — the Gemini image family for fast edits and 4K Pro renders, BYOK at provider prices.",
    blurb: [
      "Nano Banana is Google DeepMind's nickname for its Gemini image-generation line: Nano Banana (Gemini 2.5 Flash Image), Nano Banana Pro (Gemini 3 Pro Image), and Nano Banana 2 (Gemini 3.1 Flash Image). All three follow detailed instructions closely, keep a subject consistent across edits, and render legible text directly in the image rather than garbling it.",
      "Each tier is also an editing model, not just a generator — give it an existing image and a text instruction and it revises the image in place. In NodeTool that means a generate-then-edit graph is two nodes, not two tools: produce a first pass, wire the output into an edit node with a follow-up instruction, and iterate without leaving the canvas.",
      "Nano Banana is BYOK — bring a key for a provider that serves it and pay their list price. The provider table below is generated from the node manifests.",
    ],
    facts: [
      { label: "Modality", value: "Text-to-image and image editing" },
      {
        label: "Tiers",
        value: "Nano Banana, Nano Banana Pro (Gemini 3 Pro Image), Nano Banana 2",
      },
      { label: "Resolution", value: "Up to 4K (Pro tier)" },
      { label: "Reference images", value: "Up to 14 in one prompt (Pro)" },
    ],
    faq: [
      {
        q: "What is Nano Banana?",
        a: "Nano Banana is the common name for Google DeepMind's Gemini image models — Gemini 2.5 Flash Image, Gemini 3 Pro Image (Nano Banana Pro), and Gemini 3.1 Flash Image (Nano Banana 2). In NodeTool each tier is a separate image node.",
      },
      {
        q: "Can Nano Banana edit an existing image?",
        a: "Yes — editing is a core capability, not an add-on. Feed it an image plus an instruction and it revises the image while keeping the rest intact.",
      },
      {
        q: "What does Nano Banana Pro add over the original?",
        a: "Higher resolution output (up to 4K vs. 2K), up to 14 reference images in one prompt, and stronger in-image text rendering for posters, diagrams, and infographics.",
      },
      {
        q: "How do I run Nano Banana in NodeTool?",
        a: "Add the Nano Banana node to a workflow, connect a text prompt, and run. NodeTool routes the call to a provider you have a key for.",
      },
    ],
    showcaseSlugs: ["nano-banana", "nano-banana-2", "nano-banana-pro", "gemini-3-pro-image"],
    templateSlug: "movie-posters",
  }),
  model({
    slug: "grok-imagine",
    name: "Grok Imagine",
    vendor: "xAI",
    modality: "text-to-video",
    accent: "violet",
    tagline:
      "Run xAI's Grok Imagine in a visual AI workflow — text- and image-to-video with native audio, plus a matching image generator, BYOK at provider prices.",
    blurb: [
      "Grok Imagine is xAI's image and video model. The video side turns a prompt or a still image into a clip with native audio — dialogue, sound effects, and music generated in the same pass — and the image side (including a higher-fidelity \"Image Quality\" tier) handles straight text-to-image and image-to-image generation.",
      "In NodeTool, Grok Imagine's video and image endpoints are separate nodes you can mix in one graph: generate a reference still, animate it into a clip, and route the result to an upscaler or a timeline — all re-runnable as a single workflow file.",
      "Grok Imagine is BYOK. The provider table below is generated from the node manifests and matches each provider's `--list-models`.",
    ],
    facts: [
      {
        label: "Modality",
        value: "Text-to-image, image-to-image, text-to-video, image-to-video",
      },
      { label: "Native audio", value: "Yes — dialogue, SFX, and music" },
      { label: "Clip length", value: "~6–15s" },
      { label: "Image resolution", value: "Up to 2K (Image Quality tier)" },
    ],
    faq: [
      {
        q: "Does Grok Imagine generate audio with its videos?",
        a: "Yes. Audio is generated in the same pass as the video and stays in sync with the motion — no separate dubbing step.",
      },
      {
        q: "Does Grok Imagine do images as well as video?",
        a: "Yes. Its text-to-image and image-to-image endpoints are separate nodes in NodeTool, including a higher-resolution Image Quality tier.",
      },
      {
        q: "How do I run Grok Imagine in NodeTool?",
        a: "Add a Grok Imagine node — video or image — to a workflow, connect a prompt, and run. NodeTool routes the call to a provider you have a key for.",
      },
    ],
    showcaseSlugs: ["grok-imagine", "grok-imagine-video", "grok-imagine-image"],
    templateSlug: "movie-trailer-generator",
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
