/**
 * The node catalog and model folders of a lived-in local ComfyUI, for
 * `fakeComfyServer.ts`. The node definitions follow ComfyUI's own
 * `INPUT_TYPES` for the core nodes a text-to-image, LoRA, upscale and Wan
 * image-to-video workflow uses, plus Video Helper Suite's Video Combine, the
 * custom node most shared video workflows end on.
 *
 * Model names are the files a hobbyist collects from Civitai and the ComfyUI
 * templates. FLUX.1 schnell is absent on purpose: most local installs carry
 * FLUX.1 dev instead.
 */

export type ComfyInputSpec = [unknown, Record<string, unknown>?];

export interface ComfyNodeDef {
  input: {
    required: Record<string, ComfyInputSpec>;
    optional?: Record<string, ComfyInputSpec>;
    hidden?: Record<string, unknown>;
  };
  input_order: { required: string[]; optional?: string[] };
  output: string[];
  output_is_list: boolean[];
  output_name: string[];
  name: string;
  display_name: string;
  description: string;
  python_module: string;
  category: string;
  output_node: boolean;
}

export const MODEL_FOLDERS: Record<string, string[]> = {
  checkpoints: [
    "sd_xl_base_1.0.safetensors",
    "sd_xl_refiner_1.0.safetensors",
    "juggernautXL_ragnarokBy.safetensors",
    "ponyDiffusionV6XL_v6StartWithThisOne.safetensors",
    "dreamshaper_8.safetensors",
    "realisticVisionV60B1_v51HyperVAE.safetensors",
    "SDXL/RealVisXL_V5.0_fp16.safetensors",
    "flux1-dev-fp8.safetensors"
  ],
  loras: [
    "add-detail-xl.safetensors",
    "epiCRealismHelper.safetensors",
    "pixel-art-xl.safetensors",
    "Wan/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
    "Wan/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
    "flux/flux_realism_lora.safetensors"
  ],
  vae: [
    "sdxl_vae.safetensors",
    "ae.safetensors",
    "wan_2.1_vae.safetensors",
    "wan2.2_vae.safetensors"
  ],
  diffusion_models: [
    "flux1-dev.safetensors",
    "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
    "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
    "wan2.2_ti2v_5B_fp16.safetensors",
    "qwen_image_fp8_e4m3fn.safetensors"
  ],
  text_encoders: [
    "clip_l.safetensors",
    "t5xxl_fp8_e4m3fn.safetensors",
    "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    "qwen_2.5_vl_7b_fp8_scaled.safetensors"
  ],
  clip_vision: ["clip_vision_h.safetensors"],
  upscale_models: [
    "4x-UltraSharp.pth",
    "RealESRGAN_x4plus.pth",
    "4x_NMKD-Siax_200k.pth"
  ],
  controlnet: ["controlnet-union-sdxl-1.0.safetensors"],
  embeddings: ["easynegative.safetensors", "negativeXL_D.safetensors"]
};

export const SAMPLERS = [
  "euler", "euler_cfg_pp", "euler_ancestral", "euler_ancestral_cfg_pp", "heun",
  "heunpp2", "dpm_2", "dpm_2_ancestral", "lms", "dpm_fast", "dpm_adaptive",
  "dpmpp_2s_ancestral", "dpmpp_sde", "dpmpp_sde_gpu", "dpmpp_2m",
  "dpmpp_2m_cfg_pp", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu", "dpmpp_3m_sde",
  "dpmpp_3m_sde_gpu", "ddpm", "lcm", "ipndm", "ipndm_v", "deis",
  "res_multistep", "gradient_estimation", "er_sde", "seeds_2", "seeds_3",
  "sa_solver", "ddim", "uni_pc", "uni_pc_bh2"
];

export const SCHEDULERS = [
  "simple", "sgm_uniform", "karras", "exponential", "ddim_uniform", "beta",
  "normal", "linear_quadratic", "kl_optimal"
];

const MAX_RES = 16384;
const SEED: ComfyInputSpec = [
  "INT",
  { default: 0, min: 0, max: 0xffffffffffffffff, control_after_generate: true }
];
const STEPS: ComfyInputSpec = ["INT", { default: 20, min: 1, max: 10000 }];
const CFG: ComfyInputSpec = [
  "FLOAT",
  { default: 8.0, min: 0.0, max: 100.0, step: 0.1, round: 0.01 }
];
const DENOISE: ComfyInputSpec = ["FLOAT", { default: 1.0, min: 0.0, max: 1.0, step: 0.01 }];
const size = (def: number): ComfyInputSpec => [
  "INT",
  { default: def, min: 16, max: MAX_RES, step: 8 }
];

interface Def {
  cat: string;
  display: string;
  required: Record<string, ComfyInputSpec>;
  optional?: Record<string, ComfyInputSpec>;
  out: string[];
  outNames?: string[];
  outputNode?: boolean;
  module?: string;
  description?: string;
}

const DEFS: Record<string, Def> = {
  CheckpointLoaderSimple: {
    cat: "loaders",
    display: "Load Checkpoint",
    required: { ckpt_name: [MODEL_FOLDERS.checkpoints, { tooltip: "The name of the checkpoint (model) to load." }] },
    out: ["MODEL", "CLIP", "VAE"],
    description: "Loads a diffusion model checkpoint, diffusion models are used to denoise latents."
  },
  LoraLoader: {
    cat: "loaders",
    display: "Load LoRA",
    required: {
      model: ["MODEL"],
      clip: ["CLIP"],
      lora_name: [MODEL_FOLDERS.loras],
      strength_model: ["FLOAT", { default: 1.0, min: -100.0, max: 100.0, step: 0.01 }],
      strength_clip: ["FLOAT", { default: 1.0, min: -100.0, max: 100.0, step: 0.01 }]
    },
    out: ["MODEL", "CLIP"]
  },
  LoraLoaderModelOnly: {
    cat: "loaders",
    display: "LoraLoaderModelOnly",
    required: {
      model: ["MODEL"],
      lora_name: [MODEL_FOLDERS.loras],
      strength_model: ["FLOAT", { default: 1.0, min: -100.0, max: 100.0, step: 0.01 }]
    },
    out: ["MODEL"]
  },
  VAELoader: {
    cat: "loaders",
    display: "Load VAE",
    required: { vae_name: [MODEL_FOLDERS.vae] },
    out: ["VAE"]
  },
  UNETLoader: {
    cat: "advanced/loaders",
    display: "Load Diffusion Model",
    required: {
      unet_name: [MODEL_FOLDERS.diffusion_models],
      weight_dtype: [["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"]]
    },
    out: ["MODEL"]
  },
  CLIPLoader: {
    cat: "advanced/loaders",
    display: "Load CLIP",
    required: {
      clip_name: [MODEL_FOLDERS.text_encoders],
      type: [["stable_diffusion", "stable_cascade", "sd3", "stable_audio", "mochi", "ltxv", "pixart", "cosmos", "lumina2", "wan", "hidream", "chroma", "ace", "omnigen2", "qwen_image", "hunyuan_image", "flux2"]]
    },
    optional: { device: [["default", "cpu"], { advanced: true }] },
    out: ["CLIP"]
  },
  DualCLIPLoader: {
    cat: "advanced/loaders",
    display: "DualCLIPLoader",
    required: {
      clip_name1: [MODEL_FOLDERS.text_encoders],
      clip_name2: [MODEL_FOLDERS.text_encoders],
      type: [["sdxl", "sd3", "flux", "hunyuan_video", "hidream", "hunyuan_image", "ltxv"]]
    },
    optional: { device: [["default", "cpu"], { advanced: true }] },
    out: ["CLIP"]
  },
  CLIPVisionLoader: {
    cat: "loaders",
    display: "Load CLIP Vision",
    required: { clip_name: [MODEL_FOLDERS.clip_vision] },
    out: ["CLIP_VISION"]
  },
  UpscaleModelLoader: {
    cat: "loaders",
    display: "Load Upscale Model",
    required: { model_name: [MODEL_FOLDERS.upscale_models] },
    out: ["UPSCALE_MODEL"],
    module: "comfy_extras.nodes_upscale_model"
  },
  ControlNetLoader: {
    cat: "loaders",
    display: "Load ControlNet Model",
    required: { control_net_name: [MODEL_FOLDERS.controlnet] },
    out: ["CONTROL_NET"]
  },
  CLIPTextEncode: {
    cat: "conditioning",
    display: "CLIP Text Encode (Prompt)",
    required: {
      text: ["STRING", { multiline: true, dynamicPrompts: true, tooltip: "The text to be encoded." }],
      clip: ["CLIP", { tooltip: "The CLIP model used for encoding the text." }]
    },
    out: ["CONDITIONING"],
    description: "Encodes a text prompt using a CLIP model into an embedding that can be used to guide the diffusion model towards generating specific images."
  },
  CLIPSetLastLayer: {
    cat: "conditioning",
    display: "CLIP Set Last Layer",
    required: { clip: ["CLIP"], stop_at_clip_layer: ["INT", { default: -1, min: -24, max: -1, step: 1 }] },
    out: ["CLIP"]
  },
  CLIPVisionEncode: {
    cat: "conditioning",
    display: "CLIP Vision Encode",
    required: { clip_vision: ["CLIP_VISION"], image: ["IMAGE"], crop: [["center", "none"]] },
    out: ["CLIP_VISION_OUTPUT"]
  },
  FluxGuidance: {
    cat: "advanced/conditioning/flux",
    display: "FluxGuidance",
    required: { conditioning: ["CONDITIONING"], guidance: ["FLOAT", { default: 3.5, min: 0.0, max: 100.0, step: 0.1 }] },
    out: ["CONDITIONING"],
    module: "comfy_extras.nodes_flux"
  },
  ControlNetApplyAdvanced: {
    cat: "conditioning/controlnet",
    display: "Apply ControlNet",
    required: {
      positive: ["CONDITIONING"],
      negative: ["CONDITIONING"],
      control_net: ["CONTROL_NET"],
      image: ["IMAGE"],
      strength: ["FLOAT", { default: 1.0, min: 0.0, max: 10.0, step: 0.01 }],
      start_percent: ["FLOAT", { default: 0.0, min: 0.0, max: 1.0, step: 0.001 }],
      end_percent: ["FLOAT", { default: 1.0, min: 0.0, max: 1.0, step: 0.001 }]
    },
    optional: { vae: ["VAE"] },
    out: ["CONDITIONING", "CONDITIONING"],
    outNames: ["positive", "negative"]
  },
  EmptyLatentImage: {
    cat: "latent",
    display: "Empty Latent Image",
    required: {
      width: size(512),
      height: size(512),
      batch_size: ["INT", { default: 1, min: 1, max: 4096 }]
    },
    out: ["LATENT"]
  },
  EmptySD3LatentImage: {
    cat: "latent/sd3",
    display: "EmptySD3LatentImage",
    required: {
      width: ["INT", { default: 1024, min: 16, max: MAX_RES, step: 16 }],
      height: ["INT", { default: 1024, min: 16, max: MAX_RES, step: 16 }],
      batch_size: ["INT", { default: 1, min: 1, max: 4096 }]
    },
    out: ["LATENT"],
    module: "comfy_extras.nodes_sd3"
  },
  LatentUpscaleBy: {
    cat: "latent",
    display: "Upscale Latent By",
    required: {
      samples: ["LATENT"],
      upscale_method: [["nearest-exact", "bilinear", "area", "bicubic", "bislerp"]],
      scale_by: ["FLOAT", { default: 1.5, min: 0.01, max: 8.0, step: 0.01 }]
    },
    out: ["LATENT"]
  },
  VAEDecode: {
    cat: "latent",
    display: "VAE Decode",
    required: { samples: ["LATENT"], vae: ["VAE"] },
    out: ["IMAGE"]
  },
  VAEEncode: {
    cat: "latent",
    display: "VAE Encode",
    required: { pixels: ["IMAGE"], vae: ["VAE"] },
    out: ["LATENT"]
  },
  KSampler: {
    cat: "sampling",
    display: "KSampler",
    required: {
      model: ["MODEL"],
      seed: SEED,
      steps: STEPS,
      cfg: CFG,
      sampler_name: [SAMPLERS],
      scheduler: [SCHEDULERS],
      positive: ["CONDITIONING"],
      negative: ["CONDITIONING"],
      latent_image: ["LATENT"],
      denoise: DENOISE
    },
    out: ["LATENT"],
    description: "Uses the provided model, positive and negative conditioning to denoise the latent image."
  },
  KSamplerAdvanced: {
    cat: "sampling",
    display: "KSampler (Advanced)",
    required: {
      model: ["MODEL"],
      add_noise: [["enable", "disable"]],
      noise_seed: SEED,
      steps: STEPS,
      cfg: CFG,
      sampler_name: [SAMPLERS],
      scheduler: [SCHEDULERS],
      positive: ["CONDITIONING"],
      negative: ["CONDITIONING"],
      latent_image: ["LATENT"],
      start_at_step: ["INT", { default: 0, min: 0, max: 10000 }],
      end_at_step: ["INT", { default: 10000, min: 0, max: 10000 }],
      return_with_leftover_noise: [["disable", "enable"]]
    },
    out: ["LATENT"]
  },
  ModelSamplingSD3: {
    cat: "advanced/model",
    display: "ModelSamplingSD3",
    required: { model: ["MODEL"], shift: ["FLOAT", { default: 3.0, min: 0.0, max: 100.0, step: 0.01 }] },
    out: ["MODEL"],
    module: "comfy_extras.nodes_model_advanced"
  },
  LoadImage: {
    cat: "image",
    display: "Load Image",
    required: { image: [[] as string[], { image_upload: true }] },
    out: ["IMAGE", "MASK"]
  },
  SaveImage: {
    cat: "image",
    display: "Save Image",
    required: {
      images: ["IMAGE", { tooltip: "The images to save." }],
      filename_prefix: ["STRING", { default: "ComfyUI", tooltip: "The prefix for the file to save." }]
    },
    out: [],
    outputNode: true,
    description: "Saves the input images to your ComfyUI output directory."
  },
  PreviewImage: {
    cat: "image",
    display: "Preview Image",
    required: { images: ["IMAGE"] },
    out: [],
    outputNode: true,
    description: "Saves the input images to your ComfyUI output directory."
  },
  ImageScale: {
    cat: "image/upscaling",
    display: "Upscale Image",
    required: {
      image: ["IMAGE"],
      upscale_method: [["nearest-exact", "bilinear", "area", "bicubic", "lanczos"]],
      width: ["INT", { default: 512, min: 0, max: MAX_RES, step: 1 }],
      height: ["INT", { default: 512, min: 0, max: MAX_RES, step: 1 }],
      crop: [["disabled", "center"]]
    },
    out: ["IMAGE"]
  },
  ImageScaleBy: {
    cat: "image/upscaling",
    display: "Upscale Image By",
    required: {
      image: ["IMAGE"],
      upscale_method: [["nearest-exact", "bilinear", "area", "bicubic", "lanczos"]],
      scale_by: ["FLOAT", { default: 1.0, min: 0.01, max: 8.0, step: 0.01 }]
    },
    out: ["IMAGE"]
  },
  ImageUpscaleWithModel: {
    cat: "image/upscaling",
    display: "Upscale Image (using Model)",
    required: { upscale_model: ["UPSCALE_MODEL"], image: ["IMAGE"] },
    out: ["IMAGE"],
    module: "comfy_extras.nodes_upscale_model"
  },
  WanImageToVideo: {
    cat: "conditioning/video_models",
    display: "WanImageToVideo",
    required: {
      positive: ["CONDITIONING"],
      negative: ["CONDITIONING"],
      vae: ["VAE"],
      width: ["INT", { default: 832, min: 16, max: MAX_RES, step: 16 }],
      height: ["INT", { default: 480, min: 16, max: MAX_RES, step: 16 }],
      length: ["INT", { default: 81, min: 1, max: MAX_RES, step: 4 }],
      batch_size: ["INT", { default: 1, min: 1, max: 4096 }]
    },
    optional: { clip_vision_output: ["CLIP_VISION_OUTPUT"], start_image: ["IMAGE"] },
    out: ["CONDITIONING", "CONDITIONING", "LATENT"],
    outNames: ["positive", "negative", "latent"],
    module: "comfy_extras.nodes_wan"
  },
  Wan22ImageToVideoLatent: {
    cat: "conditioning/inpaint",
    display: "Wan22ImageToVideoLatent",
    required: {
      vae: ["VAE"],
      width: ["INT", { default: 1280, min: 32, max: MAX_RES, step: 32 }],
      height: ["INT", { default: 704, min: 32, max: MAX_RES, step: 32 }],
      length: ["INT", { default: 49, min: 1, max: MAX_RES, step: 4 }],
      batch_size: ["INT", { default: 1, min: 1, max: 4096 }]
    },
    optional: { start_image: ["IMAGE"] },
    out: ["LATENT"],
    module: "comfy_extras.nodes_wan"
  },
  CreateVideo: {
    cat: "image/video",
    display: "Create Video",
    required: { images: ["IMAGE"], fps: ["FLOAT", { default: 30.0, min: 1.0, max: 120.0, step: 1.0 }] },
    optional: { audio: ["AUDIO"] },
    out: ["VIDEO"],
    module: "comfy_extras.nodes_video"
  },
  SaveVideo: {
    cat: "image/video",
    display: "Save Video",
    required: {
      video: ["VIDEO", { tooltip: "The video to save." }],
      filename_prefix: ["STRING", { default: "video/ComfyUI" }],
      format: [["auto", "mp4"], { default: "auto" }],
      codec: [["auto", "h264"], { default: "auto" }]
    },
    out: [],
    outputNode: true,
    module: "comfy_extras.nodes_video",
    description: "Saves the input images to your ComfyUI output directory."
  },
  SaveWEBM: {
    cat: "image/video",
    display: "SaveWEBM",
    required: {
      images: ["IMAGE"],
      filename_prefix: ["STRING", { default: "ComfyUI" }],
      codec: [["vp9", "av1"]],
      fps: ["FLOAT", { default: 24.0, min: 0.01, max: 1000.0, step: 0.01 }],
      crf: ["FLOAT", { default: 32.0, min: 0, max: 63.0, step: 1 }]
    },
    out: [],
    outputNode: true,
    module: "comfy_extras.nodes_video"
  },
  VHS_VideoCombine: {
    cat: "Video Helper Suite 🎥🅥🅗🅢",
    display: "Video Combine 🎥🅥🅗🅢",
    required: {
      images: ["IMAGE"],
      frame_rate: ["FLOAT", { default: 8, min: 1, step: 1 }],
      loop_count: ["INT", { default: 0, min: 0, max: 100, step: 1 }],
      filename_prefix: ["STRING", { default: "AnimateDiff" }],
      format: [["image/gif", "image/webp", "video/h264-mp4", "video/webm"]],
      pingpong: ["BOOLEAN", { default: false }],
      save_output: ["BOOLEAN", { default: true }]
    },
    optional: { audio: ["AUDIO"], vae: ["VAE"] },
    out: ["VHS_FILENAMES"],
    outNames: ["Filenames"],
    outputNode: true,
    module: "custom_nodes.ComfyUI-VideoHelperSuite"
  }
};

/** `GET /object_info`, with LoadImage listing what is in the input folder. */
export function buildObjectInfo(inputFiles: string[]): Record<string, ComfyNodeDef> {
  const info: Record<string, ComfyNodeDef> = {};
  for (const [name, def] of Object.entries(DEFS)) {
    const required =
      name === "LoadImage"
        ? { image: [inputFiles, { image_upload: true }] as ComfyInputSpec }
        : def.required;
    info[name] = {
      input: { required, ...(def.optional ? { optional: def.optional } : {}) },
      input_order: {
        required: Object.keys(required),
        ...(def.optional ? { optional: Object.keys(def.optional) } : {})
      },
      output: def.out,
      output_is_list: def.out.map(() => false),
      output_name: def.outNames ?? def.out,
      name,
      display_name: def.display,
      description: def.description ?? "",
      python_module: def.module ?? "nodes",
      category: def.cat,
      output_node: def.outputNode ?? false
    };
  }
  return info;
}
