/**
 * The models the stable-diffusion.cpp provider offers. A model loads its
 * files from one or more Hugging Face repositories. Text encoders and VAEs
 * that several models share come from one repository and file, so they
 * download once.
 */

/** The model files `sd-server` takes, keyed by the flag that loads each. */
export type SdCppComponent =
  | "model"
  | "diffusion_model"
  | "uncond_diffusion_model"
  | "vae"
  | "clip_l"
  | "clip_g"
  | "t5xxl"
  | "llm"
  | "llm_vision"
  | "tokenizer"
  | "embeddings_connectors";

export const SD_CPP_COMPONENT_FLAGS: Readonly<Record<SdCppComponent, string>> = {
  model: "--model",
  diffusion_model: "--diffusion-model",
  uncond_diffusion_model: "--uncond-diffusion-model",
  vae: "--vae",
  clip_l: "--clip_l",
  clip_g: "--clip_g",
  t5xxl: "--t5xxl",
  llm: "--llm",
  llm_vision: "--llm_vision",
  tokenizer: "--tokenizer",
  embeddings_connectors: "--embeddings-connectors"
};

/** One model file in a Hugging Face repository. */
export interface SdCppFile {
  repoId: string;
  path: string;
}

export interface SdCppModelSpec {
  /** The model id the picker and workflows store. */
  id: string;
  name: string;
  files: Partial<Record<SdCppComponent, SdCppFile>>;
  /**
   * A single-file checkpoint on disk, from a model folder. Set instead of
   * `files`, which is then empty.
   */
  localPath?: string;
  /** Download size in GB, rounded, counting every file. */
  sizeGb: number;
  /**
   * What the model does with a source image. `init` denoises from it
   * (image-to-image), `reference` edits it as a reference image. Unset means
   * the model takes no source image.
   */
  imageInput?: "init" | "reference";
  /** False for a model that needs a source image, such as an upscaler. */
  textToImage?: boolean;
  /** Further `sd-server` flags the model needs. */
  serverArgs?: string[];
  /**
   * The output size for a source image: `scale` multiplies the source size
   * (an upscaler), up to `maxSide` pixels on the longer side.
   */
  sourceScale?: { scale: number; maxSide: number };
  defaults: {
    steps: number;
    cfgScale: number;
    /** Native sample_method name. Unset uses the server default. */
    sampler?: string;
    /** Flow shift for flow-matching models. Unset uses the model default. */
    flowShift?: number;
    /** The side length the model was trained at. */
    size: number;
  };
}

const hf = (repoId: string, path: string): SdCppFile => ({ repoId, path });

// Shared text encoders and VAEs.
const FLUX1_VAE = hf("second-state/FLUX.1-schnell-GGUF", "ae.safetensors");
const FLUX1_CLIP_L = hf("second-state/FLUX.1-schnell-GGUF", "clip_l-Q8_0.gguf");
const FLUX1_T5XXL = hf("second-state/FLUX.1-schnell-GGUF", "t5xxl-Q4_0.gguf");
const FLUX2_VAE = hf("Comfy-Org/flux2-dev", "split_files/vae/flux2-vae.safetensors");
const QWEN_IMAGE_VAE = hf("Comfy-Org/Qwen-Image_ComfyUI", "split_files/vae/qwen_image_vae.safetensors");
const QWEN3_4B = hf("unsloth/Qwen3-4B-GGUF", "Qwen3-4B-Q4_K_M.gguf");
const QWEN3_8B = hf("unsloth/Qwen3-8B-GGUF", "Qwen3-8B-Q4_K_M.gguf");
// Also the llama.cpp provider's recommended chat model.
const QWEN3_4B_2507 = hf("unsloth/Qwen3-4B-Instruct-2507-GGUF", "Qwen3-4B-Instruct-2507-Q4_K_M.gguf");
const QWEN3_VL_4B = hf("Qwen/Qwen3-VL-4B-Instruct-GGUF", "Qwen3VL-4B-Instruct-Q4_K_M.gguf");
const QWEN3_VL_4B_VISION = hf("Qwen/Qwen3-VL-4B-Instruct-GGUF", "mmproj-Qwen3VL-4B-Instruct-F16.gguf");
const QWEN3_VL_8B = hf("Qwen/Qwen3-VL-8B-Instruct-GGUF", "Qwen3VL-8B-Instruct-Q4_K_M.gguf");
const QWEN3_VL_8B_VISION = hf("Qwen/Qwen3-VL-8B-Instruct-GGUF", "mmproj-Qwen3VL-8B-Instruct-F16.gguf");
const QWEN25_VL_7B = hf("mradermacher/Qwen2.5-VL-7B-Instruct-GGUF", "Qwen2.5-VL-7B-Instruct.Q4_K_M.gguf");
const QWEN25_VL_7B_VISION = hf("mradermacher/Qwen2.5-VL-7B-Instruct-GGUF", "Qwen2.5-VL-7B-Instruct.mmproj-Q8_0.gguf");

export const SD_CPP_MODELS: readonly SdCppModelSpec[] = [
  {
    id: "sd-turbo",
    name: "SD-Turbo",
    files: { model: hf("Green-Sky/SD-Turbo-GGUF", "sd_turbo-f16-q8_0.gguf") },
    sizeGb: 2,
    imageInput: "init",
    defaults: { steps: 4, cfgScale: 1, size: 512 }
  },
  {
    id: "sd-1.5",
    name: "Stable Diffusion 1.5",
    files: {
      model: hf("second-state/stable-diffusion-v1-5-GGUF", "stable-diffusion-v1-5-pruned-emaonly-Q8_0.gguf")
    },
    sizeGb: 1.8,
    imageInput: "init",
    defaults: { steps: 20, cfgScale: 7, size: 512 }
  },
  {
    id: "sd-3.5-medium",
    name: "Stable Diffusion 3.5 Medium",
    files: {
      model: hf("second-state/stable-diffusion-3.5-medium-GGUF", "sd3.5_medium-Q4_0.gguf"),
      clip_l: hf("second-state/stable-diffusion-3.5-medium-GGUF", "clip_l-Q8_0.gguf"),
      clip_g: hf("second-state/stable-diffusion-3.5-medium-GGUF", "clip_g-Q8_0.gguf"),
      t5xxl: hf("second-state/stable-diffusion-3.5-medium-GGUF", "t5xxl-Q4_0.gguf")
    },
    sizeGb: 5.7,
    imageInput: "init",
    defaults: { steps: 28, cfgScale: 4.5, sampler: "euler", size: 1024 }
  },
  {
    id: "flux.1-schnell",
    name: "FLUX.1 schnell",
    files: {
      diffusion_model: hf("second-state/FLUX.1-schnell-GGUF", "flux1-schnell-Q4_0.gguf"),
      vae: FLUX1_VAE,
      clip_l: FLUX1_CLIP_L,
      t5xxl: FLUX1_T5XXL
    },
    sizeGb: 9.9,
    imageInput: "init",
    defaults: { steps: 4, cfgScale: 1, sampler: "euler", size: 1024 }
  },
  {
    id: "flux.1-dev",
    name: "FLUX.1 dev",
    files: {
      diffusion_model: hf("leejet/FLUX.1-dev-gguf", "flux1-dev-q4_0.gguf"),
      vae: FLUX1_VAE,
      clip_l: FLUX1_CLIP_L,
      t5xxl: FLUX1_T5XXL
    },
    sizeGb: 9.9,
    imageInput: "init",
    defaults: { steps: 20, cfgScale: 1, sampler: "euler", size: 1024 }
  },
  {
    id: "flux.1-kontext-dev",
    name: "FLUX.1 Kontext dev",
    files: {
      diffusion_model: hf("QuantStack/FLUX.1-Kontext-dev-GGUF", "flux1-kontext-dev-Q4_0.gguf"),
      vae: FLUX1_VAE,
      clip_l: FLUX1_CLIP_L,
      t5xxl: FLUX1_T5XXL
    },
    sizeGb: 9.9,
    imageInput: "reference",
    defaults: { steps: 20, cfgScale: 1, sampler: "euler", size: 1024 }
  },
  {
    id: "flux.2-dev",
    name: "FLUX.2 dev",
    files: {
      diffusion_model: hf("city96/FLUX.2-dev-gguf", "flux2-dev-Q4_0.gguf"),
      vae: FLUX2_VAE,
      llm: hf("unsloth/Mistral-Small-3.2-24B-Instruct-2506-GGUF", "Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf")
    },
    sizeGb: 34,
    imageInput: "reference",
    serverArgs: ["--offload-to-cpu"],
    defaults: { steps: 28, cfgScale: 1, sampler: "euler", size: 1024 }
  },
  {
    id: "flux.2-klein-4b",
    name: "FLUX.2 klein 4B",
    files: {
      diffusion_model: hf("leejet/FLUX.2-klein-4B-GGUF", "flux-2-klein-4b-Q4_0.gguf"),
      vae: FLUX2_VAE,
      llm: QWEN3_4B
    },
    sizeGb: 5.3,
    imageInput: "reference",
    defaults: { steps: 4, cfgScale: 1, sampler: "euler", size: 1024 }
  },
  {
    id: "flux.2-klein-base-4b",
    name: "FLUX.2 klein base 4B",
    files: {
      diffusion_model: hf("leejet/FLUX.2-klein-base-4B-GGUF", "flux-2-klein-base-4b-Q4_0.gguf"),
      vae: FLUX2_VAE,
      llm: QWEN3_4B
    },
    sizeGb: 5.3,
    imageInput: "reference",
    defaults: { steps: 20, cfgScale: 4, sampler: "euler", size: 1024 }
  },
  {
    id: "flux.2-klein-9b",
    name: "FLUX.2 klein 9B",
    files: {
      diffusion_model: hf("leejet/FLUX.2-klein-9B-GGUF", "flux-2-klein-9b-Q4_0.gguf"),
      vae: FLUX2_VAE,
      llm: QWEN3_8B
    },
    sizeGb: 11,
    imageInput: "reference",
    defaults: { steps: 4, cfgScale: 1, sampler: "euler", size: 1024 }
  },
  {
    id: "flux.2-klein-base-9b",
    name: "FLUX.2 klein base 9B",
    files: {
      diffusion_model: hf("leejet/FLUX.2-klein-base-9B-GGUF", "flux-2-klein-base-9b-Q4_0.gguf"),
      vae: FLUX2_VAE,
      llm: QWEN3_8B
    },
    sizeGb: 11,
    imageInput: "reference",
    defaults: { steps: 20, cfgScale: 4, sampler: "euler", size: 1024 }
  },
  {
    id: "flux.3-image-klein",
    name: "FLUX.3 Image Klein",
    files: {
      diffusion_model: hf("realrebelai/FLUX-3-Image-Klein_GGUFs", "DISTILLED/flux3_image_klein_sd-Q4_K_M.gguf"),
      vae: FLUX2_VAE,
      llm: QWEN3_VL_4B
    },
    sizeGb: 6.2,
    imageInput: "reference",
    defaults: { steps: 16, cfgScale: 1, sampler: "euler", size: 1024 }
  },
  {
    id: "flux.3-image-klein-base",
    name: "FLUX.3 Image Klein Base",
    files: {
      diffusion_model: hf("realrebelai/FLUX-3-Image-Klein_GGUFs", "BASE/flux3_image_klein-Q4_K_M.gguf"),
      vae: FLUX2_VAE,
      llm: QWEN3_VL_4B
    },
    sizeGb: 6.2,
    imageInput: "reference",
    defaults: { steps: 20, cfgScale: 3.5, sampler: "euler", size: 1024 }
  },
  {
    id: "qwen-image-2.1",
    name: "Qwen Image 2.1",
    files: {
      diffusion_model: hf("leejet/Qwen-Image-2.1-GGUF", "qwen_image_2.1-Q4_K.gguf"),
      vae: hf("Comfy-Org/Qwen-Image-2.1", "vae/qwen_image_2.1_vae_bf16.safetensors"),
      llm: QWEN3_VL_8B,
      llm_vision: QWEN3_VL_8B_VISION
    },
    sizeGb: 11,
    imageInput: "reference",
    serverArgs: ["--offload-to-cpu"],
    defaults: { steps: 40, cfgScale: 6, sampler: "euler", size: 1024 }
  },
  {
    id: "qwen-image-edit-2511",
    name: "Qwen Image Edit 2511",
    files: {
      diffusion_model: hf("unsloth/Qwen-Image-Edit-2511-GGUF", "qwen-image-edit-2511-Q4_0.gguf"),
      vae: QWEN_IMAGE_VAE,
      llm: QWEN25_VL_7B,
      llm_vision: QWEN25_VL_7B_VISION
    },
    sizeGb: 18,
    imageInput: "reference",
    textToImage: false,
    serverArgs: ["--offload-to-cpu", "--model-args", "qwen_image_zero_cond_t=true"],
    defaults: { steps: 40, cfgScale: 2.5, sampler: "euler", flowShift: 3, size: 1024 }
  },
  {
    id: "qwen-image-edit-2509",
    name: "Qwen Image Edit 2509",
    files: {
      diffusion_model: hf("QuantStack/Qwen-Image-Edit-2509-GGUF", "Qwen-Image-Edit-2509-Q4_0.gguf"),
      vae: QWEN_IMAGE_VAE,
      llm: QWEN25_VL_7B,
      llm_vision: QWEN25_VL_7B_VISION
    },
    sizeGb: 18,
    imageInput: "reference",
    textToImage: false,
    serverArgs: ["--offload-to-cpu"],
    defaults: { steps: 40, cfgScale: 2.5, sampler: "euler", flowShift: 3, size: 1024 }
  },
  {
    id: "z-image-turbo",
    name: "Z-Image Turbo",
    files: {
      diffusion_model: hf("leejet/Z-Image-Turbo-GGUF", "z_image_turbo-Q4_K.gguf"),
      vae: FLUX1_VAE,
      llm: QWEN3_4B_2507
    },
    sizeGb: 6.7,
    imageInput: "init",
    defaults: { steps: 8, cfgScale: 1, size: 1024 }
  },
  {
    id: "z-image",
    name: "Z-Image",
    files: {
      diffusion_model: hf("unsloth/Z-Image-GGUF", "z-image-Q4_K_M.gguf"),
      vae: FLUX1_VAE,
      llm: QWEN3_4B_2507
    },
    sizeGb: 7.9,
    imageInput: "init",
    defaults: { steps: 28, cfgScale: 5, size: 1024 }
  },
  {
    id: "z-image-l2p",
    name: "Z-Image L2P",
    files: {
      diffusion_model: hf("zhen-nan/L2P", "model-1k-merge.safetensors"),
      llm: QWEN3_4B_2507
    },
    sizeGb: 22,
    // Pixel space: no VAE, so no source image either.
    serverArgs: ["--type", "bf16"],
    defaults: { steps: 30, cfgScale: 2, sampler: "euler", size: 1024 }
  },
  {
    id: "krea-2-turbo",
    name: "Krea 2 Turbo",
    files: {
      diffusion_model: hf("realrebelai/KREA-2_GGUFs", "TURBO/Krea-2-Turbo-Q4_K_M.gguf"),
      vae: hf("Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/vae/wan_2.1_vae.safetensors"),
      llm: QWEN3_VL_4B
    },
    sizeGb: 10,
    imageInput: "init",
    serverArgs: ["--offload-to-cpu"],
    defaults: { steps: 8, cfgScale: 1, size: 1024 }
  },
  {
    id: "krea-2",
    name: "Krea 2 Raw",
    files: {
      diffusion_model: hf("realrebelai/KREA-2_GGUFs", "BASE/Krea-2-Base-Q4_K_M.gguf"),
      vae: hf("Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/vae/wan_2.1_vae.safetensors"),
      llm: QWEN3_VL_4B
    },
    sizeGb: 10,
    imageInput: "init",
    serverArgs: ["--offload-to-cpu"],
    defaults: { steps: 52, cfgScale: 3.5, size: 1024 }
  },
  {
    id: "ideogram-4",
    name: "Ideogram 4",
    files: {
      diffusion_model: hf("leejet/ideogram-4-GGUF", "ideogram4-Q4_0.gguf"),
      uncond_diffusion_model: hf("leejet/ideogram-4-GGUF", "ideogram4_uncond-Q4_0.gguf"),
      vae: FLUX2_VAE,
      llm: QWEN3_VL_8B
    },
    sizeGb: 17,
    serverArgs: ["--offload-to-cpu"],
    defaults: { steps: 20, cfgScale: 7, size: 1024 }
  },
  {
    id: "iris-3b",
    name: "Iris 3B",
    files: {
      diffusion_model: hf("speridlabs/iris-3b", "model.safetensors"),
      llm: QWEN3_VL_4B
    },
    sizeGb: 14.5,
    // Pixel space: no VAE, so no source image either.
    defaults: { steps: 100, cfgScale: 3, size: 1024 }
  },
  {
    id: "pid-flux-1",
    name: "PiD upscaler (FLUX.1, 512 to 2048)",
    files: {
      diffusion_model: hf("Comfy-Org/PixelDiT", "diffusion_models/pid_flux1_512_to_2048_4step_bf16.safetensors"),
      llm: hf("Comfy-Org/PixelDiT", "text_encoders/gemma_2_2b_it_elm_bf16.safetensors"),
      tokenizer: hf("unsloth/gemma-2-2b", "tokenizer.json"),
      vae: hf("nvidia/PiD", "checkpoints/ae.safetensors")
    },
    sizeGb: 8.3,
    imageInput: "reference",
    textToImage: false,
    serverArgs: ["--vae-format", "flux"],
    sourceScale: { scale: 4, maxSide: 2048 },
    defaults: { steps: 4, cfgScale: 1, size: 2048 }
  },
  {
    id: "anima",
    name: "Anima",
    files: {
      diffusion_model: hf("circlestone-labs/Anima", "split_files/diffusion_models/anima-base-v1.0.safetensors"),
      vae: hf("circlestone-labs/Anima", "split_files/vae/qwen_image_vae.safetensors"),
      llm: hf("circlestone-labs/Anima", "split_files/text_encoders/qwen_3_06b_base.safetensors")
    },
    sizeGb: 5.6,
    imageInput: "init",
    defaults: { steps: 30, cfgScale: 5, sampler: "euler", size: 1024 }
  },
  {
    id: "longcat-image-edit",
    name: "LongCat Image Edit",
    files: {
      diffusion_model: hf("vantagewithai/LongCat-Image-Edit-GGUF", "LongCat-Image-Edit-Q4_K_M.gguf"),
      vae: FLUX1_VAE,
      llm: QWEN25_VL_7B,
      llm_vision: QWEN25_VL_7B_VISION
    },
    sizeGb: 9.8,
    imageInput: "reference",
    textToImage: false,
    serverArgs: ["--offload-to-cpu"],
    defaults: { steps: 50, cfgScale: 4.5, sampler: "euler", flowShift: 3, size: 1024 }
  },
  {
    id: "boogu-image-edit",
    name: "Boogu Image Edit",
    files: {
      diffusion_model: hf("Comfy-Org/Boogu-Image", "diffusion_models/boogu_image_edit_int8_convrot.safetensors"),
      vae: hf("Comfy-Org/Boogu-Image", "vae/flux1_vae_bf16.safetensors"),
      llm: QWEN3_VL_8B,
      llm_vision: QWEN3_VL_8B_VISION
    },
    sizeGb: 17.7,
    imageInput: "reference",
    textToImage: false,
    serverArgs: ["--offload-to-cpu"],
    defaults: { steps: 25, cfgScale: 3.5, size: 1024 }
  },
  {
    id: "mage-flow-edit-turbo",
    name: "Mage-Flow Edit Turbo",
    files: {
      diffusion_model: hf("Comfy-Org/Mage-Flow", "diffusion_models/mage_flow_edit_turbo_int8_convrot.safetensors"),
      vae: hf("Comfy-Org/Mage-Flow", "vae/mage_flow_vae_bf16.safetensors"),
      llm: QWEN3_VL_4B,
      llm_vision: QWEN3_VL_4B_VISION
    },
    sizeGb: 7.9,
    imageInput: "reference",
    textToImage: false,
    defaults: { steps: 4, cfgScale: 1, sampler: "euler", size: 1024 }
  },
  {
    id: "llada-image-turbo",
    name: "LLaDA-Image Turbo",
    files: {
      diffusion_model: hf("fszontagh/LLaDA-Image-Turbo-GGUF", "llada-image-turbo-q8_0.gguf"),
      llm: hf("fszontagh/LLaDA-Image-Turbo-GGUF", "llada-image-turbo-text_encoder-q4_K.gguf"),
      embeddings_connectors: hf("fszontagh/LLaDA-Image-Turbo-GGUF", "llada-image-turbo-connectors-edit.safetensors"),
      tokenizer: hf("inclusionAI/LLaDA-Image-Turbo", "tokenizer/tokenizer.json"),
      vae: hf("inclusionAI/LLaDA-Image-Turbo", "vae/diffusion_pytorch_model.safetensors")
    },
    sizeGb: 20.2,
    imageInput: "reference",
    defaults: { steps: 4, cfgScale: 1, size: 1024 }
  }
];

export function sdCppModel(id: string): SdCppModelSpec | null {
  return SD_CPP_MODELS.find((model) => model.id === id) ?? null;
}

/** The model's files grouped by repository, in the order the spec lists them. */
export function sdCppModelRepos(model: SdCppModelSpec): { repoId: string; paths: string[] }[] {
  const repos = new Map<string, string[]>();
  for (const file of Object.values(model.files)) {
    if (!file) continue;
    const paths = repos.get(file.repoId) ?? [];
    if (!paths.includes(file.path)) paths.push(file.path);
    repos.set(file.repoId, paths);
  }
  return [...repos].map(([repoId, paths]) => ({ repoId, paths }));
}

/** The provider tasks a model serves. */
export function sdCppModelTasks(model: SdCppModelSpec): ("text_to_image" | "image_to_image")[] {
  const tasks: ("text_to_image" | "image_to_image")[] = [];
  if (model.textToImage !== false) tasks.push("text_to_image");
  if (model.imageInput) tasks.push("image_to_image");
  return tasks;
}

const TEXT_ENCODER_PREFIXES = ["cond_stage_model.", "conditioner.embedders.", "text_encoders."];

/**
 * The spec for a single-file checkpoint from a model folder, read from its
 * tensor names: the diffusion model, the VAE and the text encoders in one
 * file, as a ComfyUI `checkpoints` folder holds them. Null for anything
 * else, such as a LoRA, a VAE or a diffusion model that needs separate
 * encoders.
 */
export function localCheckpointSpec(
  path: string,
  tensorNames: readonly string[],
  sizeBytes: number
): SdCppModelSpec | null {
  const has = (prefix: string) => tensorNames.some((name) => name.startsWith(prefix));
  if (!has("model.diffusion_model.") || !has("first_stage_model.")) return null;
  if (!TEXT_ENCODER_PREFIXES.some(has)) return null;
  let defaults: SdCppModelSpec["defaults"];
  if (has("model.diffusion_model.double_blocks.")) {
    // FLUX.1 dev has a guidance embedding, schnell does not and needs few steps.
    defaults = has("model.diffusion_model.guidance_in.")
      ? { steps: 20, cfgScale: 1, sampler: "euler", size: 1024 }
      : { steps: 4, cfgScale: 1, sampler: "euler", size: 1024 };
  } else if (has("model.diffusion_model.joint_blocks.")) {
    defaults = { steps: 28, cfgScale: 4.5, sampler: "euler", size: 1024 };
  } else if (has("conditioner.embedders.1.")) {
    defaults = { steps: 25, cfgScale: 7, size: 1024 };
  } else if (has("cond_stage_model.")) {
    defaults = { steps: 20, cfgScale: 7, size: 512 };
  } else {
    return null;
  }
  const file = path.split(/[\\/]/).pop() ?? path;
  return {
    id: path,
    name: file.replace(/\.safetensors$/i, ""),
    files: {},
    localPath: path,
    sizeGb: Math.round((sizeBytes / 1e9) * 10) / 10,
    imageInput: "init",
    defaults
  };
}
