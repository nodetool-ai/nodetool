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

export class DD_Color extends ReplicateNode {
  static readonly nodeType = "replicate.image_process.DD_Color";
  static readonly title = "D D_ Color";
  static readonly description = `Towards Photo-Realistic Image Colorization via Dual Decoders
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Grayscale input image." })
  declare image: any;

  @prop({ type: "enum", default: "large", values: ["large", "tiny"], description: "Choose the model size." })
  declare model_size: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const image = String(inputs.image ?? this.image ?? "");
    const modelSize = String(inputs.model_size ?? this.model_size ?? "large");

    const args: Record<string, unknown> = {
      "image": image,
      "model_size": modelSize,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "piddnad/ddcolor", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Expand_Image extends ReplicateNode {
  static readonly nodeType = "replicate.image_process.Expand_Image";
  static readonly title = "Expand_ Image";
  static readonly description = `Bria Expand expands images beyond their borders in high quality. Resizing the image by generating new pixels to expand to the desired aspect ratio. Trained exclusively on licensed data for safe and risk-free commercial use
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "Synchronous response mode" })
  declare sync: any;

  @prop({ type: "image", default: "", description: "Image file" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "Image URL" })
  declare image_url: any;

  @prop({ type: "any", default: "", description: "Desired output canvas dimensions [width, height]. Default [1000, 1000]" })
  declare canvas_size: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"], description: "Aspect ratio for expansion." })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: true, description: "Preserve alpha channel in output" })
  declare preserve_alpha: any;

  @prop({ type: "str", default: "", description: "Negative prompt for image generation" })
  declare negative_prompt: any;

  @prop({ type: "bool", default: false, description: "Enable content moderation" })
  declare content_moderation: any;

  @prop({ type: "any", default: "", description: "Size of original image in canvas [width, height]" })
  declare original_image_size: any;

  @prop({ type: "any", default: "", description: "Position of original image in canvas [x, y]" })
  declare original_image_location: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const sync = Boolean(inputs.sync ?? this.sync ?? true);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const imageUrl = String(inputs.image_url ?? this.image_url ?? "");
    const canvasSize = String(inputs.canvas_size ?? this.canvas_size ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const preserveAlpha = Boolean(inputs.preserve_alpha ?? this.preserve_alpha ?? true);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const contentModeration = Boolean(inputs.content_moderation ?? this.content_moderation ?? false);
    const originalImageSize = String(inputs.original_image_size ?? this.original_image_size ?? "");
    const originalImageLocation = String(inputs.original_image_location ?? this.original_image_location ?? "");

    const args: Record<string, unknown> = {
      "seed": seed,
      "sync": sync,
      "prompt": prompt,
      "image_url": imageUrl,
      "canvas_size": canvasSize,
      "aspect_ratio": aspectRatio,
      "preserve_alpha": preserveAlpha,
      "negative_prompt": negativePrompt,
      "content_moderation": contentModeration,
      "original_image_size": originalImageSize,
      "original_image_location": originalImageLocation,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "bria/expand-image", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Magic_Style_Transfer extends ReplicateNode {
  static readonly nodeType = "replicate.image_process.Magic_Style_Transfer";
  static readonly title = "Magic_ Style_ Transfer";
  static readonly description = `Restyle an image with the style of another one. I strongly suggest to upscale the results with Clarity AI
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "str", default: "An astronaut riding a rainbow unicorn", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "Input image for img2img or inpaint mode" })
  declare ip_image: any;

  @prop({ type: "float", default: 0.3, description: "IP Adapter strength." })
  declare ip_scale: any;

  @prop({ type: "float", default: 0.9, description: "When img2img is active, the denoising strength. 1 means total destruction of the input image." })
  declare strength: any;

  @prop({ type: "enum", default: "K_EULER", values: ["DDIM", "DPMSolverMultistep", "HeunDiscrete", "KarrasDPM", "K_EULER_ANCESTRAL", "K_EULER", "PNDM"], description: "scheduler" })
  declare scheduler: any;

  @prop({ type: "float", default: 0.9, description: "LoRA additive scale. Only applicable on trained models." })
  declare lora_scale: any;

  @prop({ type: "int", default: 1, description: "Number of images to output" })
  declare num_outputs: any;

  @prop({ type: "str", default: "", description: "Replicate LoRA weights to use. Leave blank to use the default weights." })
  declare lora_weights: any;

  @prop({ type: "float", default: 4, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "float", default: 1, description: "If you want the image to have a solid margin. Scale of the solid margin. 1.0 means no resizing." })
  declare resizing_scale: any;

  @prop({ type: "bool", default: true, description: "Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking." })
  declare apply_watermark: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "str", default: "#A2A2A2", description: "When passing an image with alpha channel, it will be replaced with this color" })
  declare background_color: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 0.15, description: "The bigger this number is, the more ControlNet interferes" })
  declare condition_canny_scale: any;

  @prop({ type: "float", default: 0.35, description: "The bigger this number is, the more ControlNet interferes" })
  declare condition_depth_scale: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "An astronaut riding a rainbow unicorn");
    const ipScale = Number(inputs.ip_scale ?? this.ip_scale ?? 0.3);
    const strength = Number(inputs.strength ?? this.strength ?? 0.9);
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "K_EULER");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 0.9);
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const loraWeights = String(inputs.lora_weights ?? this.lora_weights ?? "");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 4);
    const resizingScale = Number(inputs.resizing_scale ?? this.resizing_scale ?? 1);
    const applyWatermark = Boolean(inputs.apply_watermark ?? this.apply_watermark ?? true);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const backgroundColor = String(inputs.background_color ?? this.background_color ?? "#A2A2A2");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 30);
    const conditionCannyScale = Number(inputs.condition_canny_scale ?? this.condition_canny_scale ?? 0.15);
    const conditionDepthScale = Number(inputs.condition_depth_scale ?? this.condition_depth_scale ?? 0.35);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "ip_scale": ipScale,
      "strength": strength,
      "scheduler": scheduler,
      "lora_scale": loraScale,
      "num_outputs": numOutputs,
      "lora_weights": loraWeights,
      "guidance_scale": guidanceScale,
      "resizing_scale": resizingScale,
      "apply_watermark": applyWatermark,
      "negative_prompt": negativePrompt,
      "background_color": backgroundColor,
      "num_inference_steps": numInferenceSteps,
      "condition_canny_scale": conditionCannyScale,
      "condition_depth_scale": conditionDepthScale,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }

    const ipImageRef = inputs.ip_image as Record<string, unknown> | undefined;
    if (isRefSet(ipImageRef)) {
      const ipImageUrl = assetToUrl(ipImageRef!);
      if (ipImageUrl) args["ip_image"] = ipImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "batouresearch/magic-style-transfer", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class ModNet extends ReplicateNode {
  static readonly nodeType = "replicate.image_process.ModNet";
  static readonly title = "Mod Net";
  static readonly description = `A deep learning approach to remove background & adding new background image
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "input image" })
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

    const res = await replicateSubmit(apiKey, "pollinations/modnet", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Nano_Banana extends ReplicateNode {
  static readonly nodeType = "replicate.image_process.Nano_Banana";
  static readonly title = "Nano_ Banana";
  static readonly description = `Google's latest image editing model in Gemini 2.5
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "A text description of the image you want to generate" })
  declare prompt: any;

  @prop({ type: "any", default: [], description: "Input images to transform or use as reference (supports multiple images)" })
  declare image_input: any;

  @prop({ type: "enum", default: "match_input_image", values: ["match_input_image", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"], description: "Aspect ratio of the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "jpg", values: ["jpg", "png"], description: "Format of the output image" })
  declare output_format: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const imageInput = String(inputs.image_input ?? this.image_input ?? []);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "match_input_image");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "jpg");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_input": imageInput,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "google/nano-banana", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class ObjectRemover extends ReplicateNode {
  static readonly nodeType = "replicate.image_process.ObjectRemover";
  static readonly title = "Object Remover";
  static readonly description = `None
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Original input image" })
  declare org_image: any;

  @prop({ type: "image", default: "", description: "Mask image" })
  declare mask_image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const args: Record<string, unknown> = {
    };

    const orgImageRef = inputs.org_image as Record<string, unknown> | undefined;
    if (isRefSet(orgImageRef)) {
      const orgImageUrl = assetToUrl(orgImageRef!);
      if (orgImageUrl) args["org_image"] = orgImageUrl;
    }

    const maskImageRef = inputs.mask_image as Record<string, unknown> | undefined;
    if (isRefSet(maskImageRef)) {
      const maskImageUrl = assetToUrl(maskImageRef!);
      if (maskImageUrl) args["mask_image"] = maskImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "codeplugtech/object_remover", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class RemoveBackground extends ReplicateNode {
  static readonly nodeType = "replicate.image_process.RemoveBackground";
  static readonly title = "Remove Background";
  static readonly description = `Remove images background
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input image" })
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

    const res = await replicateSubmit(apiKey, "cjwbw/rembg", args);
    return { output: outputToImageRef(res.output) };
  }
}

export const REPLICATE_IMAGE_PROCESS_NODES: readonly NodeClass[] = [
  DD_Color,
  Expand_Image,
  Magic_Style_Transfer,
  ModNet,
  Nano_Banana,
  ObjectRemover,
  RemoveBackground,
] as const;