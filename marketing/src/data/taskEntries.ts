/**
 * Task-hub page-data (PR-6). Each entry drives one `/tasks/<slug>` page: the
 * models that do the task, the shipped templates that wire it, and a showcase
 * strip — with Product + FAQPage JSON-LD.
 *
 * A task hub answers "how do I do <task> with AI" for a single capability
 * (image-to-video, lip-sync, upscale-video, text-to-music, …). Templates are
 * matched to the task from real generated data (node types + tags); models are
 * curated here.
 *
 * NOTE on models: PR-4's `modelEntries` (with a `modality` field) is not yet in
 * this branch, so each task carries its own curated `models` list with a
 * `modality`. When `modelEntries` lands, `modelsForTask` can switch to filtering
 * that module by `modality` with no change to the page. See registry.ts.
 *
 * A TaskEntry extends PR-1's `PageEntry`, so it folds into the sitemap and smoke
 * walk with no special-casing.
 */
import type { OgAccent } from "@/lib/og";
import type { PageEntry } from "./types";
import { templateEntries, type TemplateEntry } from "./templates";
import { showcaseEntries } from "./showcaseEntries.generated";
import type { ShowcaseEntry } from "./showcase";

export type Modality = "image" | "video" | "audio" | "text";

export interface TaskModel {
  name: string;
  provider: string;
  modality: Modality;
  blurb: string;
}

export interface TaskEntry extends PageEntry {
  slug: string;
  /** Human task name, e.g. "Image to Video". */
  task: string;
  modality: Modality;
  /** H1 text. */
  headline: string;
  /** Hero paragraph. */
  subhead: string;
  /** Node-type substrings that mark a template as doing this task. */
  nodeTypeMatch: string[];
  /** Template tags that mark it as related to this task. */
  tagMatch: string[];
  /** Curated models that perform this task. */
  models: TaskModel[];
  /** FAQ pairs — emitted as FAQPage JSON-LD and rendered on the page. */
  faqs: { q: string; a: string }[];
  accent: OgAccent;
}

const BASE = "https://nodetool.ai";
const title = (task: string) => `Best AI Models for ${task} — NodeTool`;

export const taskEntries: TaskEntry[] = [
  {
    route: "/tasks/image-to-video",
    title: title("Image to Video"),
    description:
      "Animate a still image into video with AI. Compare image-to-video models, run ready-made NodeTool workflows, and wire them into your own pipeline.",
    priority: 0.6,
    changeFrequency: "weekly",
    indexable: true,
    slug: "image-to-video",
    task: "Image to Video",
    modality: "video",
    headline: "Image-to-Video AI Models & Workflows",
    subhead:
      "Turn a single frame into motion. Pick an image-to-video model, drop it into a NodeTool workflow, and animate stills into clips — on one canvas with your own keys.",
    nodeTypeMatch: ["video.ImageToVideo", "video.FrameToVideo"],
    tagMatch: ["video"],
    models: [
      { name: "Kling 2.6", provider: "Kling", modality: "video", blurb: "High-motion image-to-video with strong subject consistency." },
      { name: "Veo 3.1", provider: "Google", modality: "video", blurb: "Cinematic camera moves and native audio from a still." },
      { name: "Wan 2.6", provider: "Alibaba", modality: "video", blurb: "Open-weight animation with fine motion control." },
      { name: "Hailuo 2.3", provider: "MiniMax", modality: "video", blurb: "Fast, expressive motion for short clips." },
    ],
    faqs: [
      {
        q: "What is image-to-video?",
        a: "It animates a still image into a short video clip — the model infers motion, camera, and timing from your frame and a prompt.",
      },
      {
        q: "Which image-to-video model is best?",
        a: "It depends on the look you want: Kling and Veo lead on cinematic motion, while open-weight models like Wan let you run locally and tune control.",
      },
      {
        q: "How do I run it in NodeTool?",
        a: "Open one of the image-to-video templates below in Studio, connect the provider key, feed it an image, and run the graph.",
      },
    ],
    accent: "violet",
  },
  {
    route: "/tasks/text-to-image",
    title: title("Text to Image"),
    description:
      "Generate images from text with AI. Compare text-to-image models, run ready-made NodeTool workflows, and build them into a bigger pipeline.",
    priority: 0.6,
    changeFrequency: "weekly",
    indexable: true,
    slug: "text-to-image",
    task: "Text to Image",
    modality: "image",
    headline: "Text-to-Image AI Models & Workflows",
    subhead:
      "Describe it and render it. Choose a text-to-image model, wire it into a NodeTool workflow, and generate on-brand visuals in batches — with your own keys.",
    nodeTypeMatch: ["image.TextToImage"],
    tagMatch: ["image", "design"],
    models: [
      { name: "FLUX.2", provider: "Black Forest Labs", modality: "image", blurb: "Sharp prompt adherence and text rendering." },
      { name: "Nano Banana Pro", provider: "Google", modality: "image", blurb: "Fast, high-fidelity generation and editing." },
      { name: "SDXL", provider: "Stability (local)", modality: "image", blurb: "Open-weight, runs on your own GPU." },
      { name: "FLUX schnell", provider: "Black Forest Labs", modality: "image", blurb: "Low-step model for quick drafts and batches." },
    ],
    faqs: [
      {
        q: "What is text-to-image generation?",
        a: "A model turns a written prompt into an image. You describe the subject, style, and composition, and it renders a picture to match.",
      },
      {
        q: "Can I run text-to-image locally?",
        a: "Yes. Open-weight models like SDXL and FLUX run in NodeTool Studio on your own GPU — no account and nothing leaves your machine.",
      },
      {
        q: "How do I generate a whole batch?",
        a: "The templates below use list and batch nodes to fan one prompt out into many variations in a single run.",
      },
    ],
    accent: "blue",
  },
  {
    route: "/tasks/text-to-speech",
    title: title("Text to Speech"),
    description:
      "Convert text to natural speech with AI. Compare text-to-speech voices, run ready-made NodeTool workflows, and add voiceover to any pipeline.",
    priority: 0.6,
    changeFrequency: "weekly",
    indexable: true,
    slug: "text-to-speech",
    task: "Text to Speech",
    modality: "audio",
    headline: "Text-to-Speech AI Models & Workflows",
    subhead:
      "Give your workflow a voice. Pick a text-to-speech model, drop it into a NodeTool graph, and turn scripts into narration and voiceover — with your own keys.",
    nodeTypeMatch: ["audio.TextToSpeech"],
    tagMatch: ["audio", "speech", "voice"],
    models: [
      { name: "ElevenLabs v3", provider: "ElevenLabs", modality: "audio", blurb: "Expressive, multi-lingual voices with cloning." },
      { name: "OpenAI TTS", provider: "OpenAI", modality: "audio", blurb: "Clean, reliable narration voices." },
      { name: "Kokoro", provider: "Local (MLX)", modality: "audio", blurb: "Open-weight TTS that runs on Apple Silicon." },
    ],
    faqs: [
      {
        q: "What is text-to-speech?",
        a: "It converts written text into spoken audio using an AI voice — useful for narration, voiceover, and accessibility.",
      },
      {
        q: "Can I clone or customize a voice?",
        a: "With providers like ElevenLabs, yes. Swap the TTS node's model and voice settings to change how it sounds.",
      },
      {
        q: "Does it run offline?",
        a: "Local models such as Kokoro run entirely in NodeTool Studio on your own machine — no network needed.",
      },
    ],
    accent: "amber",
  },
  {
    route: "/tasks/upscale-video",
    title: title("Video Upscaling"),
    description:
      "Upscale and enhance video with AI. Compare upscaling models, run ready-made NodeTool workflows, and clean up footage frame by frame.",
    priority: 0.6,
    changeFrequency: "weekly",
    indexable: true,
    slug: "upscale-video",
    task: "Video Upscaling",
    modality: "video",
    headline: "AI Video Upscaling Models & Workflows",
    subhead:
      "Sharpen, denoise, and upscale footage. Choose an enhancement model, wire it into a NodeTool workflow, and lift low-res clips to a cleaner resolution.",
    nodeTypeMatch: ["image.ImageToImage"],
    tagMatch: ["video", "upscale", "enhance"],
    models: [
      { name: "Topaz Video AI", provider: "Topaz", modality: "video", blurb: "Detail-preserving upscaling and frame interpolation." },
      { name: "Real-ESRGAN", provider: "Local", modality: "image", blurb: "Open-weight upscaler, applied per frame." },
      { name: "SeedVR2", provider: "ByteDance", modality: "video", blurb: "Diffusion-based video restoration and upscaling." },
    ],
    faqs: [
      {
        q: "How does AI video upscaling work?",
        a: "The workflow splits the clip into frames, upscales each with an enhancement model, then reassembles the frames back into video.",
      },
      {
        q: "Can I upscale and color-correct at once?",
        a: "Yes — chain an upscaling node with color and sharpening nodes in the same graph so each frame gets the full treatment.",
      },
      {
        q: "What resolution can I reach?",
        a: "That's set by the model and your prompt. Most upscalers target 2×–4× the source resolution.",
      },
    ],
    accent: "cyan",
  },
  {
    route: "/tasks/lip-sync",
    title: title("Lip Sync"),
    description:
      "Sync a talking face to any audio with AI. Compare lip-sync models, run NodeTool workflows, and build talking-head and avatar pipelines.",
    priority: 0.6,
    changeFrequency: "weekly",
    indexable: true,
    slug: "lip-sync",
    task: "Lip Sync",
    modality: "video",
    headline: "AI Lip-Sync Models & Workflows",
    subhead:
      "Make any face speak your audio. Pick a lip-sync model, wire it into a NodeTool workflow, and drive talking-head and avatar videos from a voice track.",
    nodeTypeMatch: [],
    tagMatch: ["video", "avatar", "lip-sync"],
    models: [
      { name: "Kling Lip Sync", provider: "Kling", modality: "video", blurb: "Accurate mouth motion driven by an audio track." },
      { name: "Sync Labs", provider: "Sync", modality: "video", blurb: "Photoreal lip-sync for talking heads." },
      { name: "LivePortrait", provider: "Local", modality: "video", blurb: "Open-weight portrait animation and expression transfer." },
    ],
    faqs: [
      {
        q: "What is AI lip sync?",
        a: "It animates a face so its mouth matches a voice track — turning a portrait plus audio into a talking-head clip.",
      },
      {
        q: "Do I need a video of the person?",
        a: "Not always. Some models animate a single portrait; others re-sync an existing clip to new audio. Pick the model that fits your source.",
      },
      {
        q: "How do I combine it with text-to-speech?",
        a: "Generate the voice with a TTS node, then feed that audio into the lip-sync node in the same NodeTool graph.",
      },
    ],
    accent: "rose",
  },
  {
    route: "/tasks/text-to-music",
    title: title("Text to Music"),
    description:
      "Generate original music from a text prompt with AI. Compare text-to-music models, run NodeTool workflows, and score videos on one canvas.",
    priority: 0.6,
    changeFrequency: "weekly",
    indexable: true,
    slug: "text-to-music",
    task: "Text to Music",
    modality: "audio",
    headline: "Text-to-Music AI Models & Workflows",
    subhead:
      "Describe a mood and get a track. Choose a text-to-music model, drop it into a NodeTool workflow, and score videos or generate loops — with your own keys.",
    nodeTypeMatch: [],
    tagMatch: ["music", "audio"],
    models: [
      { name: "Suno v4", provider: "Suno", modality: "audio", blurb: "Full songs with vocals from a text prompt." },
      { name: "Udio", provider: "Udio", modality: "audio", blurb: "High-fidelity music generation and extension." },
      { name: "Stable Audio", provider: "Stability", modality: "audio", blurb: "Prompt-driven instrumental tracks and loops." },
    ],
    faqs: [
      {
        q: "What is text-to-music generation?",
        a: "A model composes original audio from a written prompt — you describe genre, mood, and instruments, and it returns a track.",
      },
      {
        q: "Can I score a video with it?",
        a: "Yes. Generate a track from the prompt, then mix it under your footage with an add-audio node in the same graph.",
      },
      {
        q: "Are the tracks royalty-free?",
        a: "That depends on the provider's license — check the model's terms. NodeTool just wires the model in; you bring your own key.",
      },
    ],
    accent: "emerald",
  },
  {
    route: "/tasks/ai-b-roll",
    title: title("AI B-Roll"),
    description:
      "Generate AI b-roll from a script, prompt, or still image. Compare b-roll models, run ready-made NodeTool workflows, and batch out cutaway shots with your own keys.",
    priority: 0.6,
    changeFrequency: "weekly",
    indexable: true,
    slug: "ai-b-roll",
    task: "AI B-Roll",
    modality: "video",
    headline: "AI B-Roll Generator: Models & Workflows",
    subhead:
      "Skip the stock-footage search. Turn a shot list into cutaways with a text- or image-to-video model, batch out variations on one canvas, and drop the clips straight into your edit — with your own keys.",
    nodeTypeMatch: ["video.TextToVideo", "video.ImageToVideo", "video.FrameToVideo"],
    tagMatch: ["video"],
    models: [
      { name: "Wan 2.6", provider: "Alibaba", modality: "video", blurb: "Open-weight text- and image-to-video with fine motion control for shot-matching cutaways." },
      { name: "Seedance", provider: "ByteDance", modality: "video", blurb: "Lite tier for fast, high-volume b-roll batches; pro tier for the keeper shots." },
      { name: "Kling 2.6", provider: "Kling", modality: "video", blurb: "Image-to-video with strong subject consistency for cutaways that match an existing scene." },
      { name: "Hailuo 2.3", provider: "MiniMax", modality: "video", blurb: "Fast, energetic motion for short filler clips." },
    ],
    faqs: [
      {
        q: "What counts as AI b-roll?",
        a: "Any supplementary clip a model generates from a text prompt or a still image — cutaways, texture shots, establishing shots — instead of footage you shot or licensed.",
      },
      {
        q: "Text-to-video or image-to-video for b-roll?",
        a: "Text-to-video (Wan, Seedance) when you have no source frame; image-to-video (Kling, Hailuo) when the cutaway needs to match an existing shot's lighting and subject.",
      },
      {
        q: "How do I generate a batch of variations at once?",
        a: "The templates below fan one prompt or shot list out into several clips in a single run with a list node, so you get options instead of one clip at a time.",
      },
      {
        q: "Do these clips have audio?",
        a: "Most b-roll models are silent by default — score the clip afterward with a text-to-music or add-audio node in the same graph.",
      },
    ],
    accent: "rose",
  },
  {
    route: "/tasks/ai-storyboard",
    title: title("AI Storyboard"),
    description:
      "Turn a script into a storyboard with AI. Compare storyboard-ready image models, run ready-made NodeTool workflows, and render a full sequence of panels on one canvas.",
    priority: 0.6,
    changeFrequency: "weekly",
    indexable: true,
    slug: "ai-storyboard",
    task: "AI Storyboard",
    modality: "image",
    headline: "AI Storyboard Generator: Models & Workflows",
    subhead:
      "Go from script to panels. Split a script into scenes, render one consistent frame per beat with an image model, and lay out the whole board in a single NodeTool run — with your own keys.",
    nodeTypeMatch: ["image.TextToImage"],
    tagMatch: ["image", "design", "concept-art", "storytelling", "creative"],
    models: [
      { name: "FLUX.2", provider: "Black Forest Labs", modality: "image", blurb: "Sharp prompt adherence keeps a consistent look from panel to panel." },
      { name: "Nano Banana Pro", provider: "Google", modality: "image", blurb: "Fast edits for revising one panel without re-rendering the board." },
      { name: "Seedream", provider: "ByteDance", modality: "image", blurb: "High-resolution frames with bilingual prompt support for shot lists." },
      { name: "GPT-Image", provider: "OpenAI", modality: "image", blurb: "Strong instruction-following keeps characters and props consistent across panels." },
    ],
    faqs: [
      {
        q: "What is an AI storyboard generator?",
        a: "It turns a script or shot list into a sequence of frames — one image per beat — so you can plan composition and pacing before shooting or animating.",
      },
      {
        q: "How do I keep every panel visually consistent?",
        a: "Reuse the same character and style description in every prompt in the sequence, or chain an image-to-image step after the first frame so later panels reference it directly.",
      },
      {
        q: "Can one script produce the whole board automatically?",
        a: "Yes — the templates below use a list generator to split a script into scenes, then render one frame per scene in a single run.",
      },
      {
        q: "Can I turn the storyboard into video?",
        a: "Yes. Feed each panel into an image-to-video node afterward to animate the board scene by scene.",
      },
    ],
    accent: "amber",
  },
  {
    route: "/tasks/consistent-characters",
    title: title("Consistent Characters"),
    description:
      "Keep an AI character consistent across shots. Compare models built for character consistency, run ready-made NodeTool workflows, and chain reference images and clips on one canvas.",
    priority: 0.6,
    changeFrequency: "weekly",
    indexable: true,
    slug: "consistent-characters",
    task: "Consistent Characters",
    modality: "video",
    headline: "Consistent-Character AI Video Models & Workflows",
    subhead:
      "One face, every shot. Build a reference image, chain it through image-to-video and first/last-frame nodes, and hold a character's look across an entire sequence — a workflow problem a node canvas solves better than a single-shot tool.",
    nodeTypeMatch: ["video.ImageToVideo", "video.FrameToVideo", "image.ImageToImage"],
    tagMatch: ["video"],
    models: [
      { name: "Nano Banana Pro", provider: "Google", modality: "image", blurb: "Fast, consistent edits for building a character's reference sheet before animating." },
      { name: "Kling 2.6", provider: "Kling", modality: "video", blurb: "Start/end-frame mode chains shots while keeping the subject on-model." },
      { name: "Veo 3.1", provider: "Google", modality: "video", blurb: "Cinematic image-to-video that holds a subject's likeness across a shot." },
      { name: "Wan 2.6", provider: "Alibaba", modality: "video", blurb: "Open-weight pose and depth control for steering a character through a sequence." },
      { name: "Hailuo 2.3", provider: "MiniMax", modality: "video", blurb: "Image-to-video that keeps a subject's likeness across the clip." },
    ],
    faqs: [
      {
        q: "How do I keep an AI character consistent across shots?",
        a: "Generate a reference image once, then reuse it as the seed for every clip — feeding the same reference into an image-to-video node keeps the face, outfit, and proportions steady shot to shot.",
      },
      {
        q: "What is a first/last-frame chain?",
        a: "You generate the last frame of one clip and use it as the first frame of the next. Kling and Wan both expose start/end-frame modes for this, so a sequence reads as one continuous shot instead of visibly restarting.",
      },
      {
        q: "Why not just re-prompt a single-shot tool for every scene?",
        a: "Single-shot tools regenerate the character from scratch each call, so faces and outfits drift between clips. A node graph passes the same reference image and seed through every shot, which a single-prompt tool doesn't expose.",
      },
      {
        q: "Which models handle character consistency best?",
        a: "Kling and Hailuo hold a subject's likeness well through image-to-video, Wan adds pose and depth control for precise steering, and an image model like Nano Banana Pro builds the reference sheet first.",
      },
    ],
    accent: "cyan",
  },
];

/** Hub entry for the `/tasks` index — kept in the registry too. */
export const tasksHubEntry: PageEntry = {
  route: "/tasks",
  title: "AI Tasks — NodeTool",
  description:
    "Browse AI capabilities by task: image-to-video, text-to-image, text-to-speech, video upscaling, lip sync, and text-to-music — each with models and runnable workflows.",
  priority: 0.7,
  changeFrequency: "weekly",
  indexable: true,
};

/** Everything this engine contributes to the registry (hub first). */
export const taskRegistryEntries: PageEntry[] = [tasksHubEntry, ...taskEntries];

export function getTask(slug: string): TaskEntry | undefined {
  return taskEntries.find((t) => t.slug === slug);
}

/** Templates that wire this task, from real generated data (best-fit first). */
export function templatesForTask(task: TaskEntry, limit = 6): TemplateEntry[] {
  const scored = templateEntries
    .map((t) => {
      const nodeHits = t.nodeTypes.filter((nt) =>
        task.nodeTypeMatch.some((m) => nt.type.includes(m)),
      ).length;
      const tagHits = t.tags.filter((tag) => task.tagMatch.includes(tag)).length;
      return { t, score: nodeHits * 2 + tagHits };
    })
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.t.indexable) - Number(a.t.indexable) ||
        a.t.name.localeCompare(b.t.name),
    );
  return scored.slice(0, limit).map((x) => x.t);
}

/**
 * Showcase items for the strip. Reads the generated showcase manifest (W-1),
 * filtered to this task's modality. Empty until the seeder ingests media —
 * the page falls back to matched-template thumbnails, so the strip is never
 * blank.
 */
export function showcaseForTask(task: TaskEntry, limit = 6): ShowcaseEntry[] {
  const wanted = task.modality === "video" ? "video" : task.modality === "image" ? "image" : null;
  if (!wanted) return [];
  return showcaseEntries
    .filter((s) => s.indexable && s.mediaType === wanted)
    .slice(0, limit);
}

export function taskCanonical(task: TaskEntry): string {
  return `${BASE}${task.route}`;
}
