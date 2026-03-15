import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString,
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class ClarityUpscaler extends ReplicateNode {
  static readonly nodeType = "replicate.image_upscale.ClarityUpscaler";
  static readonly title = "Clarity Upscaler";
  static readonly description = `High resolution image Upscaler and Enhancer. Use at ClarityAI.co. A free Magnific alternative. Twitter/X: @philz1337x
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Mask image to mark areas that should be preserved during upscaling" })
  declare mask: any;

  @prop({ type: "int", default: 1337, description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "input image" })
  declare image: any;

  @prop({ type: "str", default: "masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>", description: "Prompt" })
  declare prompt: any;

  @prop({ type: "float", default: 6, description: "HDR, try from 3 - 9" })
  declare dynamic: any;

  @prop({ type: "enum", default: "disabled", values: ["disabled", "hands_only", "image_and_hands"], description: "Use clarity to fix hands in the image" })
  declare handfix: any;

  @prop({ type: "bool", default: false, description: "Upscale a pattern with seamless tiling" })
  declare pattern: any;

  @prop({ type: "float", default: 0, description: "Sharpen the image after upscaling. The higher the value, the more sharpening is applied. 0 for no sharpening" })
  declare sharpen: any;

  @prop({ type: "enum", default: "juggernaut_reborn.safetensors [338b85bc4f]", values: ["epicrealism_naturalSinRC1VAE.safetensors [84d76a0328]", "juggernaut_reborn.safetensors [338b85bc4f]", "flat2DAnimerge_v45Sharp.safetensors"], description: "Stable Diffusion model checkpoint" })
  declare sd_model: any;

  @prop({ type: "enum", default: "DPM++ 3M SDE Karras", values: ["DPM++ 2M Karras", "DPM++ SDE Karras", "DPM++ 2M SDE Exponential", "DPM++ 2M SDE Karras", "Euler a", "Euler", "LMS", "Heun", "DPM2", "DPM2 a", "DPM++ 2S a", "DPM++ 2M", "DPM++ SDE", "DPM++ 2M SDE", "DPM++ 2M SDE Heun", "DPM++ 2M SDE Heun Karras", "DPM++ 2M SDE Heun Exponential", "DPM++ 3M SDE", "DPM++ 3M SDE Karras", "DPM++ 3M SDE Exponential", "DPM fast", "DPM adaptive", "LMS Karras", "DPM2 Karras", "DPM2 a Karras", "DPM++ 2S a Karras", "Restart", "DDIM", "PLMS", "UniPC"], description: "scheduler" })
  declare scheduler: any;

  @prop({ type: "float", default: 0.35, description: "Creativity, try from 0.3 - 0.9" })
  declare creativity: any;

  @prop({ type: "str", default: "", description: "Link to a lora file you want to use in your upscaling. Multiple links possible, seperated by comma" })
  declare lora_links: any;

  @prop({ type: "bool", default: false, description: "Downscale the image before upscaling. Can improve quality and speed for images with high resolution but lower quality" })
  declare downscaling: any;

  @prop({ type: "float", default: 0.6, description: "Resemblance, try from 0.3 - 1.6" })
  declare resemblance: any;

  @prop({ type: "float", default: 2, description: "Scale factor" })
  declare scale_factor: any;

  @prop({ type: "enum", default: 112, values: ["16", "32", "48", "64", "80", "96", "112", "128", "144", "160", "176", "192", "208", "224", "240", "256"], description: "Fractality, set lower tile width for a high Fractality" })
  declare tiling_width: any;

  @prop({ type: "enum", default: "png", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "enum", default: 144, values: ["16", "32", "48", "64", "80", "96", "112", "128", "144", "160", "176", "192", "208", "224", "240", "256"], description: "Fractality, set lower tile height for a high Fractality" })
  declare tiling_height: any;

  @prop({ type: "str", default: "" })
  declare custom_sd_model: any;

  @prop({ type: "str", default: "(worst quality, low quality, normal quality:2) JuggernautNegative-neg", description: "Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 18, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 768, description: "Downscaling resolution" })
  declare downscaling_resolution: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const mask = String(inputs.mask ?? this.mask ?? "");
    const seed = Number(inputs.seed ?? this.seed ?? 1337);
    const prompt = String(inputs.prompt ?? this.prompt ?? "masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>");
    const dynamic = Number(inputs.dynamic ?? this.dynamic ?? 6);
    const handfix = String(inputs.handfix ?? this.handfix ?? "disabled");
    const pattern = Boolean(inputs.pattern ?? this.pattern ?? false);
    const sharpen = Number(inputs.sharpen ?? this.sharpen ?? 0);
    const sdModel = String(inputs.sd_model ?? this.sd_model ?? "juggernaut_reborn.safetensors [338b85bc4f]");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "DPM++ 3M SDE Karras");
    const creativity = Number(inputs.creativity ?? this.creativity ?? 0.35);
    const loraLinks = String(inputs.lora_links ?? this.lora_links ?? "");
    const downscaling = Boolean(inputs.downscaling ?? this.downscaling ?? false);
    const resemblance = Number(inputs.resemblance ?? this.resemblance ?? 0.6);
    const scaleFactor = Number(inputs.scale_factor ?? this.scale_factor ?? 2);
    const tilingWidth = String(inputs.tiling_width ?? this.tiling_width ?? 112);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "png");
    const tilingHeight = String(inputs.tiling_height ?? this.tiling_height ?? 144);
    const customSdModel = String(inputs.custom_sd_model ?? this.custom_sd_model ?? "");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "(worst quality, low quality, normal quality:2) JuggernautNegative-neg");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 18);
    const downscalingResolution = Number(inputs.downscaling_resolution ?? this.downscaling_resolution ?? 768);

    const args: Record<string, unknown> = {
      "mask": mask,
      "seed": seed,
      "prompt": prompt,
      "dynamic": dynamic,
      "handfix": handfix,
      "pattern": pattern,
      "sharpen": sharpen,
      "sd_model": sdModel,
      "scheduler": scheduler,
      "creativity": creativity,
      "lora_links": loraLinks,
      "downscaling": downscaling,
      "resemblance": resemblance,
      "scale_factor": scaleFactor,
      "tiling_width": tilingWidth,
      "output_format": outputFormat,
      "tiling_height": tilingHeight,
      "custom_sd_model": customSdModel,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
      "downscaling_resolution": downscalingResolution,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "philz1337x/clarity-upscaler", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class GFPGAN extends ReplicateNode {
  static readonly nodeType = "replicate.image_upscale.GFPGAN";
  static readonly title = "G F P G A N";
  static readonly description = `Practical face restoration algorithm for *old photos* or *AI-generated faces*
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input" })
  declare img: any;

  @prop({ type: "float", default: 2, description: "Rescaling factor" })
  declare scale: any;

  @prop({ type: "enum", default: "v1.4", values: ["v1.2", "v1.3", "v1.4", "RestoreFormer"], description: "GFPGAN version. v1.3: better quality. v1.4: more details and better identity." })
  declare version: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const scale = Number(inputs.scale ?? this.scale ?? 2);
    const version = String(inputs.version ?? this.version ?? "v1.4");

    const args: Record<string, unknown> = {
      "scale": scale,
      "version": version,
    };

    const imgRef = inputs.img as Record<string, unknown> | undefined;
    if (isRefSet(imgRef)) {
      const imgUrl = assetToUrl(imgRef!);
      if (imgUrl) args["img"] = imgUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "tencentarc/gfpgan", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class HighResolutionControlNetTile extends ReplicateNode {
  static readonly nodeType = "replicate.image_upscale.HighResolutionControlNetTile";
  static readonly title = "High Resolution Control Net Tile";
  static readonly description = `UPDATE: new upscaling algorithm for a much improved image quality. Fermat.app open-source implementation of an efficient ControlNet 1.1 tile for high-quality upscales. Increase the creativity to encourage hallucination.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 0, description: "HDR improvement over the original image" })
  declare hdr: any;

  @prop({ type: "int", default: "", description: "Seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Control image for scribble controlnet" })
  declare image: any;

  @prop({ type: "int", default: 8, description: "Steps" })
  declare steps: any;

  @prop({ type: "enum", default: "jpg", values: ["jpg", "png"], description: "Format of the output." })
  declare format: any;

  @prop({ type: "str", default: "", description: "Prompt for the model" })
  declare prompt: any;

  @prop({ type: "enum", default: "DDIM", values: ["DDIM", "DPMSolverMultistep", "K_EULER_ANCESTRAL", "K_EULER"], description: "Choose a scheduler." })
  declare scheduler: any;

  @prop({ type: "float", default: 0.35, description: "Denoising strength. 1 means total destruction of the original image" })
  declare creativity: any;

  @prop({ type: "bool", default: false, description: "In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts." })
  declare guess_mode: any;

  @prop({ type: "enum", default: 2560, values: ["2048", "2560", "4096"], description: "Image resolution" })
  declare resolution: any;

  @prop({ type: "float", default: 0.85, description: "Conditioning scale for controlnet" })
  declare resemblance: any;

  @prop({ type: "float", default: 0, description: "Scale for classifier-free guidance, should be 0." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant", description: "Negative prompt" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 1, description: "Strength of the image's details" })
  declare lora_details_strength: any;

  @prop({ type: "float", default: 1.25, description: "Strength of the image's sharpness. We don't recommend values above 2." })
  declare lora_sharpness_strength: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const hdr = Number(inputs.hdr ?? this.hdr ?? 0);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const steps = Number(inputs.steps ?? this.steps ?? 8);
    const format = String(inputs.format ?? this.format ?? "jpg");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "DDIM");
    const creativity = Number(inputs.creativity ?? this.creativity ?? 0.35);
    const guessMode = Boolean(inputs.guess_mode ?? this.guess_mode ?? false);
    const resolution = String(inputs.resolution ?? this.resolution ?? 2560);
    const resemblance = Number(inputs.resemblance ?? this.resemblance ?? 0.85);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 0);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant");
    const loraDetailsStrength = Number(inputs.lora_details_strength ?? this.lora_details_strength ?? 1);
    const loraSharpnessStrength = Number(inputs.lora_sharpness_strength ?? this.lora_sharpness_strength ?? 1.25);

    const args: Record<string, unknown> = {
      "hdr": hdr,
      "seed": seed,
      "steps": steps,
      "format": format,
      "prompt": prompt,
      "scheduler": scheduler,
      "creativity": creativity,
      "guess_mode": guessMode,
      "resolution": resolution,
      "resemblance": resemblance,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "lora_details_strength": loraDetailsStrength,
      "lora_sharpness_strength": loraSharpnessStrength,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "batouresearch/high-resolution-controlnet-tile", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class MagicImageRefiner extends ReplicateNode {
  static readonly nodeType = "replicate.image_upscale.MagicImageRefiner";
  static readonly title = "Magic Image Refiner";
  static readonly description = `A better alternative to SDXL refiners, providing a lot of quality and detail. Can also be used for inpainting or upscaling.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 0, description: "HDR improvement over the original image" })
  declare hdr: any;

  @prop({ type: "image", default: "", description: "When provided, refines some section of the image. Must be the same size as the image" })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Image to refine" })
  declare image: any;

  @prop({ type: "int", default: 20, description: "Steps" })
  declare steps: any;

  @prop({ type: "str", default: "", description: "Prompt for the model" })
  declare prompt: any;

  @prop({ type: "enum", default: "DDIM", values: ["DDIM", "DPMSolverMultistep", "K_EULER_ANCESTRAL", "K_EULER"], description: "Choose a scheduler." })
  declare scheduler: any;

  @prop({ type: "float", default: 0.25, description: "Denoising strength. 1 means total destruction of the original image" })
  declare creativity: any;

  @prop({ type: "bool", default: false, description: "In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The 'guidance_scale' between 3.0 and 5.0 is recommended." })
  declare guess_mode: any;

  @prop({ type: "enum", default: "original", values: ["original", "1024", "2048"], description: "Image resolution" })
  declare resolution: any;

  @prop({ type: "float", default: 0.75, description: "Conditioning scale for controlnet" })
  declare resemblance: any;

  @prop({ type: "float", default: 7, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant", description: "Negative prompt" })
  declare negative_prompt: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const hdr = Number(inputs.hdr ?? this.hdr ?? 0);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const steps = Number(inputs.steps ?? this.steps ?? 20);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "DDIM");
    const creativity = Number(inputs.creativity ?? this.creativity ?? 0.25);
    const guessMode = Boolean(inputs.guess_mode ?? this.guess_mode ?? false);
    const resolution = String(inputs.resolution ?? this.resolution ?? "original");
    const resemblance = Number(inputs.resemblance ?? this.resemblance ?? 0.75);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant");

    const args: Record<string, unknown> = {
      "hdr": hdr,
      "seed": seed,
      "steps": steps,
      "prompt": prompt,
      "scheduler": scheduler,
      "creativity": creativity,
      "guess_mode": guessMode,
      "resolution": resolution,
      "resemblance": resemblance,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "batouresearch/magic-image-refiner", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class RealEsrGan extends ReplicateNode {
  static readonly nodeType = "replicate.image_upscale.RealEsrGan";
  static readonly title = "Real Esr Gan";
  static readonly description = `Real-ESRGAN for image upscaling on an A100
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "float", default: 4, description: "Factor to scale image by" })
  declare scale: any;

  @prop({ type: "bool", default: false, description: "Run GFPGAN face enhancement along with upscaling" })
  declare face_enhance: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const scale = Number(inputs.scale ?? this.scale ?? 4);
    const faceEnhance = Boolean(inputs.face_enhance ?? this.face_enhance ?? false);

    const args: Record<string, unknown> = {
      "scale": scale,
      "face_enhance": faceEnhance,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "daanelson/real-esrgan-a100", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Swin2SR extends ReplicateNode {
  static readonly nodeType = "replicate.image_upscale.Swin2SR";
  static readonly title = "Swin2 S R";
  static readonly description = `3.5 Million Runs! AI Photorealistic Image Super-Resolution and Restoration
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "real_sr", values: ["classical_sr", "real_sr", "compressed_sr"], description: "Choose a task" })
  declare task: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const task = String(inputs.task ?? this.task ?? "real_sr");

    const args: Record<string, unknown> = {
      "task": task,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "mv-lab/swin2sr", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class SwinIR extends ReplicateNode {
  static readonly nodeType = "replicate.image_upscale.SwinIR";
  static readonly title = "Swin I R";
  static readonly description = `Image Restoration Using Swin Transformer
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: 40, description: "scale factor, activated for JPEG Compression Artifact Reduction. Leave it as default or arbitrary if other tasks are selected" })
  declare jpeg: any;

  @prop({ type: "image", default: "", description: "input image" })
  declare image: any;

  @prop({ type: "enum", default: 15, values: ["15", "25", "50"], description: "noise level, activated for Grayscale Image Denoising and Color Image Denoising. Leave it as default or arbitrary if other tasks are selected" })
  declare noise: any;

  @prop({ type: "enum", default: "Real-World Image Super-Resolution-Large", values: ["Real-World Image Super-Resolution-Large", "Real-World Image Super-Resolution-Medium", "Grayscale Image Denoising", "Color Image Denoising", "JPEG Compression Artifact Reduction"], description: "Choose a task" })
  declare task_type: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const jpeg = Number(inputs.jpeg ?? this.jpeg ?? 40);
    const noise = String(inputs.noise ?? this.noise ?? 15);
    const taskType = String(inputs.task_type ?? this.task_type ?? "Real-World Image Super-Resolution-Large");

    const args: Record<string, unknown> = {
      "jpeg": jpeg,
      "noise": noise,
      "task_type": taskType,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "jingyunliang/swinir", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class UltimateSDUpscale extends ReplicateNode {
  static readonly nodeType = "replicate.image_upscale.UltimateSDUpscale";
  static readonly title = "Ultimate S D Upscale";
  static readonly description = `Ultimate SD Upscale with ControlNet Tile
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 8, description: "CFG" })
  declare cfg: any;

  @prop({ type: "int", default: "", description: "Sampling seed, leave Empty for Random" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "int", default: 20, description: "Steps" })
  declare steps: any;

  @prop({ type: "float", default: 0.2, description: "Denoise" })
  declare denoise: any;

  @prop({ type: "enum", default: "4x-UltraSharp", values: ["4x_NMKD-Siax_200k", "4x-UltraSharp", "RealESRGAN_x4plus", "RealESRGAN_x4plus_anime_6B"], description: "Upscaler" })
  declare upscaler: any;

  @prop({ type: "int", default: 8, description: "Mask Blur" })
  declare mask_blur: any;

  @prop({ type: "enum", default: "Linear", values: ["Linear", "Chess", "None"], description: "Mode Type" })
  declare mode_type: any;

  @prop({ type: "enum", default: "normal", values: ["normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform"], description: "Scheduler" })
  declare scheduler: any;

  @prop({ type: "int", default: 512, description: "Tile Width" })
  declare tile_width: any;

  @prop({ type: "float", default: 2, description: "Upscale By" })
  declare upscale_by: any;

  @prop({ type: "int", default: 512, description: "Tile Height" })
  declare tile_height: any;

  @prop({ type: "enum", default: "euler", values: ["euler", "euler_ancestral", "heun", "dpm_2", "dpm_2_ancestral", "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral", "dpmpp_sde", "dpmpp_sde_gpu", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu", "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "dpmpp", "ddim", "uni_pc", "uni_pc_bh2"], description: "Sampler" })
  declare sampler_name: any;

  @prop({ type: "int", default: 32, description: "Tile Padding" })
  declare tile_padding: any;

  @prop({ type: "enum", default: "None", values: ["None", "Band Pass", "Half Tile", "Half Tile + Intersections"], description: "Seam Fix Mode" })
  declare seam_fix_mode: any;

  @prop({ type: "int", default: 64, description: "Seam Fix Width" })
  declare seam_fix_width: any;

  @prop({ type: "str", default: "", description: "Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "str", default: "Hey! Have a nice day :D", description: "Positive Prompt" })
  declare positive_prompt: any;

  @prop({ type: "float", default: 1, description: "Seam Fix Denoise" })
  declare seam_fix_denoise: any;

  @prop({ type: "int", default: 16, description: "Seam Fix Padding" })
  declare seam_fix_padding: any;

  @prop({ type: "int", default: 8, description: "Seam Fix Mask Blur" })
  declare seam_fix_mask_blur: any;

  @prop({ type: "float", default: 1, description: "ControlNet Strength" })
  declare controlnet_strength: any;

  @prop({ type: "bool", default: true, description: "Force Uniform Tiles" })
  declare force_uniform_tiles: any;

  @prop({ type: "bool", default: true, description: "Use ControlNet Tile" })
  declare use_controlnet_tile: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const cfg = Number(inputs.cfg ?? this.cfg ?? 8);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const steps = Number(inputs.steps ?? this.steps ?? 20);
    const denoise = Number(inputs.denoise ?? this.denoise ?? 0.2);
    const upscaler = String(inputs.upscaler ?? this.upscaler ?? "4x-UltraSharp");
    const maskBlur = Number(inputs.mask_blur ?? this.mask_blur ?? 8);
    const modeType = String(inputs.mode_type ?? this.mode_type ?? "Linear");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "normal");
    const tileWidth = Number(inputs.tile_width ?? this.tile_width ?? 512);
    const upscaleBy = Number(inputs.upscale_by ?? this.upscale_by ?? 2);
    const tileHeight = Number(inputs.tile_height ?? this.tile_height ?? 512);
    const samplerName = String(inputs.sampler_name ?? this.sampler_name ?? "euler");
    const tilePadding = Number(inputs.tile_padding ?? this.tile_padding ?? 32);
    const seamFixMode = String(inputs.seam_fix_mode ?? this.seam_fix_mode ?? "None");
    const seamFixWidth = Number(inputs.seam_fix_width ?? this.seam_fix_width ?? 64);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const positivePrompt = String(inputs.positive_prompt ?? this.positive_prompt ?? "Hey! Have a nice day :D");
    const seamFixDenoise = Number(inputs.seam_fix_denoise ?? this.seam_fix_denoise ?? 1);
    const seamFixPadding = Number(inputs.seam_fix_padding ?? this.seam_fix_padding ?? 16);
    const seamFixMaskBlur = Number(inputs.seam_fix_mask_blur ?? this.seam_fix_mask_blur ?? 8);
    const controlnetStrength = Number(inputs.controlnet_strength ?? this.controlnet_strength ?? 1);
    const forceUniformTiles = Boolean(inputs.force_uniform_tiles ?? this.force_uniform_tiles ?? true);
    const useControlnetTile = Boolean(inputs.use_controlnet_tile ?? this.use_controlnet_tile ?? true);

    const args: Record<string, unknown> = {
      "cfg": cfg,
      "seed": seed,
      "steps": steps,
      "denoise": denoise,
      "upscaler": upscaler,
      "mask_blur": maskBlur,
      "mode_type": modeType,
      "scheduler": scheduler,
      "tile_width": tileWidth,
      "upscale_by": upscaleBy,
      "tile_height": tileHeight,
      "sampler_name": samplerName,
      "tile_padding": tilePadding,
      "seam_fix_mode": seamFixMode,
      "seam_fix_width": seamFixWidth,
      "negative_prompt": negativePrompt,
      "positive_prompt": positivePrompt,
      "seam_fix_denoise": seamFixDenoise,
      "seam_fix_padding": seamFixPadding,
      "seam_fix_mask_blur": seamFixMaskBlur,
      "controlnet_strength": controlnetStrength,
      "force_uniform_tiles": forceUniformTiles,
      "use_controlnet_tile": useControlnetTile,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fewjative/ultimate-sd-upscale", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class ruDallE_SR extends ReplicateNode {
  static readonly nodeType = "replicate.image_upscale.ruDallE_SR";
  static readonly title = "ru Dall E_ S R";
  static readonly description = `Real-ESRGAN super-resolution model from ruDALL-E
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "enum", default: 4, values: ["2", "4", "8"], description: "Choose up-scaling factor" })
  declare scale: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const scale = String(inputs.scale ?? this.scale ?? 4);

    const args: Record<string, unknown> = {
      "scale": scale,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "cjwbw/rudalle-sr", args);
    return { output: outputToImageRef(res.output) };
  }
}

export const REPLICATE_IMAGE_UPSCALE_NODES: readonly NodeClass[] = [
  ClarityUpscaler,
  GFPGAN,
  HighResolutionControlNetTile,
  MagicImageRefiner,
  RealEsrGan,
  Swin2SR,
  SwinIR,
  UltimateSDUpscale,
  ruDallE_SR,
] as const;