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

export class BackgroundRemover_851 extends ReplicateNode {
  static readonly nodeType = "replicate.image.background.BackgroundRemover_851";
  static readonly title = "Background Remover_851";
  static readonly description = `Remove backgrounds from images.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "str",
    default: "rgba",
    description:
      "Background type: 'rgba', 'map', 'green', 'white', [R,G,B] array, 'blur', 'overlay', or path to an image."
  })
  declare background_type: any;

  @prop({
    type: "str",
    default: "png",
    description: "Output format (e.g., png, jpg). Defaults to png."
  })
  declare format: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description: "If True, remove the foreground instead of the background."
  })
  declare reverse: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Threshold for hard segmentation (0.0-1.0). If 0.0, uses soft alpha."
  })
  declare threshold: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const backgroundType = String(this.background_type ?? "rgba");
    const format = String(this.format ?? "png");
    const reverse = Boolean(this.reverse ?? false);
    const threshold = Number(this.threshold ?? 0);

    const args: Record<string, unknown> = {
      background_type: backgroundType,
      format: format,
      reverse: reverse,
      threshold: threshold
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Bria_RemoveBackground extends ReplicateNode {
  static readonly nodeType = "replicate.image.background.Bria_RemoveBackground";
  static readonly title = "Bria_ Remove Background";
  static readonly description = `Bria AI's remove background model
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
    description:
      "[DEPRECATED] Preserve partial alpha. No longer used in V2 API - use preserve_alpha instead."
  })
  declare preserve_partial_alpha: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const contentModeration = Boolean(this.content_moderation ?? false);
    const imageUrl = String(this.image_url ?? "");
    const preserveAlpha = Boolean(this.preserve_alpha ?? true);
    const preservePartialAlpha = Boolean(this.preserve_partial_alpha ?? true);

    const args: Record<string, unknown> = {
      content_moderation: contentModeration,
      image_url: imageUrl,
      preserve_alpha: preserveAlpha,
      preserve_partial_alpha: preservePartialAlpha
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bria/remove-background:5ecc270b34e9d8e1f007d9dbd3c724f0badf638f05ffaa0c5e0634ed64d3d378",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Bria_Eraser extends ReplicateNode {
  static readonly nodeType = "replicate.image.background.Bria_Eraser";
  static readonly title = "Bria_ Eraser";
  static readonly description = `SOTA Object removal, enables precise removal of unwanted objects from images while maintaining high-quality outputs. Trained exclusively on licensed data for safe and risk-free commercial use
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

  @prop({ type: "image", default: "", description: "Image file" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Image URL" })
  declare image_url: any;

  @prop({ type: "image", default: "", description: "Mask file" })
  declare mask: any;

  @prop({
    type: "enum",
    default: "manual",
    values: ["manual", "automatic"],
    description:
      "[DEPRECATED] Type of mask: manual or automatic. No longer used in V2 API."
  })
  declare mask_type: any;

  @prop({ type: "str", default: "", description: "Mask URL" })
  declare mask_url: any;

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
    const imageUrl = String(this.image_url ?? "");
    const maskType = String(this.mask_type ?? "manual");
    const maskUrl = String(this.mask_url ?? "");
    const preserveAlpha = Boolean(this.preserve_alpha ?? true);
    const sync = Boolean(this.sync ?? true);

    const args: Record<string, unknown> = {
      content_moderation: contentModeration,
      image_url: imageUrl,
      mask_type: maskType,
      mask_url: maskUrl,
      preserve_alpha: preserveAlpha,
      sync: sync
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
      "bria/eraser:2757d1ac2f1291af219f5f10e8ecba15e92e7c05253e2841295f3ba6bff6adc4",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Bria_GenerateBackground extends ReplicateNode {
  static readonly nodeType =
    "replicate.image.background.Bria_GenerateBackground";
  static readonly title = "Bria_ Generate Background";
  static readonly description = `Bria Background Generation allows for efficient swapping of backgrounds in images via text prompts or reference image, delivering realistic and polished results. Trained exclusively on licensed data for safe and risk-free commercial use
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "Text description of the new scene or background. Either bg_prompt or ref_image_url must be provided"
  })
  declare bg_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable content moderation"
  })
  declare content_moderation: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "[DEPRECATED] Enhance reference image. No longer used in V2 API."
  })
  declare enhance_ref_image: any;

  @prop({
    type: "bool",
    default: true,
    description: "[DEPRECATED] Use fast mode. No longer used in V2 API."
  })
  declare fast: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "[DEPRECATED] Force background removal. No longer used in V2 API."
  })
  declare force_rmbg: any;

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
    type: "bool",
    default: false,
    description: "Retain original input image size, otherwise scale to 1MP"
  })
  declare original_quality: any;

  @prop({
    type: "image",
    default: "",
    description: "Reference image file for background generation"
  })
  declare ref_image_file: any;

  @prop({
    type: "str",
    default: "",
    description:
      "URL of reference image for background generation. Either bg_prompt or ref_image_url must be provided"
  })
  declare ref_image_url: any;

  @prop({
    type: "bool",
    default: true,
    description: "Refine the prompt for optimal results"
  })
  declare refine_prompt: any;

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
    const bgPrompt = String(this.bg_prompt ?? "");
    const contentModeration = Boolean(this.content_moderation ?? false);
    const enhanceRefImage = Boolean(this.enhance_ref_image ?? true);
    const fast = Boolean(this.fast ?? true);
    const forceRmbg = Boolean(this.force_rmbg ?? false);
    const imageUrl = String(this.image_url ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const originalQuality = Boolean(this.original_quality ?? false);
    const refImageUrl = String(this.ref_image_url ?? "");
    const refinePrompt = Boolean(this.refine_prompt ?? true);
    const seed = Number(this.seed ?? -1);
    const sync = Boolean(this.sync ?? true);

    const args: Record<string, unknown> = {
      bg_prompt: bgPrompt,
      content_moderation: contentModeration,
      enhance_ref_image: enhanceRefImage,
      fast: fast,
      force_rmbg: forceRmbg,
      image_url: imageUrl,
      negative_prompt: negativePrompt,
      original_quality: originalQuality,
      ref_image_url: refImageUrl,
      refine_prompt: refinePrompt,
      seed: seed,
      sync: sync
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const refImageFileRef = this.ref_image_file as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(refImageFileRef)) {
      const refImageFileUrl = await assetToUrl(refImageFileRef!, apiKey);
      if (refImageFileUrl) args["ref_image_file"] = refImageFileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bria/generate-background:2555256f9a283b27092a99741d35251c180d6712e572d19a1c3912b45c80c995",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Bria_GenFill extends ReplicateNode {
  static readonly nodeType = "replicate.image.background.Bria_GenFill";
  static readonly title = "Bria_ Gen Fill";
  static readonly description = `Bria GenFill enables high-quality object addition or visual transformation. Trained exclusively on licensed data for safe and risk-free commercial use.
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

  @prop({ type: "image", default: "", description: "Image file" })
  declare image: any;

  @prop({ type: "image", default: "", description: "Mask file" })
  declare mask: any;

  @prop({
    type: "enum",
    default: "manual",
    values: ["manual", "automatic"],
    description:
      "[DEPRECATED] Type of mask: manual or automatic. No longer used in V2 API."
  })
  declare mask_type: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for image generation"
  })
  declare negative_prompt: any;

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
    const contentModeration = Boolean(this.content_moderation ?? false);
    const maskType = String(this.mask_type ?? "manual");
    const negativePrompt = String(this.negative_prompt ?? "");
    const preserveAlpha = Boolean(this.preserve_alpha ?? true);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const sync = Boolean(this.sync ?? true);

    const args: Record<string, unknown> = {
      content_moderation: contentModeration,
      mask_type: maskType,
      negative_prompt: negativePrompt,
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

    const maskRef = this.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = await assetToUrl(maskRef!, apiKey);
      if (maskUrl) args["mask"] = maskUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bria/genfill:e3811980fa5e3066d176f363a8fbc4961061ad041e635ac73542f2c0c5eb4f63",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Bria_FiboEdit extends ReplicateNode {
  static readonly nodeType = "replicate.image.background.Bria_FiboEdit";
  static readonly title = "Bria_ Fibo Edit";
  static readonly description = `FIBO-Edit brings the power of structured prompt generation to image editing
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "int", default: 0, description: "Guidance scale (1-10)" })
  declare guidance_scale: any;

  @prop({ type: "image", default: "", description: "Image file" })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text-based edit instruction (e.g., 'make the sky blue', 'add a cat')"
  })
  declare instruction: any;

  @prop({ type: "image", default: "", description: "Mask file" })
  declare mask: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for image generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A string containing the structured edit instruction in JSON format. Use this instead of instruction for precise, programmatic control."
  })
  declare structured_instruction: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const guidanceScale = Number(this.guidance_scale ?? 0);
    const instruction = String(this.instruction ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const structuredInstruction = String(this.structured_instruction ?? "");

    const args: Record<string, unknown> = {
      guidance_scale: guidanceScale,
      instruction: instruction,
      negative_prompt: negativePrompt,
      seed: seed,
      structured_instruction: structuredInstruction
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
      "bria/fibo-edit:588e6015f0020eedbd2a685ba273e47c8a21a52e3c623376cc7f136c8c6f8673",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class BackgroundRemover_Codeplug extends ReplicateNode {
  static readonly nodeType =
    "replicate.image.background.BackgroundRemover_Codeplug";
  static readonly title = "Background Remover_ Codeplug";
  static readonly description = `Remove background from image
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
      "codeplugtech/background_remover:37ff2aa89897c0de4a140a3d50969dc62b663ea467e1e2bde18008e3d3731b2b",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class BiRefNet extends ReplicateNode {
  static readonly nodeType = "replicate.image.background.BiRefNet";
  static readonly title = "Bi Ref Net";
  static readonly description = `Bilateral Reference for High-Resolution Dichotomous Image Segmentation (CAAI AIR 2024)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Resolution in WxH format, e.g., '1024x1024'"
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const resolution = String(this.resolution ?? "");

    const args: Record<string, unknown> = {
      resolution: resolution
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "men1scus/birefnet:f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class RembgEnhance extends ReplicateNode {
  static readonly nodeType = "replicate.image.background.RembgEnhance";
  static readonly title = "Rembg Enhance";
  static readonly description = `A background removal model enhanced with better matting
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
      "smoretalk/rembg-enhance:4067ee2a58f6c161d434a9c077cfa012820b8e076efa2772aa171e26557da919",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class RemoveBg extends ReplicateNode {
  static readonly nodeType = "replicate.image.background.RemoveBg";
  static readonly title = "Remove Bg";
  static readonly description = `Best Human detection and Object Detection Background removal.
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
      "zylim0702/remove_bg:35f26d202befb596c0bce411284649324b2b33dc1c7645a03155f3ec11585c59",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class RemoveBgLucataco extends ReplicateNode {
  static readonly nodeType = "replicate.image.background.RemoveBgLucataco";
  static readonly title = "Remove Bg Lucataco";
  static readonly description = `Remove background from an image
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description: "Remove background from this image"
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
      "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class RembgVideo extends ReplicateNode {
  static readonly nodeType = "replicate.image.background.RembgVideo";
  static readonly title = "Rembg Video";
  static readonly description = `Video Background Removal
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "str",
    default: "#FFFFFF",
    description: "Background color in hex format (e.g., '#FFFFFF' for white)"
  })
  declare background_color: any;

  @prop({
    type: "enum",
    default: "Normal",
    values: ["Fast", "Normal"],
    description: "Mode of operation"
  })
  declare mode: any;

  @prop({ type: "video", default: "", description: "Grayscale input image" })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const backgroundColor = String(this.background_color ?? "#FFFFFF");
    const mode = String(this.mode ?? "Normal");

    const args: Record<string, unknown> = {
      background_color: backgroundColor,
      mode: mode
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/rembg-video:c18392381d1b5410b5a76b9b0c58db132526d3f79fe602e04e0d80cb668df509",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export const REPLICATE_IMAGE_BACKGROUND_NODES: readonly NodeClass[] = [
  BackgroundRemover_851,
  Bria_RemoveBackground,
  Bria_Eraser,
  Bria_GenerateBackground,
  Bria_GenFill,
  Bria_FiboEdit,
  BackgroundRemover_Codeplug,
  BiRefNet,
  RembgEnhance,
  RemoveBg,
  RemoveBgLucataco,
  RembgVideo
] as const;
