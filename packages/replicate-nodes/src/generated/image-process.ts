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

export class RemoveBackground extends ReplicateNode {
  static readonly nodeType = "replicate.image.process.RemoveBackground";
  static readonly title = "Remove Background";
  static readonly description = `Remove images background
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input image" })
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
      "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class ModNet extends ReplicateNode {
  static readonly nodeType = "replicate.image.process.ModNet";
  static readonly title = "Mod Net";
  static readonly description = `A deep learning approach to remove background & adding new background image
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "input image" })
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
      "pollinations/modnet:da7d45f3b836795f945f221fc0b01a6d3ab7f5e163f13208948ad436001e2255",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class DD_Color extends ReplicateNode {
  static readonly nodeType = "replicate.image.process.DD_Color";
  static readonly title = "D D_ Color";
  static readonly description = `Towards Photo-Realistic Image Colorization via Dual Decoders
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Grayscale input image." })
  declare image: any;

  @prop({
    type: "enum",
    default: "large",
    values: ["large", "tiny"],
    description: "Choose the model size."
  })
  declare model_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const modelSize = String(this.model_size ?? "large");

    const args: Record<string, unknown> = {
      model_size: modelSize
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "piddnad/ddcolor:ca494ba129e44e45f661d6ece83c4c98a9a7c774309beca01429b58fce8aa695",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Magic_Style_Transfer extends ReplicateNode {
  static readonly nodeType = "replicate.image.process.Magic_Style_Transfer";
  static readonly title = "Magic_ Style_ Transfer";
  static readonly description = `Restyle an image with the style of another one. I strongly suggest to upscale the results with Clarity AI
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: true,
    description:
      "Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking."
  })
  declare apply_watermark: any;

  @prop({
    type: "str",
    default: "#A2A2A2",
    description:
      "When passing an image with alpha channel, it will be replaced with this color"
  })
  declare background_color: any;

  @prop({
    type: "float",
    default: 0.15,
    description: "The bigger this number is, the more ControlNet interferes"
  })
  declare condition_canny_scale: any;

  @prop({
    type: "float",
    default: 0.35,
    description: "The bigger this number is, the more ControlNet interferes"
  })
  declare condition_depth_scale: any;

  @prop({
    type: "float",
    default: 4,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for img2img or inpaint mode"
  })
  declare ip_image: any;

  @prop({ type: "float", default: 0.3, description: "IP Adapter strength." })
  declare ip_scale: any;

  @prop({
    type: "float",
    default: 0.9,
    description: "LoRA additive scale. Only applicable on trained models."
  })
  declare lora_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Replicate LoRA weights to use. Leave blank to use the default weights."
  })
  declare lora_weights: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output" })
  declare num_outputs: any;

  @prop({
    type: "str",
    default: "An astronaut riding a rainbow unicorn",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "If you want the image to have a solid margin. Scale of the solid margin. 1.0 means no resizing."
  })
  declare resizing_scale: any;

  @prop({
    type: "enum",
    default: "K_EULER",
    values: [
      "DDIM",
      "DPMSolverMultistep",
      "HeunDiscrete",
      "KarrasDPM",
      "K_EULER_ANCESTRAL",
      "K_EULER",
      "PNDM"
    ],
    description: "scheduler"
  })
  declare scheduler: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0.9,
    description:
      "When img2img is active, the denoising strength. 1 means total destruction of the input image."
  })
  declare strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const applyWatermark = Boolean(this.apply_watermark ?? true);
    const backgroundColor = String(this.background_color ?? "#A2A2A2");
    const conditionCannyScale = Number(this.condition_canny_scale ?? 0.15);
    const conditionDepthScale = Number(this.condition_depth_scale ?? 0.35);
    const guidanceScale = Number(this.guidance_scale ?? 4);
    const ipScale = Number(this.ip_scale ?? 0.3);
    const loraScale = Number(this.lora_scale ?? 0.9);
    const loraWeights = String(this.lora_weights ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(
      this.prompt ?? "An astronaut riding a rainbow unicorn"
    );
    const resizingScale = Number(this.resizing_scale ?? 1);
    const scheduler = String(this.scheduler ?? "K_EULER");
    const seed = Number(this.seed ?? -1);
    const strength = Number(this.strength ?? 0.9);

    const args: Record<string, unknown> = {
      apply_watermark: applyWatermark,
      background_color: backgroundColor,
      condition_canny_scale: conditionCannyScale,
      condition_depth_scale: conditionDepthScale,
      guidance_scale: guidanceScale,
      ip_scale: ipScale,
      lora_scale: loraScale,
      lora_weights: loraWeights,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      resizing_scale: resizingScale,
      scheduler: scheduler,
      seed: seed,
      strength: strength
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const ipImageRef = this.ip_image as Record<string, unknown> | undefined;
    if (isRefSet(ipImageRef)) {
      const ipImageUrl = await assetToUrl(ipImageRef!, apiKey);
      if (ipImageUrl) args["ip_image"] = ipImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fermatresearch/magic-style-transfer:3b5fa5d360c361090f11164292e45cc5d14cea8d089591d47c580cac9ec1c7ca",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class ObjectRemover extends ReplicateNode {
  static readonly nodeType = "replicate.image.process.ObjectRemover";
  static readonly title = "Object Remover";
  static readonly description = `ObjectRemover node
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Mask image" })
  declare mask_image: any;

  @prop({ type: "image", default: "", description: "Original input image" })
  declare org_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const maskImageRef = this.mask_image as Record<string, unknown> | undefined;
    if (isRefSet(maskImageRef)) {
      const maskImageUrl = await assetToUrl(maskImageRef!, apiKey);
      if (maskImageUrl) args["mask_image"] = maskImageUrl;
    }

    const orgImageRef = this.org_image as Record<string, unknown> | undefined;
    if (isRefSet(orgImageRef)) {
      const orgImageUrl = await assetToUrl(orgImageRef!, apiKey);
      if (orgImageUrl) args["org_image"] = orgImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "codeplugtech/object_remover:499559d430d997c34aa80142bfede2ad182b78e9dda9e8e03be5689d99969282",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Nano_Banana extends ReplicateNode {
  static readonly nodeType = "replicate.image.process.Nano_Banana";
  static readonly title = "Nano_ Banana";
  static readonly description = `Google's latest image editing model in Gemini 2.5
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "match_input_image",
    values: [
      "match_input_image",
      "1:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "9:16",
      "16:9",
      "21:9"
    ],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Input images to transform or use as reference (supports multiple images)"
  })
  declare image_input: any;

  @prop({
    type: "enum",
    default: "jpg",
    values: ["jpg", "png"],
    description: "Format of the output image"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "A text description of the image you want to generate"
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const outputFormat = String(this.output_format ?? "jpg");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      prompt: prompt
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/nano-banana:5bdc2c7cd642ae33611d8c33f79615f98ff02509ab8db9d8ec1cc6c36d378fba",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Expand_Image extends ReplicateNode {
  static readonly nodeType = "replicate.image.process.Expand_Image";
  static readonly title = "Expand_ Image";
  static readonly description = `Bria Expand expands images beyond their borders in high quality. Resizing the image by generating new pixels to expand to the desired aspect ratio. Trained exclusively on licensed data for safe and risk-free commercial use
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"],
    description:
      "Aspect ratio for expansion. Either aspect_ratio or canvas_size with original_image_size/location must be provided. Can be a predefined string like '1:1', '16:9' etc. or a custom float between 0.5 and 3.0"
  })
  declare aspect_ratio: any;

  @prop({
    type: "list[int]",
    default: [],
    description:
      "Desired output canvas dimensions [width, height]. Default [1000, 1000]. Max 5000x5000 pixels."
  })
  declare canvas_size: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable content moderation"
  })
  declare content_moderation: any;

  @prop({ type: "image", default: "", description: "Image file" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Image URL" })
  declare image_url: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for image generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "list[int]",
    default: [],
    description: "Position of original image in canvas [x, y]"
  })
  declare original_image_location: any;

  @prop({
    type: "list[int]",
    default: [],
    description: "Size of original image in canvas [width, height]"
  })
  declare original_image_size: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Preserve alpha channel in output. When true, maintains original transparency. When false, output is fully opaque."
  })
  declare preserve_alpha: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description: "Synchronous response mode"
  })
  declare sync: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const canvasSize = String(this.canvas_size ?? []);
    const contentModeration = Boolean(this.content_moderation ?? false);
    const imageUrl = String(this.image_url ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const originalImageLocation = String(this.original_image_location ?? []);
    const originalImageSize = String(this.original_image_size ?? []);
    const preserveAlpha = Boolean(this.preserve_alpha ?? true);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const sync = Boolean(this.sync ?? true);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      canvas_size: canvasSize,
      content_moderation: contentModeration,
      image_url: imageUrl,
      negative_prompt: negativePrompt,
      original_image_location: originalImageLocation,
      original_image_size: originalImageSize,
      preserve_alpha: preserveAlpha,
      prompt: prompt,
      seed: seed,
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
      "bria/expand-image:0d8d951a482d1f94125a7adbde188d7aa280a13fe0a444b9e786fce905e2af9a",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export const REPLICATE_IMAGE_PROCESS_NODES: readonly NodeClass[] = [
  RemoveBackground,
  ModNet,
  DD_Color,
  Magic_Style_Transfer,
  ObjectRemover,
  Nano_Banana,
  Expand_Image
] as const;
