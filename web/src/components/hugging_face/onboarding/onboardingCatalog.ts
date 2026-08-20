/**
 * Model-onboarding catalog.
 *
 * The static guidance behind the Model Manager's "Get Started" tab: which local
 * inference engines exist, which node packs unlock them, and a curated set of
 * current models with an approximate VRAM budget so the UI can tell the user
 * what actually fits their machine.
 *
 * Everything here is guidance, not a live registry. Sizes and VRAM figures are
 * approximate (quantized weights + a little runtime headroom) and labelled as
 * such in the UI. Downloads still go through the real
 * {@link useModelDownloadStore} flow, so the `model` descriptor on each entry is
 * a genuine {@link UnifiedModel} the download service understands.
 */
import type { UnifiedModel } from "../../../stores/ApiTypes";

/** What a model is for — drives the capability grouping in the UI. */
export type OnboardingCapability =
  | "chat"
  | "vision"
  | "image"
  | "speech-to-text"
  | "text-to-speech"
  | "embedding";

export const CAPABILITY_LABELS = {
  chat: "Chat & Reasoning",
  vision: "Vision (image understanding)",
  image: "Image Generation",
  "speech-to-text": "Speech to Text",
  "text-to-speech": "Text to Speech",
  embedding: "Embeddings & Search"
} satisfies Record<OnboardingCapability, string>;

/** A local inference engine the user can run models on. */
export interface OnboardingEngine {
  id: string;
  name: string;
  /** One-line pitch. */
  tagline: string;
  /** Model file formats this engine loads. */
  formats: string[];
  /** What kinds of models it runs, in prose. */
  description: string;
  /** Platform restriction, when there is one (e.g. Apple Silicon only). */
  platform?: string;
  /**
   * Runtime id in the desktop Package Manager's "Software" tab, when the engine
   * is installed as a runtime rather than bundled. Matches
   * {@link RuntimePackagesStore} status ids.
   */
  runtimeId?: string;
  /** True when the desktop app bundles it (no install step needed). */
  bundled?: boolean;
  docsUrl: string;
}

/**
 * The local engines, roughly ordered easiest-first. Ollama ships with the
 * desktop app; the rest are installed from the Package Manager.
 */
export const ONBOARDING_ENGINES: readonly OnboardingEngine[] = [
  {
    id: "ollama",
    name: "Ollama",
    tagline: "One-click local LLMs",
    formats: ["GGUF"],
    description:
      "The simplest way to run chat and reasoning models locally. Pull a model by name and it runs on your GPU or CPU. Bundled with the desktop app.",
    bundled: true,
    docsUrl: "https://ollama.com"
  },
  {
    id: "node-llama-cpp",
    name: "llama.cpp",
    tagline: "GGUF models in-process",
    formats: ["GGUF"],
    description:
      "Runs GGUF language models directly inside the NodeTool backend — no separate server. Great for GGUF weights pulled straight from Hugging Face.",
    runtimeId: "node-llama-cpp",
    docsUrl: "https://github.com/withcatai/node-llama-cpp"
  },
  {
    id: "transformers-js",
    name: "Transformers.js",
    tagline: "ONNX models, anywhere",
    formats: ["ONNX"],
    description:
      "Runs smaller models (embeddings, speech, classification) in-process via ONNX Runtime. Works on any platform, no Python required.",
    runtimeId: "transformers-js",
    docsUrl: "https://huggingface.co/docs/transformers.js"
  },
  {
    id: "huggingface",
    name: "Hugging Face / Diffusers",
    tagline: "Image, video & audio via Python",
    formats: ["Safetensors", "PyTorch"],
    description:
      "The full Python stack for diffusion (image/video) and large audio models. Needs the Python runtime and the Hugging Face node pack.",
    docsUrl: "https://huggingface.co/docs/diffusers"
  },
  {
    id: "mlx",
    name: "MLX",
    tagline: "Apple Silicon acceleration",
    formats: ["MLX", "Safetensors"],
    description:
      "Apple's array framework, tuned for the unified memory of M-series chips. Fast local inference on modern Macs.",
    platform: "Apple Silicon only",
    docsUrl: "https://github.com/ml-explore/mlx"
  }
];

export const getEngine = (id: string): OnboardingEngine | undefined =>
  ONBOARDING_ENGINES.find((e) => e.id === id);

/** A node pack that unlocks one or more capabilities. */
export interface OnboardingNodePack {
  /** Registry repo id passed to {@link useNodePacksStore.install}. */
  repoId: string;
  name: string;
  description: string;
  capabilities: OnboardingCapability[];
}

/** The pack that unlocks the Python Diffusers/Transformers stack. */
export const HUGGINGFACE_PACK_REPO_ID = "nodetool-ai/nodetool-huggingface";

/**
 * The optional node packs. Base nodes ship with NodeTool, so they are not
 * listed here — everything below is an extra install.
 */
export const ONBOARDING_NODE_PACKS: readonly OnboardingNodePack[] = [
  {
    repoId: HUGGINGFACE_PACK_REPO_ID,
    name: "Hugging Face",
    description:
      "Local image, audio, and speech models via Diffusers and Transformers.",
    capabilities: ["image", "vision", "speech-to-text", "text-to-speech"]
  },
  {
    repoId: "nodetool-ai/nodetool-ollama",
    name: "Ollama",
    description: "Chat and embedding nodes backed by your local Ollama models.",
    capabilities: ["chat", "embedding"]
  }
];

/** A curated, downloadable model with a rough hardware budget. */
export interface OnboardingModel {
  /** Stable unique id for this catalog entry. */
  id: string;
  name: string;
  capability: OnboardingCapability;
  /** Engine id from {@link ONBOARDING_ENGINES}. */
  engine: string;
  /** One-line description of what it's good at. */
  blurb: string;
  /** Approximate on-disk size, GB (quantized where applicable). */
  approxSizeGb: number;
  /** Approximate memory to run comfortably, GB (VRAM, or unified RAM). */
  minVramGb: number;
  /** Quantization label, when relevant (e.g. Q4_K_M). */
  quant?: string;
  /** Highlight as a current, notable pick. */
  featured?: boolean;
  /** The real download descriptor handed to the download service. */
  model: UnifiedModel;
}

const ollama = (
  id: string,
  name: string,
  blurb: string,
  approxSizeGb: number,
  minVramGb: number,
  capability: OnboardingCapability,
  extra?: Partial<OnboardingModel>
): OnboardingModel => ({
  id,
  name,
  capability,
  engine: "ollama",
  blurb,
  approxSizeGb,
  minVramGb,
  model: { id, name, type: "llama_model", provider: "ollama" },
  ...extra
});

const hf = (
  repoId: string,
  name: string,
  blurb: string,
  approxSizeGb: number,
  minVramGb: number,
  capability: OnboardingCapability,
  type: string,
  pipelineTag: string,
  extra?: Partial<OnboardingModel>
): OnboardingModel => ({
  id: repoId,
  name,
  capability,
  engine: "huggingface",
  blurb,
  approxSizeGb,
  minVramGb,
  model: {
    id: repoId,
    name,
    repo_id: repoId,
    type,
    pipeline_tag: pipelineTag,
    provider: "huggingface"
  },
  ...extra
});

/**
 * The curated models, sized to run on a single consumer GPU. Chat/vision run on
 * Ollama (GGUF, one-click); image/speech/embeddings run on the Hugging Face
 * Python stack.
 *
 * Ollama tags and Hugging Face repo ids are real; sizes/VRAM are approximate
 * and shown as such in the UI.
 */
export const ONBOARDING_MODELS: readonly OnboardingModel[] = [
  // --- Chat & reasoning (Ollama, GGUF) --------------------------------------
  ollama(
    "qwen3.5:2b",
    "Qwen3.5 2B",
    "Tiny and fast. Runs on almost anything, even without a GPU.",
    2.7,
    4,
    "chat"
  ),
  ollama(
    "qwen3.5:4b",
    "Qwen3.5 4B",
    "Noticeably sharper than the 2B while still fitting a laptop.",
    3.4,
    6,
    "chat"
  ),
  ollama(
    "qwen3.5:9b",
    "Qwen3.5 9B",
    "Strong all-round chat and tool use at a modest size.",
    6.6,
    8,
    "chat",
    { featured: true }
  ),
  ollama(
    "gemma4:12b",
    "Gemma 4 12B",
    "Google's mid-size open model, good quality per gigabyte.",
    7.6,
    10,
    "chat"
  ),
  ollama(
    "gpt-oss:20b",
    "GPT-OSS 20B",
    "OpenAI's open-weight reasoning model. NodeTool's default local chat model.",
    14.0,
    16,
    "chat",
    { featured: true, quant: "MXFP4" }
  ),
  ollama(
    "mistral-small3.2:24b",
    "Mistral Small 3.2 24B",
    "Near-flagship quality that still fits a 16 GB card.",
    15.0,
    16,
    "chat"
  ),
  ollama(
    "qwen3.6:27b",
    "Qwen3.6 27B",
    "One of the strongest models you can run locally at this size.",
    17.0,
    20,
    "chat",
    { featured: true }
  ),
  ollama(
    "gemma4:26b",
    "Gemma 4 26B",
    "Sparse mixture-of-experts — 26B weights, but only a few active per token.",
    18.0,
    22,
    "chat"
  ),
  ollama(
    "qwen3.6:35b-a3b",
    "Qwen3.6 35B A3B",
    "Mixture-of-experts: 35B quality at roughly 3B speed. Wants a big card.",
    24.0,
    28,
    "chat"
  ),
  // --- Vision (Ollama, GGUF) ------------------------------------------------
  ollama(
    "qwen3-vl:4b",
    "Qwen3-VL 4B",
    "Small vision model for captions, screenshots, and document Q&A.",
    3.3,
    6,
    "vision"
  ),
  ollama(
    "qwen3-vl:8b",
    "Qwen3-VL 8B",
    "Describe, read, and answer questions about images.",
    6.1,
    8,
    "vision",
    { featured: true }
  ),
  ollama(
    "qwen3-vl:32b",
    "Qwen3-VL 32B",
    "The accurate end of local vision — charts, dense text, fine detail.",
    21.0,
    24,
    "vision"
  ),
  // --- Image generation (Hugging Face, Diffusers) ---------------------------
  hf(
    "stabilityai/stable-diffusion-xl-base-1.0",
    "Stable Diffusion XL",
    "Runs on modest GPUs and has the biggest ecosystem of LoRAs and ControlNets.",
    6.9,
    8,
    "image",
    "hf.stable_diffusion_xl",
    "text-to-image"
  ),
  hf(
    "black-forest-labs/FLUX.1-schnell",
    "FLUX.1 schnell",
    "Top open image quality in a few steps. Needs a large GPU (or offloading).",
    23.0,
    24,
    "image",
    "hf.flux",
    "text-to-image",
    { featured: true }
  ),
  // --- Speech to text (Hugging Face, Transformers) --------------------------
  hf(
    "openai/whisper-large-v3-turbo",
    "Whisper Large v3 Turbo",
    "Multilingual transcription at several times the speed of Large v3.",
    1.6,
    3,
    "speech-to-text",
    "hf.automatic_speech_recognition",
    "automatic-speech-recognition",
    { featured: true }
  ),
  hf(
    "openai/whisper-large-v3",
    "Whisper Large v3",
    "The most accurate Whisper, for transcription and translation.",
    3.1,
    4,
    "speech-to-text",
    "hf.automatic_speech_recognition",
    "automatic-speech-recognition"
  ),
  // --- Text to speech (Hugging Face) ----------------------------------------
  hf(
    "hexgrad/Kokoro-82M",
    "Kokoro 82M",
    "Tiny, natural-sounding voices. Fast enough to run on CPU.",
    0.4,
    2,
    "text-to-speech",
    "hf.text_to_speech",
    "text-to-speech",
    { featured: true }
  ),
  // --- Embeddings (Hugging Face) --------------------------------------------
  hf(
    "Qwen/Qwen3-Embedding-0.6B",
    "Qwen3 Embedding 0.6B",
    "Small, current multilingual embeddings for search and RAG.",
    1.2,
    2,
    "embedding",
    "hf.feature_extraction",
    "feature-extraction",
    { featured: true }
  ),
  hf(
    "BAAI/bge-m3",
    "BGE-M3",
    "Multilingual embeddings with long-document support.",
    2.3,
    3,
    "embedding",
    "hf.feature_extraction",
    "feature-extraction"
  )
];

/** How well a model fits the machine's memory budget. */
export type FitLevel = "fits" | "tight" | "over" | "unknown";

/**
 * Classify a model against a memory budget (GB). `null` budget → "unknown".
 * A little headroom is required for a comfortable "fits"; running right at the
 * limit is "tight"; above the limit is "over".
 */
export const classifyFit = (
  minVramGb: number,
  budgetGb: number | null
): FitLevel => {
  if (budgetGb == null) {
    return "unknown";
  }
  if (budgetGb >= minVramGb * 1.15) {
    return "fits";
  }
  if (budgetGb >= minVramGb) {
    return "tight";
  }
  return "over";
};

export const FIT_LABELS = {
  fits: "Fits your machine",
  tight: "Tight fit",
  over: "Needs more memory",
  unknown: "Set your memory to check"
} satisfies Record<FitLevel, string>;

const FIT_ORDER = {
  fits: 0,
  tight: 1,
  unknown: 2,
  over: 3
} satisfies Record<FitLevel, number>;

/**
 * Sort models best-fit-first for a given budget: models that fit come first
 * (largest that still fits at the top, since bigger usually means better),
 * then tight, then unknown, then over (smallest-over first — closest to
 * runnable). Ties break on featured, then size.
 */
export const sortModelsByFit = (
  models: readonly OnboardingModel[],
  budgetGb: number | null
): OnboardingModel[] =>
  [...models].sort((a, b) => {
    const fa = classifyFit(a.minVramGb, budgetGb);
    const fb = classifyFit(b.minVramGb, budgetGb);
    if (fa !== fb) {
      return FIT_ORDER[fa] - FIT_ORDER[fb];
    }
    // Within "over", smaller (closer to fitting) first; otherwise larger first.
    const bigFirst = fa === "over" ? -1 : 1;
    if (a.minVramGb !== b.minVramGb) {
      return bigFirst * (b.minVramGb - a.minVramGb);
    }
    if (!!a.featured !== !!b.featured) {
      return a.featured ? -1 : 1;
    }
    return a.approxSizeGb - b.approxSizeGb;
  });
