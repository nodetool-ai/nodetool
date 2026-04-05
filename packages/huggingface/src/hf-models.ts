/**
 * Offline-first Hugging Face model discovery and typing utilities.
 *
 * Ported from the Python `huggingface_models.py`.
 *
 * The workflow implemented here follows a predictable sequence:
 * 1. Enumerate cached repositories and snapshots via `HfFastCache` without hitting the hub.
 * 2. Read lightweight metadata (sizes, filenames, artifacts) from the local snapshot to
 *    build `UnifiedModel` records for repos and individual files.
 * 3. Infer model type and task:
 *    - Use local `model_index.json` / `config.json` parsing and artifact inspection
 *      so we can classify models even when offline or gated.
 * 4. Provide targeted search helpers (by hf.* type, repo/file patterns, artifact hints).
 * 5. Expose convenience lookups for common runtimes (llama.cpp GGUF).
 *
 * Wherever possible, the code avoids expensive I/O and network calls, preferring cached
 * information and shallow file inspections to keep UI interactions fast and reliable.
 */

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { HfFastCache } from "./hf-cache.js";
import { inspectPaths } from "./artifact-inspector.js";
import type { ArtifactDetection } from "./artifact-inspector.js";

// ---------------------------------------------------------------------------
// UnifiedModel interface
// ---------------------------------------------------------------------------

export interface UnifiedModel {
  id: string;
  type: string | null;
  name: string;
  repo_id: string | null;
  path: string | null;
  artifact_family?: string | null;
  artifact_component?: string | null;
  artifact_confidence?: number | null;
  artifact_evidence?: string[] | null;
  cache_path?: string | null;
  allow_patterns?: string[] | null;
  ignore_patterns?: string[] | null;
  description?: string | null;
  readme?: string | null;
  downloaded?: boolean | null;
  size_on_disk?: number | null;
  pipeline_tag?: string | null;
  tags?: string[] | null;
  has_model_index?: boolean | null;
  downloads?: number | null;
  likes?: number | null;
  trending_score?: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Extensions that identify repo-root single-file diffusion checkpoints we surface directly.
 */
export const SINGLE_FILE_DIFFUSION_EXTENSIONS: readonly string[] = [
  ".safetensors",
  ".ckpt",
  ".bin",
  ".pt",
  ".pth",
  ".svdq"
];

/**
 * Tags that hint at single-file diffusion checkpoints when hub metadata is present.
 */
export const SINGLE_FILE_DIFFUSION_TAGS: ReadonlySet<string> = new Set([
  "diffusers",
  "diffusers:stablediffusionpipeline",
  "diffusers:stablediffusionxlpipeline",
  "diffusers:stablediffusion3pipeline",
  "diffusion-single-file",
  "stable-diffusion",
  "flux"
]);

/** Default globs used when scanning repos for general-purpose weight files. */
export const HF_DEFAULT_FILE_PATTERNS: readonly string[] = [
  "*.safetensors",
  "*.ckpt",
  "*.gguf",
  "*.bin",
  "*.svdq"
];

/** Extra globs for torch weights common in control/adapters. */
export const HF_PTH_FILE_PATTERNS: readonly string[] = ["*.pth", "*.pt"];

/**
 * Known repo-id allowlists for supported model families.
 * These repos are recognized for offline type matching without hub metadata.
 */
export const KNOWN_REPO_PATTERNS: Readonly<Record<string, readonly string[]>> =
  {
    flux: [
      "Comfy-Org/flux1-dev",
      "Comfy-Org/flux1-schnell",
      "black-forest-labs/FLUX.1-dev",
      "black-forest-labs/FLUX.1-schnell"
    ],
    flux_kontext: [
      "black-forest-labs/FLUX.1-Kontext-dev",
      "nunchaku-tech/nunchaku-flux-kontext"
    ],
    flux_canny: [
      "black-forest-labs/FLUX.1-Canny-dev",
      "nunchaku-tech/nunchaku-flux.1-canny-dev"
    ],
    flux_depth: [
      "black-forest-labs/FLUX.1-Depth-dev",
      "nunchaku-tech/nunchaku-flux.1-depth-dev"
    ],
    flux_vae: ["ffxvs/vae-flux"],
    qwen_image: [
      "Comfy-Org/Qwen-Image_ComfyUI",
      "city96/Qwen-Image-gguf",
      "nunchaku-tech/nunchaku-qwen-image"
    ],
    qwen_image_edit: ["Comfy-Org/Qwen-Image-Edit_ComfyUI"],
    sd35: ["Comfy-Org/stable-diffusion-3.5-fp8"]
  };

/**
 * Map hf.* types to repo-id allowlists so type matching can succeed offline.
 */
export const KNOWN_TYPE_REPO_MATCHERS: Record<string, string[]> = {
  "hf.flux": [...KNOWN_REPO_PATTERNS.flux],
  "hf.flux_fp8": [...KNOWN_REPO_PATTERNS.flux],
  "hf.flux_kontext": [...KNOWN_REPO_PATTERNS.flux_kontext],
  "hf.flux_canny": [...KNOWN_REPO_PATTERNS.flux_canny],
  "hf.flux_depth": [...KNOWN_REPO_PATTERNS.flux_depth],
  "hf.stable_diffusion_3": [...KNOWN_REPO_PATTERNS.sd35],
  "hf.qwen_image": [
    ...KNOWN_REPO_PATTERNS.qwen_image,
    ...KNOWN_REPO_PATTERNS.qwen_image_edit
  ],
  "hf.qwen_image_edit": [...KNOWN_REPO_PATTERNS.qwen_image_edit],
  "hf.qwen_vl": [
    ...KNOWN_REPO_PATTERNS.qwen_image,
    ...KNOWN_REPO_PATTERNS.qwen_image_edit
  ],
  "hf.unet": [
    ...KNOWN_REPO_PATTERNS.flux,
    ...KNOWN_REPO_PATTERNS.flux_kontext,
    ...KNOWN_REPO_PATTERNS.flux_canny,
    ...KNOWN_REPO_PATTERNS.flux_depth,
    ...KNOWN_REPO_PATTERNS.qwen_image,
    ...KNOWN_REPO_PATTERNS.qwen_image_edit,
    ...KNOWN_REPO_PATTERNS.sd35
  ],
  "hf.vae": [
    ...KNOWN_REPO_PATTERNS.flux_vae,
    ...KNOWN_REPO_PATTERNS.qwen_image,
    ...KNOWN_REPO_PATTERNS.qwen_image_edit
  ],
  "hf.clip": [
    ...KNOWN_REPO_PATTERNS.sd35,
    ...KNOWN_REPO_PATTERNS.qwen_image,
    ...KNOWN_REPO_PATTERNS.qwen_image_edit
  ],
  "hf.t5": [...KNOWN_REPO_PATTERNS.sd35]
};

/**
 * Base -> checkpoint variant mapping so heuristics propagate to single-file checkpoints.
 */
export const _CHECKPOINT_BASES: Readonly<Record<string, string>> = {
  "hf.stable_diffusion": "hf.stable_diffusion_checkpoint",
  "hf.stable_diffusion_xl": "hf.stable_diffusion_xl_checkpoint",
  "hf.stable_diffusion_3": "hf.stable_diffusion_3_checkpoint",
  "hf.stable_diffusion_xl_refiner": "hf.stable_diffusion_xl_refiner_checkpoint",
  "hf.flux": "hf.flux_checkpoint",
  "hf.flux_kontext": "hf.flux_kontext_checkpoint",
  "hf.flux_canny": "hf.flux_canny_checkpoint",
  "hf.flux_depth": "hf.flux_depth_checkpoint",
  "hf.qwen_image": "hf.qwen_image_checkpoint",
  "hf.qwen_image_edit": "hf.qwen_image_edit_checkpoint"
};

/**
 * Keyword hints across repo id/tags/paths to associate models with hf.* types.
 */
export const HF_TYPE_KEYWORD_MATCHERS: Record<string, string[]> = {
  "hf.stable_diffusion": ["stable-diffusion", "sd15"],
  "hf.stable_diffusion_xl": ["sdxl", "stable-diffusion-xl"],
  "hf.stable_diffusion_xl_refiner": ["refiner", "sdxl"],
  "hf.stable_diffusion_3": ["sd3", "stable-diffusion-3"],
  "hf.flux": ["flux"],
  "hf.flux_fp8": ["flux", "fp8"],
  "hf.flux_kontext": ["flux", "kontext", "nunchaku"],
  "hf.flux_canny": ["flux", "canny", "nunchaku"],
  "hf.flux_depth": ["flux", "depth", "nunchaku"],
  "hf.qwen_image": ["qwen", "nunchaku"],
  "hf.qwen_image_edit": ["qwen"],
  "hf.qwen_vl": ["vl", "text_encoder", "text-encoder", "qwen"],
  "hf.controlnet": ["control"],
  "hf.controlnet_sdxl": ["control", "sdxl"],
  "hf.controlnet_flux": ["control", "flux"],
  "hf.ip_adapter": ["ip-adapter"],
  "hf.lora_sd": ["lora"],
  "hf.lora_sdxl": ["lora", "sdxl"],
  "hf.lora_qwen_image": ["lora", "qwen"],
  "hf.vae": ["vae"],
  "hf.unet": ["unet"],
  "hf.clip": ["clip"],
  "hf.t5": ["t5"],
  "hf.flux_redux": ["flux", "redux"],
  "hf.real_esrgan": ["esrgan", "real-esrgan"]
};

// Copy keyword matchers to checkpoint variants.
for (const [base, ckpt] of Object.entries(_CHECKPOINT_BASES)) {
  if (base in HF_TYPE_KEYWORD_MATCHERS && !(ckpt in HF_TYPE_KEYWORD_MATCHERS)) {
    HF_TYPE_KEYWORD_MATCHERS[ckpt] = [...HF_TYPE_KEYWORD_MATCHERS[base]];
  }
}

/**
 * Map transformer architecture class names (from `config.json` `architectures` array)
 * to hf.* types for offline model-type inference.
 */
export const _CONFIG_MODEL_TYPE_ARCHITECTURE_MAPPING: Readonly<
  Record<string, string>
> = {
  // Causal language models (text generation)
  LlamaForCausalLM: "hf.text_generation",
  LlamaForSequenceClassification: "hf.text_classification",
  MistralForCausalLM: "hf.text_generation",
  Mistral3ForCausalLM: "hf.text_generation",
  MixtralForCausalLM: "hf.text_generation",
  GPT2LMHeadModel: "hf.text_generation",
  GPT2ForSequenceClassification: "hf.text_classification",
  GPTJForCausalLM: "hf.text_generation",
  GPTNeoXForCausalLM: "hf.text_generation",
  BloomForCausalLM: "hf.text_generation",
  FalconForCausalLM: "hf.text_generation",
  MPTForCausalLM: "hf.text_generation",
  Qwen2ForCausalLM: "hf.text_generation",
  Qwen3ForCausalLM: "hf.text_generation",
  Qwen2_5ForCausalLM: "hf.text_generation",
  PhiForCausalLM: "hf.text_generation",
  Phi3ForCausalLM: "hf.text_generation",
  Phi4ForCausalLM: "hf.text_generation",
  GemmaForCausalLM: "hf.text_generation",
  Gemma2ForCausalLM: "hf.text_generation",
  Gemma3ForCausalLM: "hf.text_generation",
  Gemma3nForCausalLM: "hf.text_generation",
  CohereForCausalLM: "hf.text_generation",
  OPTForCausalLM: "hf.text_generation",
  // Encoder-only models (feature extraction / classification)
  BertModel: "hf.feature_extraction",
  BertForMaskedLM: "hf.feature_extraction",
  BertForSequenceClassification: "hf.text_classification",
  RobertaModel: "hf.feature_extraction",
  RobertaForSequenceClassification: "hf.text_classification",
  DistilBertModel: "hf.feature_extraction",
  DistilBertForSequenceClassification: "hf.text_classification",
  // Vision
  CLIPModel: "hf.zero_shot_image_classification",
  CLIPVisionModel: "hf.zero_shot_image_classification",
  ViTModel: "hf.image_classification",
  ViTForImageClassification: "hf.image_classification",
  // Audio
  WhisperForConditionalGeneration: "hf.automatic_speech_recognition",
  // Seq2Seq
  T5ForConditionalGeneration: "hf.text2text_generation",
  BartForConditionalGeneration: "hf.text2text_generation",
  MBartForConditionalGeneration: "hf.translation",
  MarianMTModel: "hf.translation",
  // Vision-language
  LlavaForConditionalGeneration: "hf.image_text_to_text",
  Qwen2VLForConditionalGeneration: "hf.image_text_to_text",
  Qwen2_5_VLForConditionalGeneration: "hf.image_text_to_text",
  Qwen3VLForConditionalGeneration: "hf.image_text_to_text"
};

/**
 * Map transformer `model_type` values to hf.* types when configs are parsed offline.
 */
export const _CONFIG_MODEL_TYPE_MAPPING: Readonly<Record<string, string>> = {
  whisper: "hf.automatic_speech_recognition",
  "automatic-speech-recognition": "hf.automatic_speech_recognition",
  "audio-classification": "hf.audio_classification",
  "zero-shot-audio-classification": "hf.zero_shot_audio_classification",
  "image-classification": "hf.image_classification",
  "zero-shot-image-classification": "hf.zero_shot_image_classification",
  "image-segmentation": "hf.image_segmentation",
  "depth-estimation": "hf.depth_estimation",
  detr: "hf.object_detection",
  "object-detection": "hf.object_detection",
  "zero-shot-object-detection": "hf.zero_shot_object_detection",
  "visual-question-answering": "hf.visual_question_answering",
  "question-answering": "hf.question_answering",
  "table-question-answering": "hf.table_question_answering",
  "text-classification": "hf.text_classification",
  "zero-shot-classification": "hf.zero_shot_classification",
  "token-classification": "hf.token_classification",
  "feature-extraction": "hf.feature_extraction",
  "fill-mask": "hf.fill_mask",
  "text2text-generation": "hf.text2text_generation",
  translation: "hf.translation",
  "image-text-to-text": "hf.image_text_to_text",
  "sentence-similarity": "hf.sentence_similarity",
  reranker: "hf.reranker",
  "real-esrgan": "hf.real_esrgan",
  "flux-redux": "hf.flux_redux",
  "text-generation": "hf.text_generation",
  "text-to-audio": "hf.text_to_audio",
  "text-to-speech": "hf.text_to_speech",
  llama: "hf.text_generation",
  gemma3: "hf.text_generation",
  gemma3n: "hf.text_generation",
  qwen2: "hf.text_generation",
  qwen3: "hf.text_generation",
  qwen_2_5_vl: "hf.text_generation",
  mistral3: "hf.text_generation",
  gpt_oss: "hf.text_generation",
  phi3: "hf.text_generation",
  phi4: "hf.text_generation",
  gemma2: "hf.text_generation",
  qwen_vl: "hf.image_text_to_text",
  qwen_3_vl: "hf.image_text_to_text",
  qwen2_5_vl: "hf.image_text_to_text",
  glm4v: "hf.image_text_to_text",
  bert: "hf.feature_extraction",
  roberta: "hf.feature_extraction",
  distilbert: "hf.feature_extraction",
  clip: "hf.zero_shot_image_classification",
  clip_vision_model: "hf.zero_shot_image_classification",
  resnet: "hf.image_classification"
};

/**
 * Diffusers pipeline class name -> hf.* type mapping.
 */
export const CLASSNAME_TO_MODEL_TYPE: Readonly<Record<string, string>> = {
  StableDiffusionPipeline: "hf.stable_diffusion",
  StableDiffusionImg2ImgPipeline: "hf.stable_diffusion",
  StableDiffusionInpaintPipeline: "hf.inpainting",
  StableDiffusionXLPipeline: "hf.stable_diffusion_xl",
  StableDiffusionXLImg2ImgPipeline: "hf.stable_diffusion_xl",
  StableDiffusionXLInpaintPipeline: "hf.inpainting",
  StableDiffusionXLRefinerPipeline: "hf.stable_diffusion_xl_refiner",
  StableDiffusionXLControlNetPipeline: "hf.stable_diffusion_xl",
  StableDiffusionUpscalePipeline: "hf.stable_diffusion_upscale",
  StableDiffusion3Pipeline: "hf.stable_diffusion_3",
  StableDiffusion3Img2ImgPipeline: "hf.stable_diffusion_3",
  StableDiffusion3InpaintPipeline: "hf.inpainting",
  PixArtAlphaPipeline: "hf.pixart_alpha",
  FluxPipeline: "hf.flux",
  FluxKontextPipeline: "hf.flux_kontext",
  FluxDepthPipeline: "hf.flux_depth",
  FluxReduxPipeline: "hf.flux_redux",
  FluxFillPipeline: "hf.inpainting",
  QwenImagePipeline: "hf.qwen_image",
  QwenImageEditPlusPipeline: "hf.qwen_image_edit",
  NunchakuQwenImageTransformer2DModel: "hf.qwen_image"
};

// ---------------------------------------------------------------------------
// RepoPackagingHint
// ---------------------------------------------------------------------------

/**
 * Hint describing how a HF repo should be presented to the user.
 *
 * - `REPO_BUNDLE` means treat the repo as a single installable unit (typical diffusers).
 * - `PER_FILE` exposes individual weights (gguf, adapters, quant variants).
 * - `UNKNOWN` indicates insufficient signal; callers can pick a sensible default.
 */
export enum RepoPackagingHint {
  REPO_BUNDLE = "repo_bundle",
  PER_FILE = "per_file",
  UNKNOWN = "unknown"
}

// ---------------------------------------------------------------------------
// Packaging heuristic constants
// ---------------------------------------------------------------------------

/** Filenames/extensions used to decide whether weights belong to a bundle or per-file list. */
export const _WEIGHT_EXTENSIONS: readonly string[] = [
  ".safetensors",
  ".bin",
  ".ckpt",
  ".pt",
  ".pth",
  ".gguf",
  ".ggml",
  ".onnx",
  ".svdq"
];

export const _INDEX_FILENAMES: ReadonlySet<string> = new Set([
  "model.safetensors.index.json",
  "pytorch_model.bin.index.json",
  "model.bin.index.json",
  "model.index.json"
]);

/** Size/keyword thresholds that help spot adapters vs base weights. */
export const _SMALL_ADAPTER_MAX_BYTES = 30 * 1024 * 1024;

export const _QUANT_MARKERS: readonly string[] = [
  "gptq",
  "awq",
  "exl2",
  "exl",
  "q2",
  "q3",
  "q4",
  "q5",
  "q6",
  "q8",
  "svdq"
];

export const _ADAPTER_MARKERS: readonly string[] = [
  "lora",
  "adapter",
  "embedding",
  "textual_inversion",
  "ti_",
  "control",
  "ip-adapter",
  "style"
];

// ---------------------------------------------------------------------------
// HF_SEARCH_TYPE_CONFIG
// ---------------------------------------------------------------------------

/**
 * Static search hints per hf.* type used to build repo/file queries (offline/hub).
 */
export const HF_SEARCH_TYPE_CONFIG: Record<
  string,
  Record<string, string[] | string>
> = {
  "hf.stable_diffusion_3": {
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS],
    repo_pattern: [...KNOWN_REPO_PATTERNS.sd35]
  },
  "hf.flux": {
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS],
    repo_pattern: [...KNOWN_REPO_PATTERNS.flux, "*flux*"]
  },
  "hf.flux_fp8": {
    filename_pattern: [
      "*fp8*.safetensors",
      "*fp8*.ckpt",
      "*fp8*.bin",
      "*fp8*.pt",
      "*fp8*.pth"
    ],
    repo_pattern: [...KNOWN_REPO_PATTERNS.flux, "*flux*"]
  },
  "hf.flux_kontext": {
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS],
    repo_pattern: [
      ...KNOWN_REPO_PATTERNS.flux_kontext,
      "*nunchaku*flux*",
      "*flux*kontext*"
    ]
  },
  "hf.flux_canny": {
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS],
    repo_pattern: [
      ...KNOWN_REPO_PATTERNS.flux_canny,
      "*nunchaku*flux*canny*",
      "*flux*canny*"
    ]
  },
  "hf.flux_depth": {
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS],
    repo_pattern: [
      ...KNOWN_REPO_PATTERNS.flux_depth,
      "*nunchaku*flux*depth*",
      "*flux*depth*"
    ]
  },
  "hf.qwen_image": {
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS],
    repo_pattern: [...KNOWN_REPO_PATTERNS.qwen_image]
  },
  "hf.qwen_image_edit": {
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS],
    repo_pattern: [...KNOWN_REPO_PATTERNS.qwen_image_edit]
  },
  "hf.qwen_vl": {
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS],
    repo_pattern: [
      ...KNOWN_REPO_PATTERNS.qwen_image,
      ...KNOWN_REPO_PATTERNS.qwen_image_edit
    ]
  },
  "hf.controlnet": {
    repo_pattern: ["*control*"],
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS, ...HF_PTH_FILE_PATTERNS]
  },
  "hf.controlnet_sdxl": {
    repo_pattern: ["*control*"],
    tag: ["*sdxl*"],
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS, ...HF_PTH_FILE_PATTERNS]
  },
  "hf.controlnet_flux": {
    repo_pattern: ["*control*"],
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS, ...HF_PTH_FILE_PATTERNS]
  },
  "hf.ip_adapter": {
    repo_pattern: ["*IP-Adapter*"],
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS, ...HF_PTH_FILE_PATTERNS]
  },
  "hf.lora_sd": { repo_pattern: ["*lora*"], pipeline_tag: [] },
  "hf.lora_sdxl": {
    repo_pattern: ["*lora*sdxl*", "*sdxl*lora*"]
  },
  "hf.lora_qwen_image": { repo_pattern: ["*lora*qwen*"], pipeline_tag: [] },
  "hf.unet": {
    repo_pattern: [
      ...KNOWN_REPO_PATTERNS.flux,
      ...KNOWN_REPO_PATTERNS.qwen_image,
      ...KNOWN_REPO_PATTERNS.qwen_image_edit,
      ...KNOWN_REPO_PATTERNS.sd35,
      "*unet*",
      "*stable-diffusion*"
    ],
    filename_pattern: [
      "*unet*.safetensors",
      "*unet*.bin",
      "*unet*.ckpt",
      "*flux*.safetensors",
      "*flux*.bin",
      "*flux*.ckpt"
    ]
  },
  "hf.vae": {
    repo_pattern: [
      ...KNOWN_REPO_PATTERNS.flux_vae,
      ...KNOWN_REPO_PATTERNS.qwen_image,
      ...KNOWN_REPO_PATTERNS.qwen_image_edit,
      "*vae*",
      "*stable-diffusion*"
    ],
    filename_pattern: [
      "*vae*.safetensors",
      "*vae*.bin",
      "*vae*.ckpt",
      "*vae*.pt"
    ]
  },
  "hf.clip": {
    repo_pattern: [
      ...KNOWN_REPO_PATTERNS.sd35,
      ...KNOWN_REPO_PATTERNS.qwen_image,
      ...KNOWN_REPO_PATTERNS.qwen_image_edit,
      "*clip*",
      "*flux*"
    ],
    filename_pattern: [
      "*clip*.safetensors",
      "*clip*.bin",
      "*clip*.gguf",
      "*clip*.ckpt"
    ]
  },
  "hf.t5": {
    repo_pattern: [...KNOWN_REPO_PATTERNS.sd35, "*t5*", "*flux*"],
    filename_pattern: ["*t5*.safetensors", "*t5*.bin", "*t5*.gguf", "*t5*.ckpt"]
  },
  "hf.image_to_video": { pipeline_tag: ["image-to-video"] },
  "hf.text_to_video": { pipeline_tag: ["text-to-video"] },
  "hf.image_to_text": { pipeline_tag: ["image-to-text"], tag: ["*caption*"] },
  "hf.inpainting": { pipeline_tag: ["image-inpainting"], tag: ["*inpaint*"] },
  "hf.outpainting": { tag: ["*outpaint*"] },
  "hf.flux_redux": {
    repo_pattern: ["*flux*redux*"],
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS]
  },
  "hf.real_esrgan": {
    repo_pattern: ["*esrgan*"],
    filename_pattern: [...HF_DEFAULT_FILE_PATTERNS]
  }
};

// Derive checkpoint variants (single-file) from base configs.
for (const [base, ckpt] of Object.entries(_CHECKPOINT_BASES)) {
  if (base in HF_SEARCH_TYPE_CONFIG && !(ckpt in HF_SEARCH_TYPE_CONFIG)) {
    const baseCfg = HF_SEARCH_TYPE_CONFIG[base];
    const derived: Record<string, string[] | string> = {};
    for (const [k, v] of Object.entries(baseCfg)) {
      derived[k] = Array.isArray(v) ? [...v] : v;
    }
    HF_SEARCH_TYPE_CONFIG[ckpt] = derived;
  }
}

// ---------------------------------------------------------------------------
// HF_TYPE_STRUCTURAL_RULES
// ---------------------------------------------------------------------------

export const HF_TYPE_STRUCTURAL_RULES: Readonly<
  Record<string, Record<string, boolean>>
> = {
  "hf.unet": { file_only: true },
  "hf.vae": { file_only: true },
  "hf.clip": { file_only: true },
  "hf.t5": { file_only: true },
  "hf.qwen_vl": { file_only: true },
  "hf.stable_diffusion_checkpoint": { file_only: true, checkpoint: true },
  "hf.stable_diffusion_xl_checkpoint": { file_only: true, checkpoint: true },
  "hf.stable_diffusion_3_checkpoint": { file_only: true, checkpoint: true },
  "hf.stable_diffusion_xl_refiner_checkpoint": {
    file_only: true,
    checkpoint: true
  },
  "hf.flux_checkpoint": { file_only: true, checkpoint: true },
  "hf.qwen_image_checkpoint": { checkpoint: true, nested_checkpoint: true },
  "hf.qwen_image_edit_checkpoint": {
    checkpoint: true,
    nested_checkpoint: true
  },
  "hf.flux": { single_file_repo: true },
  "hf.flux_fp8": { single_file_repo: true },
  "hf.flux_redux": { single_file_repo: true },
  "hf.stable_diffusion": { single_file_repo: true },
  "hf.stable_diffusion_xl": { single_file_repo: true },
  "hf.stable_diffusion_3": { single_file_repo: true },
  "hf.stable_diffusion_xl_refiner": { single_file_repo: true }
};

// ---------------------------------------------------------------------------
// GENERIC_HF_TYPES & SUPPORTED_MODEL_TYPES
// ---------------------------------------------------------------------------

export const GENERIC_HF_TYPES: ReadonlySet<string> = new Set([
  "hf.text_to_image",
  "hf.image_to_image",
  "hf.model",
  "hf.model_generic"
]);

export const SUPPORTED_MODEL_TYPES: readonly string[] = [
  "qwen2",
  "qwen3",
  "qwen_2_5_vl",
  "qwen_3_vl",
  "mistral3",
  "gpt_oss",
  "llama",
  "gemma3",
  "gemma3n",
  "phi3",
  "phi4",
  "gemma2"
];

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Global HfFastCache instance for local snapshot lookups. */
const HF_FAST_CACHE = new HfFastCache();

const _DIFFUSION_COMPONENTS: ReadonlySet<string> = new Set([
  "unet",
  "transformer_denoiser"
]);
const _ARTIFACT_INSPECTION_LIMIT = 16;
const _DIFFUSION_REPO_CACHE = new Map<string, boolean>();

// ---------------------------------------------------------------------------
// fnmatch-style glob matching
// ---------------------------------------------------------------------------

/**
 * Convert a simple fnmatch-style pattern (with `*` and `?`) to a RegExp.
 *
 * This is intentionally minimal: supports `*` -> `.*` and `?` -> `.`.
 * No support for `[...]` character classes, which are rarely used in HF patterns.
 */
function _fnmatchToRegex(pattern: string): RegExp {
  let regex = "^";
  for (const ch of pattern) {
    if (ch === "*") {
      regex += ".*";
    } else if (ch === "?") {
      regex += ".";
    } else if (".+^${}()|[]\\".includes(ch)) {
      regex += "\\" + ch;
    } else {
      regex += ch;
    }
  }
  regex += "$";
  return new RegExp(regex);
}

/** Case-sensitive glob check; empty pattern list means match everything. */
export function _matchesAnyPattern(value: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  return patterns.some((p) => _fnmatchToRegex(p).test(value));
}

/** Case-insensitive glob check used when filtering by repo id. */
export function _matchesAnyPatternCi(
  value: string,
  patterns: string[]
): boolean {
  const valueLower = value.toLowerCase();
  return patterns.some((p) =>
    _fnmatchToRegex(p.toLowerCase()).test(valueLower)
  );
}

// ---------------------------------------------------------------------------
// Packaging heuristic functions
// ---------------------------------------------------------------------------

/** Lightweight check for weight-like filenames used by packaging heuristics. */
export function _isWeightFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return _WEIGHT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Simplified bundle metadata detection (without ModelInfo).
 * Returns false because we have no hub metadata in the offline-only path.
 */
export function _hasBundleMetadata(): boolean {
  return false;
}

/** Return True if filenames match common sharded checkpoint patterns. */
export function _hasShardedWeights(weightFiles: readonly string[]): boolean {
  for (const name of weightFiles) {
    const lower = name.toLowerCase();
    if (_INDEX_FILENAMES.has(lower)) return true;
    if (lower.includes("-00001-of-")) return true;
    if (lower.endsWith(".index.json")) return true;
  }
  return false;
}

/** Identify multiple quantized flavors of a model (gguf/ggml/awq/gptq/etc.). */
export function _hasQuantizedVariants(weightFiles: readonly string[]): boolean {
  let quantized = 0;
  for (const name of weightFiles) {
    const lower = name.toLowerCase();
    if (lower.endsWith(".gguf") || lower.includes("ggml")) {
      quantized++;
      continue;
    }
    if (_QUANT_MARKERS.some((marker) => lower.includes(marker))) {
      quantized++;
    }
  }
  return quantized >= 2;
}

/** Flag repos containing small LoRA/adapter-like files instead of base weights. */
export function _hasAdapterCandidates(
  weightEntries: readonly [string, number][]
): boolean {
  const adapterLike: [string, number][] = [];
  for (const [name, size] of weightEntries) {
    const lower = name.toLowerCase();
    if (_ADAPTER_MARKERS.some((marker) => lower.includes(marker))) {
      adapterLike.push([name, size]);
      continue;
    }
    if (
      lower.endsWith(".safetensors") &&
      size > 0 &&
      size < _SMALL_ADAPTER_MAX_BYTES &&
      weightEntries.length > 1
    ) {
      adapterLike.push([name, size]);
    }
  }
  return adapterLike.length >= 1;
}

/**
 * Determine if a small set of weight files belong to the same family/variant.
 *
 * Useful to keep repos with a handful of shards/quantizations grouped together
 * instead of forcing per-file selection.
 */
export function _allSameFamily(weightFiles: readonly string[]): boolean {
  if (weightFiles.length === 0 || weightFiles.length > 3) return false;
  const normalizedStems = new Set<string>();
  for (const name of weightFiles) {
    const basename = path.basename(name);
    const dotIdx = basename.lastIndexOf(".");
    let stem = (
      dotIdx >= 0 ? basename.slice(0, dotIdx) : basename
    ).toLowerCase();
    for (const marker of _QUANT_MARKERS) {
      stem = stem.replaceAll(marker, "");
    }
    normalizedStems.add(stem);
  }
  return normalizedStems.size === 1;
}

/**
 * Guess whether a repo should be presented as a single bundle or per-file list.
 *
 * Simplified version without ModelInfo (no hub metadata).
 */
export function detectRepoPackaging(
  _repoId: string,
  fileEntries: readonly [string, number][]
): RepoPackagingHint {
  const weightEntries: [string, number][] = fileEntries.filter(([name]) =>
    _isWeightFile(name)
  ) as [string, number][];
  const weightFiles = weightEntries.map(([name]) => name);
  const lowerWeightFiles = weightFiles.map((n) => n.toLowerCase());

  if (_hasBundleMetadata()) return RepoPackagingHint.REPO_BUNDLE;
  if (_hasShardedWeights(lowerWeightFiles))
    return RepoPackagingHint.REPO_BUNDLE;
  if (_hasQuantizedVariants(lowerWeightFiles))
    return RepoPackagingHint.PER_FILE;
  if (_hasAdapterCandidates(weightEntries)) return RepoPackagingHint.PER_FILE;
  if (weightFiles.length === 1) return RepoPackagingHint.REPO_BUNDLE;
  if (_allSameFamily(weightFiles)) return RepoPackagingHint.REPO_BUNDLE;
  if (weightFiles.length >= 4) return RepoPackagingHint.PER_FILE;
  return RepoPackagingHint.UNKNOWN;
}

// ---------------------------------------------------------------------------
// Single-file diffusion detection
// ---------------------------------------------------------------------------

/**
 * Heuristically detect raw checkpoint files (e.g. Stable Diffusion .safetensors)
 * that live at the repo root inside the HF cache.
 *
 * Excludes standard model weight files that are part of multi-file repos:
 * - model.safetensors, pytorch_model.bin, model.bin, model.pt, model.pth
 */
export function _isSingleFileDiffusionWeight(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, "/");
  if (normalized.includes("/")) return false;
  const lower = normalized.toLowerCase();

  if (!SINGLE_FILE_DIFFUSION_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return false;
  }

  const standardWeightNames = new Set([
    "model.safetensors",
    "pytorch_model.bin",
    "model.bin",
    "model.pt",
    "model.pth"
  ]);
  return !standardWeightNames.has(lower);
}

/** Return true for files that might reveal diffusion components. */
export function _isDiffusionArtifactCandidate(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith("model_index.json") || lower.endsWith("config.json")) {
    return true;
  }
  return SINGLE_FILE_DIFFUSION_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Return true when artifact inspection identifies diffusion components. */
export async function _repoHasDiffusionArtifacts(
  repoId: string,
  snapshotDir: string | null,
  fileList: readonly string[]
): Promise<boolean> {
  const cached = _DIFFUSION_REPO_CACHE.get(repoId);
  if (cached !== undefined) return cached;

  if (!snapshotDir || fileList.length === 0) {
    _DIFFUSION_REPO_CACHE.set(repoId, false);
    return false;
  }

  const candidatePaths: string[] = [];
  for (const fname of fileList) {
    if (candidatePaths.length >= _ARTIFACT_INSPECTION_LIMIT) break;
    if (!_isDiffusionArtifactCandidate(fname)) continue;
    candidatePaths.push(path.join(snapshotDir, fname));
  }

  if (candidatePaths.length === 0) {
    _DIFFUSION_REPO_CACHE.set(repoId, false);
    return false;
  }

  try {
    const detection = inspectPaths(candidatePaths);
    const matches = !!(
      detection && _DIFFUSION_COMPONENTS.has(detection.component ?? "")
    );
    _DIFFUSION_REPO_CACHE.set(repoId, matches);
    return matches;
  } catch {
    _DIFFUSION_REPO_CACHE.set(repoId, false);
    return false;
  }
}

// ---------------------------------------------------------------------------
// File size helpers
// ---------------------------------------------------------------------------

function _getFileSize(filePath: string): number {
  try {
    const stats = fs.lstatSync(filePath);
    if (stats.isSymbolicLink()) {
      try {
        const resolved = fs.realpathSync(filePath);
        const resolvedStats = fs.statSync(resolved);
        return resolvedStats.size;
      } catch {
        return 0;
      }
    }
    return stats.size;
  } catch {
    return 0;
  }
}

/** Calculate total size and file entries for a repo, resolving paths. */
export function _calculateRepoStats(
  snapshotPath: string,
  fileList: readonly string[] | null
): [number, [string, number][]] {
  let sizeOnDisk = 0;
  const fileEntries: [string, number][] = [];

  for (const fileName of fileList ?? []) {
    const filePath = path.join(snapshotPath, fileName);
    const fileSize = _getFileSize(filePath);
    sizeOnDisk += fileSize;
    fileEntries.push([fileName, fileSize]);
  }

  return [sizeOnDisk, fileEntries];
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

function _safeLoadJson(filePath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Local config inference
// ---------------------------------------------------------------------------

/**
 * Infer model type by reading cached config or model_index files when hub metadata
 * is unavailable.
 *
 * The logic mirrors hub-side typing: prefer diffusers `_class_name`, fall back to
 * `model_type`/`architectures` hints, and only touches local files that are already
 * present in the snapshot.
 */
export function _inferModelTypeFromLocalConfigs(
  fileEntries: readonly [string, number][],
  snapshotDir: string | null
): string | null {
  if (!snapshotDir) return null;

  const configCandidates = fileEntries
    .map(([relPath]) => relPath)
    .filter((relPath) => {
      const lower = relPath.toLowerCase();
      return (
        lower.endsWith("model_index.json") || lower.endsWith("config.json")
      );
    });

  if (configCandidates.length === 0) return null;

  // Sort by depth (fewer slashes first) then by length.
  const sorted = [...configCandidates].sort((a, b) => {
    const depthA = (a.match(/\//g) || []).length;
    const depthB = (b.match(/\//g) || []).length;
    if (depthA !== depthB) return depthA - depthB;
    return a.length - b.length;
  });

  for (const relPath of sorted) {
    const configPath = path.join(snapshotDir, relPath);
    const data = _safeLoadJson(configPath);
    if (Object.keys(data).length === 0) continue;

    const className = data._class_name;
    if (typeof className === "string") {
      const mapped = CLASSNAME_TO_MODEL_TYPE[className];
      if (mapped) return mapped;
    }

    const modelType =
      typeof data.model_type === "string" ? data.model_type.toLowerCase() : "";
    if (modelType) {
      const mapped = _CONFIG_MODEL_TYPE_MAPPING[modelType];
      if (mapped) return mapped;
    }

    const architectures = data.architectures;
    if (Array.isArray(architectures)) {
      for (const arch of architectures) {
        if (typeof arch !== "string") continue;
        const mapped = _CONFIG_MODEL_TYPE_ARCHITECTURE_MAPPING[arch];
        if (mapped) return mapped;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Build cached repo entry
// ---------------------------------------------------------------------------

/**
 * Build the repo-level `UnifiedModel` plus per-file metadata for a cached HF repo.
 */
export async function _buildCachedRepoEntry(
  repoId: string,
  repoDir: string,
  snapshotDir?: string | null,
  fileList?: string[] | null
): Promise<[UnifiedModel, [string, number][]]> {
  const repoRoot = await HF_FAST_CACHE.repoRoot(repoId, "model");
  let fileEntries: [string, number][] = [];
  let sizeOnDisk = 0;
  let snapshotPath = snapshotDir ?? null;

  if (!snapshotPath) {
    const resolved = await HF_FAST_CACHE.activeSnapshotDir(repoId, "model");
    snapshotPath = resolved ?? null;
  }

  if (snapshotPath) {
    if (fileList == null) {
      fileList = await HF_FAST_CACHE.listFiles(repoId, "model");
    }
    [sizeOnDisk, fileEntries] = _calculateRepoStats(snapshotPath, fileList);
  }

  // Artifact inspection
  let artifactDetection: ArtifactDetection | null = null;
  if (fileEntries.length > 0 && snapshotPath) {
    const artifactPaths = fileEntries.map(([name]) =>
      path.join(snapshotPath!, name)
    );
    try {
      artifactDetection = inspectPaths(artifactPaths);
    } catch {
      artifactDetection = null;
    }
  }

  const modelType = _inferModelTypeFromLocalConfigs(fileEntries, snapshotPath);

  const repoModel: UnifiedModel = {
    id: repoId,
    type: modelType,
    name: repoId,
    cache_path: repoRoot ?? repoDir,
    allow_patterns: null,
    ignore_patterns: null,
    description: null,
    readme: null,
    downloaded: repoRoot != null || fs.existsSync(repoDir),
    repo_id: repoId,
    path: null,
    size_on_disk: sizeOnDisk,
    artifact_family: artifactDetection?.family ?? null,
    artifact_component: artifactDetection?.component ?? null,
    artifact_confidence: artifactDetection?.confidence ?? null,
    artifact_evidence: artifactDetection?.evidence ?? null
  };

  return [repoModel, fileEntries];
}

// ---------------------------------------------------------------------------
// Read all cached HF models
// ---------------------------------------------------------------------------

/**
 * Enumerate all cached HF repos and return repo-level `UnifiedModel` entries.
 */
export async function readCachedHfModels(): Promise<UnifiedModel[]> {
  let repoList: RepoEntry[];
  try {
    repoList = await HF_FAST_CACHE.discoverRepos("model");
  } catch {
    return [];
  }

  const models: UnifiedModel[] = [];
  for (const { repoId, repoDir } of repoList) {
    const [repoModel] = await _buildCachedRepoEntry(repoId, repoDir);
    models.push(repoModel);
  }

  return models;
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

/** Get search configuration for a given hf.* type, or null if not found. */
export function _buildSearchConfigForType(
  modelType: string
): Record<string, string[] | string> | null {
  const normalized = modelType.toLowerCase();
  const config = HF_SEARCH_TYPE_CONFIG[normalized];
  if (config !== undefined) return config;
  if (normalized.startsWith("hf.")) {
    return {
      filename_pattern: [...HF_DEFAULT_FILE_PATTERNS],
      repo_pattern: ["*"]
    };
  }
  return null;
}

/**
 * Infer a sensible HF pipeline tag from an hf.* type or explicit task override.
 */
export function _derivePipelineTag(
  normalizedType: string,
  task?: string | null
): string | null {
  if (task) return task.replace(/_/g, "-");
  const slug = normalizedType.startsWith("hf.")
    ? normalizedType.slice(3)
    : normalizedType;
  let effectiveSlug = slug;
  if (effectiveSlug.endsWith("_checkpoint")) {
    effectiveSlug = effectiveSlug.slice(0, -"_checkpoint".length);
  }
  const textToImageSlugs = new Set([
    "stable_diffusion",
    "stable_diffusion_xl",
    "stable_diffusion_xl_refiner",
    "stable_diffusion_3",
    "flux",
    "flux_fp8",
    "flux_kontext",
    "flux_canny",
    "flux_depth",
    "flux_redux",
    "qwen_image",
    "ip_adapter"
  ]);
  if (textToImageSlugs.has(effectiveSlug)) return "text-to-image";
  const imageToImageSlugs = new Set([
    "qwen_image_edit",
    "image_to_image",
    "inpainting",
    "outpainting"
  ]);
  if (imageToImageSlugs.has(effectiveSlug)) return "image-to-image";
  if (effectiveSlug === "text_to_video") return "text-to-video";
  if (effectiveSlug === "image_to_video") return "image-to-video";
  if (effectiveSlug.includes("text_to_image")) return "text-to-image";
  if (effectiveSlug.includes("image_to_image")) return "image-to-image";
  return effectiveSlug.replace(/_/g, "-");
}

/** Check if a repo id matches any hard-coded comfy-type mappings for a model type. */
export function _matchesRepoForType(
  normalizedType: string,
  repoId: string,
  repoIdFromId: string
): boolean {
  const matchers = KNOWN_TYPE_REPO_MATCHERS[normalizedType];
  if (!matchers) return false;
  const repoLower = repoId.toLowerCase();
  const repoFromIdLower = repoIdFromId.toLowerCase();
  return matchers.some(
    (candidate) =>
      repoLower === candidate.toLowerCase() ||
      repoFromIdLower === candidate.toLowerCase()
  );
}

/**
 * Use lightweight artifact inspection hints (family/component) to match a model type.
 */
export function _matchesArtifactDetection(
  normalizedType: string,
  artifactFamily?: string | null,
  artifactComponent?: string | null
): boolean {
  const fam = (artifactFamily ?? "").toLowerCase();
  const comp = (artifactComponent ?? "").toLowerCase();

  if (
    [
      "hf.flux",
      "hf.flux_fp8",
      "hf.flux_kontext",
      "hf.flux_canny",
      "hf.flux_depth"
    ].includes(normalizedType)
  ) {
    return fam.includes("flux");
  }
  if (normalizedType === "hf.stable_diffusion") {
    return (
      fam.startsWith("sd1") ||
      fam.startsWith("sd2") ||
      fam.includes("stable-diffusion")
    );
  }
  if (normalizedType === "hf.stable_diffusion_xl") {
    return fam.includes("sdxl");
  }
  if (normalizedType === "hf.stable_diffusion_xl_refiner") {
    return fam.includes("refiner") || (fam.includes("sdxl") && comp === "unet");
  }
  if (normalizedType === "hf.stable_diffusion_3") {
    return fam.includes("sd3") || fam.includes("stable-diffusion-3");
  }
  if (
    normalizedType === "hf.qwen_image" ||
    normalizedType === "hf.qwen_image_edit"
  ) {
    return fam.includes("qwen");
  }
  return false;
}

/** Semantic match for hf.* types (no structural checks here). */
export function _matchesModelType(
  model: UnifiedModel,
  modelType: string
): boolean {
  let normalizedType = modelType.toLowerCase();
  let checkpointVariant: string | null = null;
  if (normalizedType.endsWith("_checkpoint")) {
    checkpointVariant = normalizedType;
    normalizedType = normalizedType.slice(0, -"_checkpoint".length);
  }

  const modelTypeLower = (model.type ?? "").toLowerCase();
  const repoId = (model.repo_id ?? "").toLowerCase();
  const repoIdFromId = model.id ? model.id.split(":")[0].toLowerCase() : "";
  const pathLower = (model.path ?? "").toLowerCase();

  function isQwenTextEncoder(p: string | null): boolean {
    if (!p) return false;
    return (
      p.includes("text_encoders") ||
      p.includes("text_encoder") ||
      p.includes("qwen_2.5_vl")
    );
  }

  function isQwenVae(p: string | null): boolean {
    if (!p) return false;
    return p.includes("vae");
  }

  const targetTypes = new Set([normalizedType]);
  if (checkpointVariant) targetTypes.add(checkpointVariant);

  if (modelTypeLower) {
    const modelTypeBase = modelTypeLower.endsWith("_checkpoint")
      ? modelTypeLower.slice(0, -"_checkpoint".length)
      : modelTypeLower;
    if (targetTypes.has(modelTypeLower) || modelTypeBase === normalizedType) {
      return !(
        (normalizedType === "hf.qwen_image" ||
          normalizedType === "hf.qwen_image_edit") &&
        (isQwenTextEncoder(pathLower) || isQwenVae(pathLower))
      );
    }

    if (!GENERIC_HF_TYPES.has(modelTypeLower)) {
      const qwenFamilyTypes = new Set([
        "hf.qwen_image",
        "hf.qwen_image_checkpoint"
      ]);
      const allowedFamily =
        (normalizedType === "hf.qwen_image_checkpoint" ||
          normalizedType === "hf.qwen_vl" ||
          normalizedType === "hf.vae") &&
        qwenFamilyTypes.has(modelTypeLower);
      if (!allowedFamily) return false;
    }
  }

  if (
    normalizedType === "hf.qwen_image" ||
    normalizedType === "hf.qwen_image_edit"
  ) {
    if (isQwenTextEncoder(pathLower) || isQwenVae(pathLower)) return false;
  }

  if (normalizedType === "hf.qwen_vl") {
    return isQwenTextEncoder(pathLower);
  }

  if (_matchesRepoForType(normalizedType, repoId, repoIdFromId)) return true;

  const artifactFamily = (model.artifact_family ?? "").toLowerCase();
  const artifactComponent = (model.artifact_component ?? "").toLowerCase();
  if (artifactFamily || artifactComponent) {
    if (
      _matchesArtifactDetection(
        normalizedType,
        artifactFamily,
        artifactComponent
      )
    ) {
      return true;
    }
  }

  const tags = (model.tags ?? []).map((t) => (t ?? "").toLowerCase());
  const keywords = HF_TYPE_KEYWORD_MATCHERS[normalizedType] ?? [];
  if (keywords.length > 0) {
    if (
      keywords.some(
        (keyword) =>
          repoId.includes(keyword) || tags.some((tag) => tag.includes(keyword))
      )
    ) {
      return true;
    }
    if (pathLower && keywords.some((keyword) => pathLower.includes(keyword))) {
      return true;
    }
  }

  const derivedPipeline = _derivePipelineTag(normalizedType);
  return !!(derivedPipeline && model.pipeline_tag === derivedPipeline);
}

// ---------------------------------------------------------------------------
// Iterate cached model files
// ---------------------------------------------------------------------------

interface RepoEntry {
  repoId: string;
  repoDir: string;
}

/**
 * Yield (repoId, repoDir, snapshotDir, fileList) for cached HF repos.
 * Returns the full list since TS does not have native async generators
 * that are universally ergonomic.
 */
async function _iterCachedModelFiles(
  preResolvedRepos?: RepoEntry[] | null
): Promise<
  { repoId: string; repoDir: string; snapshotDir: string; fileList: string[] }[]
> {
  const repoList: RepoEntry[] =
    preResolvedRepos ?? (await HF_FAST_CACHE.discoverRepos("model"));
  const results: {
    repoId: string;
    repoDir: string;
    snapshotDir: string;
    fileList: string[];
  }[] = [];

  for (const { repoId, repoDir } of repoList) {
    const snapshotDir = await HF_FAST_CACHE.activeSnapshotDir(repoId, "model");
    if (!snapshotDir) continue;
    let fileList: string[];
    try {
      fileList = await HF_FAST_CACHE.listFiles(repoId, "model");
    } catch {
      continue;
    }
    results.push({ repoId, repoDir, snapshotDir, fileList });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Search cached models
// ---------------------------------------------------------------------------

/**
 * Search the local HF cache for repos/files using offline data only.
 */
export async function searchCachedHfModels(
  repoPatterns?: readonly string[] | null,
  filenamePatterns?: readonly string[] | null
): Promise<UnifiedModel[]> {
  const results: UnifiedModel[] = [];

  const cachedFiles = await _iterCachedModelFiles();

  for (const { repoId, repoDir, snapshotDir, fileList } of cachedFiles) {
    if (
      repoPatterns &&
      repoPatterns.length > 0 &&
      !_matchesAnyPatternCi(repoId, [...repoPatterns])
    ) {
      continue;
    }

    const [repoModel, fileEntries] = await _buildCachedRepoEntry(
      repoId,
      repoDir,
      snapshotDir,
      fileList
    );
    results.push(repoModel);

    if (
      filenamePatterns &&
      filenamePatterns.length > 0 &&
      fileEntries.length > 0
    ) {
      for (const [relativeName, fileSize] of fileEntries) {
        if (!_matchesAnyPattern(relativeName, [...filenamePatterns])) continue;

        const fileModel: UnifiedModel = {
          id: `${repoId}:${relativeName}`,
          type: repoModel.type,
          name: `${repoId}/${relativeName}`,
          repo_id: repoId,
          path: relativeName,
          cache_path: repoModel.cache_path ?? null,
          allow_patterns: null,
          ignore_patterns: null,
          description: null,
          readme: null,
          size_on_disk: fileSize,
          downloaded: repoModel.downloaded ?? null,
          pipeline_tag: repoModel.pipeline_tag ?? null,
          tags: repoModel.tags ?? null,
          has_model_index: repoModel.has_model_index ?? null,
          downloads: repoModel.downloads ?? null,
          likes: repoModel.likes ?? null,
          trending_score: repoModel.trending_score ?? null,
          artifact_family: repoModel.artifact_family ?? null,
          artifact_component: repoModel.artifact_component ?? null,
          artifact_confidence: repoModel.artifact_confidence ?? null,
          artifact_evidence: repoModel.artifact_evidence ?? null
        };
        results.push(fileModel);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Get models by hf type
// ---------------------------------------------------------------------------

/**
 * Return cached Hugging Face models matching a requested hf.* type.
 *
 * The search is entirely offline: build a search config, scan cached repos/files,
 * then apply the same client-side heuristics (keyword matching, repo patterns,
 * artifact hints) to label each result with the desired type.
 */
export async function getModelsByHfType(
  modelType: string
): Promise<UnifiedModel[]> {
  const config = _buildSearchConfigForType(modelType) ?? {};
  const repoPattern = config.repo_pattern;
  const filenamePattern = config.filename_pattern;

  function filterModels(models: UnifiedModel[]): UnifiedModel[] {
    const rules = HF_TYPE_STRUCTURAL_RULES[modelType] ?? {};
    const fileOnly = rules.file_only ?? false;
    const checkpoint =
      rules.checkpoint ?? Object.values(_CHECKPOINT_BASES).includes(modelType);
    const nestedCheckpoint = rules.nested_checkpoint ?? false;
    const singleFileRepo = rules.single_file_repo ?? false;

    const seen = new Set<string>();
    const filtered: UnifiedModel[] = [];

    for (const model of models) {
      if (seen.has(model.id)) continue;

      const repoLower = (model.repo_id ?? "").toLowerCase();
      const pathValue = model.path ?? null;

      if (fileOnly && pathValue == null) continue;

      if (singleFileRepo) {
        if (pathValue == null && repoLower.includes("gguf")) continue;
        if (pathValue != null) {
          const pathLower = pathValue.toLowerCase();
          if (
            !_isSingleFileDiffusionWeight(pathValue) &&
            !pathLower.endsWith(".gguf")
          ) {
            continue;
          }
        }
      }

      if (checkpoint) {
        if (!pathValue) continue;
        if (pathValue.includes("/") && !nestedCheckpoint) continue;
      }

      // For non-file-oriented types, skip file-level entries to avoid duplicates
      if (!fileOnly && !checkpoint && !singleFileRepo && pathValue != null)
        continue;

      if (!_matchesModelType(model, modelType)) continue;

      filtered.push(model);
      seen.add(model.id);
    }

    return filtered;
  }

  const offlineModels = await searchCachedHfModels(
    repoPattern
      ? Array.isArray(repoPattern)
        ? repoPattern
        : [repoPattern]
      : null,
    filenamePattern
      ? Array.isArray(filenamePattern)
        ? filenamePattern
        : [filenamePattern]
      : null
  );

  return filterModels(offlineModels);
}

// ---------------------------------------------------------------------------
// Delete cached model
// ---------------------------------------------------------------------------

/**
 * Delete a model from the Hugging Face cache.
 */
export async function deleteCachedHfModel(modelId: string): Promise<boolean> {
  const repoRoot = await HF_FAST_CACHE.repoRoot(modelId, "model");
  if (!repoRoot) return false;

  try {
    await fsp.access(repoRoot);
  } catch {
    return false;
  }

  await fsp.rm(repoRoot, { recursive: true, force: true });
  await HF_FAST_CACHE.invalidate(modelId, "model");
  return true;
}

// ---------------------------------------------------------------------------
// Llama.cpp cache helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the llama.cpp native cache directory.
 */
function _getLlamaCppCacheDir(): string {
  const platform = os.platform();
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "llama.cpp");
  }
  if (platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "llama.cpp");
  }
  // Linux and others
  return path.join(os.homedir(), ".cache", "llama.cpp");
}

/** Build a lookup from flat GGUF filename to (repo_id, original_filename). */
export function _buildManifestLookup(
  cacheDir: string
): Map<string, [string, string]> {
  const lookup = new Map<string, [string, string]>();
  let entries: string[];
  try {
    entries = fs.readdirSync(cacheDir);
  } catch {
    return lookup;
  }
  for (const entry of entries) {
    if (!entry.startsWith("manifest=") || !entry.endsWith(".json")) continue;
    try {
      const filePath = path.join(cacheDir, entry);
      const content = fs.readFileSync(filePath, "utf-8");
      const manifest = JSON.parse(content) as Record<string, unknown>;
      const metadata = manifest.metadata as Record<string, unknown> | undefined;
      const ggufFile = manifest.ggufFile as Record<string, unknown> | undefined;
      const repoId = (metadata?.repo_id ?? "") as string;
      const rfilename = (ggufFile?.rfilename ?? "") as string;
      if (repoId && rfilename) {
        const flatName = `${repoId.replace("/", "_")}_${rfilename}`;
        lookup.set(flatName, [repoId, rfilename]);
      }
    } catch {
      continue;
    }
  }
  return lookup;
}

/**
 * Parse a flat llama.cpp GGUF filename into (repo_id, repo_name, filename).
 *
 * Resolution order:
 * 1. Exact match in manifest lookup (most reliable).
 * 2. Heuristic split on the first underscore to obtain the HuggingFace org.
 * 3. Fallback: return ("", "", entry).
 */
export function _parseGgufFlatFilename(
  entry: string,
  manifestLookup: Map<string, [string, string]>
): [string, string, string] {
  // 1. Manifest lookup
  const manifestMatch = manifestLookup.get(entry);
  if (manifestMatch) {
    const [repoId, filename] = manifestMatch;
    const repo = repoId.includes("/") ? repoId.split("/")[1] : repoId;
    return [repoId, repo, filename];
  }

  // 2. Heuristic: org is before the first underscore
  const firstUs = entry.indexOf("_");
  if (firstUs < 0) return ["", "", entry];

  const org = entry.slice(0, firstUs);
  const rest = entry.slice(firstUs + 1); // "{repo}_{filename}"

  let idx = 0;
  while (true) {
    const us = rest.indexOf("_", idx);
    if (us < 0) break;
    const repoCandidate = rest.slice(0, us);
    const filenameCandidate = rest.slice(us + 1);
    const expected = `${org}_${repoCandidate}_${filenameCandidate}`;
    if (
      expected === entry &&
      filenameCandidate.toLowerCase().endsWith(".gguf")
    ) {
      const repoId = `${org}/${repoCandidate}`;
      return [repoId, repoCandidate, filenameCandidate];
    }
    idx = us + 1;
  }

  // 3. Fallback
  return ["", "", entry];
}

/**
 * Enumerate GGUF models in the llama.cpp native cache directory.
 *
 * llama.cpp uses a flat file structure:
 * - {org}_{repo}_{filename}.gguf
 * - {org}_{repo}_{filename}.gguf.etag
 * - manifest={org}={repo}={tag}.json
 */
export async function getLlamaCppModelsFromCache(): Promise<UnifiedModel[]> {
  const cacheDir = _getLlamaCppCacheDir();

  try {
    const stat = await fsp.stat(cacheDir);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }

  const manifestLookup = _buildManifestLookup(cacheDir);
  const models: UnifiedModel[] = [];

  let entries: string[];
  try {
    entries = await fsp.readdir(cacheDir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith(".gguf")) continue;
    if (entry.endsWith(".etag")) continue;

    const filePath = path.join(cacheDir, entry);
    try {
      const stat = await fsp.stat(filePath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }

    const [repoId, repo, filename] = _parseGgufFlatFilename(
      entry,
      manifestLookup
    );

    let size = 0;
    try {
      const stat = await fsp.stat(filePath);
      size = stat.size;
    } catch {
      // ignore
    }

    models.push({
      id: repoId ? `${repoId}:${filename}` : filename,
      type: "llama_cpp_model",
      name: repoId
        ? `${repo.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} \u2022 ${filename}`
        : filename,
      repo_id: repoId || null,
      path: filename,
      cache_path: filePath,
      size_on_disk: size,
      downloaded: true
    });
  }

  // Sort for stability
  models.sort((a, b) => {
    const repoA = a.repo_id ?? "";
    const repoB = b.repo_id ?? "";
    if (repoA !== repoB) return repoA.localeCompare(repoB);
    return (a.path ?? "").localeCompare(b.path ?? "");
  });

  return models;
}
