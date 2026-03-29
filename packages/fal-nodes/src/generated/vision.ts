import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl,
  coerceFalOutputForPropType,
} from "../fal-base.js";
import type { FalUnitPricing } from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class ArbiterImage extends FalNode {
  static readonly nodeType = "fal.vision.ArbiterImage";
  static readonly title = "Arbiter Image";
  static readonly description = `Arbiter provides comprehensive image analysis and quality metrics.
vision, analysis, quality, metrics, image-evaluation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "values": "list[dict[str, any]]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/arbiter/image",
    unitPrice: 0.00111,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "list[str]", default: [], description: "The measurements to use for the measurement." })
  declare measurements: any;

  @prop({ type: "list[ImageInput]", default: [], description: "The inputs to use for the measurement." })
  declare inputs: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const measurements = String(this.measurements ?? []);
    const field_inputs = String(this.inputs ?? []);

    const args: Record<string, unknown> = {
      "measurements": measurements,
      "inputs": field_inputs,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/arbiter/image", args);
    return {
      "values": coerceFalOutputForPropType("list[dict[str, any]]", (res as Record<string, unknown>)["values"]),
    };
  }
}

export class ArbiterImageImage extends FalNode {
  static readonly nodeType = "fal.vision.ArbiterImageImage";
  static readonly title = "Arbiter Image Image";
  static readonly description = `Arbiter measures similarity and alignment between reference images.
vision, similarity, comparison, image-matching, analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "values": "list[dict[str, any]]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/arbiter/image/image",
    unitPrice: 0.00111,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "list[str]", default: [], description: "The measurements to use for the measurement." })
  declare measurements: any;

  @prop({ type: "list[ReferenceImageInput]", default: [], description: "The inputs to use for the measurement." })
  declare inputs: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const measurements = String(this.measurements ?? []);
    const field_inputs = String(this.inputs ?? []);

    const args: Record<string, unknown> = {
      "measurements": measurements,
      "inputs": field_inputs,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/arbiter/image/image", args);
    return {
      "values": coerceFalOutputForPropType("list[dict[str, any]]", (res as Record<string, unknown>)["values"]),
    };
  }
}

export class ArbiterImageText extends FalNode {
  static readonly nodeType = "fal.vision.ArbiterImageText";
  static readonly title = "Arbiter Image Text";
  static readonly description = `Arbiter measures semantic alignment between images and text descriptions.
vision, alignment, similarity, text-image, analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "values": "list[dict[str, any]]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/arbiter/image/text",
    unitPrice: 0.00111,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "list[str]", default: [], description: "The measurements to use for the measurement." })
  declare measurements: any;

  @prop({ type: "list[SemanticImageInput]", default: [], description: "The inputs to use for the measurement." })
  declare inputs: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const measurements = String(this.measurements ?? []);
    const field_inputs = String(this.inputs ?? []);

    const args: Record<string, unknown> = {
      "measurements": measurements,
      "inputs": field_inputs,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/arbiter/image/text", args);
    return {
      "values": coerceFalOutputForPropType("list[dict[str, any]]", (res as Record<string, unknown>)["values"]),
    };
  }
}

export class GotOcrV2 extends FalNode {
  static readonly nodeType = "fal.vision.GotOcrV2";
  static readonly title = "Got Ocr V2";
  static readonly description = `GOT-OCR2 works on a wide range of tasks, including plain document OCR, scene text OCR, formatted document OCR, and even OCR for tables, charts, mathematical formulas, geometric shapes, molecular formulas and sheet music.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "outputs": "list[str]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/got-ocr/v2",
    unitPrice: 0.05,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "bool", default: false, description: "Generate the output in formatted mode." })
  declare do_format: any;

  @prop({ type: "bool", default: false, description: "Use provided images to generate a single output." })
  declare multi_page: any;

  @prop({ type: "list[image]", default: [], description: "URL of images." })
  declare input_images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const doFormat = Boolean(this.do_format ?? false);
    const multiPage = Boolean(this.multi_page ?? false);

    const args: Record<string, unknown> = {
      "do_format": doFormat,
      "multi_page": multiPage,
    };

    const inputImagesList = this.input_images as Record<string, unknown>[] | undefined;
    if (inputImagesList?.length) {
      const inputImagesUrls: string[] = [];
      for (const ref of inputImagesList) {
        if (isRefSet(ref)) { const u = await assetToFalUrl(apiKey, ref); if (u) inputImagesUrls.push(u); }
      }
      if (inputImagesUrls.length) args["input_image_urls"] = inputImagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/got-ocr/v2", args);
    return {
      "outputs": coerceFalOutputForPropType("list[str]", (res as Record<string, unknown>)["outputs"]),
    };
  }
}

export class Moondream2 extends FalNode {
  static readonly nodeType = "fal.vision.Moondream2";
  static readonly title = "Moondream2";
  static readonly description = `Moondream2 is a highly efficient open-source vision language model that combines powerful image understanding capabilities with a remarkably small footprint.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/moondream2",
    unitPrice: 0.01,
    billingUnit: "1000 characters",
    currency: "USD",
  };

  @prop({ type: "image", default: "", description: "URL of the image to be processed" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream2", args);
    return { output: (res as any).output ?? "" };
  }
}

export class Moondream2ObjectDetection extends FalNode {
  static readonly nodeType = "fal.vision.Moondream2ObjectDetection";
  static readonly title = "Moondream2 Object Detection";
  static readonly description = `Moondream2 is a highly efficient open-source vision language model that combines powerful image understanding capabilities with a remarkably small footprint.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "image": "image", "objects": "list[dict[str, any]]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/moondream2/object-detection",
    unitPrice: 0.02,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Object to be detected in the image" })
  declare object: any;

  @prop({ type: "image", default: "", description: "URL of the image to be processed" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const object = String(this.object ?? "");

    const args: Record<string, unknown> = {
      "object": object,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream2/object-detection", args);
    return {
      "image": coerceFalOutputForPropType("image", (res as Record<string, unknown>)["image"]),
      "objects": coerceFalOutputForPropType("list[dict[str, any]]", (res as Record<string, unknown>)["objects"]),
    };
  }
}

export class Moondream2PointObjectDetection extends FalNode {
  static readonly nodeType = "fal.vision.Moondream2PointObjectDetection";
  static readonly title = "Moondream2 Point Object Detection";
  static readonly description = `Moondream2 is a highly efficient open-source vision language model that combines powerful image understanding capabilities with a remarkably small footprint.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "image": "image", "objects": "list[dict[str, any]]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/moondream2/point-object-detection",
    unitPrice: 0.02,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Object to be detected in the image" })
  declare object: any;

  @prop({ type: "image", default: "", description: "URL of the image to be processed" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const object = String(this.object ?? "");

    const args: Record<string, unknown> = {
      "object": object,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream2/point-object-detection", args);
    return {
      "image": coerceFalOutputForPropType("image", (res as Record<string, unknown>)["image"]),
      "objects": coerceFalOutputForPropType("list[dict[str, any]]", (res as Record<string, unknown>)["objects"]),
    };
  }
}

export class Moondream2VisualQuery extends FalNode {
  static readonly nodeType = "fal.vision.Moondream2VisualQuery";
  static readonly title = "Moondream2 Visual Query";
  static readonly description = `Moondream2 is a highly efficient open-source vision language model that combines powerful image understanding capabilities with a remarkably small footprint.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/moondream2/visual-query",
    unitPrice: 0.01,
    billingUnit: "1000 characters",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Query to be asked in the image" })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "URL of the image to be processed" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream2/visual-query", args);
    return { output: (res as any).output ?? "" };
  }
}

export class Moondream3PreviewCaption extends FalNode {
  static readonly nodeType = "fal.vision.Moondream3PreviewCaption";
  static readonly title = "Moondream3 Preview Caption";
  static readonly description = `Moondream3 Preview [Caption]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "finish_reason": "str", "output": "str", "usage_info": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/moondream3-preview/caption",
    unitPrice: 1,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Nucleus sampling probability mass to use, between 0 and 1." })
  declare top_p: any;

  @prop({ type: "enum", default: "normal", values: ["short", "normal", "long"], description: "Length of the caption to generate" })
  declare length: any;

  @prop({ type: "str", default: "", description: "Sampling temperature to use, between 0 and 1. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. If not set, defaults to 0." })
  declare temperature: any;

  @prop({ type: "image", default: "", description: "URL of the image to be processed" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const topP = String(this.top_p ?? "");
    const length = String(this.length ?? "normal");
    const temperature = String(this.temperature ?? "");

    const args: Record<string, unknown> = {
      "top_p": topP,
      "length": length,
      "temperature": temperature,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream3-preview/caption", args);
    return {
      "finish_reason": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["finish_reason"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
      "usage_info": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["usage_info"]),
    };
  }
}

export class Moondream3PreviewDetect extends FalNode {
  static readonly nodeType = "fal.vision.Moondream3PreviewDetect";
  static readonly title = "Moondream3 Preview Detect";
  static readonly description = `Moondream3 Preview [Detect]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "image": "image", "finish_reason": "str", "objects": "list[Object]", "usage_info": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/moondream3-preview/detect",
    unitPrice: 1,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Object to be detected in the image" })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "Whether to preview the output" })
  declare preview: any;

  @prop({ type: "image", default: "", description: "URL of the image to be processed" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const preview = Boolean(this.preview ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "preview": preview,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream3-preview/detect", args);
    return {
      "image": coerceFalOutputForPropType("image", (res as Record<string, unknown>)["image"]),
      "finish_reason": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["finish_reason"]),
      "objects": coerceFalOutputForPropType("list[Object]", (res as Record<string, unknown>)["objects"]),
      "usage_info": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["usage_info"]),
    };
  }
}

export class Moondream3PreviewPoint extends FalNode {
  static readonly nodeType = "fal.vision.Moondream3PreviewPoint";
  static readonly title = "Moondream3 Preview Point";
  static readonly description = `Moondream3 Preview [Point]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "points": "list[Point]", "image": "image", "finish_reason": "str", "usage_info": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/moondream3-preview/point",
    unitPrice: 1,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Object to be located in the image" })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "Whether to preview the output" })
  declare preview: any;

  @prop({ type: "image", default: "", description: "URL of the image to be processed" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const preview = Boolean(this.preview ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "preview": preview,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream3-preview/point", args);
    return {
      "points": coerceFalOutputForPropType("list[Point]", (res as Record<string, unknown>)["points"]),
      "image": coerceFalOutputForPropType("image", (res as Record<string, unknown>)["image"]),
      "finish_reason": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["finish_reason"]),
      "usage_info": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["usage_info"]),
    };
  }
}

export class Moondream3PreviewQuery extends FalNode {
  static readonly nodeType = "fal.vision.Moondream3PreviewQuery";
  static readonly title = "Moondream3 Preview Query";
  static readonly description = `Moondream 3 Preview [Query]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "finish_reason": "str", "output": "str", "reasoning": "str", "usage_info": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/moondream3-preview/query",
    unitPrice: 1,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Query to be asked in the image" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "Nucleus sampling probability mass to use, between 0 and 1." })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "Sampling temperature to use, between 0 and 1. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. If not set, defaults to 0." })
  declare temperature: any;

  @prop({ type: "bool", default: true, description: "Whether to include detailed reasoning behind the answer" })
  declare reasoning: any;

  @prop({ type: "image", default: "", description: "URL of the image to be processed" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const topP = String(this.top_p ?? "");
    const temperature = String(this.temperature ?? "");
    const reasoning = Boolean(this.reasoning ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "top_p": topP,
      "temperature": temperature,
      "reasoning": reasoning,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream3-preview/query", args);
    return {
      "finish_reason": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["finish_reason"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
      "reasoning": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["reasoning"]),
      "usage_info": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["usage_info"]),
    };
  }
}

export class Sam3ImageEmbed extends FalNode {
  static readonly nodeType = "fal.vision.Sam3ImageEmbed";
  static readonly title = "Sam3 Image Embed";
  static readonly description = `Sam 3
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/sam-3/image/embed",
    unitPrice: 0.005,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "image", default: "", description: "URL of the image to embed." })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-3/image/embed", args);
    return { output: (res as any).output ?? "" };
  }
}

export class VideoUnderstanding extends FalNode {
  static readonly nodeType = "fal.vision.VideoUnderstanding";
  static readonly title = "Video Understanding";
  static readonly description = `A video understanding model to analyze video content and answer questions about what's happening in the video based on user prompts.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/video-understanding",
    unitPrice: 0.01,
    billingUnit: "5 seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The question or prompt about the video content." })
  declare prompt: any;

  @prop({ type: "video", default: "", description: "URL of the video to analyze" })
  declare video: any;

  @prop({ type: "bool", default: false, description: "Whether to request a more detailed analysis of the video" })
  declare detailed_analysis: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const detailedAnalysis = Boolean(this.detailed_analysis ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "detailed_analysis": detailedAnalysis,
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/video-understanding", args);
    return { output: (res as any).output ?? "" };
  }
}

export class XAilabNsfw extends FalNode {
  static readonly nodeType = "fal.vision.XAilabNsfw";
  static readonly title = "X Ailab Nsfw";
  static readonly description = `Predict whether an image is NSFW or SFW.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "has_nsfw_concepts": "list[bool]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/x-ailab/nsfw",
    unitPrice: 0.001,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "list[image]", default: [], description: "List of image URLs to check. If more than 10 images are provided, only the first 10 will be checked." })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {
    };

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) { const u = await assetToFalUrl(apiKey, ref); if (u) imagesUrls.push(u); }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/x-ailab/nsfw", args);
    return {
      "has_nsfw_concepts": coerceFalOutputForPropType("list[bool]", (res as Record<string, unknown>)["has_nsfw_concepts"]),
    };
  }
}

export class OpenrouterRouterVision extends FalNode {
  static readonly nodeType = "fal.vision.OpenrouterRouterVision";
  static readonly title = "Openrouter Router Vision";
  static readonly description = `OpenRouter [Vision]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "usage": "str", "output": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "openrouter/router/vision",
    unitPrice: 0.01,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Prompt to be used for the image" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "System prompt to provide context or instructions to the model" })
  declare system_prompt: any;

  @prop({ type: "bool", default: false, description: "Should reasoning be the part of the final answer." })
  declare reasoning: any;

  @prop({ type: "str", default: "", description: "Name of the model to use. Charged based on actual token usage." })
  declare model: any;

  @prop({ type: "str", default: "", description: "This sets the upper limit for the number of tokens the model can generate in response. It won't produce more than this limit. The maximum value is the context length minus the prompt length." })
  declare max_tokens: any;

  @prop({ type: "float", default: 1, description: "This setting influences the variety in the model's responses. Lower values lead to more predictable and typical responses, while higher values encourage more diverse and less common responses. At 0, the model always gives the same response for a given input." })
  declare temperature: any;

  @prop({ type: "list[image]", default: [], description: "List of image URLs to be processed" })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");
    const reasoning = Boolean(this.reasoning ?? false);
    const model = String(this.model ?? "");
    const maxTokens = String(this.max_tokens ?? "");
    const temperature = Number(this.temperature ?? 1);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "system_prompt": systemPrompt,
      "reasoning": reasoning,
      "model": model,
      "max_tokens": maxTokens,
      "temperature": temperature,
    };

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) { const u = await assetToFalUrl(apiKey, ref); if (u) imagesUrls.push(u); }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "openrouter/router/vision", args);
    return {
      "usage": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["usage"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
    };
  }
}

export class PerceptronIsaac01 extends FalNode {
  static readonly nodeType = "fal.vision.PerceptronIsaac01";
  static readonly title = "Perceptron Isaac01";
  static readonly description = `Isaac-01 is a multimodal vision-language model from Perceptron for various vision language tasks.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "usage": "str", "error": "str", "partial": "bool", "output": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "perceptron/isaac-01",
    unitPrice: 1,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Prompt to be used for the image" })
  declare prompt: any;

  @prop({ type: "enum", default: "text", values: ["text", "box", "point", "polygon"], description: "\nResponse style to be used for the image.\n\n- text: Model will output text. Good for descriptions and captioning.\n- box: Model will output a combination of text and bounding boxes. Good for\nlocalization.\n- point: Model will output a combination of text and points. Good for counting many\nobjects.\n- polygon: Model will output a combination of text and polygons. Good for granular\nsegmentation.\n" })
  declare response_style: any;

  @prop({ type: "image", default: "", description: "Image URL to be processed" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const responseStyle = String(this.response_style ?? "text");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "response_style": responseStyle,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "perceptron/isaac-01", args);
    return {
      "usage": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["usage"]),
      "error": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["error"]),
      "partial": coerceFalOutputForPropType("bool", (res as Record<string, unknown>)["partial"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
    };
  }
}

export class PerceptronIsaac01OpenaiV1ChatCompletions extends FalNode {
  static readonly nodeType = "fal.vision.PerceptronIsaac01OpenaiV1ChatCompletions";
  static readonly title = "Perceptron Isaac01 Openai V1 Chat Completions";
  static readonly description = `Isaac 0.1 [OpenAI Compatible Endpoint]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "perceptron/isaac-01/openai/v1/chat/completions",
    unitPrice: 1,
    billingUnit: "units",
    currency: "USD",
  };

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "perceptron/isaac-01/openai/v1/chat/completions", args);
    return { output: res };
  }
}

export const FAL_VISION_NODES: readonly NodeClass[] = [
  ArbiterImage,
  ArbiterImageImage,
  ArbiterImageText,
  GotOcrV2,
  Moondream2,
  Moondream2ObjectDetection,
  Moondream2PointObjectDetection,
  Moondream2VisualQuery,
  Moondream3PreviewCaption,
  Moondream3PreviewDetect,
  Moondream3PreviewPoint,
  Moondream3PreviewQuery,
  Sam3ImageEmbed,
  VideoUnderstanding,
  XAilabNsfw,
  OpenrouterRouterVision,
  PerceptronIsaac01,
  PerceptronIsaac01OpenaiV1ChatCompletions,
] as const;