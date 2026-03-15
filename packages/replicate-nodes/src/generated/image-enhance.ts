import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  extractVersion,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString,
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class CodeFormer extends ReplicateNode {
  static readonly nodeType = "replicate.image_enhance.CodeFormer";
  static readonly title = "Code Former";
  static readonly description = `Robust face restoration algorithm for old photos/AI-generated faces
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "int", default: 2, description: "The final upsampling scale of the image" })
  declare upscale: any;

  @prop({ type: "bool", default: true, description: "Upsample restored faces for high-resolution AI-created images" })
  declare face_upsample: any;

  @prop({ type: "bool", default: true, description: "Enhance background image with Real-ESRGAN" })
  declare background_enhance: any;

  @prop({ type: "float", default: 0.5, description: "Balance the quality (lower number) and fidelity (higher number)." })
  declare codeformer_fidelity: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const upscale = Number(inputs.upscale ?? this.upscale ?? 2);
    const faceUpsample = Boolean(inputs.face_upsample ?? this.face_upsample ?? true);
    const backgroundEnhance = Boolean(inputs.background_enhance ?? this.background_enhance ?? true);
    const codeformerFidelity = Number(inputs.codeformer_fidelity ?? this.codeformer_fidelity ?? 0.5);

    const args: Record<string, unknown> = {
      "upscale": upscale,
      "face_upsample": faceUpsample,
      "background_enhance": backgroundEnhance,
      "codeformer_fidelity": codeformerFidelity,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, extractVersion("lucataco/codeformer").version, args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Maxim extends ReplicateNode {
  static readonly nodeType = "replicate.image_enhance.Maxim";
  static readonly title = "Maxim";
  static readonly description = `Multi-Axis MLP for Image Processing
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input image." })
  declare image: any;

  @prop({ type: "enum", default: "", values: ["Image Denoising", "Image Deblurring (GoPro)", "Image Deblurring (REDS)", "Image Deblurring (RealBlur_R)", "Image Deblurring (RealBlur_J)", "Image Deraining (Rain streak)", "Image Deraining (Rain drop)", "Image Dehazing (Indoor)", "Image Dehazing (Outdoor)", "Image Enhancement (Low-light)", "Image Enhancement (Retouching)"], description: "Choose a model." })
  declare model: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const model = String(inputs.model ?? this.model ?? "");

    const args: Record<string, unknown> = {
      "model": model,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, extractVersion("google-research/maxim").version, args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Night_Enhancement extends ReplicateNode {
  static readonly nodeType = "replicate.image_enhance.Night_Enhancement";
  static readonly title = "Night_ Enhancement";
  static readonly description = `Unsupervised Night Image Enhancement
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input image." })
  declare image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const args: Record<string, unknown> = {
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, extractVersion("cjwbw/night-enhancement").version, args);
    return { output: outputToImageRef(res.output) };
  }
}

export class OldPhotosRestoration extends ReplicateNode {
  static readonly nodeType = "replicate.image_enhance.OldPhotosRestoration";
  static readonly title = "Old Photos Restoration";
  static readonly description = `Bringing Old Photos Back to Life
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "bool", default: false, description: "whether the input image is high-resolution" })
  declare HR: any;

  @prop({ type: "image", default: "", description: "input image." })
  declare image: any;

  @prop({ type: "bool", default: false, description: "whether the input image is scratched" })
  declare with_scratch: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const HR = Boolean(inputs.HR ?? this.HR ?? false);
    const withScratch = Boolean(inputs.with_scratch ?? this.with_scratch ?? false);

    const args: Record<string, unknown> = {
      "HR": HR,
      "with_scratch": withScratch,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, extractVersion("microsoft/bringing-old-photos-back-to-life").version, args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Supir_V0F extends ReplicateNode {
  static readonly nodeType = "replicate.image_enhance.Supir_V0F";
  static readonly title = "Supir_ V0 F";
  static readonly description = `Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0F model and does NOT use LLaVA-13b.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Low quality input image." })
  declare image: any;

  @prop({ type: "float", default: 7.5, description: " Classifier-free guidance scale for prompts." })
  declare s_cfg: any;

  @prop({ type: "float", default: 5, description: "Original churn hy-param of EDM." })
  declare s_churn: any;

  @prop({ type: "float", default: 1.003, description: "Original noise hy-param of EDM." })
  declare s_noise: any;

  @prop({ type: "int", default: 1, description: "Upsampling ratio of given inputs." })
  declare upscale: any;

  @prop({ type: "str", default: "Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations.", description: "Additive positive prompt for the inputs." })
  declare a_prompt: any;

  @prop({ type: "float", default: 1024, description: "Minimum resolution of output images." })
  declare min_size: any;

  @prop({ type: "str", default: "painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth", description: "Negative prompt for the inputs." })
  declare n_prompt: any;

  @prop({ type: "int", default: -1, description: "Control Strength of Stage1 (negative means invalid)." })
  declare s_stage1: any;

  @prop({ type: "float", default: 1, description: "Control Strength of Stage2." })
  declare s_stage2: any;

  @prop({ type: "int", default: 50, description: "Number of steps for EDM Sampling Schedule." })
  declare edm_steps: any;

  @prop({ type: "bool", default: false, description: "Linearly (with sigma) increase CFG from 'spt_linear_CFG' to s_cfg." })
  declare linear_CFG: any;

  @prop({ type: "enum", default: "Wavelet", values: ["None", "AdaIn", "Wavelet"], description: "Color Fixing Type.." })
  declare color_fix_type: any;

  @prop({ type: "float", default: 1, description: "Start point of linearly increasing CFG." })
  declare spt_linear_CFG: any;

  @prop({ type: "bool", default: false, description: "Linearly (with sigma) increase s_stage2 from 'spt_linear_s_stage2' to s_stage2." })
  declare linear_s_stage2: any;

  @prop({ type: "float", default: 0, description: "Start point of linearly increasing s_stage2." })
  declare spt_linear_s_stage2: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const sCfg = Number(inputs.s_cfg ?? this.s_cfg ?? 7.5);
    const sChurn = Number(inputs.s_churn ?? this.s_churn ?? 5);
    const sNoise = Number(inputs.s_noise ?? this.s_noise ?? 1.003);
    const upscale = Number(inputs.upscale ?? this.upscale ?? 1);
    const aPrompt = String(inputs.a_prompt ?? this.a_prompt ?? "Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations.");
    const minSize = Number(inputs.min_size ?? this.min_size ?? 1024);
    const nPrompt = String(inputs.n_prompt ?? this.n_prompt ?? "painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth");
    const sStage1 = Number(inputs.s_stage1 ?? this.s_stage1 ?? -1);
    const sStage2 = Number(inputs.s_stage2 ?? this.s_stage2 ?? 1);
    const edmSteps = Number(inputs.edm_steps ?? this.edm_steps ?? 50);
    const linear_CFG = Boolean(inputs.linear_CFG ?? this.linear_CFG ?? false);
    const colorFixType = String(inputs.color_fix_type ?? this.color_fix_type ?? "Wavelet");
    const sptLinear_CFG = Number(inputs.spt_linear_CFG ?? this.spt_linear_CFG ?? 1);
    const linearSStage2 = Boolean(inputs.linear_s_stage2 ?? this.linear_s_stage2 ?? false);
    const sptLinearSStage2 = Number(inputs.spt_linear_s_stage2 ?? this.spt_linear_s_stage2 ?? 0);

    const args: Record<string, unknown> = {
      "seed": seed,
      "s_cfg": sCfg,
      "s_churn": sChurn,
      "s_noise": sNoise,
      "upscale": upscale,
      "a_prompt": aPrompt,
      "min_size": minSize,
      "n_prompt": nPrompt,
      "s_stage1": sStage1,
      "s_stage2": sStage2,
      "edm_steps": edmSteps,
      "linear_CFG": linear_CFG,
      "color_fix_type": colorFixType,
      "spt_linear_CFG": sptLinear_CFG,
      "linear_s_stage2": linearSStage2,
      "spt_linear_s_stage2": sptLinearSStage2,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, extractVersion("cjwbw/supir-v0f").version, args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Supir_V0Q extends ReplicateNode {
  static readonly nodeType = "replicate.image_enhance.Supir_V0Q";
  static readonly title = "Supir_ V0 Q";
  static readonly description = `Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0Q model and does NOT use LLaVA-13b.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Low quality input image." })
  declare image: any;

  @prop({ type: "float", default: 7.5, description: " Classifier-free guidance scale for prompts." })
  declare s_cfg: any;

  @prop({ type: "float", default: 5, description: "Original churn hy-param of EDM." })
  declare s_churn: any;

  @prop({ type: "float", default: 1.003, description: "Original noise hy-param of EDM." })
  declare s_noise: any;

  @prop({ type: "int", default: 1, description: "Upsampling ratio of given inputs." })
  declare upscale: any;

  @prop({ type: "str", default: "Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations.", description: "Additive positive prompt for the inputs." })
  declare a_prompt: any;

  @prop({ type: "float", default: 1024, description: "Minimum resolution of output images." })
  declare min_size: any;

  @prop({ type: "str", default: "painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth", description: "Negative prompt for the inputs." })
  declare n_prompt: any;

  @prop({ type: "int", default: -1, description: "Control Strength of Stage1 (negative means invalid)." })
  declare s_stage1: any;

  @prop({ type: "float", default: 1, description: "Control Strength of Stage2." })
  declare s_stage2: any;

  @prop({ type: "int", default: 50, description: "Number of steps for EDM Sampling Schedule." })
  declare edm_steps: any;

  @prop({ type: "bool", default: false, description: "Linearly (with sigma) increase CFG from 'spt_linear_CFG' to s_cfg." })
  declare linear_CFG: any;

  @prop({ type: "enum", default: "Wavelet", values: ["None", "AdaIn", "Wavelet"], description: "Color Fixing Type.." })
  declare color_fix_type: any;

  @prop({ type: "float", default: 1, description: "Start point of linearly increasing CFG." })
  declare spt_linear_CFG: any;

  @prop({ type: "bool", default: false, description: "Linearly (with sigma) increase s_stage2 from 'spt_linear_s_stage2' to s_stage2." })
  declare linear_s_stage2: any;

  @prop({ type: "float", default: 0, description: "Start point of linearly increasing s_stage2." })
  declare spt_linear_s_stage2: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const sCfg = Number(inputs.s_cfg ?? this.s_cfg ?? 7.5);
    const sChurn = Number(inputs.s_churn ?? this.s_churn ?? 5);
    const sNoise = Number(inputs.s_noise ?? this.s_noise ?? 1.003);
    const upscale = Number(inputs.upscale ?? this.upscale ?? 1);
    const aPrompt = String(inputs.a_prompt ?? this.a_prompt ?? "Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations.");
    const minSize = Number(inputs.min_size ?? this.min_size ?? 1024);
    const nPrompt = String(inputs.n_prompt ?? this.n_prompt ?? "painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth");
    const sStage1 = Number(inputs.s_stage1 ?? this.s_stage1 ?? -1);
    const sStage2 = Number(inputs.s_stage2 ?? this.s_stage2 ?? 1);
    const edmSteps = Number(inputs.edm_steps ?? this.edm_steps ?? 50);
    const linear_CFG = Boolean(inputs.linear_CFG ?? this.linear_CFG ?? false);
    const colorFixType = String(inputs.color_fix_type ?? this.color_fix_type ?? "Wavelet");
    const sptLinear_CFG = Number(inputs.spt_linear_CFG ?? this.spt_linear_CFG ?? 1);
    const linearSStage2 = Boolean(inputs.linear_s_stage2 ?? this.linear_s_stage2 ?? false);
    const sptLinearSStage2 = Number(inputs.spt_linear_s_stage2 ?? this.spt_linear_s_stage2 ?? 0);

    const args: Record<string, unknown> = {
      "seed": seed,
      "s_cfg": sCfg,
      "s_churn": sChurn,
      "s_noise": sNoise,
      "upscale": upscale,
      "a_prompt": aPrompt,
      "min_size": minSize,
      "n_prompt": nPrompt,
      "s_stage1": sStage1,
      "s_stage2": sStage2,
      "edm_steps": edmSteps,
      "linear_CFG": linear_CFG,
      "color_fix_type": colorFixType,
      "spt_linear_CFG": sptLinear_CFG,
      "linear_s_stage2": linearSStage2,
      "spt_linear_s_stage2": sptLinearSStage2,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, extractVersion("cjwbw/supir-v0q").version, args);
    return { output: outputToImageRef(res.output) };
  }
}

export const REPLICATE_IMAGE_ENHANCE_NODES: readonly NodeClass[] = [
  CodeFormer,
  Maxim,
  Night_Enhancement,
  OldPhotosRestoration,
  Supir_V0F,
  Supir_V0Q,
] as const;