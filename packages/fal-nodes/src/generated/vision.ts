import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl
} from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class ArbiterImageText extends FalNode {
  static readonly nodeType = "fal.vision.ArbiterImageText";
  static readonly title = "Arbiter Image Text";
  static readonly description = `Arbiter measures semantic alignment between images and text descriptions.
vision, alignment, similarity, text-image, analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { values: "list[dict[str, any]]" };

  @prop({
    type: "list[str]",
    default: [],
    description: "The measurements to use for the measurement."
  })
  declare measurements: any;

  @prop({
    type: "list[SemanticImageInput]",
    default: [],
    description: "The inputs to use for the measurement."
  })
  declare inputs: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const measurements = String(this.measurements ?? []);
    const field_inputs = String(this.inputs ?? []);

    const args: Record<string, unknown> = {
      measurements: measurements,
      inputs: field_inputs
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/arbiter/image/text", args);
    return res as Record<string, unknown>;
  }
}

export class ArbiterImageImage extends FalNode {
  static readonly nodeType = "fal.vision.ArbiterImageImage";
  static readonly title = "Arbiter Image Image";
  static readonly description = `Arbiter measures similarity and alignment between reference images.
vision, similarity, comparison, image-matching, analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { values: "list[dict[str, any]]" };

  @prop({
    type: "list[str]",
    default: [],
    description: "The measurements to use for the measurement."
  })
  declare measurements: any;

  @prop({
    type: "list[ReferenceImageInput]",
    default: [],
    description: "The inputs to use for the measurement."
  })
  declare inputs: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const measurements = String(this.measurements ?? []);
    const field_inputs = String(this.inputs ?? []);

    const args: Record<string, unknown> = {
      measurements: measurements,
      inputs: field_inputs
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/arbiter/image/image", args);
    return res as Record<string, unknown>;
  }
}

export class ArbiterImage extends FalNode {
  static readonly nodeType = "fal.vision.ArbiterImage";
  static readonly title = "Arbiter Image";
  static readonly description = `Arbiter provides comprehensive image analysis and quality metrics.
vision, analysis, quality, metrics, image-evaluation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { values: "list[dict[str, any]]" };

  @prop({
    type: "list[str]",
    default: [],
    description: "The measurements to use for the measurement."
  })
  declare measurements: any;

  @prop({
    type: "list[ImageInput]",
    default: [],
    description: "The inputs to use for the measurement."
  })
  declare inputs: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const measurements = String(this.measurements ?? []);
    const field_inputs = String(this.inputs ?? []);

    const args: Record<string, unknown> = {
      measurements: measurements,
      inputs: field_inputs
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/arbiter/image", args);
    return res as Record<string, unknown>;
  }
}

export class Florence2RegionToDescription extends FalNode {
  static readonly nodeType = "fal.vision.Florence2RegionToDescription";
  static readonly title = "Florence2 Region To Description";
  static readonly description = `Florence-2 Large generates detailed descriptions of specific image regions.
vision, captioning, region-description, florence, ocr`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({ type: "str", default: "", description: "The user input coordinates" })
  declare region: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to be processed."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const region = String(this.region ?? "");

    const args: Record<string, unknown> = {
      region: region
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/florence-2-large/region-to-description",
      args
    );
    return { output: (res as any).output ?? "" };
  }
}

export class Florence2OCR extends FalNode {
  static readonly nodeType = "fal.vision.Florence2OCR";
  static readonly title = "Florence2 O C R";
  static readonly description = `Florence-2 Large performs optical character recognition to extract text from images.
vision, ocr, text-extraction, florence, reading`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to be processed."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/florence-2-large/ocr", args);
    return { output: (res as any).output ?? "" };
  }
}

export class Florence2MoreDetailedCaption extends FalNode {
  static readonly nodeType = "fal.vision.Florence2MoreDetailedCaption";
  static readonly title = "Florence2 More Detailed Caption";
  static readonly description = `Florence-2 Large generates highly detailed, comprehensive image captions.
vision, captioning, detailed-description, florence, analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to be processed."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/florence-2-large/more-detailed-caption",
      args
    );
    return { output: (res as any).output ?? "" };
  }
}

export class Florence2RegionToCategory extends FalNode {
  static readonly nodeType = "fal.vision.Florence2RegionToCategory";
  static readonly title = "Florence2 Region To Category";
  static readonly description = `Florence-2 Large classifies image regions into semantic categories.
vision, classification, region-analysis, florence, categorization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({ type: "str", default: "", description: "The user input coordinates" })
  declare region: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to be processed."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const region = String(this.region ?? "");

    const args: Record<string, unknown> = {
      region: region
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/florence-2-large/region-to-category",
      args
    );
    return { output: (res as any).output ?? "" };
  }
}

export class Florence2Caption extends FalNode {
  static readonly nodeType = "fal.vision.Florence2Caption";
  static readonly title = "Florence2 Caption";
  static readonly description = `Florence-2 Large generates concise, accurate captions for images.
vision, captioning, description, florence, analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to be processed."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/florence-2-large/caption",
      args
    );
    return { output: (res as any).output ?? "" };
  }
}

export class Florence2DetailedCaption extends FalNode {
  static readonly nodeType = "fal.vision.Florence2DetailedCaption";
  static readonly title = "Florence2 Detailed Caption";
  static readonly description = `Florence-2 Large generates detailed captions with rich contextual information.
vision, captioning, detailed-description, florence, analysis`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to be processed."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/florence-2-large/detailed-caption",
      args
    );
    return { output: (res as any).output ?? "" };
  }
}

export class Sam3ImageEmbed extends FalNode {
  static readonly nodeType = "fal.vision.Sam3ImageEmbed";
  static readonly title = "Sam3 Image Embed";
  static readonly description = `Sam 3
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to embed."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-3/image/embed", args);
    return { output: (res as any).output ?? "" };
  }
}

export class OpenrouterRouterVision extends FalNode {
  static readonly nodeType = "fal.vision.OpenrouterRouterVision";
  static readonly title = "Openrouter Router Vision";
  static readonly description = `OpenRouter [Vision]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { usage: "str", output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt to be used for the image"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Should reasoning be the part of the final answer."
  })
  declare reasoning: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to provide context or instructions to the model"
  })
  declare system_prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Name of the model to use. Charged based on actual token usage."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    description:
      "This sets the upper limit for the number of tokens the model can generate in response. It won't produce more than this limit. The maximum value is the context length minus the prompt length."
  })
  declare max_tokens: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "This setting influences the variety in the model's responses. Lower values lead to more predictable and typical responses, while higher values encourage more diverse and less common responses. At 0, the model always gives the same response for a given input."
  })
  declare temperature: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "List of image URLs to be processed"
  })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const reasoning = Boolean(this.reasoning ?? false);
    const systemPrompt = String(this.system_prompt ?? "");
    const model = String(this.model ?? "");
    const maxTokens = String(this.max_tokens ?? "");
    const temperature = Number(this.temperature ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      reasoning: reasoning,
      system_prompt: systemPrompt,
      model: model,
      max_tokens: maxTokens,
      temperature: temperature
    };

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) imagesUrls.push(u);
        }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "openrouter/router/vision", args);
    return res as Record<string, unknown>;
  }
}

export class Moondream3PreviewDetect extends FalNode {
  static readonly nodeType = "fal.vision.Moondream3PreviewDetect";
  static readonly title = "Moondream3 Preview Detect";
  static readonly description = `Moondream3 Preview [Detect]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    image: "image",
    finish_reason: "str",
    objects: "list[Object]",
    usage_info: "str"
  };

  @prop({
    type: "str",
    default: "",
    description: "Object to be detected in the image"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to preview the output"
  })
  declare preview: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be processed"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const preview = Boolean(this.preview ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      preview: preview
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/moondream3-preview/detect",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class Moondream3PreviewPoint extends FalNode {
  static readonly nodeType = "fal.vision.Moondream3PreviewPoint";
  static readonly title = "Moondream3 Preview Point";
  static readonly description = `Moondream3 Preview [Point]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    points: "list[Point]",
    image: "image",
    finish_reason: "str",
    usage_info: "str"
  };

  @prop({
    type: "str",
    default: "",
    description: "Object to be located in the image"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to preview the output"
  })
  declare preview: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be processed"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const preview = Boolean(this.preview ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      preview: preview
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/moondream3-preview/point",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class Moondream3PreviewQuery extends FalNode {
  static readonly nodeType = "fal.vision.Moondream3PreviewQuery";
  static readonly title = "Moondream3 Preview Query";
  static readonly description = `Moondream 3 Preview [Query]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    finish_reason: "str",
    output: "str",
    reasoning: "str",
    usage_info: "str"
  };

  @prop({
    type: "str",
    default: "",
    description: "Query to be asked in the image"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Nucleus sampling probability mass to use, between 0 and 1."
  })
  declare top_p: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Sampling temperature to use, between 0 and 1. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. If not set, defaults to 0."
  })
  declare temperature: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to include detailed reasoning behind the answer"
  })
  declare reasoning: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be processed"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const topP = String(this.top_p ?? "");
    const temperature = String(this.temperature ?? "");
    const reasoning = Boolean(this.reasoning ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      top_p: topP,
      temperature: temperature,
      reasoning: reasoning
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/moondream3-preview/query",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class Moondream3PreviewCaption extends FalNode {
  static readonly nodeType = "fal.vision.Moondream3PreviewCaption";
  static readonly title = "Moondream3 Preview Caption";
  static readonly description = `Moondream3 Preview [Caption]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    finish_reason: "str",
    output: "str",
    usage_info: "str"
  };

  @prop({
    type: "str",
    default: "",
    description: "Nucleus sampling probability mass to use, between 0 and 1."
  })
  declare top_p: any;

  @prop({
    type: "enum",
    default: "normal",
    values: ["short", "normal", "long"],
    description: "Length of the caption to generate"
  })
  declare length: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Sampling temperature to use, between 0 and 1. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. If not set, defaults to 0."
  })
  declare temperature: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be processed"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const topP = String(this.top_p ?? "");
    const length = String(this.length ?? "normal");
    const temperature = String(this.temperature ?? "");

    const args: Record<string, unknown> = {
      top_p: topP,
      length: length,
      temperature: temperature
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/moondream3-preview/caption",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class PerceptronIsaac01OpenaiV1ChatCompletions extends FalNode {
  static readonly nodeType =
    "fal.vision.PerceptronIsaac01OpenaiV1ChatCompletions";
  static readonly title = "Perceptron Isaac01 Openai V1 Chat Completions";
  static readonly description = `Isaac 0.1 [OpenAI Compatible Endpoint]
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "perceptron/isaac-01/openai/v1/chat/completions",
      args
    );
    return { output: res };
  }
}

export class PerceptronIsaac01 extends FalNode {
  static readonly nodeType = "fal.vision.PerceptronIsaac01";
  static readonly title = "Perceptron Isaac01";
  static readonly description = `Isaac-01 is a multimodal vision-language model from Perceptron for various vision language tasks.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    usage: "str",
    error: "str",
    partial: "bool",
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    description: "Prompt to be used for the image"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "text",
    values: ["text", "box", "point", "polygon"],
    description:
      "\nResponse style to be used for the image.\n\n- text: Model will output text. Good for descriptions and captioning.\n- box: Model will output a combination of text and bounding boxes. Good for\nlocalization.\n- point: Model will output a combination of text and points. Good for counting many\nobjects.\n- polygon: Model will output a combination of text and polygons. Good for granular\nsegmentation.\n"
  })
  declare response_style: any;

  @prop({
    type: "image",
    default: "",
    description: "Image URL to be processed"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const responseStyle = String(this.response_style ?? "text");

    const args: Record<string, unknown> = {
      prompt: prompt,
      response_style: responseStyle
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "perceptron/isaac-01", args);
    return res as Record<string, unknown>;
  }
}

export class XAilabNsfw extends FalNode {
  static readonly nodeType = "fal.vision.XAilabNsfw";
  static readonly title = "X Ailab Nsfw";
  static readonly description = `Predict whether an image is NSFW or SFW.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { has_nsfw_concepts: "list[bool]" };

  @prop({
    type: "list[image]",
    default: [],
    description:
      "List of image URLs to check. If more than 10 images are provided, only the first 10 will be checked."
  })
  declare images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) imagesUrls.push(u);
        }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/x-ailab/nsfw", args);
    return res as Record<string, unknown>;
  }
}

export class VideoUnderstanding extends FalNode {
  static readonly nodeType = "fal.vision.VideoUnderstanding";
  static readonly title = "Video Understanding";
  static readonly description = `A video understanding model to analyze video content and answer questions about what's happening in the video based on user prompts.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "The question or prompt about the video content."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the video to analyze"
  })
  declare video: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to request a more detailed analysis of the video"
  })
  declare detailed_analysis: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const detailedAnalysis = Boolean(this.detailed_analysis ?? false);

    const args: Record<string, unknown> = {
      prompt: prompt,
      detailed_analysis: detailedAnalysis
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

export class Moondream2VisualQuery extends FalNode {
  static readonly nodeType = "fal.vision.Moondream2VisualQuery";
  static readonly title = "Moondream2 Visual Query";
  static readonly description = `Moondream2 is a highly efficient open-source vision language model that combines powerful image understanding capabilities with a remarkably small footprint.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Query to be asked in the image"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be processed"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream2/visual-query", args);
    return { output: (res as any).output ?? "" };
  }
}

export class Moondream2 extends FalNode {
  static readonly nodeType = "fal.vision.Moondream2";
  static readonly title = "Moondream2";
  static readonly description = `Moondream2 is a highly efficient open-source vision language model that combines powerful image understanding capabilities with a remarkably small footprint.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be processed"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream2", args);
    return { output: (res as any).output ?? "" };
  }
}

export class Moondream2PointObjectDetection extends FalNode {
  static readonly nodeType = "fal.vision.Moondream2PointObjectDetection";
  static readonly title = "Moondream2 Point Object Detection";
  static readonly description = `Moondream2 is a highly efficient open-source vision language model that combines powerful image understanding capabilities with a remarkably small footprint.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    image: "image",
    objects: "list[dict[str, any]]"
  };

  @prop({
    type: "str",
    default: "",
    description: "Object to be detected in the image"
  })
  declare object: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be processed"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const object = String(this.object ?? "");

    const args: Record<string, unknown> = {
      object: object
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/moondream2/point-object-detection",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class Moondream2ObjectDetection extends FalNode {
  static readonly nodeType = "fal.vision.Moondream2ObjectDetection";
  static readonly title = "Moondream2 Object Detection";
  static readonly description = `Moondream2 is a highly efficient open-source vision language model that combines powerful image understanding capabilities with a remarkably small footprint.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    image: "image",
    objects: "list[dict[str, any]]"
  };

  @prop({
    type: "str",
    default: "",
    description: "Object to be detected in the image"
  })
  declare object: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be processed"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const object = String(this.object ?? "");

    const args: Record<string, unknown> = {
      object: object
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/moondream2/object-detection",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class GotOcrV2 extends FalNode {
  static readonly nodeType = "fal.vision.GotOcrV2";
  static readonly title = "Got Ocr V2";
  static readonly description = `GOT-OCR2 works on a wide range of tasks, including plain document OCR, scene text OCR, formatted document OCR, and even OCR for tables, charts, mathematical formulas, geometric shapes, molecular formulas and sheet music.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { outputs: "list[str]" };

  @prop({
    type: "bool",
    default: false,
    description: "Generate the output in formatted mode."
  })
  declare do_format: any;

  @prop({
    type: "bool",
    default: false,
    description: "Use provided images to generate a single output."
  })
  declare multi_page: any;

  @prop({ type: "list[image]", default: [], description: "URL of images." })
  declare input_images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const doFormat = Boolean(this.do_format ?? false);
    const multiPage = Boolean(this.multi_page ?? false);

    const args: Record<string, unknown> = {
      do_format: doFormat,
      multi_page: multiPage
    };

    const inputImagesList = this.input_images as
      | Record<string, unknown>[]
      | undefined;
    if (inputImagesList?.length) {
      const inputImagesUrls: string[] = [];
      for (const ref of inputImagesList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) inputImagesUrls.push(u);
        }
      }
      if (inputImagesUrls.length) args["input_image_urls"] = inputImagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/got-ocr/v2", args);
    return res as Record<string, unknown>;
  }
}

export class MoondreamNextBatch extends FalNode {
  static readonly nodeType = "fal.vision.MoondreamNextBatch";
  static readonly title = "Moondream Next Batch";
  static readonly description = `MoonDreamNext Batch is a multimodal vision-language model for batch captioning.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { outputs: "list[str]", captions_file: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Single prompt to apply to all images"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "List of image URLs to be processed (maximum 32 images)"
  })
  declare images_data: any;

  @prop({
    type: "int",
    default: 64,
    description: "Maximum number of tokens to generate"
  })
  declare max_tokens: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const maxTokens = Number(this.max_tokens ?? 64);

    const args: Record<string, unknown> = {
      prompt: prompt,
      max_tokens: maxTokens
    };

    const imagesDataRef = this.images_data as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imagesDataRef)) {
      const imagesDataUrl =
        (await imageToDataUrl(imagesDataRef!)) ??
        (await assetToFalUrl(apiKey, imagesDataRef!));
      if (imagesDataUrl) args["images_data_url"] = imagesDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream-next/batch", args);
    return res as Record<string, unknown>;
  }
}

export class Sa2va4bVideo extends FalNode {
  static readonly nodeType = "fal.vision.Sa2va4bVideo";
  static readonly title = "Sa2va4b Video";
  static readonly description = `Sa2VA is an MLLM capable of question answering, visual prompt understanding, and dense object segmentation at both image and video levels
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { masks: "list[File]", output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt to be used for the chat completion"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the input video."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to sample from the video. If not provided, all frames are sampled."
  })
  declare num_frames_to_sample: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numFramesToSample = Number(this.num_frames_to_sample ?? 0);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_frames_to_sample: numFramesToSample
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sa2va/4b/video", args);
    return res as Record<string, unknown>;
  }
}

export class Sa2va8bVideo extends FalNode {
  static readonly nodeType = "fal.vision.Sa2va8bVideo";
  static readonly title = "Sa2va8b Video";
  static readonly description = `Sa2VA is an MLLM capable of question answering, visual prompt understanding, and dense object segmentation at both image and video levels
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { masks: "list[File]", output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt to be used for the chat completion"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description: "The URL of the input video."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Number of frames to sample from the video. If not provided, all frames are sampled."
  })
  declare num_frames_to_sample: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numFramesToSample = Number(this.num_frames_to_sample ?? 0);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_frames_to_sample: numFramesToSample
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sa2va/8b/video", args);
    return res as Record<string, unknown>;
  }
}

export class Sa2va4bImage extends FalNode {
  static readonly nodeType = "fal.vision.Sa2va4bImage";
  static readonly title = "Sa2va4b Image";
  static readonly description = `Sa2VA is an MLLM capable of question answering, visual prompt understanding, and dense object segmentation at both image and video levels
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { masks: "list[Image]", output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt to be used for the chat completion"
  })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "Url for the Input image." })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sa2va/4b/image", args);
    return res as Record<string, unknown>;
  }
}

export class Sa2va8bImage extends FalNode {
  static readonly nodeType = "fal.vision.Sa2va8bImage";
  static readonly title = "Sa2va8b Image";
  static readonly description = `Sa2VA is an MLLM capable of question answering, visual prompt understanding, and dense object segmentation at both image and video levels
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { masks: "list[Image]", output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt to be used for the chat completion"
  })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "Url for the Input image." })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sa2va/8b/image", args);
    return res as Record<string, unknown>;
  }
}

export class MoondreamNext extends FalNode {
  static readonly nodeType = "fal.vision.MoondreamNext";
  static readonly title = "Moondream Next";
  static readonly description = `MoonDreamNext is a multimodal vision-language model for captioning, gaze detection, bbox detection, point detection, and more.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({ type: "str", default: "", description: "Prompt for query task" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "caption",
    values: ["caption", "query"],
    description: "Type of task to perform"
  })
  declare task_type: any;

  @prop({
    type: "int",
    default: 64,
    description: "Maximum number of tokens to generate"
  })
  declare max_tokens: any;

  @prop({
    type: "image",
    default: "",
    description: "Image URL to be processed"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const taskType = String(this.task_type ?? "caption");
    const maxTokens = Number(this.max_tokens ?? 64);

    const args: Record<string, unknown> = {
      prompt: prompt,
      task_type: taskType,
      max_tokens: maxTokens
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream-next", args);
    return { output: (res as any).output ?? "" };
  }
}

export class ImageutilsNsfw extends FalNode {
  static readonly nodeType = "fal.vision.ImageutilsNsfw";
  static readonly title = "Imageutils Nsfw";
  static readonly description = `Predict the probability of an image being NSFW.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { nsfw_probability: "float" };

  @prop({ type: "image", default: "", description: "Input image url." })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/imageutils/nsfw", args);
    return res as Record<string, unknown>;
  }
}

export class MoondreamBatched extends FalNode {
  static readonly nodeType = "fal.vision.MoondreamBatched";
  static readonly title = "Moondream Batched";
  static readonly description = `Answer questions from the images.
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    filenames: "list[str]",
    outputs: "list[str]",
    partial: "bool",
    timings: "dict[str, any]"
  };

  @prop({
    type: "enum",
    default: "vikhyatk/moondream2",
    values: ["vikhyatk/moondream2", "fal-ai/moondream2-docci"],
    description: "Model ID to use for inference"
  })
  declare model_id: any;

  @prop({
    type: "float",
    default: 1,
    description: "Repetition penalty for sampling"
  })
  declare repetition_penalty: any;

  @prop({
    type: "list[MoondreamInputParam]",
    default: [],
    description: "List of input prompts and image URLs"
  })
  declare inputs: any;

  @prop({
    type: "int",
    default: 64,
    description: "Maximum number of new tokens to generate"
  })
  declare max_tokens: any;

  @prop({
    type: "float",
    default: 0.2,
    description: "Temperature for sampling"
  })
  declare temperature: any;

  @prop({ type: "float", default: 1, description: "Top P for sampling" })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const modelId = String(this.model_id ?? "vikhyatk/moondream2");
    const repetitionPenalty = Number(this.repetition_penalty ?? 1);
    const field_inputs = String(this.inputs ?? []);
    const maxTokens = Number(this.max_tokens ?? 64);
    const temperature = Number(this.temperature ?? 0.2);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      model_id: modelId,
      repetition_penalty: repetitionPenalty,
      inputs: field_inputs,
      max_tokens: maxTokens,
      temperature: temperature,
      top_p: topP
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/moondream/batched", args);
    return res as Record<string, unknown>;
  }
}

export class LlavaNext extends FalNode {
  static readonly nodeType = "fal.vision.LlavaNext";
  static readonly title = "Llava Next";
  static readonly description = `Vision
vision, analysis, image-understanding, detection`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { partial: "bool", output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt to be used for the image"
  })
  declare prompt: any;

  @prop({ type: "float", default: 1, description: "Top P for sampling" })
  declare top_p: any;

  @prop({
    type: "int",
    default: 64,
    description: "Maximum number of tokens to generate"
  })
  declare max_tokens: any;

  @prop({
    type: "float",
    default: 0.2,
    description: "Temperature for sampling"
  })
  declare temperature: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the image to be processed"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const topP = Number(this.top_p ?? 1);
    const maxTokens = Number(this.max_tokens ?? 64);
    const temperature = Number(this.temperature ?? 0.2);

    const args: Record<string, unknown> = {
      prompt: prompt,
      top_p: topP,
      max_tokens: maxTokens,
      temperature: temperature
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/llava-next", args);
    return res as Record<string, unknown>;
  }
}

export const FAL_VISION_NODES: readonly NodeClass[] = [
  ArbiterImageText,
  ArbiterImageImage,
  ArbiterImage,
  Florence2RegionToDescription,
  Florence2OCR,
  Florence2MoreDetailedCaption,
  Florence2RegionToCategory,
  Florence2Caption,
  Florence2DetailedCaption,
  Sam3ImageEmbed,
  OpenrouterRouterVision,
  Moondream3PreviewDetect,
  Moondream3PreviewPoint,
  Moondream3PreviewQuery,
  Moondream3PreviewCaption,
  PerceptronIsaac01OpenaiV1ChatCompletions,
  PerceptronIsaac01,
  XAilabNsfw,
  VideoUnderstanding,
  Moondream2VisualQuery,
  Moondream2,
  Moondream2PointObjectDetection,
  Moondream2ObjectDetection,
  GotOcrV2,
  MoondreamNextBatch,
  Sa2va4bVideo,
  Sa2va8bVideo,
  Sa2va4bImage,
  Sa2va8bImage,
  MoondreamNext,
  ImageutilsNsfw,
  MoondreamBatched,
  LlavaNext
] as const;
