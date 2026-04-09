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

export class CodeFormer extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.CodeFormer";
  static readonly title = "Code Former";
  static readonly description = `Robust face restoration algorithm for old photos/AI-generated faces
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: true,
    description: "Enhance background image with Real-ESRGAN"
  })
  declare background_enhance: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Balance the quality (lower number) and fidelity (higher number)."
  })
  declare codeformer_fidelity: any;

  @prop({
    type: "bool",
    default: true,
    description: "Upsample restored faces for high-resolution AI-created images"
  })
  declare face_upsample: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "int",
    default: 2,
    description: "The final upsampling scale of the image"
  })
  declare upscale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const backgroundEnhance = Boolean(this.background_enhance ?? true);
    const codeformerFidelity = Number(this.codeformer_fidelity ?? 0.5);
    const faceUpsample = Boolean(this.face_upsample ?? true);
    const upscale = Number(this.upscale ?? 2);

    const args: Record<string, unknown> = {
      background_enhance: backgroundEnhance,
      codeformer_fidelity: codeformerFidelity,
      face_upsample: faceUpsample,
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
      "lucataco/codeformer:78f2bab438ab0ffc85a68cdfd316a2ecd3994b5dd26aa6b3d203357b45e5eb1b",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Night_Enhancement extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.Night_Enhancement";
  static readonly title = "Night_ Enhancement";
  static readonly description = `Unsupervised Night Image Enhancement
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input image." })
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
      "cjwbw/night-enhancement:4328e402cfedafa70ad7cec04412e86ab61832204deccd94108ae5222c9b1ae1",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Supir_V0Q extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.Supir_V0Q";
  static readonly title = "Supir_ V0 Q";
  static readonly description = `Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0Q model and does NOT use LLaVA-13b.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "str",
    default:
      "Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations.",
    description: "Additive positive prompt for the inputs."
  })
  declare a_prompt: any;

  @prop({
    type: "enum",
    default: "Wavelet",
    values: ["None", "AdaIn", "Wavelet"],
    description: "Color Fixing Type.."
  })
  declare color_fix_type: any;

  @prop({
    type: "int",
    default: 50,
    description: "Number of steps for EDM Sampling Schedule."
  })
  declare edm_steps: any;

  @prop({ type: "image", default: "", description: "Low quality input image." })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Linearly (with sigma) increase CFG from 'spt_linear_CFG' to s_cfg."
  })
  declare linear_CFG: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Linearly (with sigma) increase s_stage2 from 'spt_linear_s_stage2' to s_stage2."
  })
  declare linear_s_stage2: any;

  @prop({
    type: "float",
    default: 1024,
    description: "Minimum resolution of output images."
  })
  declare min_size: any;

  @prop({
    type: "str",
    default:
      "painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth",
    description: "Negative prompt for the inputs."
  })
  declare n_prompt: any;

  @prop({
    type: "float",
    default: 7.5,
    description: " Classifier-free guidance scale for prompts."
  })
  declare s_cfg: any;

  @prop({
    type: "float",
    default: 5,
    description: "Original churn hy-param of EDM."
  })
  declare s_churn: any;

  @prop({
    type: "float",
    default: 1.003,
    description: "Original noise hy-param of EDM."
  })
  declare s_noise: any;

  @prop({
    type: "int",
    default: -1,
    description: "Control Strength of Stage1 (negative means invalid)."
  })
  declare s_stage1: any;

  @prop({
    type: "float",
    default: 1,
    description: "Control Strength of Stage2."
  })
  declare s_stage2: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description: "Start point of linearly increasing CFG."
  })
  declare spt_linear_CFG: any;

  @prop({
    type: "float",
    default: 0,
    description: "Start point of linearly increasing s_stage2."
  })
  declare spt_linear_s_stage2: any;

  @prop({
    type: "int",
    default: 1,
    description: "Upsampling ratio of given inputs."
  })
  declare upscale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aPrompt = String(
      this.a_prompt ??
        "Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations."
    );
    const colorFixType = String(this.color_fix_type ?? "Wavelet");
    const edmSteps = Number(this.edm_steps ?? 50);
    const linear_CFG = Boolean(this.linear_CFG ?? false);
    const linearSStage2 = Boolean(this.linear_s_stage2 ?? false);
    const minSize = Number(this.min_size ?? 1024);
    const nPrompt = String(
      this.n_prompt ??
        "painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth"
    );
    const sCfg = Number(this.s_cfg ?? 7.5);
    const sChurn = Number(this.s_churn ?? 5);
    const sNoise = Number(this.s_noise ?? 1.003);
    const sStage1 = Number(this.s_stage1 ?? -1);
    const sStage2 = Number(this.s_stage2 ?? 1);
    const seed = Number(this.seed ?? -1);
    const sptLinear_CFG = Number(this.spt_linear_CFG ?? 1);
    const sptLinearSStage2 = Number(this.spt_linear_s_stage2 ?? 0);
    const upscale = Number(this.upscale ?? 1);

    const args: Record<string, unknown> = {
      a_prompt: aPrompt,
      color_fix_type: colorFixType,
      edm_steps: edmSteps,
      linear_CFG: linear_CFG,
      linear_s_stage2: linearSStage2,
      min_size: minSize,
      n_prompt: nPrompt,
      s_cfg: sCfg,
      s_churn: sChurn,
      s_noise: sNoise,
      s_stage1: sStage1,
      s_stage2: sStage2,
      seed: seed,
      spt_linear_CFG: sptLinear_CFG,
      spt_linear_s_stage2: sptLinearSStage2,
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
      "cjwbw/supir-v0q:ede69f6a5ae7d09f769d683347325b08d2f83a93d136ed89747941205e0a71da",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Supir_V0F extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.Supir_V0F";
  static readonly title = "Supir_ V0 F";
  static readonly description = `Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0F model and does NOT use LLaVA-13b.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "str",
    default:
      "Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations.",
    description: "Additive positive prompt for the inputs."
  })
  declare a_prompt: any;

  @prop({
    type: "enum",
    default: "Wavelet",
    values: ["None", "AdaIn", "Wavelet"],
    description: "Color Fixing Type.."
  })
  declare color_fix_type: any;

  @prop({
    type: "int",
    default: 50,
    description: "Number of steps for EDM Sampling Schedule."
  })
  declare edm_steps: any;

  @prop({ type: "image", default: "", description: "Low quality input image." })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Linearly (with sigma) increase CFG from 'spt_linear_CFG' to s_cfg."
  })
  declare linear_CFG: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Linearly (with sigma) increase s_stage2 from 'spt_linear_s_stage2' to s_stage2."
  })
  declare linear_s_stage2: any;

  @prop({
    type: "float",
    default: 1024,
    description: "Minimum resolution of output images."
  })
  declare min_size: any;

  @prop({
    type: "str",
    default:
      "painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth",
    description: "Negative prompt for the inputs."
  })
  declare n_prompt: any;

  @prop({
    type: "float",
    default: 7.5,
    description: " Classifier-free guidance scale for prompts."
  })
  declare s_cfg: any;

  @prop({
    type: "float",
    default: 5,
    description: "Original churn hy-param of EDM."
  })
  declare s_churn: any;

  @prop({
    type: "float",
    default: 1.003,
    description: "Original noise hy-param of EDM."
  })
  declare s_noise: any;

  @prop({
    type: "int",
    default: -1,
    description: "Control Strength of Stage1 (negative means invalid)."
  })
  declare s_stage1: any;

  @prop({
    type: "float",
    default: 1,
    description: "Control Strength of Stage2."
  })
  declare s_stage2: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description: "Start point of linearly increasing CFG."
  })
  declare spt_linear_CFG: any;

  @prop({
    type: "float",
    default: 0,
    description: "Start point of linearly increasing s_stage2."
  })
  declare spt_linear_s_stage2: any;

  @prop({
    type: "int",
    default: 1,
    description: "Upsampling ratio of given inputs."
  })
  declare upscale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aPrompt = String(
      this.a_prompt ??
        "Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations."
    );
    const colorFixType = String(this.color_fix_type ?? "Wavelet");
    const edmSteps = Number(this.edm_steps ?? 50);
    const linear_CFG = Boolean(this.linear_CFG ?? false);
    const linearSStage2 = Boolean(this.linear_s_stage2 ?? false);
    const minSize = Number(this.min_size ?? 1024);
    const nPrompt = String(
      this.n_prompt ??
        "painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth"
    );
    const sCfg = Number(this.s_cfg ?? 7.5);
    const sChurn = Number(this.s_churn ?? 5);
    const sNoise = Number(this.s_noise ?? 1.003);
    const sStage1 = Number(this.s_stage1 ?? -1);
    const sStage2 = Number(this.s_stage2 ?? 1);
    const seed = Number(this.seed ?? -1);
    const sptLinear_CFG = Number(this.spt_linear_CFG ?? 1);
    const sptLinearSStage2 = Number(this.spt_linear_s_stage2 ?? 0);
    const upscale = Number(this.upscale ?? 1);

    const args: Record<string, unknown> = {
      a_prompt: aPrompt,
      color_fix_type: colorFixType,
      edm_steps: edmSteps,
      linear_CFG: linear_CFG,
      linear_s_stage2: linearSStage2,
      min_size: minSize,
      n_prompt: nPrompt,
      s_cfg: sCfg,
      s_churn: sChurn,
      s_noise: sNoise,
      s_stage1: sStage1,
      s_stage2: sStage2,
      seed: seed,
      spt_linear_CFG: sptLinear_CFG,
      spt_linear_s_stage2: sptLinearSStage2,
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
      "cjwbw/supir-v0f:b9c26267b41f3617099b53f09f2d894a621ebf4a59b632bfedb5031eeabd8959",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Maxim extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.Maxim";
  static readonly title = "Maxim";
  static readonly description = `Multi-Axis MLP for Image Processing
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input image." })
  declare image: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "Image Denoising",
      "Image Deblurring (GoPro)",
      "Image Deblurring (REDS)",
      "Image Deblurring (RealBlur_R)",
      "Image Deblurring (RealBlur_J)",
      "Image Deraining (Rain streak)",
      "Image Deraining (Rain drop)",
      "Image Dehazing (Indoor)",
      "Image Dehazing (Outdoor)",
      "Image Enhancement (Low-light)",
      "Image Enhancement (Retouching)"
    ],
    description: "Choose a model."
  })
  declare model: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const model = String(this.model ?? "");

    const args: Record<string, unknown> = {
      model: model
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google-research/maxim:494ca4d578293b4b93945115601b6a38190519da18467556ca223d219c3af9f9",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class OldPhotosRestoration extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.OldPhotosRestoration";
  static readonly title = "Old Photos Restoration";
  static readonly description = `Bringing Old Photos Back to Life
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description: "whether the input image is high-resolution"
  })
  declare HR: any;

  @prop({ type: "image", default: "", description: "input image." })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description: "whether the input image is scratched"
  })
  declare with_scratch: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const HR = Boolean(this.HR ?? false);
    const withScratch = Boolean(this.with_scratch ?? false);

    const args: Record<string, unknown> = {
      HR: HR,
      with_scratch: withScratch
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "microsoft/bringing-old-photos-back-to-life:c75db81db6cbd809d93cc3b7e7a088a351a3349c9fa02b6d393e35e0d51ba799",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Deoldify_Image extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.Deoldify_Image";
  static readonly title = "Deoldify_ Image";
  static readonly description = `Add colours to old images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Path to an image" })
  declare input_image: any;

  @prop({
    type: "enum",
    default: "",
    values: ["Artistic", "Stable"],
    description:
      "Which model to use: Artistic has more vibrant color but may leave important parts of the image gray.Stable is better for nature scenery and is less prone to leaving gray human parts"
  })
  declare model_name: any;

  @prop({
    type: "int",
    default: 35,
    description:
      "The default value of 35 has been carefully chosen and should work -ok- for most scenarios (but probably won't be the -best-). This determines resolution at which the color portion of the image is rendered. Lower resolution will render faster, and colors also tend to look more vibrant. Older and lower quality images in particular will generally benefit by lowering the render factor. Higher render factors are often better for higher quality images, but the colors may get slightly washed out."
  })
  declare render_factor: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const modelName = String(this.model_name ?? "");
    const renderFactor = Number(this.render_factor ?? 35);

    const args: Record<string, unknown> = {
      model_name: modelName,
      render_factor: renderFactor
    };

    const inputImageRef = this.input_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await assetToUrl(inputImageRef!, apiKey);
      if (inputImageUrl) args["input_image"] = inputImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "arielreplicate/deoldify_image:0da600fab0c45a66211339f1c16b71345d22f26ef5fea3dca1bb90bb5711e950",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class BigColor extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.BigColor";
  static readonly title = "Big Color";
  static readonly description = `Colorization using a Generative Color Prior for Natural Images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "str",
    default: "88",
    description:
      "Specify classes for Multi-modal class vector c, separate the classes with space."
  })
  declare classes: any;

  @prop({ type: "image", default: "", description: "Input image." })
  declare image: any;

  @prop({
    type: "enum",
    default: "Real Gray Colorization",
    values: ["Real Gray Colorization", "Multi-modal class vector c"],
    description: "Choose the colorization mode."
  })
  declare mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const classes = String(this.classes ?? "88");
    const mode = String(this.mode ?? "Real Gray Colorization");

    const args: Record<string, unknown> = {
      classes: classes,
      mode: mode
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "cjwbw/bigcolor:9451bfbf652b21a9bccc741e5c7046540faa5586cfa3aa45abc7dbb46151a4f7",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class NAFNet extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.NAFNet";
  static readonly title = "N A F Net";
  static readonly description = `Nonlinear Activation Free Network for Image Restoration
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "Input image. Stereo Image Super-Resolution, upload the left image here."
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Right Input image for Stereo Image Super-Resolution. Optional, only valid for Stereo Image Super-Resolution task."
  })
  declare image_r: any;

  @prop({
    type: "enum",
    default: "Image Debluring (REDS)",
    values: [
      "Image Denoising",
      "Image Debluring (GoPro)",
      "Image Debluring (REDS)",
      "Stereo Image Super-Resolution"
    ],
    description: "Choose task type."
  })
  declare task_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const taskType = String(this.task_type ?? "Image Debluring (REDS)");

    const args: Record<string, unknown> = {
      task_type: taskType
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const imageRRef = this.image_r as Record<string, unknown> | undefined;
    if (isRefSet(imageRRef)) {
      const imageRUrl = await assetToUrl(imageRRef!, apiKey);
      if (imageRUrl) args["image_r"] = imageRUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "megvii-research/nafnet:018241a6c880319404eaa2714b764313e27e11f950a7ff0a7b5b37b27b74dcf7",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class InstructIR extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.InstructIR";
  static readonly title = "Instruct I R";
  static readonly description = `High-Quality Image Restoration Following Human Instructions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input image." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Input prompt." })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "mv-lab/instructir:e98baeb90b5cd143a86aa2a9deeffb2852c3bebbd428f3cdf5da1b31fb99d3a3",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class AnimeSR extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.AnimeSR";
  static readonly title = "Anime S R";
  static readonly description = `Real-World Super-Resolution Models for Animation Videos
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "Zip file of frames of a video. Ignored when video is provided."
  })
  declare frames: any;

  @prop({ type: "video", default: "", description: "Input video file" })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const framesRef = this.frames as Record<string, unknown> | undefined;
    if (isRefSet(framesRef)) {
      const framesUrl = await assetToUrl(framesRef!, apiKey);
      if (framesUrl) args["frames"] = framesUrl;
    }

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "tencentarc/animesr:8c5b0d2da7a0c881bb2253adc3b899f27cb191f643f43c14a0e554078a7bbad3",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class VQFR extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.VQFR";
  static readonly title = "V Q F R";
  static readonly description = `Blind Face Restoration with Vector-Quantized Dictionary and Parallel Decoder
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description: "Input are aligned faces."
  })
  declare aligned: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image. Output restored faces and whole image."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aligned = Boolean(this.aligned ?? false);

    const args: Record<string, unknown> = {
      aligned: aligned
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "tencentarc/vqfr:f9085ea5bf9c8f2d7e5c64564234ab41b5bcd8cd61a58b59a3dde5cbb487721a",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Topaz_DustScratch_V2 extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.Topaz_DustScratch_V2";
  static readonly title = "Topaz_ Dust Scratch_ V2";
  static readonly description = `Remove dust and scratches from old photos
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description: "Apply film grain effect to the output"
  })
  declare grain: any;

  @prop({
    type: "int",
    default: 30,
    description: "Density of the grain particles from 0 to 60"
  })
  declare grain_density: any;

  @prop({
    type: "enum",
    default: "silver rich",
    values: ["silver rich", "gaussian", "grey"],
    description:
      "Type of grain to apply: silver rich (classic film look), gaussian (uniform noise), or grey (monochromatic grain)"
  })
  declare grain_model: any;

  @prop({
    type: "int",
    default: 1,
    description: "Size of the grain particles from 1 to 5"
  })
  declare grain_size: any;

  @prop({
    type: "int",
    default: 30,
    description: "Intensity of the grain effect from 0 to 60"
  })
  declare grain_strength: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image with dust, scratches, or surface imperfections to restore"
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "jpg",
    values: ["jpg", "png"],
    description: "Output format"
  })
  declare output_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const grain = Boolean(this.grain ?? false);
    const grainDensity = Number(this.grain_density ?? 30);
    const grainModel = String(this.grain_model ?? "silver rich");
    const grainSize = Number(this.grain_size ?? 1);
    const grainStrength = Number(this.grain_strength ?? 30);
    const outputFormat = String(this.output_format ?? "jpg");

    const args: Record<string, unknown> = {
      grain: grain,
      grain_density: grainDensity,
      grain_model: grainModel,
      grain_size: grainSize,
      grain_strength: grainStrength,
      output_format: outputFormat
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "topazlabs/dust-and-scratch-v2:f9848c7feb1604b71c4d09a70ccfde538c86e3c82dbdacecb93cdc2513163c44",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Topaz_Colorization extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.Topaz_Colorization";
  static readonly title = "Topaz_ Colorization";
  static readonly description = `Image colorization model from Topaz Labs
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description: "Grayscale or faded image to colorize"
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "jpg",
    values: ["jpg", "png"],
    description: "Output format"
  })
  declare output_format: any;

  @prop({
    type: "float",
    default: 0.2,
    description:
      "Color saturation level from 0 to 1. Higher values produce more vibrant colors."
  })
  declare saturation: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const outputFormat = String(this.output_format ?? "jpg");
    const saturation = Number(this.saturation ?? 0.2);

    const args: Record<string, unknown> = {
      output_format: outputFormat,
      saturation: saturation
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "topazlabs/image-colorization:52d9e774f4f6e15dacd9f794fd572a90b3ebcbe874720436fb25fc5fbd73f629",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class GPEN extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.GPEN";
  static readonly title = "G P E N";
  static readonly description = `Blind Face Restoration in the Wild
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: true,
    description:
      "whether the input image is broken, valid for Face Inpainting. When set to True, the output will be the 'fixed' image. When set to False, the image will randomly add brush strokes to simulate a broken image and the output will be broken + fixed image"
  })
  declare broken_image: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description: "whether outputs individual enhanced faces."
  })
  declare output_individual: any;

  @prop({
    type: "enum",
    default: "Face Restoration",
    values: ["Face Restoration", "Face Colorization", "Face Inpainting"],
    description: "Choose a task."
  })
  declare task: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const brokenImage = Boolean(this.broken_image ?? true);
    const outputIndividual = Boolean(this.output_individual ?? false);
    const task = String(this.task ?? "Face Restoration");

    const args: Record<string, unknown> = {
      broken_image: brokenImage,
      output_individual: outputIndividual,
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
      "yangxy/gpen:cf4e15a70049c0119884eb2906c8ae8807af8317bea98313fefd941e414d0c91",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class SUPIR extends ReplicateNode {
  static readonly nodeType = "replicate.image.enhance.SUPIR";
  static readonly title = "S U P I R";
  static readonly description = `Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This version uses LLaVA-13b for captioning.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "str",
    default:
      "Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations.",
    description: "Additive positive prompt for the inputs."
  })
  declare a_prompt: any;

  @prop({
    type: "enum",
    default: "Wavelet",
    values: ["None", "AdaIn", "Wavelet"],
    description: "Color Fixing Type.."
  })
  declare color_fix_type: any;

  @prop({
    type: "int",
    default: 50,
    description: "Number of steps for EDM Sampling Schedule."
  })
  declare edm_steps: any;

  @prop({ type: "image", default: "", description: "Low quality input image." })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Linearly (with sigma) increase CFG from 'spt_linear_CFG' to s_cfg."
  })
  declare linear_CFG: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Linearly (with sigma) increase s_stage2 from 'spt_linear_s_stage2' to s_stage2."
  })
  declare linear_s_stage2: any;

  @prop({
    type: "float",
    default: 1024,
    description: "Minimum resolution of output images."
  })
  declare min_size: any;

  @prop({
    type: "enum",
    default: "SUPIR-v0Q",
    values: ["SUPIR-v0Q", "SUPIR-v0F"],
    description:
      "Choose a model. SUPIR-v0Q is the default training settings with paper. SUPIR-v0F is high generalization and high image quality in most cases. Training with light degradation settings. Stage1 encoder of SUPIR-v0F remains more details when facing light degradations."
  })
  declare model_name: any;

  @prop({
    type: "str",
    default:
      "painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth",
    description: "Negative prompt for the inputs."
  })
  declare n_prompt: any;

  @prop({
    type: "float",
    default: 7.5,
    description: " Classifier-free guidance scale for prompts."
  })
  declare s_cfg: any;

  @prop({
    type: "float",
    default: 5,
    description: "Original churn hy-param of EDM."
  })
  declare s_churn: any;

  @prop({
    type: "float",
    default: 1.003,
    description: "Original noise hy-param of EDM."
  })
  declare s_noise: any;

  @prop({
    type: "int",
    default: -1,
    description: "Control Strength of Stage1 (negative means invalid)."
  })
  declare s_stage1: any;

  @prop({
    type: "float",
    default: 1,
    description: "Control Strength of Stage2."
  })
  declare s_stage2: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description: "Start point of linearly increasing CFG."
  })
  declare spt_linear_CFG: any;

  @prop({
    type: "float",
    default: 0,
    description: "Start point of linearly increasing s_stage2."
  })
  declare spt_linear_s_stage2: any;

  @prop({
    type: "int",
    default: 1,
    description: "Upsampling ratio of given inputs."
  })
  declare upscale: any;

  @prop({
    type: "bool",
    default: true,
    description: "Use LLaVA model to get captions."
  })
  declare use_llava: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aPrompt = String(
      this.a_prompt ??
        "Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations."
    );
    const colorFixType = String(this.color_fix_type ?? "Wavelet");
    const edmSteps = Number(this.edm_steps ?? 50);
    const linear_CFG = Boolean(this.linear_CFG ?? false);
    const linearSStage2 = Boolean(this.linear_s_stage2 ?? false);
    const minSize = Number(this.min_size ?? 1024);
    const modelName = String(this.model_name ?? "SUPIR-v0Q");
    const nPrompt = String(
      this.n_prompt ??
        "painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth"
    );
    const sCfg = Number(this.s_cfg ?? 7.5);
    const sChurn = Number(this.s_churn ?? 5);
    const sNoise = Number(this.s_noise ?? 1.003);
    const sStage1 = Number(this.s_stage1 ?? -1);
    const sStage2 = Number(this.s_stage2 ?? 1);
    const seed = Number(this.seed ?? -1);
    const sptLinear_CFG = Number(this.spt_linear_CFG ?? 1);
    const sptLinearSStage2 = Number(this.spt_linear_s_stage2 ?? 0);
    const upscale = Number(this.upscale ?? 1);
    const useLlava = Boolean(this.use_llava ?? true);

    const args: Record<string, unknown> = {
      a_prompt: aPrompt,
      color_fix_type: colorFixType,
      edm_steps: edmSteps,
      linear_CFG: linear_CFG,
      linear_s_stage2: linearSStage2,
      min_size: minSize,
      model_name: modelName,
      n_prompt: nPrompt,
      s_cfg: sCfg,
      s_churn: sChurn,
      s_noise: sNoise,
      s_stage1: sStage1,
      s_stage2: sStage2,
      seed: seed,
      spt_linear_CFG: sptLinear_CFG,
      spt_linear_s_stage2: sptLinearSStage2,
      upscale: upscale,
      use_llava: useLlava
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "cjwbw/supir:1302b550b4f7681da87ed0e405016d443fe1fafd64dabce6673401855a5039b5",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export const REPLICATE_IMAGE_ENHANCE_NODES: readonly NodeClass[] = [
  CodeFormer,
  Night_Enhancement,
  Supir_V0Q,
  Supir_V0F,
  Maxim,
  OldPhotosRestoration,
  Deoldify_Image,
  BigColor,
  NAFNet,
  InstructIR,
  AnimeSR,
  VQFR,
  Topaz_DustScratch_V2,
  Topaz_Colorization,
  GPEN,
  SUPIR
] as const;
