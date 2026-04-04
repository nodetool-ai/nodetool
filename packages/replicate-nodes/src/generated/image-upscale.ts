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
  outputToString
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class RealEsrGan extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.RealEsrGan";
  static readonly title = "Real Esr Gan";
  static readonly description = `Real-ESRGAN for image upscaling on an A100
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description: "Run GFPGAN face enhancement along with upscaling"
  })
  declare face_enhance: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "float", default: 4, description: "Factor to scale image by" })
  declare scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const faceEnhance = Boolean(this.face_enhance ?? false);
    const scale = Number(this.scale ?? 4);

    const args: Record<string, unknown> = {
      face_enhance: faceEnhance,
      scale: scale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "daanelson/real-esrgan-a100:f94d7ed4a1f7e1ffed0d51e4089e4911609d5eeee5e874ef323d2c7562624bed",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class GFPGAN extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.GFPGAN";
  static readonly title = "G F P G A N";
  static readonly description = `Practical face restoration algorithm for *old photos* or *AI-generated faces*
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input" })
  declare img: any;

  @prop({ type: "float", default: 2, description: "Rescaling factor" })
  declare scale: any;

  @prop({
    type: "enum",
    default: "v1.4",
    values: ["v1.2", "v1.3", "v1.4", "RestoreFormer"],
    description:
      "GFPGAN version. v1.3: better quality. v1.4: more details and better identity."
  })
  declare version: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const scale = Number(this.scale ?? 2);
    const version = String(this.version ?? "v1.4");

    const args: Record<string, unknown> = {
      scale: scale,
      version: version
    };

    const imgRef = this.img as Record<string, unknown> | undefined;
    if (isRefSet(imgRef)) {
      const imgUrl = await assetToUrl(imgRef!, apiKey);
      if (imgUrl) args["img"] = imgUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "tencentarc/gfpgan:0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class ClarityUpscaler extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.ClarityUpscaler";
  static readonly title = "Clarity Upscaler";
  static readonly description = `High resolution image Upscaler and Enhancer. Use at ClarityAI.co. A free Magnific alternative. Twitter/X: @philz1337x
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 0.35,
    description: "Creativity, try from 0.3 - 0.9"
  })
  declare creativity: any;

  @prop({ type: "str", default: "" })
  declare custom_sd_model: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Downscale the image before upscaling. Can improve quality and speed for images with high resolution but lower quality"
  })
  declare downscaling: any;

  @prop({ type: "int", default: 768, description: "Downscaling resolution" })
  declare downscaling_resolution: any;

  @prop({ type: "float", default: 6, description: "HDR, try from 3 - 9" })
  declare dynamic: any;

  @prop({
    type: "enum",
    default: "disabled",
    values: ["disabled", "hands_only", "image_and_hands"],
    description: "Use clarity to fix hands in the image"
  })
  declare handfix: any;

  @prop({ type: "image", default: "", description: "input image" })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Link to a lora file you want to use in your upscaling. Multiple links possible, seperated by comma"
  })
  declare lora_links: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Mask image to mark areas that should be preserved during upscaling"
  })
  declare mask: any;

  @prop({
    type: "str",
    default:
      "(worst quality, low quality, normal quality:2) JuggernautNegative-neg",
    description: "Negative Prompt"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 18, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({
    type: "enum",
    default: "png",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "bool",
    default: false,
    description: "Upscale a pattern with seamless tiling"
  })
  declare pattern: any;

  @prop({
    type: "str",
    default:
      "masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>",
    description: "Prompt"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.6,
    description: "Resemblance, try from 0.3 - 1.6"
  })
  declare resemblance: any;

  @prop({ type: "float", default: 2, description: "Scale factor" })
  declare scale_factor: any;

  @prop({
    type: "enum",
    default: "DPM++ 3M SDE Karras",
    values: [
      "DPM++ 2M Karras",
      "DPM++ SDE Karras",
      "DPM++ 2M SDE Exponential",
      "DPM++ 2M SDE Karras",
      "Euler a",
      "Euler",
      "LMS",
      "Heun",
      "DPM2",
      "DPM2 a",
      "DPM++ 2S a",
      "DPM++ 2M",
      "DPM++ SDE",
      "DPM++ 2M SDE",
      "DPM++ 2M SDE Heun",
      "DPM++ 2M SDE Heun Karras",
      "DPM++ 2M SDE Heun Exponential",
      "DPM++ 3M SDE",
      "DPM++ 3M SDE Karras",
      "DPM++ 3M SDE Exponential",
      "DPM fast",
      "DPM adaptive",
      "LMS Karras",
      "DPM2 Karras",
      "DPM2 a Karras",
      "DPM++ 2S a Karras",
      "Restart",
      "DDIM",
      "PLMS",
      "UniPC"
    ],
    description: "scheduler"
  })
  declare scheduler: any;

  @prop({
    type: "enum",
    default: "juggernaut_reborn.safetensors [338b85bc4f]",
    values: [
      "epicrealism_naturalSinRC1VAE.safetensors [84d76a0328]",
      "juggernaut_reborn.safetensors [338b85bc4f]",
      "flat2DAnimerge_v45Sharp.safetensors"
    ],
    description: "Stable Diffusion model checkpoint"
  })
  declare sd_model: any;

  @prop({
    type: "int",
    default: 1337,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Sharpen the image after upscaling. The higher the value, the more sharpening is applied. 0 for no sharpening"
  })
  declare sharpen: any;

  @prop({
    type: "enum",
    default: 144,
    values: [
      "16",
      "32",
      "48",
      "64",
      "80",
      "96",
      "112",
      "128",
      "144",
      "160",
      "176",
      "192",
      "208",
      "224",
      "240",
      "256"
    ],
    description: "Fractality, set lower tile height for a high Fractality"
  })
  declare tiling_height: any;

  @prop({
    type: "enum",
    default: 112,
    values: [
      "16",
      "32",
      "48",
      "64",
      "80",
      "96",
      "112",
      "128",
      "144",
      "160",
      "176",
      "192",
      "208",
      "224",
      "240",
      "256"
    ],
    description: "Fractality, set lower tile width for a high Fractality"
  })
  declare tiling_width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const creativity = Number(this.creativity ?? 0.35);
    const customSdModel = String(this.custom_sd_model ?? "");
    const downscaling = Boolean(this.downscaling ?? false);
    const downscalingResolution = Number(this.downscaling_resolution ?? 768);
    const dynamic = Number(this.dynamic ?? 6);
    const handfix = String(this.handfix ?? "disabled");
    const loraLinks = String(this.lora_links ?? "");
    const negativePrompt = String(
      this.negative_prompt ??
        "(worst quality, low quality, normal quality:2) JuggernautNegative-neg"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 18);
    const outputFormat = String(this.output_format ?? "png");
    const pattern = Boolean(this.pattern ?? false);
    const prompt = String(
      this.prompt ??
        "masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>"
    );
    const resemblance = Number(this.resemblance ?? 0.6);
    const scaleFactor = Number(this.scale_factor ?? 2);
    const scheduler = String(this.scheduler ?? "DPM++ 3M SDE Karras");
    const sdModel = String(
      this.sd_model ?? "juggernaut_reborn.safetensors [338b85bc4f]"
    );
    const seed = Number(this.seed ?? 1337);
    const sharpen = Number(this.sharpen ?? 0);
    const tilingHeight = String(this.tiling_height ?? 144);
    const tilingWidth = String(this.tiling_width ?? 112);

    const args: Record<string, unknown> = {
      creativity: creativity,
      custom_sd_model: customSdModel,
      downscaling: downscaling,
      downscaling_resolution: downscalingResolution,
      dynamic: dynamic,
      handfix: handfix,
      lora_links: loraLinks,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      output_format: outputFormat,
      pattern: pattern,
      prompt: prompt,
      resemblance: resemblance,
      scale_factor: scaleFactor,
      scheduler: scheduler,
      sd_model: sdModel,
      seed: seed,
      sharpen: sharpen,
      tiling_height: tilingHeight,
      tiling_width: tilingWidth
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const maskRef = this.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = await assetToUrl(maskRef!, apiKey);
      if (maskUrl) args["mask"] = maskUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "philz1337x/clarity-upscaler:dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class MagicImageRefiner extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.MagicImageRefiner";
  static readonly title = "Magic Image Refiner";
  static readonly description = `A better alternative to SDXL refiners, providing a lot of quality and detail. Can also be used for inpainting or upscaling.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 0.25,
    description:
      "Denoising strength. 1 means total destruction of the original image"
  })
  declare creativity: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The 'guidance_scale' between 3.0 and 5.0 is recommended."
  })
  declare guess_mode: any;

  @prop({
    type: "float",
    default: 7,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({
    type: "float",
    default: 0,
    description: "HDR improvement over the original image"
  })
  declare hdr: any;

  @prop({ type: "image", default: "", description: "Image to refine" })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "When provided, refines some section of the image. Must be the same size as the image"
  })
  declare mask: any;

  @prop({
    type: "str",
    default:
      "teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant",
    description: "Negative prompt"
  })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", description: "Prompt for the model" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.75,
    description: "Conditioning scale for controlnet"
  })
  declare resemblance: any;

  @prop({
    type: "enum",
    default: "original",
    values: ["original", "1024", "2048"],
    description: "Image resolution"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "DDIM",
    values: ["DDIM", "DPMSolverMultistep", "K_EULER_ANCESTRAL", "K_EULER"],
    description: "Choose a scheduler."
  })
  declare scheduler: any;

  @prop({ type: "int", default: -1, description: "Seed" })
  declare seed: any;

  @prop({ type: "int", default: 20, description: "Steps" })
  declare steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const creativity = Number(this.creativity ?? 0.25);
    const guessMode = Boolean(this.guess_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 7);
    const hdr = Number(this.hdr ?? 0);
    const negativePrompt = String(
      this.negative_prompt ??
        "teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant"
    );
    const prompt = String(this.prompt ?? "");
    const resemblance = Number(this.resemblance ?? 0.75);
    const resolution = String(this.resolution ?? "original");
    const scheduler = String(this.scheduler ?? "DDIM");
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 20);

    const args: Record<string, unknown> = {
      creativity: creativity,
      guess_mode: guessMode,
      guidance_scale: guidanceScale,
      hdr: hdr,
      negative_prompt: negativePrompt,
      prompt: prompt,
      resemblance: resemblance,
      resolution: resolution,
      scheduler: scheduler,
      seed: seed,
      steps: steps
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const maskRef = this.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = await assetToUrl(maskRef!, apiKey);
      if (maskUrl) args["mask"] = maskUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fermatresearch/magic-image-refiner:507ddf6f977a7e30e46c0daefd30de7d563c72322f9e4cf7cbac52ef0f667b13",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class ruDallE_SR extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.ruDallE_SR";
  static readonly title = "ru Dall E_ S R";
  static readonly description = `Real-ESRGAN super-resolution model from ruDALL-E
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "enum",
    default: 4,
    values: ["2", "4", "8"],
    description: "Choose up-scaling factor"
  })
  declare scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const scale = String(this.scale ?? 4);

    const args: Record<string, unknown> = {
      scale: scale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "cjwbw/rudalle-sr:32fdb2231d00a10d33754cc2ba794a2dfec94216579770785849ce6f149dbc69",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class HighResolutionControlNetTile extends ReplicateNode {
  static readonly nodeType =
    "replicate.image.upscale.HighResolutionControlNetTile";
  static readonly title = "High Resolution Control Net Tile";
  static readonly description = `UPDATE: new upscaling algorithm for a much improved image quality. Fermat.app open-source implementation of an efficient ControlNet 1.1 tile for high-quality upscales. Increase the creativity to encourage hallucination.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 0.35,
    description:
      "Denoising strength. 1 means total destruction of the original image"
  })
  declare creativity: any;

  @prop({
    type: "enum",
    default: "jpg",
    values: ["jpg", "png"],
    description: "Format of the output."
  })
  declare format: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts."
  })
  declare guess_mode: any;

  @prop({
    type: "float",
    default: 0,
    description: "Scale for classifier-free guidance, should be 0."
  })
  declare guidance_scale: any;

  @prop({
    type: "float",
    default: 0,
    description: "HDR improvement over the original image"
  })
  declare hdr: any;

  @prop({
    type: "image",
    default: "",
    description: "Control image for scribble controlnet"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 1,
    description: "Strength of the image's details"
  })
  declare lora_details_strength: any;

  @prop({
    type: "float",
    default: 1.25,
    description:
      "Strength of the image's sharpness. We don't recommend values above 2."
  })
  declare lora_sharpness_strength: any;

  @prop({
    type: "str",
    default:
      "teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant",
    description: "Negative prompt"
  })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", description: "Prompt for the model" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.85,
    description: "Conditioning scale for controlnet"
  })
  declare resemblance: any;

  @prop({
    type: "enum",
    default: 2560,
    values: ["2048", "2560", "4096"],
    description: "Image resolution"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "DDIM",
    values: ["DDIM", "DPMSolverMultistep", "K_EULER_ANCESTRAL", "K_EULER"],
    description: "Choose a scheduler."
  })
  declare scheduler: any;

  @prop({ type: "int", default: -1, description: "Seed" })
  declare seed: any;

  @prop({ type: "int", default: 8, description: "Steps" })
  declare steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const creativity = Number(this.creativity ?? 0.35);
    const format = String(this.format ?? "jpg");
    const guessMode = Boolean(this.guess_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 0);
    const hdr = Number(this.hdr ?? 0);
    const loraDetailsStrength = Number(this.lora_details_strength ?? 1);
    const loraSharpnessStrength = Number(this.lora_sharpness_strength ?? 1.25);
    const negativePrompt = String(
      this.negative_prompt ??
        "teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant"
    );
    const prompt = String(this.prompt ?? "");
    const resemblance = Number(this.resemblance ?? 0.85);
    const resolution = String(this.resolution ?? 2560);
    const scheduler = String(this.scheduler ?? "DDIM");
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 8);

    const args: Record<string, unknown> = {
      creativity: creativity,
      format: format,
      guess_mode: guessMode,
      guidance_scale: guidanceScale,
      hdr: hdr,
      lora_details_strength: loraDetailsStrength,
      lora_sharpness_strength: loraSharpnessStrength,
      negative_prompt: negativePrompt,
      prompt: prompt,
      resemblance: resemblance,
      resolution: resolution,
      scheduler: scheduler,
      seed: seed,
      steps: steps
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fermatresearch/high-resolution-controlnet-tile:8e6a54d7b2848c48dc741a109d3fb0ea2a7f554eb4becd39a25cc532536ea975",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class UltimateSDUpscale extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.UltimateSDUpscale";
  static readonly title = "Ultimate S D Upscale";
  static readonly description = `Ultimate SD Upscale with ControlNet Tile
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "float", default: 8, description: "CFG" })
  declare cfg: any;

  @prop({ type: "float", default: 1, description: "ControlNet Strength" })
  declare controlnet_strength: any;

  @prop({ type: "float", default: 0.2, description: "Denoise" })
  declare denoise: any;

  @prop({ type: "bool", default: true, description: "Force Uniform Tiles" })
  declare force_uniform_tiles: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "int", default: 8, description: "Mask Blur" })
  declare mask_blur: any;

  @prop({
    type: "enum",
    default: "Linear",
    values: ["Linear", "Chess", "None"],
    description: "Mode Type"
  })
  declare mode_type: any;

  @prop({ type: "str", default: "", description: "Negative Prompt" })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "Hey! Have a nice day :D",
    description: "Positive Prompt"
  })
  declare positive_prompt: any;

  @prop({
    type: "enum",
    default: "euler",
    values: [
      "euler",
      "euler_ancestral",
      "heun",
      "dpm_2",
      "dpm_2_ancestral",
      "lms",
      "dpm_fast",
      "dpm_adaptive",
      "dpmpp_2s_ancestral",
      "dpmpp_sde",
      "dpmpp_sde_gpu",
      "dpmpp_2m",
      "dpmpp_2m_sde",
      "dpmpp_2m_sde_gpu",
      "dpmpp_3m_sde",
      "dpmpp_3m_sde_gpu",
      "dpmpp",
      "ddim",
      "uni_pc",
      "uni_pc_bh2"
    ],
    description: "Sampler"
  })
  declare sampler_name: any;

  @prop({
    type: "enum",
    default: "normal",
    values: [
      "normal",
      "karras",
      "exponential",
      "sgm_uniform",
      "simple",
      "ddim_uniform"
    ],
    description: "Scheduler"
  })
  declare scheduler: any;

  @prop({ type: "float", default: 1, description: "Seam Fix Denoise" })
  declare seam_fix_denoise: any;

  @prop({ type: "int", default: 8, description: "Seam Fix Mask Blur" })
  declare seam_fix_mask_blur: any;

  @prop({
    type: "enum",
    default: "None",
    values: ["None", "Band Pass", "Half Tile", "Half Tile + Intersections"],
    description: "Seam Fix Mode"
  })
  declare seam_fix_mode: any;

  @prop({ type: "int", default: 16, description: "Seam Fix Padding" })
  declare seam_fix_padding: any;

  @prop({ type: "int", default: 64, description: "Seam Fix Width" })
  declare seam_fix_width: any;

  @prop({
    type: "int",
    default: -1,
    description: "Sampling seed, leave Empty for Random"
  })
  declare seed: any;

  @prop({ type: "int", default: 20, description: "Steps" })
  declare steps: any;

  @prop({ type: "int", default: 512, description: "Tile Height" })
  declare tile_height: any;

  @prop({ type: "int", default: 32, description: "Tile Padding" })
  declare tile_padding: any;

  @prop({ type: "int", default: 512, description: "Tile Width" })
  declare tile_width: any;

  @prop({ type: "float", default: 2, description: "Upscale By" })
  declare upscale_by: any;

  @prop({
    type: "enum",
    default: "4x-UltraSharp",
    values: [
      "4x_NMKD-Siax_200k",
      "4x-UltraSharp",
      "RealESRGAN_x4plus",
      "RealESRGAN_x4plus_anime_6B"
    ],
    description: "Upscaler"
  })
  declare upscaler: any;

  @prop({ type: "bool", default: true, description: "Use ControlNet Tile" })
  declare use_controlnet_tile: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cfg = Number(this.cfg ?? 8);
    const controlnetStrength = Number(this.controlnet_strength ?? 1);
    const denoise = Number(this.denoise ?? 0.2);
    const forceUniformTiles = Boolean(this.force_uniform_tiles ?? true);
    const maskBlur = Number(this.mask_blur ?? 8);
    const modeType = String(this.mode_type ?? "Linear");
    const negativePrompt = String(this.negative_prompt ?? "");
    const positivePrompt = String(
      this.positive_prompt ?? "Hey! Have a nice day :D"
    );
    const samplerName = String(this.sampler_name ?? "euler");
    const scheduler = String(this.scheduler ?? "normal");
    const seamFixDenoise = Number(this.seam_fix_denoise ?? 1);
    const seamFixMaskBlur = Number(this.seam_fix_mask_blur ?? 8);
    const seamFixMode = String(this.seam_fix_mode ?? "None");
    const seamFixPadding = Number(this.seam_fix_padding ?? 16);
    const seamFixWidth = Number(this.seam_fix_width ?? 64);
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 20);
    const tileHeight = Number(this.tile_height ?? 512);
    const tilePadding = Number(this.tile_padding ?? 32);
    const tileWidth = Number(this.tile_width ?? 512);
    const upscaleBy = Number(this.upscale_by ?? 2);
    const upscaler = String(this.upscaler ?? "4x-UltraSharp");
    const useControlnetTile = Boolean(this.use_controlnet_tile ?? true);

    const args: Record<string, unknown> = {
      cfg: cfg,
      controlnet_strength: controlnetStrength,
      denoise: denoise,
      force_uniform_tiles: forceUniformTiles,
      mask_blur: maskBlur,
      mode_type: modeType,
      negative_prompt: negativePrompt,
      positive_prompt: positivePrompt,
      sampler_name: samplerName,
      scheduler: scheduler,
      seam_fix_denoise: seamFixDenoise,
      seam_fix_mask_blur: seamFixMaskBlur,
      seam_fix_mode: seamFixMode,
      seam_fix_padding: seamFixPadding,
      seam_fix_width: seamFixWidth,
      seed: seed,
      steps: steps,
      tile_height: tileHeight,
      tile_padding: tilePadding,
      tile_width: tileWidth,
      upscale_by: upscaleBy,
      upscaler: upscaler,
      use_controlnet_tile: useControlnetTile
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fewjative/ultimate-sd-upscale:5daf1012d946160622cd1bd45ed8f12d9675d24659276ccfe24804035f3b3ad7",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class SwinIR extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.SwinIR";
  static readonly title = "Swin I R";
  static readonly description = `Image Restoration Using Swin Transformer
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "input image" })
  declare image: any;

  @prop({
    type: "int",
    default: 40,
    description:
      "scale factor, activated for JPEG Compression Artifact Reduction. Leave it as default or arbitrary if other tasks are selected"
  })
  declare jpeg: any;

  @prop({
    type: "enum",
    default: 15,
    values: ["15", "25", "50"],
    description:
      "noise level, activated for Grayscale Image Denoising and Color Image Denoising. Leave it as default or arbitrary if other tasks are selected"
  })
  declare noise: any;

  @prop({
    type: "enum",
    default: "Real-World Image Super-Resolution-Large",
    values: [
      "Real-World Image Super-Resolution-Large",
      "Real-World Image Super-Resolution-Medium",
      "Grayscale Image Denoising",
      "Color Image Denoising",
      "JPEG Compression Artifact Reduction"
    ],
    description: "Choose a task"
  })
  declare task_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const jpeg = Number(this.jpeg ?? 40);
    const noise = String(this.noise ?? 15);
    const taskType = String(
      this.task_type ?? "Real-World Image Super-Resolution-Large"
    );

    const args: Record<string, unknown> = {
      jpeg: jpeg,
      noise: noise,
      task_type: taskType
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "jingyunliang/swinir:660d922d33153019e8c263a3bba265de882e7f4f70396546b6c9c8f9d47a021a",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Swin2SR extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.Swin2SR";
  static readonly title = "Swin2 S R";
  static readonly description = `3.5 Million Runs! AI Photorealistic Image Super-Resolution and Restoration
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "enum",
    default: "real_sr",
    values: ["classical_sr", "real_sr", "compressed_sr"],
    description: "Choose a task"
  })
  declare task: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const task = String(this.task ?? "real_sr");

    const args: Record<string, unknown> = {
      task: task
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "mv-lab/swin2sr:a01b0512004918ca55d02e554914a9eca63909fa83a29ff0f115c78a7045574f",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Alexgenovese_Upscaler extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.Alexgenovese_Upscaler";
  static readonly title = "Alexgenovese_ Upscaler";
  static readonly description = `GFPGAN aims at developing Practical Algorithms for Real-world Face and Object Restoration
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "bool", default: true, description: "Face enhance" })
  declare face_enhance: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "float", default: 4, description: "Factor to scale image by" })
  declare scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const faceEnhance = Boolean(this.face_enhance ?? true);
    const scale = Number(this.scale ?? 4);

    const args: Record<string, unknown> = {
      face_enhance: faceEnhance,
      scale: scale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "alexgenovese/upscaler:4f7eb3da655b5182e559d50a0437440f242992d47e5e20bd82829a79dee61ff3",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Bria_IncreaseResolution extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.Bria_IncreaseResolution";
  static readonly title = "Bria_ Increase Resolution";
  static readonly description = `Bria Increase resolution upscales the resolution of any image. It increases resolution using a dedicated upscaling method that preserves the original image content without regeneration.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description: "Enable content moderation"
  })
  declare content_moderation: any;

  @prop({
    type: "enum",
    default: 2,
    values: ["2", "4"],
    description:
      "Resolution multiplier (scale factor). Possible values are 2 or 4. Maximum total area is 8192x8192 pixels"
  })
  declare desired_increase: any;

  @prop({ type: "image", default: "", description: "Image file" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Image URL" })
  declare image_url: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Preserve alpha channel in output. When true, maintains original transparency. When false, output is fully opaque."
  })
  declare preserve_alpha: any;

  @prop({
    type: "bool",
    default: true,
    description: "Synchronous response mode"
  })
  declare sync: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const contentModeration = Boolean(this.content_moderation ?? false);
    const desiredIncrease = String(this.desired_increase ?? 2);
    const imageUrl = String(this.image_url ?? "");
    const preserveAlpha = Boolean(this.preserve_alpha ?? true);
    const sync = Boolean(this.sync ?? true);

    const args: Record<string, unknown> = {
      content_moderation: contentModeration,
      desired_increase: desiredIncrease,
      image_url: imageUrl,
      preserve_alpha: preserveAlpha,
      sync: sync
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bria/increase-resolution:53f1c804909dba21ec57397ac0193347ff8d425a0c3ed77b1ba30bf03ef1bf35",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class CjwbwRealEsrGan extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.CjwbwRealEsrGan";
  static readonly title = "Cjwbw Real Esr Gan";
  static readonly description = `Real-ESRGAN: Real-World Blind Super-Resolution
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "enum",
    default: 4,
    values: ["2", "4", "8"],
    description: "Upscaling factor"
  })
  declare upscale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const upscale = String(this.upscale ?? 4);

    const args: Record<string, unknown> = {
      upscale: upscale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "cjwbw/real-esrgan:d0ee3d708c9b911f122a4ad90046c5d26a0293b99476d697f6bb7f2e251ce2d4",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Google_Upscaler extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.Google_Upscaler";
  static readonly title = "Google_ Upscaler";
  static readonly description = `Upscale images 2x or 4x times
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "int",
    default: 80,
    description: "Compression quality for output (1-100)"
  })
  declare compression_quality: any;

  @prop({ type: "image", default: "", description: "Image to upscale" })
  declare image: any;

  @prop({
    type: "enum",
    default: "x2",
    values: ["x2", "x4"],
    description: "Factor by which to upscale the image"
  })
  declare upscale_factor: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const compressionQuality = Number(this.compression_quality ?? 80);
    const upscaleFactor = String(this.upscale_factor ?? "x2");

    const args: Record<string, unknown> = {
      compression_quality: compressionQuality,
      upscale_factor: upscaleFactor
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/upscaler:496385cf77d71de0a4ac353b4b7cf798e63e903196e4394b12174f68c9c042ce",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class DemofusionEnhance extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.DemofusionEnhance";
  static readonly title = "Demofusion Enhance";
  static readonly description = `Image to Image enhancer using DemoFusion
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Select to use auto-generated CLIP prompt instead of using the above custom prompt"
  })
  declare auto_prompt: any;

  @prop({
    type: "float",
    default: 3,
    description: "Control the strength of skip-residual"
  })
  declare cosine_scale_1: any;

  @prop({
    type: "float",
    default: 1,
    description: "Control the strength of dilated sampling"
  })
  declare cosine_scale_2: any;

  @prop({
    type: "float",
    default: 1,
    description: "Control the strength of the Gaussian filter"
  })
  declare cosine_scale_3: any;

  @prop({
    type: "float",
    default: 8.5,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "bool", default: false, description: "Use multiple decoders" })
  declare multi_decoder: any;

  @prop({
    type: "str",
    default: "blurry, ugly, duplicate, poorly drawn, deformed, mosaic",
    description: "Input Negative Prompt"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 40, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "A high resolution photo",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: 2,
    values: ["1", "2", "4"],
    description: "Scale factor for input image"
  })
  declare scale: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0.8,
    description: "The standard value of the Gaussian filter"
  })
  declare sigma: any;

  @prop({
    type: "int",
    default: 64,
    description: "The stride of moving local patches"
  })
  declare stride: any;

  @prop({
    type: "int",
    default: 16,
    description: "The batch size for multiple denoising paths"
  })
  declare view_batch_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const autoPrompt = Boolean(this.auto_prompt ?? false);
    const cosineScale_1 = Number(this.cosine_scale_1 ?? 3);
    const cosineScale_2 = Number(this.cosine_scale_2 ?? 1);
    const cosineScale_3 = Number(this.cosine_scale_3 ?? 1);
    const guidanceScale = Number(this.guidance_scale ?? 8.5);
    const multiDecoder = Boolean(this.multi_decoder ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, ugly, duplicate, poorly drawn, deformed, mosaic"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const prompt = String(this.prompt ?? "A high resolution photo");
    const scale = String(this.scale ?? 2);
    const seed = Number(this.seed ?? -1);
    const sigma = Number(this.sigma ?? 0.8);
    const stride = Number(this.stride ?? 64);
    const viewBatchSize = Number(this.view_batch_size ?? 16);

    const args: Record<string, unknown> = {
      auto_prompt: autoPrompt,
      cosine_scale_1: cosineScale_1,
      cosine_scale_2: cosineScale_2,
      cosine_scale_3: cosineScale_3,
      guidance_scale: guidanceScale,
      multi_decoder: multiDecoder,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      prompt: prompt,
      scale: scale,
      seed: seed,
      sigma: sigma,
      stride: stride,
      view_batch_size: viewBatchSize
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/demofusion-enhance:5bcfe11066c820e8c08232c6efa3c8a7ab2cd667ad136ca173633f352170691e",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class PASD_Magnify extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.PASD_Magnify";
  static readonly title = "P A S D_ Magnify";
  static readonly description = `(Academic and Non-commercial use only) Pixel-Aware Stable Diffusion for Realistic Image Super-resolution and Personalized Stylization
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "float", default: 1.1, description: "Conditioning Scale" })
  declare conditioning_scale: any;

  @prop({ type: "int", default: 20, description: "Denoise Steps" })
  declare denoise_steps: any;

  @prop({ type: "float", default: 7.5, description: "Guidance Scale" })
  declare guidance_scale: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "str",
    default:
      "dotted, noise, blur, lowres, oversmooth, longbody, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality",
    description: "Negative Prompt"
  })
  declare n_prompt: any;

  @prop({
    type: "str",
    default: "Frog, clean, high-resolution, 8k, best quality, masterpiece",
    description: "Prompt"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({ type: "int", default: 2, description: "Upsample Scale" })
  declare upsample_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const conditioningScale = Number(this.conditioning_scale ?? 1.1);
    const denoiseSteps = Number(this.denoise_steps ?? 20);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const nPrompt = String(
      this.n_prompt ??
        "dotted, noise, blur, lowres, oversmooth, longbody, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality"
    );
    const prompt = String(
      this.prompt ??
        "Frog, clean, high-resolution, 8k, best quality, masterpiece"
    );
    const seed = Number(this.seed ?? -1);
    const upsampleScale = Number(this.upsample_scale ?? 2);

    const args: Record<string, unknown> = {
      conditioning_scale: conditioningScale,
      denoise_steps: denoiseSteps,
      guidance_scale: guidanceScale,
      n_prompt: nPrompt,
      prompt: prompt,
      seed: seed,
      upsample_scale: upsampleScale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/pasd-magnify:d59e83ee13c42b137aee558c483e3acc0a8ecdacb1444a7be48152f008dcc195",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class SD_X4_Upscaler extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.SD_X4_Upscaler";
  static readonly title = "S D_ X4_ Upscaler";
  static readonly description = `Stable Diffusion x4 upscaler model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Grayscale input image" })
  declare image: any;

  @prop({ type: "str", default: "A white cat", description: "Input prompt" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: 4,
    values: ["1", "2", "4"],
    description: "Factor to scale image by"
  })
  declare scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const prompt = String(this.prompt ?? "A white cat");
    const scale = String(this.scale ?? 4);

    const args: Record<string, unknown> = {
      prompt: prompt,
      scale: scale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/stable-diffusion-x4-upscaler:c96e30cc409e6c5f68cd8b071b15fe819b23956669fd6461891000ee64545760",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class NightmareAI_RealEsrGan extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.NightmareAI_RealEsrGan";
  static readonly title = "Nightmare A I_ Real Esr Gan";
  static readonly description = `Real-ESRGAN with optional face correction and adjustable upscale
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description: "Run GFPGAN face enhancement along with upscaling"
  })
  declare face_enhance: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "float", default: 4, description: "Factor to scale image by" })
  declare scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const faceEnhance = Boolean(this.face_enhance ?? false);
    const scale = Number(this.scale ?? 4);

    const args: Record<string, unknown> = {
      face_enhance: faceEnhance,
      scale: scale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "nightmareai/real-esrgan:b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_Creative_Upscale extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.Recraft_Creative_Upscale";
  static readonly title = "Recraft_ Creative_ Upscale";
  static readonly description = `Creative Upscale focuses on enhancing details and refining complex elements in the image. It doesn’t just increase resolution but adds depth by improving textures, fine details, and facial features.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Image to upscale" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "recraft-ai/recraft-creative-upscale:55c7bc47bac03ff7248e74561f7798f1cdcb51646242da191227eed1af2c7e43",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_Crisp_Upscale extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.Recraft_Crisp_Upscale";
  static readonly title = "Recraft_ Crisp_ Upscale";
  static readonly description = `Designed to make images sharper and cleaner, Crisp Upscale increases overall quality, making visuals suitable for web use or print-ready materials.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Image to upscale" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "recraft-ai/recraft-crisp-upscale:2177c1e3a177f5a76c632e467c32b413e424c23d84e43f7b036a965e305f6557",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Topaz_Image_Upscale extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.Topaz_Image_Upscale";
  static readonly title = "Topaz_ Image_ Upscale";
  static readonly description = `Professional-grade image upscaling, from Topaz Labs
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "Standard V2",
    values: [
      "Standard V2",
      "Low Resolution V2",
      "CGI",
      "High Fidelity V2",
      "Text Refine"
    ],
    description:
      "Model to use: Standard V2 (general purpose), Low Resolution V2 (for low-res images), CGI (for digital art), High Fidelity V2 (preserves details), Text Refine (optimized for text)"
  })
  declare enhance_model: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enhance faces in the image"
  })
  declare face_enhancement: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Choose the level of creativity for face enhancement from 0 to 1. Defaults to 0, and is ignored if face_enhancement is false."
  })
  declare face_enhancement_creativity: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Control how sharp the enhanced faces are relative to the background from 0 to 1. Defaults to 0.8, and is ignored if face_enhancement is false."
  })
  declare face_enhancement_strength: any;

  @prop({ type: "image", default: "", description: "Image to enhance" })
  declare image: any;

  @prop({
    type: "enum",
    default: "jpg",
    values: ["jpg", "png"],
    description: "Output format"
  })
  declare output_format: any;

  @prop({
    type: "enum",
    default: "None",
    values: ["None", "All", "Foreground", "Background"],
    description: "Subject detection"
  })
  declare subject_detection: any;

  @prop({
    type: "enum",
    default: "None",
    values: ["None", "2x", "4x", "6x"],
    description: "How much to upscale the image"
  })
  declare upscale_factor: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const enhanceModel = String(this.enhance_model ?? "Standard V2");
    const faceEnhancement = Boolean(this.face_enhancement ?? false);
    const faceEnhancementCreativity = Number(
      this.face_enhancement_creativity ?? 0
    );
    const faceEnhancementStrength = Number(
      this.face_enhancement_strength ?? 0.8
    );
    const outputFormat = String(this.output_format ?? "jpg");
    const subjectDetection = String(this.subject_detection ?? "None");
    const upscaleFactor = String(this.upscale_factor ?? "None");

    const args: Record<string, unknown> = {
      enhance_model: enhanceModel,
      face_enhancement: faceEnhancement,
      face_enhancement_creativity: faceEnhancementCreativity,
      face_enhancement_strength: faceEnhancementStrength,
      output_format: outputFormat,
      subject_detection: subjectDetection,
      upscale_factor: upscaleFactor
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "topazlabs/image-upscale:2fdc3b86a01d338ae89ad58e5d9241398a8a01de9b0dda41ba8a0434c8a00dc3",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class ESRGAN extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.ESRGAN";
  static readonly title = "E S R G A N";
  static readonly description = `Image 4x super-resolution
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description: "Low-resolution input image"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "xinntao/esrgan:c263265e04b16fda1046d1828997fc27b46610647a3348df1c72fbffbdbac912",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Aura_SR extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.Aura_SR";
  static readonly title = "Aura_ S R";
  static readonly description = `AuraSR: GAN-based Super-Resolution for real-world
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description: "The input image file to be upscaled."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Controls the number of image tiles processed simultaneously. Higher values may increase speed but require more GPU memory. Lower values use less memory but may increase processing time. Default is 1 for broad compatibility. Adjust based on your GPU capabilities for optimal performance."
  })
  declare max_batch_size: any;

  @prop({
    type: "enum",
    default: 4,
    values: ["2", "4", "8", "16", "32"],
    description:
      "The factor by which to upscale the image (2, 4, 8, 16, or 32)."
  })
  declare scale_factor: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxBatchSize = Number(this.max_batch_size ?? 1);
    const scaleFactor = String(this.scale_factor ?? 4);

    const args: Record<string, unknown> = {
      max_batch_size: maxBatchSize,
      scale_factor: scaleFactor
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/aura-sr:7231d40ac06e74c6d1bc287309c396fa4791e4cf4fdcb91fb4b191c6c485fc1c",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Aura_SR_V2 extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.Aura_SR_V2";
  static readonly title = "Aura_ S R_ V2";
  static readonly description = `AuraSR v2: Second-gen GAN-based Super-Resolution for real-world applications
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input image to upscale" })
  declare image: any;

  @prop({
    type: "int",
    default: 8,
    description:
      "Maximum number of tiles to process in a single batch. Higher values may increase speed but require more GPU memory."
  })
  declare max_batch_size: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "The image file format of the generated output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "The image compression quality (for lossy formats like JPEG and WebP). 100 = best quality, 0 = lowest quality."
  })
  declare output_quality: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxBatchSize = Number(this.max_batch_size ?? 8);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);

    const args: Record<string, unknown> = {
      max_batch_size: maxBatchSize,
      output_format: outputFormat,
      output_quality: outputQuality
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/aura-sr-v2:5c137257cce8d5ce16e8a334b70e9e025106b5580affed0bc7d48940b594e74c",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class BSRGAN extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.BSRGAN";
  static readonly title = "B S R G A N";
  static readonly description = `Upscale videos + images with BSRGAN
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description: "Input image or video file"
  })
  declare input_file: any;

  @prop({
    type: "enum",
    default: 4,
    values: ["2", "4"],
    description: "Upscaling factor (2x or 4x)"
  })
  declare scale_factor: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const scaleFactor = String(this.scale_factor ?? 4);

    const args: Record<string, unknown> = {
      scale_factor: scaleFactor
    };

    const inputFileRef = this.input_file as Record<string, unknown> | undefined;
    if (isRefSet(inputFileRef)) {
      const inputFileUrl = await assetToUrl(inputFileRef!, apiKey);
      if (inputFileUrl) args["input_file"] = inputFileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/bsrgan:1ae02b13920bbc43cedec32a680b836412a55d978d0a2f2f6a423acc85e332e4",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class DiffBIR extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.DiffBIR";
  static readonly title = "Diff B I R";
  static readonly description = `✨DiffBIR: Towards Blind Image Restoration with Generative Diffusion Prior
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "RealESRGAN",
    values: ["DiffBIR", "RealESRGAN"],
    description:
      "For 'faces' mode: Model used to upscale the background in images where the primary subject is a face."
  })
  declare background_upsampler: any;

  @prop({
    type: "int",
    default: 400,
    description:
      "For 'faces' mode: Size of each tile used by the background upsampler when dividing the image into patches."
  })
  declare background_upsampler_tile: any;

  @prop({
    type: "int",
    default: 400,
    description:
      "For 'faces' mode: Distance between the start of each tile when the background is divided for upscaling. A smaller stride means more overlap between tiles."
  })
  declare background_upsampler_tile_stride: any;

  @prop({
    type: "enum",
    default: "wavelet",
    values: ["wavelet", "adain", "none"],
    description:
      "Method used for color correction post enhancement. 'wavelet' and 'adain' offer different styles of color correction, while 'none' skips this step."
  })
  declare color_fix_type: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Disables the initial preprocessing step using SwinIR. Turn this off if your input image is already of high quality and doesn't require restoration."
  })
  declare disable_preprocess_model: any;

  @prop({
    type: "enum",
    default: "retinaface_resnet50",
    values: [
      "retinaface_resnet50",
      "retinaface_mobile0.25",
      "YOLOv5l",
      "YOLOv5n",
      "dlib"
    ],
    description:
      "For 'faces' mode: Model used for detecting faces in the image. Choose based on accuracy and speed preferences."
  })
  declare face_detection_model: any;

  @prop({
    type: "int",
    default: 5,
    description:
      "For 'general_scenes': Number of times the guidance process is repeated during enhancement."
  })
  declare guidance_repeat: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "For 'general_scenes': Scale factor for the guidance mechanism. Adjusts the influence of guidance on the enhancement process."
  })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: "latent",
    values: ["rgb", "latent"],
    description:
      "For 'general_scenes': Determines in which space (RGB or latent) the guidance operates. 'latent' can often provide more subtle and context-aware enhancements."
  })
  declare guidance_space: any;

  @prop({
    type: "int",
    default: 1001,
    description:
      "For 'general_scenes': Specifies when (at which step) the guidance mechanism starts influencing the enhancement."
  })
  declare guidance_time_start: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "For 'general_scenes': Specifies when (at which step) the guidance mechanism stops influencing the enhancement."
  })
  declare guidance_time_stop: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "For 'faces' mode: Indicates if the input images are already cropped and aligned to faces. If not, the model will attempt to do this."
  })
  declare has_aligned: any;

  @prop({
    type: "image",
    default: "",
    description: "Path to the input image you want to enhance."
  })
  declare input: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "For 'faces' mode: If multiple faces are detected, only enhance the center-most face in the image."
  })
  declare only_center_face: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Reload the image restoration model (SwinIR) if set to True. This can be useful if you've updated or changed the underlying SwinIR model."
  })
  declare reload_restoration_model: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Number of times the enhancement process is repeated by feeding the output back as input. This can refine the result but might also introduce over-enhancement issues."
  })
  declare repeat_times: any;

  @prop({
    type: "enum",
    default: "general_scenes",
    values: ["faces", "general_scenes"],
    description:
      "Select the restoration model that aligns with the content of your image. This model is responsible for image restoration which removes degradations."
  })
  declare restoration_model_type: any;

  @prop({
    type: "int",
    default: 231,
    description:
      "Random seed to ensure reproducibility. Setting this ensures that multiple runs with the same input produce the same output."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 50,
    description:
      "The number of enhancement iterations to perform. More steps might result in a clearer image but can also introduce artifacts."
  })
  declare steps: any;

  @prop({
    type: "int",
    default: 4,
    description:
      "Factor by which the input image resolution should be increased. For instance, a factor of 4 will make the resolution 4 times greater in both height and width."
  })
  declare super_resolution_factor: any;

  @prop({
    type: "int",
    default: 512,
    description:
      "Size of each tile (or patch) when 'tiled' option is enabled. Determines how the image is divided during patch-based enhancement."
  })
  declare tile_size: any;

  @prop({
    type: "int",
    default: 256,
    description:
      "Distance between the start of each tile when the image is divided for patch-based enhancement. A smaller stride means more overlap between tiles."
  })
  declare tile_stride: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to use patch-based sampling. This can be useful for very large images to enhance them in smaller chunks rather than all at once."
  })
  declare tiled: any;

  @prop({
    type: "enum",
    default: "general_scenes",
    values: ["faces", "general_scenes"],
    description:
      "Choose the type of model best suited for the primary content of the image: 'faces' for portraits and 'general_scenes' for everything else."
  })
  declare upscaling_model_type: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Use latent image guidance for enhancement. This can help in achieving more accurate and contextually relevant enhancements."
  })
  declare use_guidance: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const backgroundUpsampler = String(
      this.background_upsampler ?? "RealESRGAN"
    );
    const backgroundUpsamplerTile = Number(
      this.background_upsampler_tile ?? 400
    );
    const backgroundUpsamplerTileStride = Number(
      this.background_upsampler_tile_stride ?? 400
    );
    const colorFixType = String(this.color_fix_type ?? "wavelet");
    const disablePreprocessModel = Boolean(
      this.disable_preprocess_model ?? false
    );
    const faceDetectionModel = String(
      this.face_detection_model ?? "retinaface_resnet50"
    );
    const guidanceRepeat = Number(this.guidance_repeat ?? 5);
    const guidanceScale = Number(this.guidance_scale ?? 0);
    const guidanceSpace = String(this.guidance_space ?? "latent");
    const guidanceTimeStart = Number(this.guidance_time_start ?? 1001);
    const guidanceTimeStop = Number(this.guidance_time_stop ?? -1);
    const hasAligned = Boolean(this.has_aligned ?? false);
    const onlyCenterFace = Boolean(this.only_center_face ?? false);
    const reloadRestorationModel = Boolean(
      this.reload_restoration_model ?? false
    );
    const repeatTimes = Number(this.repeat_times ?? 1);
    const restorationModelType = String(
      this.restoration_model_type ?? "general_scenes"
    );
    const seed = Number(this.seed ?? 231);
    const steps = Number(this.steps ?? 50);
    const superResolutionFactor = Number(this.super_resolution_factor ?? 4);
    const tileSize = Number(this.tile_size ?? 512);
    const tileStride = Number(this.tile_stride ?? 256);
    const tiled = Boolean(this.tiled ?? false);
    const upscalingModelType = String(
      this.upscaling_model_type ?? "general_scenes"
    );
    const useGuidance = Boolean(this.use_guidance ?? false);

    const args: Record<string, unknown> = {
      background_upsampler: backgroundUpsampler,
      background_upsampler_tile: backgroundUpsamplerTile,
      background_upsampler_tile_stride: backgroundUpsamplerTileStride,
      color_fix_type: colorFixType,
      disable_preprocess_model: disablePreprocessModel,
      face_detection_model: faceDetectionModel,
      guidance_repeat: guidanceRepeat,
      guidance_scale: guidanceScale,
      guidance_space: guidanceSpace,
      guidance_time_start: guidanceTimeStart,
      guidance_time_stop: guidanceTimeStop,
      has_aligned: hasAligned,
      only_center_face: onlyCenterFace,
      reload_restoration_model: reloadRestorationModel,
      repeat_times: repeatTimes,
      restoration_model_type: restorationModelType,
      seed: seed,
      steps: steps,
      super_resolution_factor: superResolutionFactor,
      tile_size: tileSize,
      tile_stride: tileStride,
      tiled: tiled,
      upscaling_model_type: upscalingModelType,
      use_guidance: useGuidance
    };

    const inputRef = this.input as Record<string, unknown> | undefined;
    if (isRefSet(inputRef)) {
      const inputUrl = await assetToUrl(inputRef!, apiKey);
      if (inputUrl) args["input"] = inputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/diffbir:51ed1464d8bbbaca811153b051d3b09ab42f0bdeb85804ae26ba323d7a66a4ac",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class InvSR extends ReplicateNode {
  static readonly nodeType = "replicate.image.upscale.InvSR";
  static readonly title = "Inv S R";
  static readonly description = `Arbitrary-steps Image Super-resolution via Diffusion Inversion
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: 128,
    values: ["128", "256", "512"],
    description: "Chopping resolution"
  })
  declare chopping_size: any;

  @prop({ type: "image", default: "", description: "Input low-quality image" })
  declare in_path: any;

  @prop({
    type: "enum",
    default: 1,
    values: ["1", "2", "3", "4", "5"],
    description: "Number of sampling steps."
  })
  declare num_steps: any;

  @prop({
    type: "int",
    default: 12345,
    description: "Random seed. Leave blank to randomize the seed."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const choppingSize = String(this.chopping_size ?? 128);
    const numSteps = String(this.num_steps ?? 1);
    const seed = Number(this.seed ?? 12345);

    const args: Record<string, unknown> = {
      chopping_size: choppingSize,
      num_steps: numSteps,
      seed: seed
    };

    const inPathRef = this.in_path as Record<string, unknown> | undefined;
    if (isRefSet(inPathRef)) {
      const inPathUrl = await assetToUrl(inPathRef!, apiKey);
      if (inPathUrl) args["in_path"] = inPathUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsyoaoa/invsr:37eebabfb6cdc4be2892b884b96b361d6fedc9f6a934d2fa3c1a2f85f004b0f0",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export const REPLICATE_IMAGE_UPSCALE_NODES: readonly NodeClass[] = [
  RealEsrGan,
  GFPGAN,
  ClarityUpscaler,
  MagicImageRefiner,
  ruDallE_SR,
  HighResolutionControlNetTile,
  UltimateSDUpscale,
  SwinIR,
  Swin2SR,
  Alexgenovese_Upscaler,
  Bria_IncreaseResolution,
  CjwbwRealEsrGan,
  Google_Upscaler,
  DemofusionEnhance,
  PASD_Magnify,
  SD_X4_Upscaler,
  NightmareAI_RealEsrGan,
  Recraft_Creative_Upscale,
  Recraft_Crisp_Upscale,
  Topaz_Image_Upscale,
  ESRGAN,
  Aura_SR,
  Aura_SR_V2,
  BSRGAN,
  DiffBIR,
  InvSR
] as const;
