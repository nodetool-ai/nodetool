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

export class BriaFibo_bbqGenerate extends FalNode {
  static readonly nodeType = "fal.text_to_image.BriaFibo_bbqGenerate";
  static readonly title = "Bria Fibo_bbq Generate";
  static readonly description = `A preview to the next level of control of Text-to-Image models.
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[dict[str, any]]", "image": "image", "structured_prompt": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "bria/fibo-bbq-preview/generate",
    unitPrice: 0.04,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Prompt for image generation." })
  declare prompt: any;

  @prop({ type: "int", default: 50, description: "Number of inference steps." })
  declare steps_num: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"], description: "Aspect ratio. Options: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9" })
  declare aspect_ratio: any;

  @prop({ type: "image", default: "", description: "Reference image (file or URL)." })
  declare image: any;

  @prop({ type: "bool", default: false, description: "If true, returns the image directly in the response (increases latency)." })
  declare sync_mode: any;

  @prop({ type: "int", default: 5, description: "Guidance scale for text." })
  declare guidance_scale: any;

  @prop({ type: "int", default: 5555, description: "Random seed for reproducibility." })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Negative prompt for image generation." })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", description: "The structured prompt to generate an image from." })
  declare structured_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const stepsNum = Number(this.steps_num ?? 50);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const seed = Number(this.seed ?? 5555);
    const negativePrompt = String(this.negative_prompt ?? "");
    const structuredPrompt = String(this.structured_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "steps_num": stepsNum,
      "aspect_ratio": aspectRatio,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "negative_prompt": negativePrompt,
      "structured_prompt": structuredPrompt,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "bria/fibo_bbq/generate", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "image": { type: "image", uri: _url } };
  }
}

export class BriaFiboLiteGenerate extends FalNode {
  static readonly nodeType = "fal.text_to_image.BriaFiboLiteGenerate";
  static readonly title = "Bria Fibo Lite Generate";
  static readonly description = `Fibo Lite
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[dict[str, any]]", "image": "image", "structured_prompt": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "bria/fibo-lite/generate",
    unitPrice: 0.036,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"], description: "Aspect ratio. Options: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9" })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 8, description: "Number of inference steps." })
  declare steps_num: any;

  @prop({ type: "image", default: "", description: "Input image URL" })
  declare image: any;

  @prop({ type: "bool", default: false, description: "If true, returns the image directly in the response (increases latency)." })
  declare sync_mode: any;

  @prop({ type: "int", default: 7, description: "Seed for the random number generator." })
  declare seed: any;

  @prop({ type: "str", default: "", description: "The structured prompt to generate." })
  declare structured_prompt: any;

  @prop({ type: "str", default: "", description: "Negative prompt for image generation." })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const stepsNum = Number(this.steps_num ?? 8);
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = Number(this.seed ?? 7);
    const structuredPrompt = String(this.structured_prompt ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "steps_num": stepsNum,
      "sync_mode": syncMode,
      "seed": seed,
      "structured_prompt": structuredPrompt,
      "negative_prompt": negativePrompt,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "bria/fibo-lite/generate", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "image": { type: "image", uri: _url } };
  }
}

export class BriaFiboGenerate extends FalNode {
  static readonly nodeType = "fal.text_to_image.BriaFiboGenerate";
  static readonly title = "Bria Fibo Generate";
  static readonly description = `Fibo
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[dict[str, any]]", "image": "image", "structured_prompt": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "bria/fibo/generate",
    unitPrice: 0.04,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Prompt for image generation." })
  declare prompt: any;

  @prop({ type: "enum", default: "1MP", values: ["1MP", "4MP"], description: "Output image resolution" })
  declare resolution: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"], description: "Aspect ratio. Options: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9" })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 50, description: "Number of inference steps." })
  declare steps_num: any;

  @prop({ type: "image", default: "", description: "Reference image (file or URL)." })
  declare image: any;

  @prop({ type: "bool", default: false, description: "If true, returns the image directly in the response (increases latency)." })
  declare sync_mode: any;

  @prop({ type: "int", default: 5555, description: "Random seed for reproducibility." })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Negative prompt for image generation." })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", description: "The structured prompt to generate an image from." })
  declare structured_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1MP");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const stepsNum = Number(this.steps_num ?? 50);
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = Number(this.seed ?? 5555);
    const negativePrompt = String(this.negative_prompt ?? "");
    const structuredPrompt = String(this.structured_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "resolution": resolution,
      "aspect_ratio": aspectRatio,
      "steps_num": stepsNum,
      "sync_mode": syncMode,
      "seed": seed,
      "negative_prompt": negativePrompt,
      "structured_prompt": structuredPrompt,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "bria/fibo/generate", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "image": { type: "image", uri: _url } };
  }
}

export class BriaTextToImage32 extends FalNode {
  static readonly nodeType = "fal.text_to_image.BriaTextToImage32";
  static readonly title = "Bria Text To Image32";
  static readonly description = `Bria’s Text-to-Image model, trained exclusively on licensed data for safe and risk-free commercial use. Excels in Text-Rendering and Aesthetics.
image generation`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "image": "image" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "bria/text-to-image/3.2",
    unitPrice: 0.04,
    billingUnit: "generations",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Prompt for image generation." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"], description: "Aspect ratio. Options: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9" })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: true, description: "Whether to improve the prompt." })
  declare prompt_enhancer: any;

  @prop({ type: "bool", default: false, description: "If true, returns the image directly in the response (increases latency)." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "Whether to truncate the prompt." })
  declare truncate_prompt: any;

  @prop({ type: "float", default: 5, description: "Guidance scale for text." })
  declare guidance_scale: any;

  @prop({ type: "int", default: 30, description: "Number of inference steps." })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 5555, description: "Random seed for reproducibility." })
  declare seed: any;

  @prop({ type: "str", default: "Logo,Watermark,Ugly,Morbid,Extra fingers,Poorly drawn hands,Mutation,Blurry,Extra limbs,Gross proportions,Missing arms,Mutated hands,Long neck,Duplicate,Mutilated,Mutilated hands,Poorly drawn face,Deformed,Bad anatomy,Cloned face,Malformed limbs,Missing legs,Too many fingers", description: "Negative prompt for image generation." })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const promptEnhancer = Boolean(this.prompt_enhancer ?? true);
    const syncMode = Boolean(this.sync_mode ?? false);
    const truncatePrompt = Boolean(this.truncate_prompt ?? true);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const seed = Number(this.seed ?? 5555);
    const negativePrompt = String(this.negative_prompt ?? "Logo,Watermark,Ugly,Morbid,Extra fingers,Poorly drawn hands,Mutation,Blurry,Extra limbs,Gross proportions,Missing arms,Mutated hands,Long neck,Duplicate,Mutilated,Mutilated hands,Poorly drawn face,Deformed,Bad anatomy,Cloned face,Malformed limbs,Missing legs,Too many fingers");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "prompt_enhancer": promptEnhancer,
      "sync_mode": syncMode,
      "truncate_prompt": truncatePrompt,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
      "negative_prompt": negativePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "bria/text-to-image/3.2", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "image": { type: "image", uri: _url } };
  }
}

export class AuraFlow extends FalNode {
  static readonly nodeType = "fal.text_to_image.AuraFlow";
  static readonly title = "Aura Flow";
  static readonly description = `AuraFlow v0.3 is an open-source flow-based text-to-image generation model that achieves state-of-the-art results on GenEval. The model is currently in beta.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/aura-flow",
    unitPrice: 0.00125,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate images from" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate" })
  declare num_images: any;

  @prop({ type: "bool", default: true, description: "Whether to perform prompt expansion (recommended)" })
  declare expand_prompt: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "Classifier free guidance scale" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 50, description: "The number of inference steps to take" })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "The seed to use for generating images" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const expandPrompt = Boolean(this.expand_prompt ?? true);
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "expand_prompt": expandPrompt,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/aura-flow", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Bagel extends FalNode {
  static readonly nodeType = "fal.text_to_image.Bagel";
  static readonly title = "Bagel";
  static readonly description = `Bagel is a 7B parameter from Bytedance-Seed multimodal model that can generate both text and images.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/bagel",
    unitPrice: 0.1,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: -1, description: "The seed to use for the generation." })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Whether to use thought tokens for generation. If set to true, the model will \"think\" to potentially improve generation quality. Increases generation time and increases the cost by 20%." })
  declare use_thought: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = Number(this.seed ?? -1);
    const useThought = Boolean(this.use_thought ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "use_thought": useThought,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/bagel", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Bitdance extends FalNode {
  static readonly nodeType = "fal.text_to_image.Bitdance";
  static readonly title = "Bitdance";
  static readonly description = `Image generation with BitDance. Fast, high-resolution photorealistic images using an autoregressive LLM— for efficient, high-quality results.
text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/bitdance",
    unitPrice: 0.01,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt for image generation." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image. Will be snapped to the nearest supported resolution." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If true, the media will be returned as a data URI." })
  declare sync_mode: any;

  @prop({ type: "float", default: 7.5, description: "Classifier-free guidance scale. Higher values follow the prompt more closely." })
  declare guidance_scale: any;

  @prop({ type: "int", default: 25, description: "Number of diffusion sampling steps per decoding step. Higher values (e.g. 50) improve quality at the cost of speed." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. The same seed and prompt will produce the same image." })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 25);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/bitdance", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class BytedanceDreaminaV31TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.BytedanceDreaminaV31TextToImage";
  static readonly title = "Bytedance Dreamina V31 Text To Image";
  static readonly description = `Bytedance
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/bytedance/dreamina/v3.1/text-to-image",
    unitPrice: 0.03,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt used to generate the image" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "str", default: "", description: "The size of the generated image. Width and height must be between 512 and 2048." })
  declare image_size: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "str", default: "", description: "Random seed to control the stochasticity of image generation." })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Whether to use an LLM to enhance the prompt" })
  declare enhance_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "");
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = String(this.seed ?? "");
    const enhancePrompt = Boolean(this.enhance_prompt ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "sync_mode": syncMode,
      "seed": seed,
      "enhance_prompt": enhancePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/bytedance/dreamina/v3.1/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class BytedanceSeedreamV3TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.BytedanceSeedreamV3TextToImage";
  static readonly title = "Bytedance Seedream V3 Text To Image";
  static readonly description = `Bytedance
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/bytedance/seedream/v3/text-to-image",
    unitPrice: 0.03,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt used to generate the image" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "str", default: "", description: "Use for finer control over the output image size. Will be used over aspect_ratio, if both are provided. Width and height must be between 512 and 2048." })
  declare image_size: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed to control the stochasticity of image generation." })
  declare seed: any;

  @prop({ type: "float", default: 2.5, description: "Controls how closely the output image aligns with the input prompt. Higher values mean stronger prompt correlation." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 2.5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/bytedance/seedream/v3/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class BytedanceSeedreamV45TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.BytedanceSeedreamV45TextToImage";
  static readonly title = "Bytedance Seedream V45 Text To Image";
  static readonly description = `ByteDance SeeDream v4.5 generates advanced images from text with cutting-edge AI technology.
image, generation, bytedance, seedream, v4.5, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/bytedance/seedream/v4.5/text-to-image",
    unitPrice: 0.04,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt used to generate the image" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of separate model generations to be run with the prompt." })
  declare num_images: any;

  @prop({ type: "str", default: "", description: "The size of the generated image. Width and height must be between 1920 and 4096, or total number of pixels must be between 2560*1440 and 4096*4096." })
  declare image_size: any;

  @prop({ type: "int", default: 1, description: "If set to a number greater than one, enables multi-image generation. The model will potentially return up to 'max_images' images every generation, and in total, 'num_images' generations will be carried out. In total, the number of images generated will be between 'num_images' and 'max_images*num_images'." })
  declare max_images: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed to control the stochasticity of image generation." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "");
    const maxImages = Number(this.max_images ?? 1);
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "max_images": maxImages,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/bytedance/seedream/v4.5/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class BytedanceSeedreamV4TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.BytedanceSeedreamV4TextToImage";
  static readonly title = "Bytedance Seedream V4 Text To Image";
  static readonly description = `Bytedance Seedream v4
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/bytedance/seedream/v4/text-to-image",
    unitPrice: 0.03,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt used to generate the image" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of separate model generations to be run with the prompt." })
  declare num_images: any;

  @prop({ type: "str", default: "", description: "The size of the generated image. Total pixels must be between 960x960 and 4096x4096." })
  declare image_size: any;

  @prop({ type: "int", default: 1, description: "If set to a number greater than one, enables multi-image generation. The model will potentially return up to 'max_images' images every generation, and in total, 'num_images' generations will be carried out. In total, the number of images generated will be between 'num_images' and 'max_images*num_images'." })
  declare max_images: any;

  @prop({ type: "enum", default: "standard", values: ["standard", "fast"], description: "The mode to use for enhancing prompt enhancement. Standard mode provides higher quality results but takes longer to generate. Fast mode provides average quality results but takes less time to generate." })
  declare enhance_prompt_mode: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed to control the stochasticity of image generation." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "");
    const maxImages = Number(this.max_images ?? 1);
    const enhancePromptMode = String(this.enhance_prompt_mode ?? "standard");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "max_images": maxImages,
      "enhance_prompt_mode": enhancePromptMode,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/bytedance/seedream/v4/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class BytedanceSeedreamV5LiteTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.BytedanceSeedreamV5LiteTextToImage";
  static readonly title = "Bytedance Seedream V5 Lite Text To Image";
  static readonly description = `Text to Image endpoint for the fast Lite version of Seedream 5.0, supporting high quality intelligent text-to-image generation.
text-to-image, bytedance, seedream-5.0-lite`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/bytedance/seedream/v5/lite/text-to-image",
    unitPrice: 0.035,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "int", default: 1, description: "Number of separate model generations to be run with the prompt." })
  declare num_images: any;

  @prop({ type: "str", default: "auto_2K", description: "The size of the generated image. Total pixels must be between 2560x1440 and 3072x3072. In case the image size does not fall within these parameters, the image size will be adjusted to by scaling." })
  declare image_size: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The text prompt used to generate the image" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "If set to a number greater than one, enables multi-image generation. The model will potentially return up to 'max_images' images every generation, and in total, 'num_images' generations will be carried out. In total, the number of images generated will be between 'num_images' and 'max_images*num_images'." })
  declare max_images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = Boolean(this.sync_mode ?? false);
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "auto_2K");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const prompt = String(this.prompt ?? "");
    const maxImages = Number(this.max_images ?? 1);

    const args: Record<string, unknown> = {
      "sync_mode": syncMode,
      "num_images": numImages,
      "image_size": imageSize,
      "enable_safety_checker": enableSafetyChecker,
      "prompt": prompt,
      "max_images": maxImages,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/bytedance/seedream/v5/lite/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Cogview4 extends FalNode {
  static readonly nodeType = "fal.text_to_image.Cogview4";
  static readonly title = "Cogview4";
  static readonly description = `Generate high quality images from text prompts using CogView4. Longer text prompts will result in better quality images.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/cogview4",
    unitPrice: 0.1,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        " })
  declare negative_prompt: any;

  @prop({ type: "int", default: 50, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/cogview4", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Dreamo extends FalNode {
  static readonly nodeType = "fal.text_to_image.Dreamo";
  static readonly title = "Dreamo";
  static readonly description = `DreamO is an image customization framework designed to support a wide range of tasks while facilitating seamless integration of multiple conditions.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/dreamo",
    unitPrice: 0.05,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "URL of first reference image to use for generation." })
  declare first_image: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "image", default: "", description: "URL of second reference image to use for generation." })
  declare second_image: any;

  @prop({ type: "enum", default: "ip", values: ["ip", "id", "style"], description: "Task for second reference image (ip/id/style)." })
  declare second_reference_task: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "enum", default: "ip", values: ["ip", "id", "style"], description: "Task for first reference image (ip/id/style)." })
  declare first_reference_task: any;

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare negative_prompt: any;

  @prop({ type: "int", default: 512, description: "Resolution for reference images." })
  declare ref_resolution: any;

  @prop({ type: "bool", default: false, description: "\n            If set to true, the function will wait for the image to be generated and uploaded\n            before returning the response. This will increase the latency of the function but\n            it allows you to get the image directly in the response without going through the CDN.\n        " })
  declare sync_mode: any;

  @prop({ type: "float", default: 1, description: "The weight of the CFG loss." })
  declare true_cfg: any;

  @prop({ type: "int", default: 12, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "int", default: -1, description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const secondReferenceTask = String(this.second_reference_task ?? "ip");
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const firstReferenceTask = String(this.first_reference_task ?? "ip");
    const negativePrompt = String(this.negative_prompt ?? "");
    const refResolution = Number(this.ref_resolution ?? 512);
    const syncMode = Boolean(this.sync_mode ?? false);
    const trueCfg = Number(this.true_cfg ?? 1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 12);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "second_reference_task": secondReferenceTask,
      "guidance_scale": guidanceScale,
      "enable_safety_checker": enableSafetyChecker,
      "first_reference_task": firstReferenceTask,
      "negative_prompt": negativePrompt,
      "ref_resolution": refResolution,
      "sync_mode": syncMode,
      "true_cfg": trueCfg,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
    };

    const firstImageRef = this.first_image as Record<string, unknown> | undefined;
    if (isRefSet(firstImageRef)) {
      const firstImageUrl = await imageToDataUrl(firstImageRef!) ?? await assetToFalUrl(apiKey, firstImageRef!);
      if (firstImageUrl) args["first_image_url"] = firstImageUrl;
    }

    const secondImageRef = this.second_image as Record<string, unknown> | undefined;
    if (isRefSet(secondImageRef)) {
      const secondImageUrl = await imageToDataUrl(secondImageRef!) ?? await assetToFalUrl(apiKey, secondImageRef!);
      if (secondImageUrl) args["second_image_url"] = secondImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/dreamo", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Emu35ImageTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.Emu35ImageTextToImage";
  static readonly title = "Emu35 Image Text To Image";
  static readonly description = `Emu 3.5 Image
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/emu-3.5-image/text-to-image",
    unitPrice: 0.15,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to create the image." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"], description: "The aspect ratio of the output image." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "720p", values: ["480p", "720p"], description: "The resolution of the output image." })
  declare resolution: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the output image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "Whether to return the image in sync mode." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the safety checker." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed for the inference." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const resolution = String(this.resolution ?? "720p");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "resolution": resolution,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/emu-3.5-image/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FLiteStandard extends FalNode {
  static readonly nodeType = "fal.text_to_image.FLiteStandard";
  static readonly title = "F Lite Standard";
  static readonly description = `F Lite is a 10B parameter diffusion model created by Fal and Freepik, trained exclusively on copyright-safe and SFW content.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/f-lite/standard",
    unitPrice: 0.025,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Negative Prompt for generation." })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/f-lite/standard", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FLiteTexture extends FalNode {
  static readonly nodeType = "fal.text_to_image.FLiteTexture";
  static readonly title = "F Lite Texture";
  static readonly description = `F Lite is a 10B parameter diffusion model created by Fal and Freepik, trained exclusively on copyright-safe and SFW content. This is a high texture density variant of the model.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/f-lite/texture",
    unitPrice: 0.025,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Negative Prompt for generation." })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/f-lite/texture", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FastLightningSdxl extends FalNode {
  static readonly nodeType = "fal.text_to_image.FastLightningSdxl";
  static readonly title = "Fast Lightning Sdxl";
  static readonly description = `Run SDXL at the speed of light
generation, text-to-image, txt2img, ai-art, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/fast-lightning-sdxl",
    unitPrice: 0.00125,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare format: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "str", default: "", description: "The prompt to use for generating the image. Be as descriptive as possible for best results." })
  declare prompt: any;

  @prop({ type: "list[Embedding]", default: [], description: "The list of embeddings to use." })
  declare embeddings: any;

  @prop({ type: "bool", default: false, description: "If set to true, the prompt will be expanded with additional prompts." })
  declare expand_prompt: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "v1", values: ["v1", "v2"], description: "The version of the safety checker to use. v1 is the default CompVis safety checker. v2 uses a custom ViT model." })
  declare safety_checker_version: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "enum", default: 4, values: ["1", "2", "4", "8"], description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "\n            An id bound to a request, can be used with response to identify the request\n            itself.\n        " })
  declare request_id: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        " })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const format = String(this.format ?? "jpeg");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const prompt = String(this.prompt ?? "");
    const embeddings = String(this.embeddings ?? []);
    const expandPrompt = Boolean(this.expand_prompt ?? false);
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyCheckerVersion = String(this.safety_checker_version ?? "v1");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = String(this.num_inference_steps ?? 4);
    const requestId = String(this.request_id ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "format": format,
      "num_images": numImages,
      "image_size": imageSize,
      "prompt": prompt,
      "embeddings": embeddings,
      "expand_prompt": expandPrompt,
      "sync_mode": syncMode,
      "safety_checker_version": safetyCheckerVersion,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "request_id": requestId,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/fast-lightning-sdxl", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FastSdxl extends FalNode {
  static readonly nodeType = "fal.text_to_image.FastSdxl";
  static readonly title = "Fast Sdxl";
  static readonly description = `Run SDXL at the speed of light
generation, text-to-image, txt2img, ai-art, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/fast-sdxl",
    unitPrice: 0.00125,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to use for generating the image. Be as descriptive as possible for best results." })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "list[Embedding]", default: [], description: "The list of embeddings to use." })
  declare embeddings: any;

  @prop({ type: "bool", default: false, description: "If set to true, the prompt will be expanded with additional prompts." })
  declare expand_prompt: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "The list of LoRA weights to use." })
  declare loras: any;

  @prop({ type: "float", default: 7.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        " })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare format: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "v1", values: ["v1", "v2"], description: "The version of the safety checker to use. v1 is the default CompVis safety checker. v2 uses a custom ViT model." })
  declare safety_checker_version: any;

  @prop({ type: "str", default: "", description: "\n            An id bound to a request, can be used with response to identify the request\n            itself.\n        " })
  declare request_id: any;

  @prop({ type: "int", default: 25, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        " })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const embeddings = String(this.embeddings ?? []);
    const expandPrompt = Boolean(this.expand_prompt ?? false);
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const format = String(this.format ?? "jpeg");
    const numImages = Number(this.num_images ?? 1);
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyCheckerVersion = String(this.safety_checker_version ?? "v1");
    const requestId = String(this.request_id ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 25);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "embeddings": embeddings,
      "expand_prompt": expandPrompt,
      "loras": loras,
      "guidance_scale": guidanceScale,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
      "format": format,
      "num_images": numImages,
      "sync_mode": syncMode,
      "safety_checker_version": safetyCheckerVersion,
      "request_id": requestId,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/fast-sdxl", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux1Dev extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux1Dev";
  static readonly title = "Flux1 Dev";
  static readonly description = `FLUX.1 [dev] is a 12 billion parameter flow transformer that generates high-quality images from text. It is suitable for personal and commercial use. 
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-1/dev",
    unitPrice: 0.025,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The speed of the generation. The higher the speed, the faster the generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "\n        The CFG (Classifier Free Guidance) scale is a measure of how close you want\n        the model to stick to your prompt when looking for a related image to show you.\n    " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n        The same seed and the same prompt given to the same version of the model\n        will output the same image every time.\n    " })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-1/dev", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux1Krea extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux1Krea";
  static readonly title = "Flux1 Krea";
  static readonly description = `FLUX.1 Krea [dev]
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-1/krea",
    unitPrice: 0.025,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The speed of the generation. The higher the speed, the faster the generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 4.5, description: "\n        The CFG (Classifier Free Guidance) scale is a measure of how close you want\n        the model to stick to your prompt when looking for a related image to show you.\n    " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n        The same seed and the same prompt given to the same version of the model\n        will output the same image every time.\n    " })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 4.5);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-1/krea", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux1Schnell extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux1Schnell";
  static readonly title = "Flux1 Schnell";
  static readonly description = `Fastest inference in the world for the 12 billion parameter FLUX.1 [schnell] text-to-image model. 
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-1/schnell",
    unitPrice: 0.003,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The speed of the generation. The higher the speed, the faster the generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "\n        The CFG (Classifier Free Guidance) scale is a measure of how close you want\n        the model to stick to your prompt when looking for a related image to show you.\n    " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n        The same seed and the same prompt given to the same version of the model\n        will output the same image every time.\n    " })
  declare seed: any;

  @prop({ type: "int", default: 4, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-1/schnell", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux1Srpo extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux1Srpo";
  static readonly title = "Flux1 Srpo";
  static readonly description = `FLUX.1 SRPO [dev]
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-1/srpo",
    unitPrice: 0.025,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The speed of the generation. The higher the speed, the faster the generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 4.5, description: "\n        The CFG (Classifier Free Guidance) scale is a measure of how close you want\n        the model to stick to your prompt when looking for a related image to show you.\n    " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n        The same seed and the same prompt given to the same version of the model\n        will output the same image every time.\n    " })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 4.5);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-1/srpo", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2 extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2";
  static readonly title = "Flux2";
  static readonly description = `Text-to-image generation with FLUX.2 [dev] from Black Forest Labs. Enhanced realism, crisper text generation, and native editing capabilities.
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2",
    unitPrice: 0.012,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the image to generate. The width and height must be between 512 and 2048 pixels." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use for the image generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 2.5, description: "Guidance Scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you." })
  declare guidance_scale: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "If set to true, the prompt will be expanded for better results." })
  declare enable_prompt_expansion: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation. If not provided, a random seed will be used." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 2.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "enable_prompt_expansion": enablePromptExpansion,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Flex extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Flex";
  static readonly title = "Flux2 Flex";
  static readonly description = `Flux 2 Flex
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2-flex",
    unitPrice: 0.05,
    billingUnit: "processed megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "2", values: ["1", "2", "3", "4", "5"], description: "The safety tolerance level for the generated image. 1 being the most strict and 5 being the most permissive." })
  declare safety_tolerance: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the safety checker." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation." })
  declare seed: any;

  @prop({ type: "float", default: 3.5, description: "The guidance scale to use for the generation." })
  declare guidance_scale: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "2");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-flex", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Klein4B extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Klein4B";
  static readonly title = "Flux2 Klein4 B";
  static readonly description = `FLUX-2 Klein 4B generates images with the efficient 4-billion parameter model for balanced quality and speed.
image, generation, flux-2, klein, 4b, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2/klein/4b",
    unitPrice: 0.009,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the image to generate." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI. Output is not stored when this is True." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation. If not provided, a random seed will be used." })
  declare seed: any;

  @prop({ type: "int", default: 4, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-klein/4b", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Klein4BBase extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Klein4BBase";
  static readonly title = "Flux2 Klein4 B Base";
  static readonly description = `FLUX-2 Klein 4B Base provides foundation model generation with 4-billion parameters.
image, generation, flux-2, klein, 4b, base`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2/klein/4b/base",
    unitPrice: 0.00167,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the image to generate." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use for image generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI. Output is not stored when this is True." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation. If not provided, a random seed will be used." })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "Negative prompt for classifier-free guidance. Describes what to avoid in the image." })
  declare negative_prompt: any;

  @prop({ type: "float", default: 5, description: "Guidance scale for classifier-free guidance." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const negativePrompt = String(this.negative_prompt ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "negative_prompt": negativePrompt,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-klein/4b/base", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Klein4BBaseLora extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Klein4BBaseLora";
  static readonly title = "Flux2 Klein4 B Base Lora";
  static readonly description = `FLUX-2 Klein 4B Base with LoRA enables custom-trained 4B models for specialized generation.
image, generation, flux-2, klein, 4b, base, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2/klein/4b/base/lora",
    unitPrice: 0.016,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the image to generate." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use for image generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "list[LoRAInput]", default: [], description: "List of LoRA weights to apply (maximum 3)." })
  declare loras: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI. Output is not stored when this is True." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation. If not provided, a random seed will be used." })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "Negative prompt for classifier-free guidance. Describes what to avoid in the image." })
  declare negative_prompt: any;

  @prop({ type: "float", default: 5, description: "Guidance scale for classifier-free guidance." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "png");
    const loras = String(this.loras ?? []);
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const negativePrompt = String(this.negative_prompt ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "loras": loras,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "negative_prompt": negativePrompt,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-klein/4b/base/lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Klein4bDistilledLora extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Klein4bDistilledLora";
  static readonly title = "Flux2 Klein4b Distilled Lora";
  static readonly description = `Text-to-image generation with FLUX.2 [klein] 4B from Black Forest Labs and custom LoRA. Enhanced realism, crisper text generation, and native editing capabilities.
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2/klein/4b/lora",
    unitPrice: 0.00167,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the image to generate." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "list[LoRAInput]", default: [], description: "List of LoRA weights to apply (maximum 3)." })
  declare loras: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI. Output is not stored when this is True." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 4, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation. If not provided, a random seed will be used." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const loras = String(this.loras ?? []);
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "loras": loras,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-klein/4b/distilled/lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Klein9B extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Klein9B";
  static readonly title = "Flux2 Klein9 B";
  static readonly description = `FLUX-2 Klein 9B generates high-quality images with the powerful 9-billion parameter model.
image, generation, flux-2, klein, 9b, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2/klein/9b",
    unitPrice: 0.011,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the image to generate." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI. Output is not stored when this is True." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation. If not provided, a random seed will be used." })
  declare seed: any;

  @prop({ type: "int", default: 4, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-klein/9b", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Klein9BBase extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Klein9BBase";
  static readonly title = "Flux2 Klein9 B Base";
  static readonly description = `FLUX-2 Klein 9B Base provides foundation generation with the full 9-billion parameter model.
image, generation, flux-2, klein, 9b, base`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2/klein/9b/base",
    unitPrice: 0.00167,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the image to generate." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use for image generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI. Output is not stored when this is True." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation. If not provided, a random seed will be used." })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "Negative prompt for classifier-free guidance. Describes what to avoid in the image." })
  declare negative_prompt: any;

  @prop({ type: "float", default: 5, description: "Guidance scale for classifier-free guidance." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const negativePrompt = String(this.negative_prompt ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "negative_prompt": negativePrompt,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-klein/9b/base", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Klein9BBaseLora extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Klein9BBaseLora";
  static readonly title = "Flux2 Klein9 B Base Lora";
  static readonly description = `FLUX-2 Klein 9B Base with LoRA combines powerful generation with custom-trained models.
image, generation, flux-2, klein, 9b, base, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2/klein/9b/base/lora",
    unitPrice: 0.02,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the image to generate." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use for image generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "list[LoRAInput]", default: [], description: "List of LoRA weights to apply (maximum 3)." })
  declare loras: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI. Output is not stored when this is True." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation. If not provided, a random seed will be used." })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "Negative prompt for classifier-free guidance. Describes what to avoid in the image." })
  declare negative_prompt: any;

  @prop({ type: "float", default: 5, description: "Guidance scale for classifier-free guidance." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "png");
    const loras = String(this.loras ?? []);
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const negativePrompt = String(this.negative_prompt ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "loras": loras,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "negative_prompt": negativePrompt,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-klein/9b/base/lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Klein9bD4BetaLora extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Klein9bD4BetaLora";
  static readonly title = "Flux2 Klein9b D4 Beta Lora";
  static readonly description = `Text-to-image generation with FLUX.2 [klein] 9B from Black Forest Labs and custom LoRA.
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2/klein/9b/lora",
    unitPrice: 0.00167,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the image to generate." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "list[LoRAInput]", default: [], description: "List of LoRA weights to apply (maximum 3)." })
  declare loras: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI. Output is not stored when this is True." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 4, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation. If not provided, a random seed will be used." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const loras = String(this.loras ?? []);
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "loras": loras,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-klein/9b/d4-beta/lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2LoraGalleryBallpointPenSketch extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2LoraGalleryBallpointPenSketch";
  static readonly title = "Flux2 Lora Gallery Ballpoint Pen Sketch";
  static readonly description = `Flux 2 Lora Gallery
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2-lora-gallery/ballpoint-pen-sketch",
    unitPrice: 0.021,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate a ballpoint pen sketch style image. Use 'b4llp01nt' trigger word for best results." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular"], description: "Acceleration level for image generation. 'regular' balances speed and quality." })
  declare acceleration: any;

  @prop({ type: "float", default: 1, description: "The strength of the ballpoint pen sketch effect." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "png", values: ["png", "jpeg", "webp"], description: "The format of the output image" })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and won't be saved in history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the safety checker for the generated image." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. Same seed with same prompt will produce same result." })
  declare seed: any;

  @prop({ type: "int", default: 40, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 2.5, description: "The CFG (Classifier Free Guidance) scale. Controls how closely the model follows the prompt." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const loraScale = Number(this.lora_scale ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const guidanceScale = Number(this.guidance_scale ?? 2.5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "lora_scale": loraScale,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-lora-gallery/ballpoint-pen-sketch", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2LoraGalleryDigitalComicArt extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2LoraGalleryDigitalComicArt";
  static readonly title = "Flux2 Lora Gallery Digital Comic Art";
  static readonly description = `Flux 2 Lora Gallery
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2-lora-gallery/digital-comic-art",
    unitPrice: 0.021,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate a digital comic art style image. Use 'd1g1t4l' trigger word for best results." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular"], description: "Acceleration level for image generation. 'regular' balances speed and quality." })
  declare acceleration: any;

  @prop({ type: "float", default: 1, description: "The strength of the digital comic art effect." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "png", values: ["png", "jpeg", "webp"], description: "The format of the output image" })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and won't be saved in history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the safety checker for the generated image." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. Same seed with same prompt will produce same result." })
  declare seed: any;

  @prop({ type: "int", default: 40, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 2.5, description: "The CFG (Classifier Free Guidance) scale. Controls how closely the model follows the prompt." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const loraScale = Number(this.lora_scale ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const guidanceScale = Number(this.guidance_scale ?? 2.5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "lora_scale": loraScale,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-lora-gallery/digital-comic-art", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2LoraGalleryHdrStyle extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2LoraGalleryHdrStyle";
  static readonly title = "Flux2 Lora Gallery Hdr Style";
  static readonly description = `Flux 2 Lora Gallery
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2-lora-gallery/hdr-style",
    unitPrice: 0.021,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an HDR style image. The trigger word 'Hyp3rRe4list1c' will be automatically prepended." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular"], description: "Acceleration level for image generation. 'regular' balances speed and quality." })
  declare acceleration: any;

  @prop({ type: "float", default: 1, description: "The strength of the HDR style effect." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "png", values: ["png", "jpeg", "webp"], description: "The format of the output image" })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and won't be saved in history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the safety checker for the generated image." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. Same seed with same prompt will produce same result." })
  declare seed: any;

  @prop({ type: "int", default: 40, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 2.5, description: "The CFG (Classifier Free Guidance) scale. Controls how closely the model follows the prompt." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const loraScale = Number(this.lora_scale ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const guidanceScale = Number(this.guidance_scale ?? 2.5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "lora_scale": loraScale,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-lora-gallery/hdr-style", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2LoraGalleryRealism extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2LoraGalleryRealism";
  static readonly title = "Flux2 Lora Gallery Realism";
  static readonly description = `Flux 2 Lora Gallery
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2-lora-gallery/realism",
    unitPrice: 0.021,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate a realistic image with natural lighting and authentic details." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular"], description: "Acceleration level for image generation. 'regular' balances speed and quality." })
  declare acceleration: any;

  @prop({ type: "float", default: 1, description: "The strength of the realism effect." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "png", values: ["png", "jpeg", "webp"], description: "The format of the output image" })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and won't be saved in history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the safety checker for the generated image." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. Same seed with same prompt will produce same result." })
  declare seed: any;

  @prop({ type: "int", default: 40, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 2.5, description: "The CFG (Classifier Free Guidance) scale. Controls how closely the model follows the prompt." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const loraScale = Number(this.lora_scale ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const guidanceScale = Number(this.guidance_scale ?? 2.5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "lora_scale": loraScale,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-lora-gallery/realism", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2LoraGallerySatelliteViewStyle extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2LoraGallerySatelliteViewStyle";
  static readonly title = "Flux2 Lora Gallery Satellite View Style";
  static readonly description = `Flux 2 Lora Gallery
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2-lora-gallery/satellite-view-style",
    unitPrice: 0.021,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate a satellite/aerial view style image." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular"], description: "Acceleration level for image generation. 'regular' balances speed and quality." })
  declare acceleration: any;

  @prop({ type: "float", default: 1, description: "The strength of the satellite view style effect." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "png", values: ["png", "jpeg", "webp"], description: "The format of the output image" })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and won't be saved in history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the safety checker for the generated image." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. Same seed with same prompt will produce same result." })
  declare seed: any;

  @prop({ type: "int", default: 40, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 2.5, description: "The CFG (Classifier Free Guidance) scale. Controls how closely the model follows the prompt." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const loraScale = Number(this.lora_scale ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const guidanceScale = Number(this.guidance_scale ?? 2.5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "lora_scale": loraScale,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-lora-gallery/satellite-view-style", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2LoraGallerySepiaVintage extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2LoraGallerySepiaVintage";
  static readonly title = "Flux2 Lora Gallery Sepia Vintage";
  static readonly description = `Flux 2 Lora Gallery
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2-lora-gallery/sepia-vintage",
    unitPrice: 0.021,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate a sepia vintage photography style image." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular"], description: "Acceleration level for image generation. 'regular' balances speed and quality." })
  declare acceleration: any;

  @prop({ type: "float", default: 1, description: "The strength of the sepia vintage photography effect." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "png", values: ["png", "jpeg", "webp"], description: "The format of the output image" })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and won't be saved in history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the safety checker for the generated image." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. Same seed with same prompt will produce same result." })
  declare seed: any;

  @prop({ type: "int", default: 40, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 2.5, description: "The CFG (Classifier Free Guidance) scale. Controls how closely the model follows the prompt." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const loraScale = Number(this.lora_scale ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const guidanceScale = Number(this.guidance_scale ?? 2.5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "lora_scale": loraScale,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-lora-gallery/sepia-vintage", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Max extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Max";
  static readonly title = "Flux2 Max";
  static readonly description = `FLUX-2 Max generates maximum quality images with the most advanced FLUX-2 model for premium results.
image, generation, flux-2, max, premium, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2-max",
    unitPrice: 0.07,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "2", values: ["1", "2", "3", "4", "5"], description: "The safety tolerance level for the generated image. 1 being the most strict and 5 being the most permissive." })
  declare safety_tolerance: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the safety checker." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "2");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-max", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Pro extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Pro";
  static readonly title = "Flux2 Pro";
  static readonly description = `Image editing with FLUX.2 [pro] from Black Forest Labs. Ideal for high-quality image manipulation, style transfer, and sequential editing workflows
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2-pro",
    unitPrice: 0.03,
    billingUnit: "processed megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "2", values: ["1", "2", "3", "4", "5"], description: "The safety tolerance level for the generated image. 1 being the most strict and 5 being the most permissive." })
  declare safety_tolerance: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the safety checker." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "2");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-pro", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Flash extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Flash";
  static readonly title = "Flux2 Flash";
  static readonly description = `FLUX.2 Flash is an ultra-fast variant of FLUX.2 designed for instant image generation with minimal latency.
image, generation, flux, ultra-fast, flash, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2/flash",
    unitPrice: 0.005,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "landscape_4_3", description: "Size preset for the generated image" })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 2.5, description: "Guidance Scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you." })
  declare guidance_scale: any;

  @prop({ type: "int", default: -1, description: "Seed for reproducible results. Use -1 for random" })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "bool", default: false, description: "If set to true, the prompt will be expanded for better results." })
  declare enable_prompt_expansion: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 2.5);
    const seed = Number(this.seed ?? -1);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
      "enable_prompt_expansion": enablePromptExpansion,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2/flash", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Lora extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Lora";
  static readonly title = "Flux2 Lora";
  static readonly description = `Text-to-image generation with LoRA support for FLUX.2 [dev] from Black Forest Labs. Custom style adaptation and fine-tuned model variations.
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2/lora",
    unitPrice: 0.021,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the image to generate. The width and height must be between 512 and 2048 pixels." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use for the image generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "list[LoRAInput]", default: [], description: "List of LoRA weights to apply (maximum 3). Each LoRA can be a URL, HuggingFace repo ID, or local path." })
  declare loras: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 2.5, description: "Guidance Scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you." })
  declare guidance_scale: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "If set to true, the prompt will be expanded for better results." })
  declare enable_prompt_expansion: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The seed to use for the generation. If not provided, a random seed will be used." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "png");
    const loras = String(this.loras ?? []);
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 2.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "loras": loras,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "enable_prompt_expansion": enablePromptExpansion,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2/lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Flux2Turbo extends FalNode {
  static readonly nodeType = "fal.text_to_image.Flux2Turbo";
  static readonly title = "Flux2 Turbo";
  static readonly description = `FLUX.2 Turbo is a blazing-fast image generation model optimized for speed without sacrificing quality, ideal for real-time applications.
image, generation, flux, fast, turbo, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-2/turbo",
    unitPrice: 0.008,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "enum", default: "landscape_4_3", description: "Size preset for the generated image" })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 2.5, description: "Guidance Scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you." })
  declare guidance_scale: any;

  @prop({ type: "int", default: -1, description: "Seed for reproducible results. Use -1 for random" })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "bool", default: false, description: "If set to true, the prompt will be expanded for better results." })
  declare enable_prompt_expansion: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 2.5);
    const seed = Number(this.seed ?? -1);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
      "enable_prompt_expansion": enablePromptExpansion,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2/turbo", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxControlLoraCanny extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxControlLoraCanny";
  static readonly title = "Flux Control Lora Canny";
  static readonly description = `FLUX Control LoRA Canny is a high-performance endpoint that uses a control image to transfer structure to the generated image, using a Canny edge map.
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-control-lora-canny",
    unitPrice: 0.04,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "float", default: 1, description: "The strength of the control lora." })
  declare control_lora_strength: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "bool", default: true, description: "\n            If set to true, the input image will be preprocessed to extract depth information.\n            This is useful for generating depth maps from images.\n        " })
  declare preprocess_depth: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "image", default: "", description: "URL of image to use for image-to-image generation." })
  declare image: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "image", default: "", description: "\n            The image to use for control lora. This is used to control the style of the generated image.\n        " })
  declare control_lora_image: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const controlLoraStrength = Number(this.control_lora_strength ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const preprocessDepth = Boolean(this.preprocess_depth ?? true);
    const loras = String(this.loras ?? []);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "control_lora_strength": controlLoraStrength,
      "image_size": imageSize,
      "preprocess_depth": preprocessDepth,
      "loras": loras,
      "enable_safety_checker": enableSafetyChecker,
      "guidance_scale": guidanceScale,
      "num_images": numImages,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const controlLoraImageRef = this.control_lora_image as Record<string, unknown> | undefined;
    if (isRefSet(controlLoraImageRef)) {
      const controlLoraImageUrl = await imageToDataUrl(controlLoraImageRef!) ?? await assetToFalUrl(apiKey, controlLoraImageRef!);
      if (controlLoraImageUrl) args["control_lora_image_url"] = controlLoraImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-control-lora-canny", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxControlLoraDepth extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxControlLoraDepth";
  static readonly title = "Flux Control Lora Depth";
  static readonly description = `FLUX Control LoRA Depth is a high-performance endpoint that uses a control image to transfer structure to the generated image, using a depth map.
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-control-lora-depth",
    unitPrice: 0.04,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "float", default: 1, description: "The strength of the control lora." })
  declare control_lora_strength: any;

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "bool", default: true, description: "\n            If set to true, the input image will be preprocessed to extract depth information.\n            This is useful for generating depth maps from images.\n        " })
  declare preprocess_depth: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "image", default: "", description: "URL of image to use for image-to-image generation." })
  declare image: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "image", default: "", description: "\n            The image to use for control lora. This is used to control the style of the generated image.\n        " })
  declare control_lora_image: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const controlLoraStrength = Number(this.control_lora_strength ?? 1);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const preprocessDepth = Boolean(this.preprocess_depth ?? true);
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "control_lora_strength": controlLoraStrength,
      "prompt": prompt,
      "image_size": imageSize,
      "preprocess_depth": preprocessDepth,
      "loras": loras,
      "guidance_scale": guidanceScale,
      "enable_safety_checker": enableSafetyChecker,
      "num_images": numImages,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const controlLoraImageRef = this.control_lora_image as Record<string, unknown> | undefined;
    if (isRefSet(controlLoraImageRef)) {
      const controlLoraImageUrl = await imageToDataUrl(controlLoraImageRef!) ?? await assetToFalUrl(apiKey, controlLoraImageRef!);
      if (controlLoraImageUrl) args["control_lora_image_url"] = controlLoraImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-control-lora-depth", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxGeneral extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxGeneral";
  static readonly title = "Flux General";
  static readonly description = `A versatile endpoint for the FLUX.1 [dev] model that supports multiple AI extensions including LoRA, ControlNet conditioning, and IP-Adapter integration, enabling comprehensive control over image generation through various guidance methods.
lora, controlnet, ip-adapter`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-general",
    unitPrice: 0.075,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "float", default: 0.25, description: "\n            The proportion of steps to apply NAG. After the specified proportion\n            of steps has been iterated, the remaining steps will use original\n            attention processors in FLUX.\n        " })
  declare nag_end: any;

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "list[ControlLoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation which use a control image. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare control_loras: any;

  @prop({ type: "str", default: "", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "euler", values: ["euler", "dpmpp_2m"], description: "Scheduler for the denoising process." })
  declare scheduler: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "list[EasyControlWeight]", default: [], description: "\n        EasyControl Inputs to use for image generation.\n        " })
  declare easycontrols: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare real_cfg_scale: any;

  @prop({ type: "bool", default: false, description: "\n            Uses CFG-zero init sampling as in https://arxiv.org/abs/2503.18886.\n        " })
  declare use_cfg_zero: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "str", default: "", description: "Use an image input to influence the generation. Can be used to fill images in masked areas." })
  declare fill_image: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "str", default: "", description: "Sigmas schedule for the denoising process." })
  declare sigma_schedule: any;

  @prop({ type: "float", default: 1, description: "\n            The percentage of the total timesteps when the reference guidance is to be ended.\n        " })
  declare reference_end: any;

  @prop({ type: "float", default: 0.65, description: "Strength of reference_only generation. Only used if a reference image is provided." })
  declare reference_strength: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "float", default: 3, description: "\n            The scale for NAG. Higher values will result in a image that is more distant\n            to the negative prompt.\n        " })
  declare nag_scale: any;

  @prop({ type: "image", default: "", description: "URL of Image for Reference-Only" })
  declare reference_image: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "list[ControlNetUnion]", default: [], description: "\n            The controlnet unions to use for the image generation. Only one controlnet is supported at the moment.\n        " })
  declare controlnet_unions: any;

  @prop({ type: "float", default: 2.5, description: "\n            The tau for NAG. Controls the normalization of the hidden state.\n            Higher values will result in a less aggressive normalization,\n            but may also lead to unexpected changes with respect to the original image.\n            Not recommended to change this value.\n        " })
  declare nag_tau: any;

  @prop({ type: "str", default: "", description: "\n            Negative prompt to steer the image generation away from unwanted features.\n            By default, we will be using NAG for processing the negative prompt.\n        " })
  declare negative_prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate. This is always set to 1 for streaming output." })
  declare num_images: any;

  @prop({ type: "bool", default: false, description: "\n            Uses classical CFG as in SD1.5, SDXL, etc. Increases generation times and price when set to be true.\n            If using XLabs IP-Adapter v1, this will be turned on!.\n        " })
  declare use_real_cfg: any;

  @prop({ type: "float", default: 0.25, description: "\n            The alpha value for NAG. This value is used as a final weighting\n            factor for steering the normalized guidance (positive and negative prompts)\n            in the direction of the positive prompt. Higher values will result in less\n            steering on the normalized guidance where lower values will result in\n            considering the positive prompt guidance more.\n        " })
  declare nag_alpha: any;

  @prop({ type: "float", default: 0.5, description: "Base shift for the scheduled timesteps" })
  declare base_shift: any;

  @prop({ type: "list[IPAdapter]", default: [], description: "\n        IP-Adapter to use for image generation.\n        " })
  declare ip_adapters: any;

  @prop({ type: "bool", default: false, description: "Specifies whether beta sigmas ought to be used." })
  declare use_beta_schedule: any;

  @prop({ type: "list[ControlNet]", default: [], description: "\n            The controlnets to use for the image generation. Only one controlnet is supported at the moment.\n        " })
  declare controlnets: any;

  @prop({ type: "float", default: 0, description: "\n            The percentage of the total timesteps when the reference guidance is to bestarted.\n        " })
  declare reference_start: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 1.15, description: "Max shift for the scheduled timesteps" })
  declare max_shift: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const nagEnd = Number(this.nag_end ?? 0.25);
    const prompt = String(this.prompt ?? "");
    const controlLoras = String(this.control_loras ?? []);
    const imageSize = String(this.image_size ?? "");
    const scheduler = String(this.scheduler ?? "euler");
    const loras = String(this.loras ?? []);
    const easycontrols = String(this.easycontrols ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const realCfgScale = Number(this.real_cfg_scale ?? 3.5);
    const useCfgZero = Boolean(this.use_cfg_zero ?? false);
    const outputFormat = String(this.output_format ?? "png");
    const fillImage = String(this.fill_image ?? "");
    const syncMode = Boolean(this.sync_mode ?? false);
    const sigmaSchedule = String(this.sigma_schedule ?? "");
    const referenceEnd = Number(this.reference_end ?? 1);
    const referenceStrength = Number(this.reference_strength ?? 0.65);
    const seed = String(this.seed ?? "");
    const nagScale = Number(this.nag_scale ?? 3);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const controlnetUnions = String(this.controlnet_unions ?? []);
    const nagTau = Number(this.nag_tau ?? 2.5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const useRealCfg = Boolean(this.use_real_cfg ?? false);
    const nagAlpha = Number(this.nag_alpha ?? 0.25);
    const baseShift = Number(this.base_shift ?? 0.5);
    const ipAdapters = String(this.ip_adapters ?? []);
    const useBetaSchedule = Boolean(this.use_beta_schedule ?? false);
    const controlnets = String(this.controlnets ?? []);
    const referenceStart = Number(this.reference_start ?? 0);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const maxShift = Number(this.max_shift ?? 1.15);

    const args: Record<string, unknown> = {
      "nag_end": nagEnd,
      "prompt": prompt,
      "control_loras": controlLoras,
      "image_size": imageSize,
      "scheduler": scheduler,
      "loras": loras,
      "easycontrols": easycontrols,
      "guidance_scale": guidanceScale,
      "real_cfg_scale": realCfgScale,
      "use_cfg_zero": useCfgZero,
      "output_format": outputFormat,
      "fill_image": fillImage,
      "sync_mode": syncMode,
      "sigma_schedule": sigmaSchedule,
      "reference_end": referenceEnd,
      "reference_strength": referenceStrength,
      "seed": seed,
      "nag_scale": nagScale,
      "enable_safety_checker": enableSafetyChecker,
      "controlnet_unions": controlnetUnions,
      "nag_tau": nagTau,
      "negative_prompt": negativePrompt,
      "num_images": numImages,
      "use_real_cfg": useRealCfg,
      "nag_alpha": nagAlpha,
      "base_shift": baseShift,
      "ip_adapters": ipAdapters,
      "use_beta_schedule": useBetaSchedule,
      "controlnets": controlnets,
      "reference_start": referenceStart,
      "num_inference_steps": numInferenceSteps,
      "max_shift": maxShift,
    };

    const referenceImageRef = this.reference_image as Record<string, unknown> | undefined;
    if (isRefSet(referenceImageRef)) {
      const referenceImageUrl = await imageToDataUrl(referenceImageRef!) ?? await assetToFalUrl(apiKey, referenceImageRef!);
      if (referenceImageUrl) args["reference_image_url"] = referenceImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-general", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxKontextLoraTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxKontextLoraTextToImage";
  static readonly title = "Flux Kontext Lora Text To Image";
  static readonly description = `Flux Kontext Lora
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-kontext-lora/text-to-image",
    unitPrice: 0.035,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate the image with" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "none", values: ["none", "regular", "high"], description: "The speed of the generation. The higher the speed, the faster the generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "float", default: 2.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 30, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "none");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 2.5);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "loras": loras,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-kontext-lora/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxKreaLora extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxKreaLora";
  static readonly title = "Flux Krea Lora";
  static readonly description = `FLUX.1 Krea [dev] with LoRAs
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = null;

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate. This is always set to 1 for streaming output." })
  declare num_images: any;

  @prop({ type: "enum", default: "none", values: ["none", "regular"], description: "Acceleration level for image generation. 'regular' balances speed and quality." })
  declare acceleration: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const acceleration = String(this.acceleration ?? "none");
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "acceleration": acceleration,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "loras": loras,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-krea-lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxKreaLoraStream extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxKreaLoraStream";
  static readonly title = "Flux Krea Lora Stream";
  static readonly description = `Flux Krea Lora
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-krea-lora/stream",
    unitPrice: 0.035,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate. This is always set to 1 for streaming output." })
  declare num_images: any;

  @prop({ type: "enum", default: "none", values: ["none", "regular"], description: "Acceleration level for image generation. 'regular' balances speed and quality." })
  declare acceleration: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const acceleration = String(this.acceleration ?? "none");
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "acceleration": acceleration,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "loras": loras,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-krea-lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxLora extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxLora";
  static readonly title = "Flux Lora";
  static readonly description = `FLUX with LoRA support enables fine-tuned image generation using custom LoRA models for specific styles or subjects.
image, generation, flux, lora, fine-tuning, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = null;

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate. This is always set to 1 for streaming output." })
  declare num_images: any;

  @prop({ type: "enum", default: "none", values: ["none", "regular"], description: "Acceleration level for image generation. 'regular' balances speed and quality." })
  declare acceleration: any;

  @prop({ type: "str", default: "landscape_4_3", description: "Size preset for the generated image" })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "List of LoRA models to apply with their weights" })
  declare loras: any;

  @prop({ type: "float", default: 3.5, description: "How strictly to follow the prompt" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "Enable safety checker to filter unsafe content" })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Seed for reproducible results. Use -1 for random" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const acceleration = String(this.acceleration ?? "none");
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "acceleration": acceleration,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "loras": loras,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxLoraStream extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxLoraStream";
  static readonly title = "Flux Lora Stream";
  static readonly description = `Super fast endpoint for the FLUX.1 [dev] model with LoRA support, enabling rapid and high-quality image generation using pre-trained LoRA adaptations for personalization, specific styles, brand identities, and product-specific outputs.
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-lora/stream",
    unitPrice: 0.035,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate. This is always set to 1 for streaming output." })
  declare num_images: any;

  @prop({ type: "enum", default: "none", values: ["none", "regular"], description: "Acceleration level for image generation. 'regular' balances speed and quality." })
  declare acceleration: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const acceleration = String(this.acceleration ?? "none");
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "acceleration": acceleration,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "loras": loras,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxLoraInpainting extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxLoraInpainting";
  static readonly title = "Flux Lora Inpainting";
  static readonly description = `Super fast endpoint for the FLUX.1 [dev] inpainting model with LoRA support, enabling rapid and high-quality image inpaingting using pre-trained LoRA adaptations for personalization, specific styles, brand identities, and product-specific outputs.
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-lora/inpainting",
    unitPrice: 0.035,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "enum", default: "none", values: ["none", "regular"], description: "Acceleration level for image generation. 'regular' balances speed and quality." })
  declare acceleration: any;

  @prop({ type: "str", default: "", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate. This is always set to 1 for streaming output." })
  declare num_images: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "image", default: "", description: "URL of image to use for inpainting. or img2img" })
  declare image: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 0.85, description: "The strength to use for inpainting/image-to-image. Only used if the image_url is provided. 1.0 is completely remakes the image while 0.0 preserves the original." })
  declare strength: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "\n            The mask to area to Inpaint in.\n        " })
  declare mask_url: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const acceleration = String(this.acceleration ?? "none");
    const imageSize = String(this.image_size ?? "");
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const strength = Number(this.strength ?? 0.85);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const maskUrl = String(this.mask_url ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "acceleration": acceleration,
      "image_size": imageSize,
      "loras": loras,
      "guidance_scale": guidanceScale,
      "enable_safety_checker": enableSafetyChecker,
      "num_images": numImages,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "strength": strength,
      "num_inference_steps": numInferenceSteps,
      "mask_url": maskUrl,
      "seed": seed,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-lora/inpainting", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxProKontextMaxTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxProKontextMaxTextToImage";
  static readonly title = "Flux Pro Kontext Max Text To Image";
  static readonly description = `FLUX.1 Kontext [max] text-to-image is a new premium model brings maximum performance across all aspects – greatly improved prompt adherence.
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-pro/kontext/max/text-to-image",
    unitPrice: 0.08,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"], description: "The aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "2", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for the generated image. 1 being the most strict and 5 being the most permissive." })
  declare safety_tolerance: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Whether to enhance the prompt for better results." })
  declare enhance_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "2");
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = String(this.seed ?? "");
    const enhancePrompt = Boolean(this.enhance_prompt ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "num_images": numImages,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "enhance_prompt": enhancePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-pro/kontext/max/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxProKontextTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxProKontextTextToImage";
  static readonly title = "Flux Pro Kontext Text To Image";
  static readonly description = `The FLUX.1 Kontext [pro] text-to-image delivers state-of-the-art image generation results with unprecedented prompt following, photorealistic rendering, and flawless typography.
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-pro/kontext/text-to-image",
    unitPrice: 0.04,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"], description: "The aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "2", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for the generated image. 1 being the most strict and 5 being the most permissive." })
  declare safety_tolerance: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Whether to enhance the prompt for better results." })
  declare enhance_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "2");
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = String(this.seed ?? "");
    const enhancePrompt = Boolean(this.enhance_prompt ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "num_images": numImages,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "enhance_prompt": enhancePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-pro/kontext/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxV1ProUltra extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxV1ProUltra";
  static readonly title = "Flux V1 Pro Ultra";
  static readonly description = `FLUX.1 Pro Ultra delivers the highest quality image generation with enhanced detail and realism.
image, generation, flux, pro, ultra, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-pro/v1.1-ultra",
    unitPrice: 0.06,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "str", default: "16:9", description: "Aspect ratio for the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "bool", default: false, description: "Generate less processed, more natural results" })
  declare raw: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "image", default: "", description: "The image URL to generate an image from." })
  declare image: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "2", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for the generated image. 1 being the most strict and 5 being the most permissive." })
  declare safety_tolerance: any;

  @prop({ type: "float", default: 0.1, description: "Strength of image prompt influence (0-1)" })
  declare image_prompt_strength: any;

  @prop({ type: "str", default: "", description: "Seed for reproducible results. Use -1 for random" })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Whether to enhance the prompt for better results." })
  declare enhance_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const numImages = Number(this.num_images ?? 1);
    const raw = Boolean(this.raw ?? false);
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "2");
    const imagePromptStrength = Number(this.image_prompt_strength ?? 0.1);
    const seed = String(this.seed ?? "");
    const enhancePrompt = Boolean(this.enhance_prompt ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "num_images": numImages,
      "raw": raw,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "image_prompt_strength": imagePromptStrength,
      "seed": seed,
      "enhance_prompt": enhancePrompt,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-pro/v1.1-ultra", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxProV11UltraFinetuned extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxProV11UltraFinetuned";
  static readonly title = "Flux Pro V11 Ultra Finetuned";
  static readonly description = `FLUX1.1 [pro] ultra fine-tuned is the newest version of FLUX1.1 [pro] with a fine-tuned LoRA, maintaining professional-grade image quality while delivering up to 2K resolution with improved photo realism.
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux-pro/v1.1-ultra-finetuned",
    unitPrice: 0.07,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "str", default: "16:9", description: "The aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "float", default: 0, description: "\n        Controls finetune influence.\n        Increase this value if your target concept isn't showing up strongly enough.\n        The optimal setting depends on your finetune and prompt\n        " })
  declare finetune_strength: any;

  @prop({ type: "bool", default: false, description: "Whether to enhance the prompt for better results." })
  declare enhance_prompt: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "str", default: "", description: "References your specific model" })
  declare finetune_id: any;

  @prop({ type: "image", default: "", description: "The image URL to generate an image from." })
  declare image: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "2", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for the generated image. 1 being the most strict and 5 being the most permissive." })
  declare safety_tolerance: any;

  @prop({ type: "float", default: 0.1, description: "The strength of the image prompt, between 0 and 1." })
  declare image_prompt_strength: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Generate less processed, more natural-looking images." })
  declare raw: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const numImages = Number(this.num_images ?? 1);
    const finetuneStrength = Number(this.finetune_strength ?? 0);
    const enhancePrompt = Boolean(this.enhance_prompt ?? false);
    const outputFormat = String(this.output_format ?? "jpeg");
    const finetuneId = String(this.finetune_id ?? "");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "2");
    const imagePromptStrength = Number(this.image_prompt_strength ?? 0.1);
    const seed = String(this.seed ?? "");
    const raw = Boolean(this.raw ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "num_images": numImages,
      "finetune_strength": finetuneStrength,
      "enhance_prompt": enhancePrompt,
      "output_format": outputFormat,
      "finetune_id": finetuneId,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "image_prompt_strength": imagePromptStrength,
      "seed": seed,
      "raw": raw,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-pro/v1.1-ultra-finetuned", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxDev extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxDev";
  static readonly title = "Flux Dev";
  static readonly description = `FLUX.1 [dev] is a powerful open-weight text-to-image model with 12 billion parameters. Optimized for prompt following and visual quality.
image, generation, flux, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux/dev",
    unitPrice: 0.025,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "enum", default: "landscape_4_3", description: "Size preset for the generated image" })
  declare image_size: any;

  @prop({ type: "enum", default: "none", values: ["none", "regular", "high"], description: "The speed of the generation. The higher the speed, the faster the generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "How strictly to follow the prompt. Higher values are more literal" })
  declare guidance_scale: any;

  @prop({ type: "int", default: -1, description: "Seed for reproducible results. Use -1 for random" })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. More steps typically improve quality" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "Enable safety checker to filter unsafe content" })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "none");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = Number(this.seed ?? -1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux/dev", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxKrea extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxKrea";
  static readonly title = "Flux Krea";
  static readonly description = `FLUX.1 Krea [dev]
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux/krea",
    unitPrice: 0.025,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "none", values: ["none", "regular", "high"], description: "The speed of the generation. The higher the speed, the faster the generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 4.5, description: "\n        The CFG (Classifier Free Guidance) scale is a measure of how close you want\n        the model to stick to your prompt when looking for a related image to show you.\n    " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n        The same seed and the same prompt given to the same version of the model\n        will output the same image every time.\n    " })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "none");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 4.5);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux/krea", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxSchnell extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxSchnell";
  static readonly title = "Flux Schnell";
  static readonly description = `FLUX.1 [schnell] is a fast distilled version of FLUX.1 optimized for speed. Can generate high-quality images in 1-4 steps.
image, generation, flux, fast, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux/schnell",
    unitPrice: 0.003,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "enum", default: "landscape_4_3", description: "Size preset for the generated image" })
  declare image_size: any;

  @prop({ type: "enum", default: "none", values: ["none", "regular", "high"], description: "The speed of the generation. The higher the speed, the faster the generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "\n        The CFG (Classifier Free Guidance) scale is a measure of how close you want\n        the model to stick to your prompt when looking for a related image to show you.\n    " })
  declare guidance_scale: any;

  @prop({ type: "int", default: -1, description: "Seed for reproducible results. Use -1 for random" })
  declare seed: any;

  @prop({ type: "int", default: 4, description: "Number of denoising steps (1-4 recommended for schnell)" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "Enable safety checker to filter unsafe content" })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "none");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = Number(this.seed ?? -1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux/schnell", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class FluxSrpo extends FalNode {
  static readonly nodeType = "fal.text_to_image.FluxSrpo";
  static readonly title = "Flux Srpo";
  static readonly description = `FLUX.1 SRPO [dev]
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/flux/srpo",
    unitPrice: 0.025,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "none", values: ["none", "regular", "high"], description: "The speed of the generation. The higher the speed, the faster the generation." })
  declare acceleration: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 4.5, description: "\n        The CFG (Classifier Free Guidance) scale is a measure of how close you want\n        the model to stick to your prompt when looking for a related image to show you.\n    " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n        The same seed and the same prompt given to the same version of the model\n        will output the same image every time.\n    " })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "none");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 4.5);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux/srpo", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Gemini25FlashImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.Gemini25FlashImage";
  static readonly title = "Gemini25 Flash Image";
  static readonly description = `Gemini 2.5 Flash Image
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]", "description": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/gemini-25-flash-image",
    unitPrice: 0.0398,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "1:1", values: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"], description: "The aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "4", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for content moderation. 1 is the most strict (blocks most content), 6 is the least strict." })
  declare safety_tolerance: any;

  @prop({ type: "str", default: "", description: "The seed for the random number generator." })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Experimental parameter to limit the number of generations from each round of prompting to 1. Set to 'True' to to disregard any instructions in the prompt regarding the number of images to generate." })
  declare limit_generations: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const limitGenerations = Boolean(this.limit_generations ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "seed": seed,
      "limit_generations": limitGenerations,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/gemini-25-flash-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Gemini3ProImagePreview extends FalNode {
  static readonly nodeType = "fal.text_to_image.Gemini3ProImagePreview";
  static readonly title = "Gemini3 Pro Image Preview";
  static readonly description = `Gemini 3 Pro Image Preview
generation, text-to-image, txt2img, ai-art, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "description": "str", "images": "list[ImageFile]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/gemini-3-pro-image-preview",
    unitPrice: 0.15,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "enum", default: "1K", values: ["1K", "2K", "4K"], description: "The resolution of the image to generate." })
  declare resolution: any;

  @prop({ type: "bool", default: false, description: "Enable web search for the image generation task. This will allow the model to use the latest information from the web to generate the image." })
  declare enable_web_search: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "1:1", description: "The aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "4", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for content moderation. 1 is the most strict (blocks most content), 6 is the least strict." })
  declare safety_tolerance: any;

  @prop({ type: "str", default: "", description: "The seed for the random number generator." })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Experimental parameter to limit the number of generations from each round of prompting to 1. Set to 'True' to to disregard any instructions in the prompt regarding the number of images to generate." })
  declare limit_generations: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1K");
    const enableWebSearch = Boolean(this.enable_web_search ?? false);
    const numImages = Number(this.num_images ?? 1);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const limitGenerations = Boolean(this.limit_generations ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "resolution": resolution,
      "enable_web_search": enableWebSearch,
      "num_images": numImages,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "seed": seed,
      "limit_generations": limitGenerations,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/gemini-3-pro-image-preview", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Gemini31FlashImagePreview extends FalNode {
  static readonly nodeType = "fal.text_to_image.Gemini31FlashImagePreview";
  static readonly title = "Gemini31 Flash Image Preview";
  static readonly description = `Gemini 3.1 Flash Image (a.k.a Nano Banana 2) is Google's new state-of-the-art fast image generation and editing model
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "description": "str", "images": "list[ImageFile]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/gemini-3.1-flash-image-preview",
    unitPrice: 0.08,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "bool", default: false, description: "Enable web search for the image generation task. This will allow the model to use the latest information from the web to generate the image." })
  declare enable_web_search: any;

  @prop({ type: "enum", default: "1K", values: ["0.5K", "1K", "2K", "4K"], description: "The resolution of the image to generate." })
  declare resolution: any;

  @prop({ type: "str", default: "auto", description: "The aspect ratio of the generated image. Supports extreme ratios: 4:1, 1:4, 8:1, 1:8. Use \"auto\" to let the model decide based on the prompt." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "str", default: "", description: "When set, enables model thinking with the given level ('minimal' or 'high') and includes thoughts in the generation. Omit to disable." })
  declare thinking_level: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "4", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for content moderation. 1 is the most strict (blocks most content), 6 is the least strict." })
  declare safety_tolerance: any;

  @prop({ type: "str", default: "", description: "The seed for the random number generator." })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "Experimental parameter to limit the number of generations from each round of prompting to 1. Set to 'True' to to disregard any instructions in the prompt regarding the number of images to generate and ignore any intermediate images generated by the model. This may affect generation quality." })
  declare limit_generations: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const enableWebSearch = Boolean(this.enable_web_search ?? false);
    const resolution = String(this.resolution ?? "1K");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const outputFormat = String(this.output_format ?? "png");
    const thinkingLevel = String(this.thinking_level ?? "");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const limitGenerations = Boolean(this.limit_generations ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "enable_web_search": enableWebSearch,
      "resolution": resolution,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "thinking_level": thinkingLevel,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "seed": seed,
      "limit_generations": limitGenerations,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/gemini-3.1-flash-image-preview", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class GlmImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.GlmImage";
  static readonly title = "Glm Image";
  static readonly description = `GLM Image generates images from text with advanced AI understanding and quality output.
image, generation, glm, ai, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/glm-image",
    unitPrice: 0.05,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt for image generation." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "Output image size." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "Output image format." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If True, the image will be returned as a base64 data URI instead of a URL." })
  declare sync_mode: any;

  @prop({ type: "float", default: 1.5, description: "Classifier-free guidance scale. Higher values make the model follow the prompt more closely." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. The same seed with the same prompt will produce the same image." })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "Enable NSFW safety checking on the generated images." })
  declare enable_safety_checker: any;

  @prop({ type: "bool", default: false, description: "If True, the prompt will be enhanced using an LLM for more detailed and higher quality results." })
  declare enable_prompt_expansion: any;

  @prop({ type: "int", default: 30, description: "Number of diffusion denoising steps. More steps generally produce higher quality images." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 1.5);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
      "enable_prompt_expansion": enablePromptExpansion,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/glm-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class GptImage1Mini extends FalNode {
  static readonly nodeType = "fal.text_to_image.GptImage1Mini";
  static readonly title = "Gpt Image1 Mini";
  static readonly description = `GPT Image 1 Mini
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/gpt-image-1-mini",
    unitPrice: 1,
    billingUnit: "credits",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt for image generation" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "1024x1024", "1536x1024", "1024x1536"], description: "Aspect ratio for the generated image" })
  declare image_size: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "transparent", "opaque"], description: "Background for the generated image" })
  declare background: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "low", "medium", "high"], description: "Quality for the generated image" })
  declare quality: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "Output format for the images" })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "auto");
    const background = String(this.background ?? "auto");
    const quality = String(this.quality ?? "auto");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "background": background,
      "quality": quality,
      "output_format": outputFormat,
      "sync_mode": syncMode,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/gpt-image-1-mini", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class GptImage15 extends FalNode {
  static readonly nodeType = "fal.text_to_image.GptImage15";
  static readonly title = "Gpt Image15";
  static readonly description = `GPT Image 1.5 generates images from text with GPT-powered language understanding and visual creation.
image, generation, gpt, language-ai, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/gpt-image-1.5",
    unitPrice: 1,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt for image generation" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "enum", default: "1024x1024", values: ["1024x1024", "1536x1024", "1024x1536"], description: "Aspect ratio for the generated image" })
  declare image_size: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "transparent", "opaque"], description: "Background for the generated image" })
  declare background: any;

  @prop({ type: "enum", default: "high", values: ["low", "medium", "high"], description: "Quality for the generated image" })
  declare quality: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "Output format for the images" })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "1024x1024");
    const background = String(this.background ?? "auto");
    const quality = String(this.quality ?? "high");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "background": background,
      "quality": quality,
      "output_format": outputFormat,
      "sync_mode": syncMode,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/gpt-image-1.5", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class GptImage1TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.GptImage1TextToImage";
  static readonly title = "Gpt Image1 Text To Image";
  static readonly description = `OpenAI's latest image generation and editing model: gpt-1-image.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/gpt-image-1/text-to-image",
    unitPrice: 1,
    billingUnit: "credits",
    currency: "USD",
  };

  @prop({ type: "enum", default: "auto", values: ["auto", "transparent", "opaque"], description: "Background for the generated image" })
  declare background: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare num_images: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "1024x1024", "1536x1024", "1024x1536"], description: "Aspect ratio for the generated image" })
  declare image_size: any;

  @prop({ type: "str", default: "", description: "The prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "low", "medium", "high"], description: "Quality for the generated image" })
  declare quality: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "Output format for the images" })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const background = String(this.background ?? "auto");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "auto");
    const prompt = String(this.prompt ?? "");
    const quality = String(this.quality ?? "auto");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);

    const args: Record<string, unknown> = {
      "background": background,
      "num_images": numImages,
      "image_size": imageSize,
      "prompt": prompt,
      "quality": quality,
      "output_format": outputFormat,
      "sync_mode": syncMode,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/gpt-image-1/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class HidreamI1Dev extends FalNode {
  static readonly nodeType = "fal.text_to_image.HidreamI1Dev";
  static readonly title = "Hidream I1 Dev";
  static readonly description = `HiDream-I1 dev is a new open-source image generative foundation model with 17B parameters that achieves state-of-the-art image generation quality within seconds.
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hidream-i1-dev",
    unitPrice: 0.03,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        " })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "negative_prompt": negativePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hidream-i1-dev", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class HidreamI1Fast extends FalNode {
  static readonly nodeType = "fal.text_to_image.HidreamI1Fast";
  static readonly title = "Hidream I1 Fast";
  static readonly description = `HiDream-I1 fast is a new open-source image generative foundation model with 17B parameters that achieves state-of-the-art image generation quality within 16 steps.
`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hidream-i1-fast",
    unitPrice: 0.01,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 16, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "str", default: "", description: "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        " })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 16);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
      "negative_prompt": negativePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hidream-i1-fast", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class HidreamI1Full extends FalNode {
  static readonly nodeType = "fal.text_to_image.HidreamI1Full";
  static readonly title = "Hidream I1 Full";
  static readonly description = `HiDream-I1 full is a new open-source image generative foundation model with 17B parameters that achieves state-of-the-art image generation quality within seconds.
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hidream-i1-full",
    unitPrice: 0.05,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "str", default: "", description: "A list of LoRAs to apply to the model. Each LoRA specifies its path, scale, and optional weight name." })
  declare loras: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 50, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "str", default: "", description: "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        " })
  declare negative_prompt: any;

  @prop({ type: "float", default: 5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "");
    const outputFormat = String(this.output_format ?? "jpeg");
    const loras = String(this.loras ?? "");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "loras": loras,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
      "negative_prompt": negativePrompt,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hidream-i1-full", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class HunyuanImageV3InstructTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.HunyuanImageV3InstructTextToImage";
  static readonly title = "Hunyuan Image V3 Instruct Text To Image";
  static readonly description = `Hunyuan Image v3 Instruct generates high-quality images from text with advanced instruction understanding.
image, generation, hunyuan, v3, instruct, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hunyuan-image/v3/instruct/text-to-image",
    unitPrice: 0.09,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "auto", description: "The desired size of the generated image. If auto, image size will be determined by the model." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "Controls how much the model adheres to the prompt. Higher values mean stricter adherence." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducible results. If None, a random seed is used." })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "auto");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-image-3-instruct-gpu", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class HunyuanImageV21TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.HunyuanImageV21TextToImage";
  static readonly title = "Hunyuan Image V21 Text To Image";
  static readonly description = `Hunyuan Image
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hunyuan-image/v2.1/text-to-image",
    unitPrice: 0.1,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The desired size of the generated image." })
  declare image_size: any;

  @prop({ type: "bool", default: true, description: "Enable prompt enhancement for potentially better results." })
  declare use_reprompt: any;

  @prop({ type: "bool", default: false, description: "Enable the refiner model for improved image quality." })
  declare use_refiner: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "Controls how much the model adheres to the prompt. Higher values mean stricter adherence." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducible results. If None, a random seed is used." })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The negative prompt to guide the image generation away from certain concepts." })
  declare negative_prompt: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const useReprompt = Boolean(this.use_reprompt ?? true);
    const useRefiner = Boolean(this.use_refiner ?? false);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "use_reprompt": useReprompt,
      "use_refiner": useRefiner,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-image/v2.1/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class HunyuanImageV3TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.HunyuanImageV3TextToImage";
  static readonly title = "Hunyuan Image V3 Text To Image";
  static readonly description = `Hunyuan Image
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hunyuan-image/v3/text-to-image",
    unitPrice: 0.1,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt for image-to-image." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The desired size of the generated image." })
  declare image_size: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps." })
  declare num_inference_steps: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: false, description: "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning." })
  declare enable_prompt_expansion: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducible results. If None, a random seed is used." })
  declare seed: any;

  @prop({ type: "float", default: 7.5, description: "Controls how much the model adheres to the prompt. Higher values mean stricter adherence." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "The negative prompt to guide the image generation away from certain concepts." })
  declare negative_prompt: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);
    const seed = String(this.seed ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "num_inference_steps": numInferenceSteps,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_prompt_expansion": enablePromptExpansion,
      "seed": seed,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-image/v3/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class IdeogramV2 extends FalNode {
  static readonly nodeType = "fal.text_to_image.IdeogramV2";
  static readonly title = "Ideogram V2";
  static readonly description = `Ideogram V2 is a state-of-the-art image generation model optimized for commercial and creative use, featuring exceptional typography handling and realistic outputs.
image, generation, ai, typography, realistic, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/ideogram/v2",
    unitPrice: 0.08,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["10:16", "16:10", "9:16", "16:9", "4:3", "3:4", "1:1", "1:3", "3:1", "3:2", "2:3"], description: "The aspect ratio of the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "general", "realistic", "design", "render_3D", "anime"], description: "The style of the generated image" })
  declare style: any;

  @prop({ type: "bool", default: true, description: "Whether to expand the prompt with MagicPrompt functionality" })
  declare expand_prompt: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "str", default: "", description: "Seed for reproducible results. Use -1 for random" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "A negative prompt to avoid in the generated image" })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const style = String(this.style ?? "auto");
    const expandPrompt = Boolean(this.expand_prompt ?? true);
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "style": style,
      "expand_prompt": expandPrompt,
      "sync_mode": syncMode,
      "seed": seed,
      "negative_prompt": negativePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ideogram/v2", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class IdeogramV2a extends FalNode {
  static readonly nodeType = "fal.text_to_image.IdeogramV2a";
  static readonly title = "Ideogram V2a";
  static readonly description = `Generate high-quality images, posters, and logos with Ideogram V2A. Features exceptional typography handling and realistic outputs optimized for commercial and creative use.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/ideogram/v2a",
    unitPrice: 0.04,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["10:16", "16:10", "9:16", "16:9", "4:3", "3:4", "1:1", "1:3", "3:1", "3:2", "2:3"], description: "The aspect ratio of the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "general", "realistic", "design", "render_3D", "anime"], description: "The style of the generated image" })
  declare style: any;

  @prop({ type: "str", default: "", description: "Seed for the random number generator" })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "Whether to expand the prompt with MagicPrompt functionality." })
  declare expand_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const syncMode = Boolean(this.sync_mode ?? false);
    const style = String(this.style ?? "auto");
    const seed = String(this.seed ?? "");
    const expandPrompt = Boolean(this.expand_prompt ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "sync_mode": syncMode,
      "style": style,
      "seed": seed,
      "expand_prompt": expandPrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ideogram/v2a", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class IdeogramV2aTurbo extends FalNode {
  static readonly nodeType = "fal.text_to_image.IdeogramV2aTurbo";
  static readonly title = "Ideogram V2a Turbo";
  static readonly description = `Accelerated image generation with Ideogram V2A Turbo. Create high-quality visuals, posters, and logos with enhanced speed while maintaining Ideogram's signature quality.
generation, text-to-image, txt2img, ai-art, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/ideogram/v2a/turbo",
    unitPrice: 0.025,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["10:16", "16:10", "9:16", "16:9", "4:3", "3:4", "1:1", "1:3", "3:1", "3:2", "2:3"], description: "The aspect ratio of the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "general", "realistic", "design", "render_3D", "anime"], description: "The style of the generated image" })
  declare style: any;

  @prop({ type: "str", default: "", description: "Seed for the random number generator" })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "Whether to expand the prompt with MagicPrompt functionality." })
  declare expand_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const syncMode = Boolean(this.sync_mode ?? false);
    const style = String(this.style ?? "auto");
    const seed = String(this.seed ?? "");
    const expandPrompt = Boolean(this.expand_prompt ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "sync_mode": syncMode,
      "style": style,
      "seed": seed,
      "expand_prompt": expandPrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ideogram/v2a/turbo", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class IdeogramV3 extends FalNode {
  static readonly nodeType = "fal.text_to_image.IdeogramV3";
  static readonly title = "Ideogram V3";
  static readonly description = `Ideogram V3 is the latest generation with enhanced text rendering, superior image quality, and expanded creative controls.
image, generation, ideogram, typography, text-rendering, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/ideogram/v3",
    unitPrice: 0.03,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The resolution of the generated image" })
  declare image_size: any;

  @prop({ type: "str", default: "", description: "The style preset for the generated image" })
  declare style: any;

  @prop({ type: "str", default: "", description: "Style preset for generation. The chosen style preset will guide the generation." })
  declare style_preset: any;

  @prop({ type: "bool", default: true, description: "Automatically enhance the prompt for better results" })
  declare expand_prompt: any;

  @prop({ type: "enum", default: "BALANCED", values: ["TURBO", "BALANCED", "QUALITY"], description: "The rendering speed to use." })
  declare rendering_speed: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "str", default: "", description: "A color palette for generation, must EITHER be specified via one of the presets (name) or explicitly via hexadecimal representations of the color with optional weights (members)" })
  declare color_palette: any;

  @prop({ type: "str", default: "", description: "A list of 8 character hexadecimal codes representing the style of the image. Cannot be used in conjunction with style_reference_images or style" })
  declare style_codes: any;

  @prop({ type: "str", default: "", description: "Seed for the random number generator" })
  declare seed: any;

  @prop({ type: "list[image]", default: "", description: "A set of images to use as style references (maximum total size 10MB across all style references). The images should be in JPEG, PNG or WebP format" })
  declare images: any;

  @prop({ type: "str", default: "", description: "Description of what to exclude from an image. Descriptions in the prompt take precedence to descriptions in the negative prompt." })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const style = String(this.style ?? "");
    const stylePreset = String(this.style_preset ?? "");
    const expandPrompt = Boolean(this.expand_prompt ?? true);
    const renderingSpeed = String(this.rendering_speed ?? "BALANCED");
    const syncMode = Boolean(this.sync_mode ?? false);
    const colorPalette = String(this.color_palette ?? "");
    const styleCodes = String(this.style_codes ?? "");
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "style": style,
      "style_preset": stylePreset,
      "expand_prompt": expandPrompt,
      "rendering_speed": renderingSpeed,
      "sync_mode": syncMode,
      "color_palette": colorPalette,
      "style_codes": styleCodes,
      "seed": seed,
      "negative_prompt": negativePrompt,
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

    const res = await falSubmit(apiKey, "fal-ai/ideogram/v3", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Imagen4Preview extends FalNode {
  static readonly nodeType = "fal.text_to_image.Imagen4Preview";
  static readonly title = "Imagen4 Preview";
  static readonly description = `Google’s highest quality image generation model
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]", "description": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/imagen4/preview",
    unitPrice: 0.04,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "enum", default: "1K", values: ["1K", "2K"], description: "The resolution of the generated image." })
  declare resolution: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "9:16", "4:3", "3:4"], description: "The aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "4", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for content moderation. 1 is the most strict (blocks most content), 6 is the least strict." })
  declare safety_tolerance: any;

  @prop({ type: "str", default: "", description: "The seed for the random number generator." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1K");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "resolution": resolution,
      "aspect_ratio": aspectRatio,
      "num_images": numImages,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/imagen4/preview", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Imagen4PreviewFast extends FalNode {
  static readonly nodeType = "fal.text_to_image.Imagen4PreviewFast";
  static readonly title = "Imagen4 Preview Fast";
  static readonly description = `Google’s highest quality image generation model
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]", "description": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/imagen4/preview/fast",
    unitPrice: 0.02,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "9:16", "4:3", "3:4"], description: "The aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "4", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for content moderation. 1 is the most strict (blocks most content), 6 is the least strict." })
  declare safety_tolerance: any;

  @prop({ type: "str", default: "", description: "The seed for the random number generator." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/imagen4/preview/fast", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Imagen4PreviewUltra extends FalNode {
  static readonly nodeType = "fal.text_to_image.Imagen4PreviewUltra";
  static readonly title = "Imagen4 Preview Ultra";
  static readonly description = `Google's highest quality image generation model
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]", "description": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/imagen4/preview/ultra",
    unitPrice: 0.06,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "enum", default: "1K", values: ["1K", "2K"], description: "The resolution of the generated image." })
  declare resolution: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "9:16", "4:3", "3:4"], description: "The aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "4", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for content moderation. 1 is the most strict (blocks most content), 6 is the least strict." })
  declare safety_tolerance: any;

  @prop({ type: "str", default: "", description: "The seed for the random number generator." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1K");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "resolution": resolution,
      "aspect_ratio": aspectRatio,
      "num_images": numImages,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/imagen4/preview/ultra", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class KlingImageO3TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.KlingImageO3TextToImage";
  static readonly title = "Kling Image O3 Text To Image";
  static readonly description = `Kling Image O3 generates high-quality images from text prompts with refined detail.
image, generation, kling, o3, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/kling-image/o3/text-to-image",
    unitPrice: 0.028,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt for image generation. Max 2500 characters." })
  declare prompt: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"], description: "Aspect ratio of generated images." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "1K", values: ["1K", "2K", "4K"], description: "Image generation resolution. 1K: standard, 2K: high-res, 4K: ultra high-res." })
  declare resolution: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate (1-9). Only used when result_type is 'single'." })
  declare num_images: any;

  @prop({ type: "str", default: "", description: "Number of images in series (2-9). Only used when result_type is 'series'." })
  declare series_amount: any;

  @prop({ type: "enum", default: "single", values: ["single", "series"], description: "Result type. 'single' for one image, 'series' for a series of related images." })
  declare result_type: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI." })
  declare sync_mode: any;

  @prop({ type: "str", default: "", description: "Optional: Elements (characters/objects) for face control. Reference in prompt as @Element1, @Element2, etc." })
  declare elements: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "1K");
    const numImages = Number(this.num_images ?? 1);
    const seriesAmount = String(this.series_amount ?? "");
    const resultType = String(this.result_type ?? "single");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const elements = String(this.elements ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "resolution": resolution,
      "num_images": numImages,
      "series_amount": seriesAmount,
      "result_type": resultType,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "elements": elements,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kling-image/o3/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class KlingImageV3TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.KlingImageV3TextToImage";
  static readonly title = "Kling Image V3 Text To Image";
  static readonly description = `Kling V3: Latest Kling Image model
text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/kling-image/v3/text-to-image",
    unitPrice: 0.028,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt for image generation. Max 2500 characters." })
  declare prompt: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"], description: "Aspect ratio of generated images." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "1K", values: ["1K", "2K"], description: "Image generation resolution. 1K: standard, 2K: high-res." })
  declare resolution: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate (1-9)." })
  declare num_images: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI." })
  declare sync_mode: any;

  @prop({ type: "str", default: "", description: "Optional: Elements (characters/objects) to include in the image for face control. Each element can have a frontal image and optionally reference images." })
  declare elements: any;

  @prop({ type: "str", default: "", description: "Negative text prompt. It is recommended to supplement negative prompt information through negative sentences directly within positive prompts." })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const resolution = String(this.resolution ?? "1K");
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const elements = String(this.elements ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "resolution": resolution,
      "num_images": numImages,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "elements": elements,
      "negative_prompt": negativePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/kling-image/v3/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class LongcatImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.LongcatImage";
  static readonly title = "Longcat Image";
  static readonly description = `Longcat Image generates creative and unique images from text with distinctive AI characteristics.
image, generation, longcat, creative, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/longcat-image",
    unitPrice: 0.13,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 4.5, description: "The guidance scale to use for the image generation." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const guidanceScale = Number(this.guidance_scale ?? 4.5);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/longcat-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Lora extends FalNode {
  static readonly nodeType = "fal.text_to_image.Lora";
  static readonly title = "Lora";
  static readonly description = `Run Any Stable Diffusion model with customizable LoRA weights.
generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "debug_latents": "str", "seed": "int", "has_nsfw_concepts": "list[bool]", "debug_per_pass_latents": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/lora",
    unitPrice: 0.00125,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to use for generating the image. Be as descriptive as possible for best results." })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd", description: "\n            The size of the generated image. You can choose between some presets or custom height and width\n            that **must be multiples of 8**.\n        " })
  declare image_size: any;

  @prop({ type: "int", default: 4096, description: "The size of the tiles to be used for the image generation." })
  declare tile_height: any;

  @prop({ type: "list[Embedding]", default: [], description: "\n            The embeddings to use for the image generation. Only a single embedding is supported at the moment.\n            The embeddings will be used to map the tokens in the prompt to the embedding weights.\n        " })
  declare embeddings: any;

  @prop({ type: "image", default: "", description: "\n            The URL of the IC Light model to use for the image generation.\n        " })
  declare ic_light_model_url: any;

  @prop({ type: "bool", default: false, description: "If set to true, the latents will be saved for debugging per pass." })
  declare debug_per_pass_latents: any;

  @prop({ type: "list[IPAdapter]", default: [], description: "\n            The IP adapter to use for the image generation.\n        " })
  declare ip_adapter: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "str", default: "", description: "\n            Optionally override the sigmas to use for the denoising process. Only works with schedulers which support the 'sigmas' argument in their 'set_sigmas' method.\n            Defaults to not overriding, in which case the scheduler automatically sets the sigmas based on the 'num_inference_steps' parameter.\n            If set to a custom sigma schedule, the 'num_inference_steps' parameter will be ignored. Cannot be set if 'timesteps' is set.\n        " })
  declare sigmas: any;

  @prop({ type: "str", default: "pytorch_model.bin", description: "\n            The weight name of the image encoder model to use for the image generation.\n        " })
  declare image_encoder_weight_name: any;

  @prop({ type: "float", default: 7.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "int", default: 2048, description: "The stride of the tiles to be used for the image generation." })
  declare tile_stride_width: any;

  @prop({ type: "str", default: "", description: "Scheduler / sampler to use for the image denoising process." })
  declare scheduler: any;

  @prop({ type: "str", default: "", description: "\n            Optionally override the timesteps to use for the denoising process. Only works with schedulers which support the 'timesteps' argument in their 'set_timesteps' method.\n            Defaults to not overriding, in which case the scheduler automatically sets the timesteps based on the 'num_inference_steps' parameter.\n            If set to a custom timestep schedule, the 'num_inference_steps' parameter will be ignored. Cannot be set if 'sigmas' is set.\n        " })
  declare timesteps: any;

  @prop({ type: "str", default: "", description: "URL or HuggingFace ID of the base model to generate the image." })
  declare model_name: any;

  @prop({ type: "bool", default: false, description: "\n            If set to true, the prompt weighting syntax will be used.\n            Additionally, this will lift the 77 token limit by averaging embeddings.\n        " })
  declare prompt_weighting: any;

  @prop({ type: "str", default: "", description: "The variant of the model to use for huggingface models, e.g. 'fp16'." })
  declare variant: any;

  @prop({ type: "str", default: "", description: "\n            The subfolder of the image encoder model to use for the image generation.\n        " })
  declare image_encoder_subfolder: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "\n            If set to true, the controlnet will be applied to only the conditional predictions.\n        " })
  declare controlnet_guess_mode: any;

  @prop({ type: "image", default: "", description: "\n            The URL of the IC Light model background image to use for the image generation.\n            Make sure to use a background compatible with the model.\n        " })
  declare ic_light_model_background_image: any;

  @prop({ type: "bool", default: false, description: "\n            Whether to set the rescale_betas_snr_zero option or not for the sampler\n        " })
  declare rescale_betas_snr_zero: any;

  @prop({ type: "int", default: 4096, description: "The size of the tiles to be used for the image generation." })
  declare tile_width: any;

  @prop({ type: "enum", default: "epsilon", values: ["v_prediction", "epsilon"], description: "\n            The type of prediction to use for the image generation.\n            The 'epsilon' is the default.\n        " })
  declare prediction_type: any;

  @prop({ type: "float", default: 0, description: "The eta value to be used for the image generation." })
  declare eta: any;

  @prop({ type: "str", default: "", description: "\n            The path to the image encoder model to use for the image generation.\n        " })
  declare image_encoder_path: any;

  @prop({ type: "bool", default: false, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The negative prompt to use.Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        " })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare image_format: any;

  @prop({ type: "int", default: 1, description: "\n            Number of images to generate in one request. Note that the higher the batch size,\n            the longer it will take to generate the images.\n        " })
  declare num_images: any;

  @prop({ type: "bool", default: false, description: "If set to true, the latents will be saved for debugging." })
  declare debug_latents: any;

  @prop({ type: "image", default: "", description: "\n            The URL of the IC Light model image to use for the image generation.\n        " })
  declare ic_light_image: any;

  @prop({ type: "str", default: "", description: "URL or HuggingFace ID of the custom U-Net model to use for the image generation." })
  declare unet_name: any;

  @prop({ type: "int", default: 2048, description: "The stride of the tiles to be used for the image generation." })
  declare tile_stride_height: any;

  @prop({ type: "int", default: 0, description: "\n            Skips part of the image generation process, leading to slightly different results.\n            This means the image renders faster, too.\n        " })
  declare clip_skip: any;

  @prop({ type: "list[ControlNet]", default: [], description: "\n            The control nets to use for the image generation. You can use any number of control nets\n            and they will be applied to the image at the specified timesteps.\n        " })
  declare controlnets: any;

  @prop({ type: "int", default: 30, description: "\n            Increasing the amount of steps tells Stable Diffusion that it should take more steps\n            to generate your final result which can increase the amount of detail in your image.\n        " })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const tileHeight = Number(this.tile_height ?? 4096);
    const embeddings = String(this.embeddings ?? []);
    const debugPerPassLatents = Boolean(this.debug_per_pass_latents ?? false);
    const ipAdapter = String(this.ip_adapter ?? []);
    const loras = String(this.loras ?? []);
    const sigmas = String(this.sigmas ?? "");
    const imageEncoderWeightName = String(this.image_encoder_weight_name ?? "pytorch_model.bin");
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const tileStrideWidth = Number(this.tile_stride_width ?? 2048);
    const scheduler = String(this.scheduler ?? "");
    const timesteps = String(this.timesteps ?? "");
    const modelName = String(this.model_name ?? "");
    const promptWeighting = Boolean(this.prompt_weighting ?? false);
    const variant = String(this.variant ?? "");
    const imageEncoderSubfolder = String(this.image_encoder_subfolder ?? "");
    const seed = String(this.seed ?? "");
    const controlnetGuessMode = Boolean(this.controlnet_guess_mode ?? false);
    const rescaleBetasSnrZero = Boolean(this.rescale_betas_snr_zero ?? false);
    const tileWidth = Number(this.tile_width ?? 4096);
    const predictionType = String(this.prediction_type ?? "epsilon");
    const eta = Number(this.eta ?? 0);
    const imageEncoderPath = String(this.image_encoder_path ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");
    const imageFormat = String(this.image_format ?? "png");
    const numImages = Number(this.num_images ?? 1);
    const debugLatents = Boolean(this.debug_latents ?? false);
    const unetName = String(this.unet_name ?? "");
    const tileStrideHeight = Number(this.tile_stride_height ?? 2048);
    const clipSkip = Number(this.clip_skip ?? 0);
    const controlnets = String(this.controlnets ?? []);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "tile_height": tileHeight,
      "embeddings": embeddings,
      "debug_per_pass_latents": debugPerPassLatents,
      "ip_adapter": ipAdapter,
      "loras": loras,
      "sigmas": sigmas,
      "image_encoder_weight_name": imageEncoderWeightName,
      "guidance_scale": guidanceScale,
      "tile_stride_width": tileStrideWidth,
      "scheduler": scheduler,
      "timesteps": timesteps,
      "model_name": modelName,
      "prompt_weighting": promptWeighting,
      "variant": variant,
      "image_encoder_subfolder": imageEncoderSubfolder,
      "seed": seed,
      "controlnet_guess_mode": controlnetGuessMode,
      "rescale_betas_snr_zero": rescaleBetasSnrZero,
      "tile_width": tileWidth,
      "prediction_type": predictionType,
      "eta": eta,
      "image_encoder_path": imageEncoderPath,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
      "image_format": imageFormat,
      "num_images": numImages,
      "debug_latents": debugLatents,
      "unet_name": unetName,
      "tile_stride_height": tileStrideHeight,
      "clip_skip": clipSkip,
      "controlnets": controlnets,
      "num_inference_steps": numInferenceSteps,
    };

    const icLightModelUrlRef = this.ic_light_model_url as Record<string, unknown> | undefined;
    if (isRefSet(icLightModelUrlRef)) {
      const icLightModelUrlUrl = await imageToDataUrl(icLightModelUrlRef!) ?? await assetToFalUrl(apiKey, icLightModelUrlRef!);
      if (icLightModelUrlUrl) args["ic_light_model_url"] = icLightModelUrlUrl;
    }

    const icLightModelBackgroundImageRef = this.ic_light_model_background_image as Record<string, unknown> | undefined;
    if (isRefSet(icLightModelBackgroundImageRef)) {
      const icLightModelBackgroundImageUrl = await imageToDataUrl(icLightModelBackgroundImageRef!) ?? await assetToFalUrl(apiKey, icLightModelBackgroundImageRef!);
      if (icLightModelBackgroundImageUrl) args["ic_light_model_background_image_url"] = icLightModelBackgroundImageUrl;
    }

    const icLightImageRef = this.ic_light_image as Record<string, unknown> | undefined;
    if (isRefSet(icLightImageRef)) {
      const icLightImageUrl = await imageToDataUrl(icLightImageRef!) ?? await assetToFalUrl(apiKey, icLightImageRef!);
      if (icLightImageUrl) args["ic_light_image_url"] = icLightImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class LuminaImageV2 extends FalNode {
  static readonly nodeType = "fal.text_to_image.LuminaImageV2";
  static readonly title = "Lumina Image V2";
  static readonly description = `Lumina-Image-2.0 is a 2 billion parameter flow-based diffusion transforer which features improved performance in image quality, typography, complex prompt understanding, and resource-efficiency.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/lumina-image/v2",
    unitPrice: 0.075,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "float", default: 1, description: "The ratio of the timestep interval to apply normalization-based guidance scale." })
  declare cfg_trunc_ratio: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "float", default: 4, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "You are an assistant designed to generate superior images with the superior degree of image-text alignment based on textual prompts or user prompts.", description: "The system prompt to use." })
  declare system_prompt: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 30, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "str", default: "", description: "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        " })
  declare negative_prompt: any;

  @prop({ type: "bool", default: true, description: "Whether to apply normalization-based guidance scale." })
  declare cfg_normalization: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const cfgTruncRatio = Number(this.cfg_trunc_ratio ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const guidanceScale = Number(this.guidance_scale ?? 4);
    const systemPrompt = String(this.system_prompt ?? "You are an assistant designed to generate superior images with the superior degree of image-text alignment based on textual prompts or user prompts.");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const cfgNormalization = Boolean(this.cfg_normalization ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "cfg_trunc_ratio": cfgTruncRatio,
      "image_size": imageSize,
      "guidance_scale": guidanceScale,
      "system_prompt": systemPrompt,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
      "negative_prompt": negativePrompt,
      "cfg_normalization": cfgNormalization,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/lumina-image/v2", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class MinimaxImage01 extends FalNode {
  static readonly nodeType = "fal.text_to_image.MinimaxImage01";
  static readonly title = "Minimax Image01";
  static readonly description = `Generate high quality images from text prompts using MiniMax Image-01. Longer text prompts will result in better quality images.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/minimax/image-01",
    unitPrice: 0.01,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt for image generation (max 1500 characters)" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"], description: "Aspect ratio of the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: false, description: "Whether to enable automatic prompt optimization" })
  declare prompt_optimizer: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate (1-9)" })
  declare num_images: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? false);
    const numImages = Number(this.num_images ?? 1);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "prompt_optimizer": promptOptimizer,
      "num_images": numImages,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/minimax/image-01", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class NanoBanana extends FalNode {
  static readonly nodeType = "fal.text_to_image.NanoBanana";
  static readonly title = "Nano Banana";
  static readonly description = `Nano Banana
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "description": "str", "images": "list[ImageFile]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/nano-banana",
    unitPrice: 0.0398,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "1:1", values: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"], description: "The aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "4", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for content moderation. 1 is the most strict (blocks most content), 6 is the least strict." })
  declare safety_tolerance: any;

  @prop({ type: "str", default: "", description: "The seed for the random number generator." })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Experimental parameter to limit the number of generations from each round of prompting to 1. Set to 'True' to to disregard any instructions in the prompt regarding the number of images to generate." })
  declare limit_generations: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const limitGenerations = Boolean(this.limit_generations ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "seed": seed,
      "limit_generations": limitGenerations,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/nano-banana", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class NanoBanana2 extends FalNode {
  static readonly nodeType = "fal.text_to_image.NanoBanana2";
  static readonly title = "Nano Banana2";
  static readonly description = `Nano Banana 2 is Google's new state-of-the-art fast image generation and editing model
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]", "description": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/nano-banana-2",
    unitPrice: 0.08,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "str", default: "auto", description: "The aspect ratio of the generated image. Supports extreme ratios: 4:1, 1:4, 8:1, 1:8. Use \"auto\" to let the model decide based on the prompt." })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: false, description: "Enable web search for the image generation task. This will allow the model to use the latest information from the web to generate the image." })
  declare enable_web_search: any;

  @prop({ type: "enum", default: "1K", values: ["0.5K", "1K", "2K", "4K"], description: "The resolution of the image to generate." })
  declare resolution: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "str", default: "", description: "When set, enables model thinking with the given level ('minimal' or 'high') and includes thoughts in the generation. Omit to disable." })
  declare thinking_level: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "4", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for content moderation. 1 is the most strict (blocks most content), 6 is the least strict." })
  declare safety_tolerance: any;

  @prop({ type: "str", default: "", description: "The seed for the random number generator." })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "Experimental parameter to limit the number of generations from each round of prompting to 1. Set to 'True' to to disregard any instructions in the prompt regarding the number of images to generate and ignore any intermediate images generated by the model. This may affect generation quality." })
  declare limit_generations: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const enableWebSearch = Boolean(this.enable_web_search ?? false);
    const resolution = String(this.resolution ?? "1K");
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const thinkingLevel = String(this.thinking_level ?? "");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const limitGenerations = Boolean(this.limit_generations ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "enable_web_search": enableWebSearch,
      "resolution": resolution,
      "num_images": numImages,
      "output_format": outputFormat,
      "thinking_level": thinkingLevel,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "seed": seed,
      "limit_generations": limitGenerations,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/nano-banana-2", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class NanoBananaPro extends FalNode {
  static readonly nodeType = "fal.text_to_image.NanoBananaPro";
  static readonly title = "Nano Banana Pro";
  static readonly description = `Nano Banana Pro
generation, text-to-image, txt2img, ai-art, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]", "description": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/nano-banana-pro",
    unitPrice: 0.15,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "str", default: "1:1", description: "The aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: false, description: "Enable web search for the image generation task. This will allow the model to use the latest information from the web to generate the image." })
  declare enable_web_search: any;

  @prop({ type: "enum", default: "1K", values: ["1K", "2K", "4K"], description: "The resolution of the image to generate." })
  declare resolution: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "4", values: ["1", "2", "3", "4", "5", "6"], description: "The safety tolerance level for content moderation. 1 is the most strict (blocks most content), 6 is the least strict." })
  declare safety_tolerance: any;

  @prop({ type: "str", default: "", description: "The seed for the random number generator." })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Experimental parameter to limit the number of generations from each round of prompting to 1. Set to 'True' to to disregard any instructions in the prompt regarding the number of images to generate." })
  declare limit_generations: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const enableWebSearch = Boolean(this.enable_web_search ?? false);
    const resolution = String(this.resolution ?? "1K");
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const safetyTolerance = String(this.safety_tolerance ?? "4");
    const seed = String(this.seed ?? "");
    const limitGenerations = Boolean(this.limit_generations ?? false);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "enable_web_search": enableWebSearch,
      "resolution": resolution,
      "num_images": numImages,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "safety_tolerance": safetyTolerance,
      "seed": seed,
      "limit_generations": limitGenerations,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/nano-banana-pro", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class OmniGenV1 extends FalNode {
  static readonly nodeType = "fal.text_to_image.OmniGenV1";
  static readonly title = "Omni Gen V1";
  static readonly description = `OmniGen V1 is a versatile unified model for multi-modal image generation and editing with text, supporting complex compositional tasks.
image, generation, multi-modal, editing, unified, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/omnigen-v1",
    unitPrice: 0.1,
    billingUnit: "processed megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate or edit an image" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "float", default: 1.6, description: "\n            The Image Guidance scale is a measure of how close you want\n            the model to stick to your input image when looking for a related image to show you.\n        " })
  declare img_guidance_scale: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "list[image]", default: [], description: "URL of images to use while generating the image, Use <img><|image_1|></img> for the first image and so on." })
  declare input_images: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: -1, description: "Seed for reproducible results. Use -1 for random" })
  declare seed: any;

  @prop({ type: "float", default: 3, description: "How strictly to follow the prompt and inputs" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps for generation quality" })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const imgGuidanceScale = Number(this.img_guidance_scale ?? 1.6);
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = Number(this.seed ?? -1);
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "img_guidance_scale": imgGuidanceScale,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
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

    const res = await falSubmit(apiKey, "fal-ai/omnigen-v1", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class OmnigenV2 extends FalNode {
  static readonly nodeType = "fal.text_to_image.OmnigenV2";
  static readonly title = "Omnigen V2";
  static readonly description = `Omnigen V2
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/omnigen-v2",
    unitPrice: 0.15,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate or edit an image. Use specific language like 'Add the bird from image 1 to the desk in image 2' for better results." })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "euler", values: ["euler", "dpmsolver"], description: "The scheduler to use for the diffusion process." })
  declare scheduler: any;

  @prop({ type: "float", default: 1, description: "CFG range end value." })
  declare cfg_range_end: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "(((deformed))), blurry, over saturation, bad anatomy, disfigured, poorly drawn face, mutation, mutated, (extra_limb), (ugly), (poorly drawn hands), fused fingers, messy drawing, broken legs censor, censored, censor_bar", description: "Negative prompt to guide what should not be in the image." })
  declare negative_prompt: any;

  @prop({ type: "float", default: 5, description: "\n            The Text Guidance scale controls how closely the model follows the text prompt.\n            Higher values make the model stick more closely to the prompt.\n        " })
  declare text_guidance_scale: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "float", default: 2, description: "\n            The Image Guidance scale controls how closely the model follows the input images.\n            For image editing: 1.3-2.0, for in-context generation: 2.0-3.0\n        " })
  declare image_guidance_scale: any;

  @prop({ type: "list[image]", default: [], description: "URLs of input images to use for image editing or multi-image generation. Support up to 3 images." })
  declare input_images: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 0, description: "CFG range start value." })
  declare cfg_range_start: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 50, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const scheduler = String(this.scheduler ?? "euler");
    const cfgRangeEnd = Number(this.cfg_range_end ?? 1);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(this.negative_prompt ?? "(((deformed))), blurry, over saturation, bad anatomy, disfigured, poorly drawn face, mutation, mutated, (extra_limb), (ugly), (poorly drawn hands), fused fingers, messy drawing, broken legs censor, censored, censor_bar");
    const textGuidanceScale = Number(this.text_guidance_scale ?? 5);
    const numImages = Number(this.num_images ?? 1);
    const imageGuidanceScale = Number(this.image_guidance_scale ?? 2);
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const cfgRangeStart = Number(this.cfg_range_start ?? 0);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "scheduler": scheduler,
      "cfg_range_end": cfgRangeEnd,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
      "text_guidance_scale": textGuidanceScale,
      "num_images": numImages,
      "image_guidance_scale": imageGuidanceScale,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "cfg_range_start": cfgRangeStart,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
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

    const res = await falSubmit(apiKey, "fal-ai/omnigen-v2", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class OvisImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.OvisImage";
  static readonly title = "Ovis Image";
  static readonly description = `Ovis Image
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/ovis-image",
    unitPrice: 0.012,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 5, description: "The guidance scale to use for the image generation." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "The negative prompt to generate an image from." })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const acceleration = String(this.acceleration ?? "regular");
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "acceleration": acceleration,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ovis-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Phota extends FalNode {
  static readonly nodeType = "fal.text_to_image.Phota";
  static readonly title = "Phota";
  static readonly description = `Phota's model empowers developers, photographers, and creators with personalized photograph generation and editing.
stylized, transform, typography, phota`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/phota",
    unitPrice: 0.09,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text description of the desired image. In case you wish to use specific profiles, refer to them as [[profile_id_1]], [[profile_id_2]], etc." })
  declare prompt: any;

  @prop({ type: "enum", default: "1K", values: ["1K", "4K"], description: "Resolution of the generated image." })
  declare resolution: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate." })
  declare num_images: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "1:1", "16:9", "4:3", "3:4", "9:16"], description: "Aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1K");
    const numImages = Number(this.num_images ?? 1);
    const syncMode = Boolean(this.sync_mode ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const outputFormat = String(this.output_format ?? "jpeg");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "resolution": resolution,
      "num_images": numImages,
      "sync_mode": syncMode,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/phota", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Piflow extends FalNode {
  static readonly nodeType = "fal.text_to_image.Piflow";
  static readonly title = "Piflow";
  static readonly description = `Piflow
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/piflow",
    unitPrice: 0.025,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "\n            The size of the generated image. You can choose between some presets or custom height and width\n            that **must be multiples of 8**.\n        " })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducible generation. If set to None, a random seed will be used." })
  declare seed: any;

  @prop({ type: "int", default: 8, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 8);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/piflow", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class PlaygroundV25 extends FalNode {
  static readonly nodeType = "fal.text_to_image.PlaygroundV25";
  static readonly title = "Playground V25";
  static readonly description = `State-of-the-art open-source model in aesthetic quality
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/playground-v25",
    unitPrice: 0.00111,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to use for generating the image. Be as descriptive as possible for best results." })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "list[Embedding]", default: [], description: "The list of embeddings to use." })
  declare embeddings: any;

  @prop({ type: "bool", default: false, description: "If set to true, the prompt will be expanded with additional prompts." })
  declare expand_prompt: any;

  @prop({ type: "float", default: 0, description: "The rescale factor for the CFG." })
  declare guidance_rescale: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "float", default: 3, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        " })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare format: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "v1", values: ["v1", "v2"], description: "The version of the safety checker to use. v1 is the default CompVis safety checker. v2 uses a custom ViT model." })
  declare safety_checker_version: any;

  @prop({ type: "str", default: "", description: "\n            An id bound to a request, can be used with response to identify the request\n            itself.\n        " })
  declare request_id: any;

  @prop({ type: "int", default: -1, description: "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 25, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const embeddings = String(this.embeddings ?? []);
    const expandPrompt = Boolean(this.expand_prompt ?? false);
    const guidanceRescale = Number(this.guidance_rescale ?? 0);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const negativePrompt = String(this.negative_prompt ?? "");
    const format = String(this.format ?? "jpeg");
    const numImages = Number(this.num_images ?? 1);
    const safetyCheckerVersion = String(this.safety_checker_version ?? "v1");
    const requestId = String(this.request_id ?? "");
    const seed = Number(this.seed ?? -1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 25);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "embeddings": embeddings,
      "expand_prompt": expandPrompt,
      "guidance_rescale": guidanceRescale,
      "enable_safety_checker": enableSafetyChecker,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "format": format,
      "num_images": numImages,
      "safety_checker_version": safetyCheckerVersion,
      "request_id": requestId,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/playground-v25", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class PonyV7 extends FalNode {
  static readonly nodeType = "fal.text_to_image.PonyV7";
  static readonly title = "Pony V7";
  static readonly description = `Pony V7 is a finetuned text to image for superior aesthetics and prompt following.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/pony-v7",
    unitPrice: 0.03,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate images from" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate" })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "enum", default: "gpu", values: ["gpu", "cpu"], description: "\n            The source of the noise to use for generating images.\n            If set to 'gpu', the noise will be generated on the GPU.\n            If set to 'cpu', the noise will be generated on the CPU.\n        " })
  declare noise_source: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: false, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 40, description: "The number of inference steps to take" })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 3.5, description: "Classifier free guidance scale" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "The seed to use for generating images" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const outputFormat = String(this.output_format ?? "jpeg");
    const noiseSource = String(this.noise_source ?? "gpu");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "noise_source": noiseSource,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "guidance_scale": guidanceScale,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pony-v7", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class QwenImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.QwenImage";
  static readonly title = "Qwen Image";
  static readonly description = `Qwen Image
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/qwen-image",
    unitPrice: 0.02,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate the image with" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "int", default: 30, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "enum", default: "none", values: ["none", "regular", "high"], description: "Acceleration level for image generation. Options: 'none', 'regular', 'high'. Higher acceleration increases speed. 'regular' balances speed and quality. 'high' is recommended for images without text." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use up to 3 LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Enable turbo mode for faster generation with high quality. When enabled, uses optimized settings (10 steps, CFG=1.2)." })
  declare use_turbo: any;

  @prop({ type: "str", default: " ", description: "The negative prompt for the generation" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 2.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const acceleration = String(this.acceleration ?? "none");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const loras = String(this.loras ?? []);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const useTurbo = Boolean(this.use_turbo ?? false);
    const negativePrompt = String(this.negative_prompt ?? " ");
    const guidanceScale = Number(this.guidance_scale ?? 2.5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "num_inference_steps": numInferenceSteps,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "loras": loras,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "use_turbo": useTurbo,
      "negative_prompt": negativePrompt,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class QwenImage2ProTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.QwenImage2ProTextToImage";
  static readonly title = "Qwen Image2 Pro Text To Image";
  static readonly description = `Qwen-Image-2.0 is a next-generation foundational unified generation-and-editing model
realism, typography`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/qwen-image-2/pro/text-to-image",
    unitPrice: 0.075,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt describing the desired image. Supports Chinese and English;." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image. Total number of pixels must be between 512x512 and 2048x2048." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "Enable content moderation for input and output." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility (0-2147483647)." })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "Enable LLM prompt optimization for better results." })
  declare enable_prompt_expansion: any;

  @prop({ type: "str", default: "", description: "Content to avoid in the generated image. Max 500 characters." })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "enable_prompt_expansion": enablePromptExpansion,
      "negative_prompt": negativePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-image-2/pro/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class QwenImage2TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.QwenImage2TextToImage";
  static readonly title = "Qwen Image2 Text To Image";
  static readonly description = `Qwen-Image-2.0 is a next-generation foundational unified generation-and-editing model
realism, typography`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/qwen-image-2/text-to-image",
    unitPrice: 0.035,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt describing the desired image. Supports Chinese and English." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image. Total number of pixels must be between 512x512 and 2048x2048." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "Enable content moderation for input and output." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility (0-2147483647)." })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "Enable LLM prompt optimization for better results." })
  declare enable_prompt_expansion: any;

  @prop({ type: "str", default: "", description: "Content to avoid in the generated image. Max 500 characters." })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "enable_prompt_expansion": enablePromptExpansion,
      "negative_prompt": negativePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-image-2/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class QwenImage2512 extends FalNode {
  static readonly nodeType = "fal.text_to_image.QwenImage2512";
  static readonly title = "Qwen Image2512";
  static readonly description = `Qwen Image 2512 generates high-resolution images from text with excellent quality and detail.
image, generation, qwen, 2512, high-resolution, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/qwen-image-2512",
    unitPrice: 0.02,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 4, description: "The guidance scale to use for the image generation." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "The negative prompt to generate an image from." })
  declare negative_prompt: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const acceleration = String(this.acceleration ?? "regular");
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 4);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const negativePrompt = String(this.negative_prompt ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "acceleration": acceleration,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "negative_prompt": negativePrompt,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-image-2512", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class QwenImage2512Lora extends FalNode {
  static readonly nodeType = "fal.text_to_image.QwenImage2512Lora";
  static readonly title = "Qwen Image2512 Lora";
  static readonly description = `Qwen Image 2512 with LoRA support enables custom-trained models for specialized image generation.
image, generation, qwen, 2512, lora, custom`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/qwen-image-2512/lora",
    unitPrice: 0.035,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use up to 3 LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "float", default: 4, description: "The guidance scale to use for the image generation." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "The negative prompt to generate an image from." })
  declare negative_prompt: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const acceleration = String(this.acceleration ?? "regular");
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 4);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const negativePrompt = String(this.negative_prompt ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "acceleration": acceleration,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "loras": loras,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "negative_prompt": negativePrompt,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-image-2512/lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class QwenImageMaxTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.QwenImageMaxTextToImage";
  static readonly title = "Qwen Image Max Text To Image";
  static readonly description = `Qwen Image Max generates premium quality images from text with superior detail and accuracy.
image, generation, qwen, max, premium, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/qwen-image-max/text-to-image",
    unitPrice: 0.075,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt describing the desired image. Supports Chinese and English. Max 800 characters." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "Enable LLM prompt optimization for better results." })
  declare enable_prompt_expansion: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility (0-2147483647)." })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "Enable content moderation for input and output." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Content to avoid in the generated image. Max 500 characters." })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_prompt_expansion": enablePromptExpansion,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-image-max/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Recraft20b extends FalNode {
  static readonly nodeType = "fal.text_to_image.Recraft20b";
  static readonly title = "Recraft20b";
  static readonly description = `Recraft 20b is a new and affordable text-to-image model.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/recraft-20b",
    unitPrice: 0.0219,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd" })
  declare image_size: any;

  @prop({ type: "enum", default: "realistic_image", values: ["any", "realistic_image", "digital_illustration", "vector_illustration", "realistic_image/b_and_w", "realistic_image/enterprise", "realistic_image/hard_flash", "realistic_image/hdr", "realistic_image/motion_blur", "realistic_image/natural_light", "realistic_image/studio_portrait", "digital_illustration/2d_art_poster", "digital_illustration/2d_art_poster_2", "digital_illustration/3d", "digital_illustration/80s", "digital_illustration/engraving_color", "digital_illustration/glow", "digital_illustration/grain", "digital_illustration/hand_drawn", "digital_illustration/hand_drawn_outline", "digital_illustration/handmade_3d", "digital_illustration/infantile_sketch", "digital_illustration/kawaii", "digital_illustration/pixel_art", "digital_illustration/psychedelic", "digital_illustration/seamless", "digital_illustration/voxel", "digital_illustration/watercolor", "vector_illustration/cartoon", "vector_illustration/doodle_line_art", "vector_illustration/engraving", "vector_illustration/flat_2", "vector_illustration/kawaii", "vector_illustration/line_art", "vector_illustration/line_circuit", "vector_illustration/linocut", "vector_illustration/seamless"], description: "The style of the generated images. Vector images cost 2X as much." })
  declare style: any;

  @prop({ type: "list[RGBColor]", default: [], description: "An array of preferable colors" })
  declare colors: any;

  @prop({ type: "bool", default: false, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The ID of the custom style reference (optional)" })
  declare style_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const style = String(this.style ?? "realistic_image");
    const colors = String(this.colors ?? []);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const styleId = String(this.style_id ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "style": style,
      "colors": colors,
      "enable_safety_checker": enableSafetyChecker,
      "style_id": styleId,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/recraft-20b", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class RecraftV3TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.RecraftV3TextToImage";
  static readonly title = "Recraft V3 Text To Image";
  static readonly description = `Recraft V3 is a text-to-image model with the ability to generate long texts, vector art, images in brand style, and much more. As of today, it is SOTA in image generation, proven by Hugging Face's industry-leading Text-to-Image Benchmark by Artificial Analysis.
vector, typography, style`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/recraft/v3/text-to-image",
    unitPrice: 0.04,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd" })
  declare image_size: any;

  @prop({ type: "enum", default: "realistic_image", values: ["any", "realistic_image", "digital_illustration", "vector_illustration", "realistic_image/b_and_w", "realistic_image/hard_flash", "realistic_image/hdr", "realistic_image/natural_light", "realistic_image/studio_portrait", "realistic_image/enterprise", "realistic_image/motion_blur", "realistic_image/evening_light", "realistic_image/faded_nostalgia", "realistic_image/forest_life", "realistic_image/mystic_naturalism", "realistic_image/natural_tones", "realistic_image/organic_calm", "realistic_image/real_life_glow", "realistic_image/retro_realism", "realistic_image/retro_snapshot", "realistic_image/urban_drama", "realistic_image/village_realism", "realistic_image/warm_folk", "digital_illustration/pixel_art", "digital_illustration/hand_drawn", "digital_illustration/grain", "digital_illustration/infantile_sketch", "digital_illustration/2d_art_poster", "digital_illustration/handmade_3d", "digital_illustration/hand_drawn_outline", "digital_illustration/engraving_color", "digital_illustration/2d_art_poster_2", "digital_illustration/antiquarian", "digital_illustration/bold_fantasy", "digital_illustration/child_book", "digital_illustration/child_books", "digital_illustration/cover", "digital_illustration/crosshatch", "digital_illustration/digital_engraving", "digital_illustration/expressionism", "digital_illustration/freehand_details", "digital_illustration/grain_20", "digital_illustration/graphic_intensity", "digital_illustration/hard_comics", "digital_illustration/long_shadow", "digital_illustration/modern_folk", "digital_illustration/multicolor", "digital_illustration/neon_calm", "digital_illustration/noir", "digital_illustration/nostalgic_pastel", "digital_illustration/outline_details", "digital_illustration/pastel_gradient", "digital_illustration/pastel_sketch", "digital_illustration/pop_art", "digital_illustration/pop_renaissance", "digital_illustration/street_art", "digital_illustration/tablet_sketch", "digital_illustration/urban_glow", "digital_illustration/urban_sketching", "digital_illustration/vanilla_dreams", "digital_illustration/young_adult_book", "digital_illustration/young_adult_book_2", "vector_illustration/bold_stroke", "vector_illustration/chemistry", "vector_illustration/colored_stencil", "vector_illustration/contour_pop_art", "vector_illustration/cosmics", "vector_illustration/cutout", "vector_illustration/depressive", "vector_illustration/editorial", "vector_illustration/emotional_flat", "vector_illustration/infographical", "vector_illustration/marker_outline", "vector_illustration/mosaic", "vector_illustration/naivector", "vector_illustration/roundish_flat", "vector_illustration/segmented_colors", "vector_illustration/sharp_contrast", "vector_illustration/thin", "vector_illustration/vector_photo", "vector_illustration/vivid_shapes", "vector_illustration/engraving", "vector_illustration/line_art", "vector_illustration/line_circuit", "vector_illustration/linocut"], description: "The style of the generated images. Vector images cost 2X as much." })
  declare style: any;

  @prop({ type: "list[RGBColor]", default: [], description: "An array of preferable colors" })
  declare colors: any;

  @prop({ type: "bool", default: false, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The ID of the custom style reference (optional)" })
  declare style_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const style = String(this.style ?? "realistic_image");
    const colors = String(this.colors ?? []);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const styleId = String(this.style_id ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "style": style,
      "colors": colors,
      "enable_safety_checker": enableSafetyChecker,
      "style_id": styleId,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/recraft/v3/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class RecraftV4ProTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.RecraftV4ProTextToImage";
  static readonly title = "Recraft V4 Pro Text To Image";
  static readonly description = `Recraft V4 was developed with designers to bring true visual taste to AI image generation. Built for brand systems and production-ready workflows, it goes beyond prompt accuracy — delivering stronger composition, refined lighting, realistic materials, and a cohesive aesthetic. The result is imagery shaped by professional design judgment, ready for immediate real-world use without additional post-processing.
text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/recraft/v4/pro/text-to-image",
    unitPrice: 0.25,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd" })
  declare image_size: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "list[RGBColor]", default: [], description: "An array of preferable colors" })
  declare colors: any;

  @prop({ type: "str", default: "", description: "The preferable background color of the generated images." })
  declare background_color: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const colors = String(this.colors ?? []);
    const backgroundColor = String(this.background_color ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "enable_safety_checker": enableSafetyChecker,
      "colors": colors,
      "background_color": backgroundColor,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/recraft/v4/pro/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class RecraftV4ProTextToVector extends FalNode {
  static readonly nodeType = "fal.text_to_image.RecraftV4ProTextToVector";
  static readonly title = "Recraft V4 Pro Text To Vector";
  static readonly description = `Recraft V4 was developed with designers to bring true visual taste to AI image generation. Built for brand systems and production-ready workflows, it goes beyond prompt accuracy — delivering stronger composition, refined lighting, realistic materials, and a cohesive aesthetic. The result is imagery shaped by professional design judgment, ready for immediate real-world use without additional post-processing.
text-to-image, text-to-vector`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/recraft/v4/pro/text-to-vector",
    unitPrice: 0.3,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd" })
  declare image_size: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "list[RGBColor]", default: [], description: "An array of preferable colors" })
  declare colors: any;

  @prop({ type: "str", default: "", description: "The preferable background color of the generated images." })
  declare background_color: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const colors = String(this.colors ?? []);
    const backgroundColor = String(this.background_color ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "enable_safety_checker": enableSafetyChecker,
      "colors": colors,
      "background_color": backgroundColor,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/recraft/v4/pro/text-to-vector", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class RecraftV4TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.RecraftV4TextToImage";
  static readonly title = "Recraft V4 Text To Image";
  static readonly description = `Recraft V4 was developed with designers to bring true visual taste to AI image generation. Built for brand systems and production-ready workflows, it goes beyond prompt accuracy delivering stronger composition, refined lighting, realistic materials, and a cohesive aesthetic. The result is imagery shaped by professional design judgment, ready for immediate real-world use without additional post-processing.
text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/recraft/v4/text-to-image",
    unitPrice: 0.04,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd" })
  declare image_size: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "list[RGBColor]", default: [], description: "An array of preferable colors" })
  declare colors: any;

  @prop({ type: "str", default: "", description: "The preferable background color of the generated images." })
  declare background_color: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const colors = String(this.colors ?? []);
    const backgroundColor = String(this.background_color ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "enable_safety_checker": enableSafetyChecker,
      "colors": colors,
      "background_color": backgroundColor,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/recraft/v4/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class RecraftV4TextToVector extends FalNode {
  static readonly nodeType = "fal.text_to_image.RecraftV4TextToVector";
  static readonly title = "Recraft V4 Text To Vector";
  static readonly description = `Recraft V4 was developed with designers to bring true visual taste to AI image generation. Built for brand systems and production-ready workflows, it goes beyond prompt accuracy — delivering stronger composition, refined lighting, realistic materials, and a cohesive aesthetic. The result is imagery shaped by professional design judgment, ready for immediate real-world use without additional post-processing.
text-to-image, text-to-vector`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/recraft/v4/text-to-vector",
    unitPrice: 0.08,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "" })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd" })
  declare image_size: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "list[RGBColor]", default: [], description: "An array of preferable colors" })
  declare colors: any;

  @prop({ type: "str", default: "", description: "The preferable background color of the generated images." })
  declare background_color: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const colors = String(this.colors ?? []);
    const backgroundColor = String(this.background_color ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "enable_safety_checker": enableSafetyChecker,
      "colors": colors,
      "background_color": backgroundColor,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/recraft/v4/text-to-vector", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Sana extends FalNode {
  static readonly nodeType = "fal.text_to_image.Sana";
  static readonly title = "Sana";
  static readonly description = `Sana is an efficient high-resolution image generation model that balances quality and speed for practical applications.
image, generation, efficient, high-resolution, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/sana",
    unitPrice: 0.001,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "landscape_4_3", description: "Size preset for the generated image" })
  declare image_size: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "(No style)", values: ["(No style)", "Cinematic", "Photographic", "Anime", "Manga", "Digital Art", "Pixel art", "Fantasy art", "Neonpunk", "3D Model"], description: "The style to generate the image in." })
  declare style_name: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 18, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "Elements to avoid in the generated image" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 5, description: "How strictly to follow the prompt" })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const styleName = String(this.style_name ?? "(No style)");
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 18);
    const negativePrompt = String(this.negative_prompt ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "enable_safety_checker": enableSafetyChecker,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "style_name": styleName,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "negative_prompt": negativePrompt,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sana", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class SanaSprint extends FalNode {
  static readonly nodeType = "fal.text_to_image.SanaSprint";
  static readonly title = "Sana Sprint";
  static readonly description = `Sana Sprint is a text-to-image model capable of generating 4K images with exceptional speed.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/sana/sprint",
    unitPrice: 0.0025,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "enum", default: "(No style)", values: ["(No style)", "Cinematic", "Photographic", "Anime", "Manga", "Digital Art", "Pixel art", "Fantasy art", "Neonpunk", "3D Model"], description: "The style to generate the image in." })
  declare style_name: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 2, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        " })
  declare negative_prompt: any;

  @prop({ type: "float", default: 5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const outputFormat = String(this.output_format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const styleName = String(this.style_name ?? "(No style)");
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 2);
    const negativePrompt = String(this.negative_prompt ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "enable_safety_checker": enableSafetyChecker,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "style_name": styleName,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "negative_prompt": negativePrompt,
      "guidance_scale": guidanceScale,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sana/sprint", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class SdxlControlnetUnion extends FalNode {
  static readonly nodeType = "fal.text_to_image.SdxlControlnetUnion";
  static readonly title = "Sdxl Controlnet Union";
  static readonly description = `An efficent SDXL multi-controlnet text-to-image model.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/sdxl-controlnet-union",
    unitPrice: 0.00111,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to use for generating the image. Be as descriptive as possible for best results." })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Whether to preprocess the depth image." })
  declare depth_preprocess: any;

  @prop({ type: "str", default: "", description: "The size of the generated image. Leave it none to automatically infer from the control image." })
  declare image_size: any;

  @prop({ type: "image", default: "", description: "The URL of the control image." })
  declare normal_image: any;

  @prop({ type: "list[Embedding]", default: [], description: "The list of embeddings to use." })
  declare embeddings: any;

  @prop({ type: "image", default: "", description: "The URL of the control image." })
  declare teed_image: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "The list of LoRA weights to use." })
  declare loras: any;

  @prop({ type: "float", default: 7.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "image", default: "", description: "The URL of the control image." })
  declare canny_image: any;

  @prop({ type: "bool", default: true, description: "Whether to preprocess the segmentation image." })
  declare segmentation_preprocess: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "str", default: "", description: "\n            An id bound to a request, can be used with response to identify the request\n            itself.\n        " })
  declare request_id: any;

  @prop({ type: "int", default: -1, description: "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "image", default: "", description: "The URL of the control image." })
  declare segmentation_image: any;

  @prop({ type: "image", default: "", description: "The URL of the control image." })
  declare openpose_image: any;

  @prop({ type: "bool", default: true, description: "Whether to preprocess the canny image." })
  declare canny_preprocess: any;

  @prop({ type: "bool", default: false, description: "If set to true, the prompt will be expanded with additional prompts." })
  declare expand_prompt: any;

  @prop({ type: "image", default: "", description: "The URL of the control image." })
  declare depth_image: any;

  @prop({ type: "bool", default: true, description: "Whether to preprocess the normal image." })
  declare normal_preprocess: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        " })
  declare negative_prompt: any;

  @prop({ type: "bool", default: true, description: "Whether to preprocess the teed image." })
  declare teed_preprocess: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "float", default: 0.5, description: "The scale of the controlnet conditioning." })
  declare controlnet_conditioning_scale: any;

  @prop({ type: "enum", default: "v1", values: ["v1", "v2"], description: "The version of the safety checker to use. v1 is the default CompVis safety checker. v2 uses a custom ViT model." })
  declare safety_checker_version: any;

  @prop({ type: "bool", default: true, description: "Whether to preprocess the openpose image." })
  declare openpose_preprocess: any;

  @prop({ type: "int", default: 35, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const depthPreprocess = Boolean(this.depth_preprocess ?? true);
    const imageSize = String(this.image_size ?? "");
    const embeddings = String(this.embeddings ?? []);
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const segmentationPreprocess = Boolean(this.segmentation_preprocess ?? true);
    const format = String(this.format ?? "jpeg");
    const syncMode = Boolean(this.sync_mode ?? false);
    const requestId = String(this.request_id ?? "");
    const seed = Number(this.seed ?? -1);
    const cannyPreprocess = Boolean(this.canny_preprocess ?? true);
    const expandPrompt = Boolean(this.expand_prompt ?? false);
    const normalPreprocess = Boolean(this.normal_preprocess ?? true);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const teedPreprocess = Boolean(this.teed_preprocess ?? true);
    const numImages = Number(this.num_images ?? 1);
    const controlnetConditioningScale = Number(this.controlnet_conditioning_scale ?? 0.5);
    const safetyCheckerVersion = String(this.safety_checker_version ?? "v1");
    const openposePreprocess = Boolean(this.openpose_preprocess ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 35);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "depth_preprocess": depthPreprocess,
      "image_size": imageSize,
      "embeddings": embeddings,
      "loras": loras,
      "guidance_scale": guidanceScale,
      "segmentation_preprocess": segmentationPreprocess,
      "format": format,
      "sync_mode": syncMode,
      "request_id": requestId,
      "seed": seed,
      "canny_preprocess": cannyPreprocess,
      "expand_prompt": expandPrompt,
      "normal_preprocess": normalPreprocess,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
      "teed_preprocess": teedPreprocess,
      "num_images": numImages,
      "controlnet_conditioning_scale": controlnetConditioningScale,
      "safety_checker_version": safetyCheckerVersion,
      "openpose_preprocess": openposePreprocess,
      "num_inference_steps": numInferenceSteps,
    };

    const normalImageRef = this.normal_image as Record<string, unknown> | undefined;
    if (isRefSet(normalImageRef)) {
      const normalImageUrl = await imageToDataUrl(normalImageRef!) ?? await assetToFalUrl(apiKey, normalImageRef!);
      if (normalImageUrl) args["normal_image_url"] = normalImageUrl;
    }

    const teedImageRef = this.teed_image as Record<string, unknown> | undefined;
    if (isRefSet(teedImageRef)) {
      const teedImageUrl = await imageToDataUrl(teedImageRef!) ?? await assetToFalUrl(apiKey, teedImageRef!);
      if (teedImageUrl) args["teed_image_url"] = teedImageUrl;
    }

    const cannyImageRef = this.canny_image as Record<string, unknown> | undefined;
    if (isRefSet(cannyImageRef)) {
      const cannyImageUrl = await imageToDataUrl(cannyImageRef!) ?? await assetToFalUrl(apiKey, cannyImageRef!);
      if (cannyImageUrl) args["canny_image_url"] = cannyImageUrl;
    }

    const segmentationImageRef = this.segmentation_image as Record<string, unknown> | undefined;
    if (isRefSet(segmentationImageRef)) {
      const segmentationImageUrl = await imageToDataUrl(segmentationImageRef!) ?? await assetToFalUrl(apiKey, segmentationImageRef!);
      if (segmentationImageUrl) args["segmentation_image_url"] = segmentationImageUrl;
    }

    const openposeImageRef = this.openpose_image as Record<string, unknown> | undefined;
    if (isRefSet(openposeImageRef)) {
      const openposeImageUrl = await imageToDataUrl(openposeImageRef!) ?? await assetToFalUrl(apiKey, openposeImageRef!);
      if (openposeImageUrl) args["openpose_image_url"] = openposeImageUrl;
    }

    const depthImageRef = this.depth_image as Record<string, unknown> | undefined;
    if (isRefSet(depthImageRef)) {
      const depthImageUrl = await imageToDataUrl(depthImageRef!) ?? await assetToFalUrl(apiKey, depthImageRef!);
      if (depthImageUrl) args["depth_image_url"] = depthImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sdxl-controlnet-union", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class StableCascade extends FalNode {
  static readonly nodeType = "fal.text_to_image.StableCascade";
  static readonly title = "Stable Cascade";
  static readonly description = `Stable Cascade: Image generation on a smaller & cheaper latent space.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/stable-cascade",
    unitPrice: 0.000575,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to use for generating the image. Be as descriptive as possible for best results." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "float", default: 0, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare second_stage_guidance_scale: any;

  @prop({ type: "bool", default: false, description: "\n            If set to true, the image will be returned as base64 encoded string.\n        " })
  declare sync_mode: any;

  @prop({ type: "int", default: 20, description: "Number of steps to run the first stage for." })
  declare first_stage_steps: any;

  @prop({ type: "float", default: 4, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "int", default: -1, description: "\n            The same seed and the same prompt given to the same version of Stable Cascade\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to false, the safety checker will be disabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The negative prompt to use. Use it to address details that you don't want\n            in the image. This could be colors, objects, scenery and even the small details\n            (e.g. moustache, blurry, low resolution).\n        " })
  declare negative_prompt: any;

  @prop({ type: "int", default: 10, description: "Number of steps to run the second stage for." })
  declare second_stage_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const secondStageGuidanceScale = Number(this.second_stage_guidance_scale ?? 0);
    const syncMode = Boolean(this.sync_mode ?? false);
    const firstStageSteps = Number(this.first_stage_steps ?? 20);
    const guidanceScale = Number(this.guidance_scale ?? 4);
    const seed = Number(this.seed ?? -1);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const secondStageSteps = Number(this.second_stage_steps ?? 10);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "second_stage_guidance_scale": secondStageGuidanceScale,
      "sync_mode": syncMode,
      "first_stage_steps": firstStageSteps,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
      "second_stage_steps": secondStageSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/stable-cascade", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class StableDiffusionV3Medium extends FalNode {
  static readonly nodeType = "fal.text_to_image.StableDiffusionV3Medium";
  static readonly title = "Stable Diffusion V3 Medium";
  static readonly description = `Stable Diffusion 3 Medium (Text to Image) is a Multimodal Diffusion Transformer (MMDiT) model that improves image quality, typography, prompt understanding, and efficiency.
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "num_images": "int", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/stable-diffusion-v3-medium",
    unitPrice: 0.035,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "bool", default: false, description: "If set to true, prompt will be upsampled with more details." })
  declare prompt_expansion: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of Stable Diffusion\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "float", default: 5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "The negative prompt to generate an image from." })
  declare negative_prompt: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square_hd");
    const promptExpansion = Boolean(this.prompt_expansion ?? false);
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "prompt_expansion": promptExpansion,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/stable-diffusion-v3-medium", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class StableDiffusionV35Large extends FalNode {
  static readonly nodeType = "fal.text_to_image.StableDiffusionV35Large";
  static readonly title = "Stable Diffusion V35 Large";
  static readonly description = `Stable Diffusion 3.5 Large is a powerful open-weight model with excellent prompt adherence and diverse output capabilities.
image, generation, stable-diffusion, open-source, text-to-image, txt2img`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/stable-diffusion-v35-large",
    unitPrice: 0.065,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "", description: "The size of the generated image. Defaults to landscape_4_3 if no controlnet has been passed, otherwise defaults to the size of the controlnet conditioning image." })
  declare image_size: any;

  @prop({ type: "image", default: "", description: "\n            ControlNet for inference.\n        " })
  declare controlnet: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "str", default: "", description: "\n            IP-Adapter to use during inference.\n        " })
  declare ip_adapter: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "str", default: "", description: "Elements to avoid in the generated image" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "");
    const outputFormat = String(this.output_format ?? "jpeg");
    const ipAdapter = String(this.ip_adapter ?? "");
    const loras = String(this.loras ?? []);
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const negativePrompt = String(this.negative_prompt ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 3.5);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "ip_adapter": ipAdapter,
      "loras": loras,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "negative_prompt": negativePrompt,
      "guidance_scale": guidanceScale,
    };

    const controlnetRef = this.controlnet as Record<string, unknown> | undefined;
    if (isRefSet(controlnetRef)) {
      const controlnetUrl = await assetToFalUrl(apiKey, controlnetRef!);
      if (controlnetUrl) {
        args["controlnet"] = {
          "control_image_url": controlnetUrl,
          "conditioning_scale": Number((this as any).conditioning_scale ?? 0),
          "path": String((this as any).path ?? ""),
          "end_percentage": Number((this as any).end_percentage ?? 0),
          "start_percentage": Number((this as any).start_percentage ?? 0),
        };
      }
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/stable-diffusion-v35-large", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class Vecglypher extends FalNode {
  static readonly nodeType = "fal.text_to_image.Vecglypher";
  static readonly title = "Vecglypher";
  static readonly description = `Vector font generation with VecGlypher. Create custom glyphs from text descriptions or reference images—outputs clean SVG paths directly without raster-to-vector conversion.
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "svg_content": "str", "image": "image", "seed": "int", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/vecglypher",
    unitPrice: 0.005,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The target text to generate as vector glyphs. Each character is rendered as a separate SVG path element." })
  declare prompt: any;

  @prop({ type: "float", default: 1, description: "Repetition penalty to reduce repeated SVG path segments." })
  declare repetition_penalty: any;

  @prop({ type: "float", default: 0.95, description: "Top-p (nucleus) sampling parameter." })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "Optional stroke (outline) color for the generated glyphs. When set, adds an outline around each glyph path." })
  declare stroke_color: any;

  @prop({ type: "int", default: 512, description: "Maximum dimension (width or height) of the output SVG in pixels. The aspect ratio is preserved." })
  declare output_size: any;

  @prop({ type: "float", default: 1, description: "Stroke width in SVG units. Only applies when stroke_color is set." })
  declare stroke_width: any;

  @prop({ type: "int", default: 5, description: "Top-k sampling parameter." })
  declare top_k: any;

  @prop({ type: "str", default: "italic style, 400 weight, serif, text, elegant", description: "Font style description using typography terms such as weight (100-900), style (italic, oblique), category (serif, sans-serif, display, handwriting, monospace), and characteristics (geometric, humanist, condensed, rounded)." })
  declare style_description: any;

  @prop({ type: "int", default: 8192, description: "Maximum tokens to generate. Increase for longer text." })
  declare max_tokens: any;

  @prop({ type: "float", default: 0.1, description: "Sampling temperature. Lower values produce more deterministic output." })
  declare temperature: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility." })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "Enable input safety checking." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "black", description: "Fill color for the generated glyphs. Accepts any valid SVG/CSS color value." })
  declare fill_color: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const repetitionPenalty = Number(this.repetition_penalty ?? 1);
    const topP = Number(this.top_p ?? 0.95);
    const strokeColor = String(this.stroke_color ?? "");
    const outputSize = Number(this.output_size ?? 512);
    const strokeWidth = Number(this.stroke_width ?? 1);
    const topK = Number(this.top_k ?? 5);
    const styleDescription = String(this.style_description ?? "italic style, 400 weight, serif, text, elegant");
    const maxTokens = Number(this.max_tokens ?? 8192);
    const temperature = Number(this.temperature ?? 0.1);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const fillColor = String(this.fill_color ?? "black");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "repetition_penalty": repetitionPenalty,
      "top_p": topP,
      "stroke_color": strokeColor,
      "output_size": outputSize,
      "stroke_width": strokeWidth,
      "top_k": topK,
      "style_description": styleDescription,
      "max_tokens": maxTokens,
      "temperature": temperature,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
      "fill_color": fillColor,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vecglypher", args);
    return {
      "svg_content": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["svg_content"]),
      "image": coerceFalOutputForPropType("image", (res as Record<string, unknown>)["image"]),
      "seed": coerceFalOutputForPropType("int", (res as Record<string, unknown>)["seed"]),
      "timings": coerceFalOutputForPropType("dict[str, any]", (res as Record<string, unknown>)["timings"]),
    };
  }
}

export class ViduQ2TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.ViduQ2TextToImage";
  static readonly title = "Vidu Q2 Text To Image";
  static readonly description = `Vidu Q2 generates quality images from text with optimized performance and consistent results.
image, generation, vidu, q2, optimized, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "image": "image" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/vidu/q2/text-to-image",
    unitPrice: 0.05,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt for video generation, max 1500 characters" })
  declare prompt: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9", "9:16", "1:1"], description: "The aspect ratio of the output video" })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Random seed for generation" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/vidu/q2/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "image": { type: "image", uri: _url } };
  }
}

export class Wan25PreviewTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.Wan25PreviewTextToImage";
  static readonly title = "Wan25 Preview Text To Image";
  static readonly description = `Wan 2.5 Text to Image
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "seeds": "list[int]", "images": "list[ImageFile]", "actual_prompt": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/wan-25-preview/text-to-image",
    unitPrice: 0.05,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt for image generation. Supports Chinese and English, max 2000 characters." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate. Values from 1 to 4." })
  declare num_images: any;

  @prop({ type: "str", default: "square", description: "The size of the generated image. Can use preset names like 'square', 'landscape_16_9', etc., or specific dimensions. Total pixels must be between 768×768 and 1440×1440, with aspect ratio between [1:4, 4:1]." })
  declare image_size: any;

  @prop({ type: "bool", default: true, description: "Whether to enable prompt rewriting using LLM. Improves results for short prompts but increases processing time." })
  declare enable_prompt_expansion: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. If None, a random seed is chosen." })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Negative prompt to describe content to avoid. Max 500 characters." })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "square");
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "enable_prompt_expansion": enablePromptExpansion,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-25-preview/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class WanV26TextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.WanV26TextToImage";
  static readonly title = "Wan V26 Text To Image";
  static readonly description = `Wan v2.6 generates high-quality images from text with advanced capabilities and consistent results.
image, generation, wan, v2.6, quality, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[File]", "seed": "int", "generated_text": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "wan/v2.6/text-to-image",
    unitPrice: 0.00007,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt describing the desired image. Supports Chinese and English. Max 2000 characters." })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "Output image size. If not set: matches input image size (up to 1280*1280). Use presets like 'square_hd', 'landscape_16_9', or specify exact dimensions." })
  declare image_size: any;

  @prop({ type: "int", default: 1, description: "Maximum number of images to generate (1-5). Actual count may be less depending on model inference." })
  declare max_images: any;

  @prop({ type: "image", default: "", description: "Optional reference image (0 or 1). When provided, can be used for style guidance. Resolution: 384-5000px each dimension. Max size: 10MB. Formats: JPEG, JPG, PNG (no alpha), BMP, WEBP." })
  declare image: any;

  @prop({ type: "bool", default: true, description: "Enable content moderation for input and output." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility (0-2147483647)." })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Content to avoid in the generated image. Max 500 characters." })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "");
    const maxImages = Number(this.max_images ?? 1);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "max_images": maxImages,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "negative_prompt": negativePrompt,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-26-image/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class WanV225BTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.WanV225BTextToImage";
  static readonly title = "Wan V225 B Text To Image";
  static readonly description = `Wan
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "image": "image", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/wan/v2.2-5b/text-to-image",
    unitPrice: 0.016,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "float", default: 2, description: "Shift value for the image. Must be between 1.0 and 10.0." })
  declare shift: any;

  @prop({ type: "float", default: 3.5, description: "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "str", default: "", description: "The text prompt to guide image generation." })
  declare prompt: any;

  @prop({ type: "enum", default: "jpeg", values: ["png", "jpeg"], description: "The format of the output image." })
  declare image_format: any;

  @prop({ type: "bool", default: false, description: "If set to true, output video will be checked for safety after generation." })
  declare enable_output_safety_checker: any;

  @prop({ type: "bool", default: false, description: "If set to true, input data will be checked for safety before processing." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 40, description: "Number of inference steps for sampling. Higher values give better quality but take longer." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning." })
  declare enable_prompt_expansion: any;

  @prop({ type: "str", default: "", description: "Negative prompt for video generation." })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. If None, a random seed is chosen." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const shift = Number(this.shift ?? 2);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const imageSize = String(this.image_size ?? "square_hd");
    const prompt = String(this.prompt ?? "");
    const imageFormat = String(this.image_format ?? "jpeg");
    const enableOutputSafetyChecker = Boolean(this.enable_output_safety_checker ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "shift": shift,
      "guidance_scale": guidanceScale,
      "image_size": imageSize,
      "prompt": prompt,
      "image_format": imageFormat,
      "enable_output_safety_checker": enableOutputSafetyChecker,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "enable_prompt_expansion": enablePromptExpansion,
      "negative_prompt": negativePrompt,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan/v2.2-5b/text-to-image", args);
    return {
      "image": coerceFalOutputForPropType("image", (res as Record<string, unknown>)["image"]),
      "seed": coerceFalOutputForPropType("int", (res as Record<string, unknown>)["seed"]),
    };
  }
}

export class WanV22A14BTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.WanV22A14BTextToImage";
  static readonly title = "Wan V22 A14 B Text To Image";
  static readonly description = `Wan
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "image": "image", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/wan/v2.2-a14b/text-to-image",
    unitPrice: 0.025,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to guide image generation." })
  declare prompt: any;

  @prop({ type: "float", default: 2, description: "Shift value for the image. Must be between 1.0 and 10.0." })
  declare shift: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular"], description: "Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'." })
  declare acceleration: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "float", default: 3.5, description: "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality." })
  declare guidance_scale: any;

  @prop({ type: "bool", default: false, description: "If set to true, output video will be checked for safety after generation." })
  declare enable_output_safety_checker: any;

  @prop({ type: "float", default: 4, description: "Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model." })
  declare guidance_scale_2: any;

  @prop({ type: "bool", default: false, description: "If set to true, input data will be checked for safety before processing." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: 27, description: "Number of inference steps for sampling. Higher values give better quality but take longer." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning." })
  declare enable_prompt_expansion: any;

  @prop({ type: "str", default: "", description: "Negative prompt for video generation." })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. If None, a random seed is chosen." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const shift = Number(this.shift ?? 2);
    const acceleration = String(this.acceleration ?? "regular");
    const imageSize = String(this.image_size ?? "square_hd");
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const enableOutputSafetyChecker = Boolean(this.enable_output_safety_checker ?? false);
    const guidanceScale_2 = Number(this.guidance_scale_2 ?? 4);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 27);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "shift": shift,
      "acceleration": acceleration,
      "image_size": imageSize,
      "guidance_scale": guidanceScale,
      "enable_output_safety_checker": enableOutputSafetyChecker,
      "guidance_scale_2": guidanceScale_2,
      "enable_safety_checker": enableSafetyChecker,
      "num_inference_steps": numInferenceSteps,
      "enable_prompt_expansion": enablePromptExpansion,
      "negative_prompt": negativePrompt,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan/v2.2-a14b/text-to-image", args);
    return {
      "image": coerceFalOutputForPropType("image", (res as Record<string, unknown>)["image"]),
      "seed": coerceFalOutputForPropType("int", (res as Record<string, unknown>)["seed"]),
    };
  }
}

export class WanV22A14BTextToImageLora extends FalNode {
  static readonly nodeType = "fal.text_to_image.WanV22A14BTextToImageLora";
  static readonly title = "Wan V22 A14 B Text To Image Lora";
  static readonly description = `Wan v2.2 A14B Text-to-Image A14B with LoRAs
generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "image": "image", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/wan/v2.2-a14b/text-to-image/lora",
    unitPrice: 0.05,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt to guide image generation." })
  declare prompt: any;

  @prop({ type: "float", default: 2, description: "Shift value for the image. Must be between 1.0 and 10.0." })
  declare shift: any;

  @prop({ type: "bool", default: false, description: "If true, the video will be reversed." })
  declare reverse_video: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular"], description: "Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'." })
  declare acceleration: any;

  @prop({ type: "list[LoRAWeight]", default: [], description: "LoRA weights to be used in the inference." })
  declare loras: any;

  @prop({ type: "float", default: 3.5, description: "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality." })
  declare guidance_scale: any;

  @prop({ type: "bool", default: false, description: "If set to true, input data will be checked for safety before processing." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "Negative prompt for video generation." })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "jpeg", values: ["png", "jpeg"], description: "The format of the output image." })
  declare image_format: any;

  @prop({ type: "bool", default: false, description: "If set to true, output video will be checked for safety after generation." })
  declare enable_output_safety_checker: any;

  @prop({ type: "float", default: 4, description: "Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model." })
  declare guidance_scale_2: any;

  @prop({ type: "bool", default: false, description: "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning." })
  declare enable_prompt_expansion: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility. If None, a random seed is chosen." })
  declare seed: any;

  @prop({ type: "int", default: 27, description: "Number of inference steps for sampling. Higher values give better quality but take longer." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const shift = Number(this.shift ?? 2);
    const reverseVideo = Boolean(this.reverse_video ?? false);
    const imageSize = String(this.image_size ?? "square_hd");
    const acceleration = String(this.acceleration ?? "regular");
    const loras = String(this.loras ?? []);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");
    const imageFormat = String(this.image_format ?? "jpeg");
    const enableOutputSafetyChecker = Boolean(this.enable_output_safety_checker ?? false);
    const guidanceScale_2 = Number(this.guidance_scale_2 ?? 4);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 27);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "shift": shift,
      "reverse_video": reverseVideo,
      "image_size": imageSize,
      "acceleration": acceleration,
      "loras": loras,
      "guidance_scale": guidanceScale,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
      "image_format": imageFormat,
      "enable_output_safety_checker": enableOutputSafetyChecker,
      "guidance_scale_2": guidanceScale_2,
      "enable_prompt_expansion": enablePromptExpansion,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan/v2.2-a14b/text-to-image/lora", args);
    return {
      "image": coerceFalOutputForPropType("image", (res as Record<string, unknown>)["image"]),
      "seed": coerceFalOutputForPropType("int", (res as Record<string, unknown>)["seed"]),
    };
  }
}

export class Xai extends FalNode {
  static readonly nodeType = "fal.text_to_image.Xai";
  static readonly title = "Xai";
  static readonly description = `Generate highly aesthetic images with xAI's Grok Imagine Image generation model.
xai, grok, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[ImageFile]", "revised_prompt": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "xai/grok-imagine-image",
    unitPrice: 0.02,
    billingUnit: "images",
    currency: "USD",
  };

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "", description: "Text description of the desired image." })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["2:1", "20:9", "19.5:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:19.5", "9:20", "1:2"], description: "Aspect ratio of the generated image." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = Boolean(this.sync_mode ?? false);
    const numImages = Number(this.num_images ?? 1);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const outputFormat = String(this.output_format ?? "jpeg");

    const args: Record<string, unknown> = {
      "sync_mode": syncMode,
      "num_images": numImages,
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/xai", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class ZImageBase extends FalNode {
  static readonly nodeType = "fal.text_to_image.ZImageBase";
  static readonly title = "Z Image Base";
  static readonly description = `Z-Image Base generates quality images from text with efficient processing and good results.
image, generation, z-image, base, efficient, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/z-image/base",
    unitPrice: 0.01,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 4, description: "The guidance scale to use for the image generation." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The negative prompt to use for the image generation." })
  declare negative_prompt: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 4);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/z-image-base/base", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class ZImageBaseLora extends FalNode {
  static readonly nodeType = "fal.text_to_image.ZImageBaseLora";
  static readonly title = "Z Image Base Lora";
  static readonly description = `Z-Image Base with LoRA enables efficient custom-trained models for specialized generation tasks.
image, generation, z-image, base, lora, custom`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/z-image/base/lora",
    unitPrice: 0.012,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "list[LoRAInput]", default: [], description: "List of LoRA weights to apply (maximum 3)." })
  declare loras: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 4, description: "The guidance scale to use for the image generation." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "The negative prompt to use for the image generation." })
  declare negative_prompt: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "png");
    const loras = String(this.loras ?? []);
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 4);
    const seed = String(this.seed ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "loras": loras,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/z-image-base/base/lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class ZImageTurbo extends FalNode {
  static readonly nodeType = "fal.text_to_image.ZImageTurbo";
  static readonly title = "Z Image Turbo";
  static readonly description = `Z-Image Turbo generates images from text with maximum speed for rapid iteration and prototyping.
image, generation, z-image, turbo, fast, text-to-image`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/z-image/turbo",
    unitPrice: 0.005,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Whether to enable prompt expansion. Note: this will increase the price by 0.0025 credits per request." })
  declare enable_prompt_expansion: any;

  @prop({ type: "int", default: 8, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 8);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "enable_prompt_expansion": enablePromptExpansion,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/z-image/turbo", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class ZImageTurboLora extends FalNode {
  static readonly nodeType = "fal.text_to_image.ZImageTurboLora";
  static readonly title = "Z Image Turbo Lora";
  static readonly description = `Z-Image Turbo with LoRA combines maximum speed with custom models for fast specialized generation.
image, generation, z-image, turbo, lora, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/z-image/turbo/lora",
    unitPrice: 0.0085,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "list[LoRAInput]", default: [], description: "List of LoRA weights to apply (maximum 3)." })
  declare loras: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Whether to enable prompt expansion. Note: this will increase the price by 0.0025 credits per request." })
  declare enable_prompt_expansion: any;

  @prop({ type: "int", default: 8, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const acceleration = String(this.acceleration ?? "regular");
    const outputFormat = String(this.output_format ?? "png");
    const loras = String(this.loras ?? []);
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = String(this.seed ?? "");
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);
    const numInferenceSteps = Number(this.num_inference_steps ?? 8);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "acceleration": acceleration,
      "output_format": outputFormat,
      "loras": loras,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "enable_prompt_expansion": enablePromptExpansion,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/z-image/turbo/lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class ZImageTurboTiling extends FalNode {
  static readonly nodeType = "fal.text_to_image.ZImageTurboTiling";
  static readonly title = "Z Image Turbo Tiling";
  static readonly description = `Generate seamlessly tiling photorealistic images from text using Z-Image Turbo
z-image, turbo, seamless, tiling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/z-image/turbo/tiling",
    unitPrice: 0.02,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image. Use 'auto' to match the input image size (or 1024x1024 if no image)." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "image", default: "", description: "URL of a mask image for inpainting. White regions are regenerated, black regions are preserved. Requires image_url." })
  declare mask_image: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "enum", default: "both", values: ["both", "horizontal", "vertical"], description: "Tiling direction: 'both' (omnidirectional), 'horizontal' (left-right only), 'vertical' (top-bottom only)." })
  declare tiling_mode: any;

  @prop({ type: "int", default: 64, description: "Tile stride in latent space. (32 = 256px, 64 = 512px, 128 = 1024px)." })
  declare tile_stride: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "int", default: 128, description: "Tile size in latent space (64 = 512px, 128 = 1024px, 256 = 2048px)." })
  declare tile_size: any;

  @prop({ type: "image", default: "", description: "URL of an image for image-to-image or inpainting. When provided without mask_image_url, performs image-to-image; with mask_image_url, performs inpainting." })
  declare image: any;

  @prop({ type: "float", default: 0.6, description: "How much to transform the input image. Only used when image_url is provided." })
  declare strength: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: false, description: "Whether to enable prompt expansion. Note: this will increase the price by 0.0025 credits per request." })
  declare enable_prompt_expansion: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 8, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const acceleration = String(this.acceleration ?? "regular");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const tilingMode = String(this.tiling_mode ?? "both");
    const tileStride = Number(this.tile_stride ?? 64);
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const tileSize = Number(this.tile_size ?? 128);
    const strength = Number(this.strength ?? 0.6);
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 8);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "acceleration": acceleration,
      "enable_safety_checker": enableSafetyChecker,
      "tiling_mode": tilingMode,
      "tile_stride": tileStride,
      "num_images": numImages,
      "output_format": outputFormat,
      "tile_size": tileSize,
      "strength": strength,
      "sync_mode": syncMode,
      "enable_prompt_expansion": enablePromptExpansion,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
    };

    const maskImageRef = this.mask_image as Record<string, unknown> | undefined;
    if (isRefSet(maskImageRef)) {
      const maskImageUrl = await imageToDataUrl(maskImageRef!) ?? await assetToFalUrl(apiKey, maskImageRef!);
      if (maskImageUrl) args["mask_image_url"] = maskImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/z-image/turbo/tiling", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class ZImageTurboTilingLora extends FalNode {
  static readonly nodeType = "fal.text_to_image.ZImageTurboTilingLora";
  static readonly title = "Z Image Turbo Tiling Lora";
  static readonly description = `Generate seamlessly tiling photorealistic images from text using Z-Image Turbo and custom LoRA
z-image, turbo, seamless, tiling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[ImageFile]", "seed": "int", "has_nsfw_concepts": "list[bool]", "timings": "dict[str, any]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/z-image/turbo/tiling/lora",
    unitPrice: 0.025,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "str", default: "square_hd", description: "The size of the generated image. Use 'auto' to match the input image size (or 1024x1024 if no image)." })
  declare image_size: any;

  @prop({ type: "enum", default: "regular", values: ["none", "regular", "high"], description: "The acceleration level to use." })
  declare acceleration: any;

  @prop({ type: "image", default: "", description: "URL of a mask image for inpainting. White regions are regenerated, black regions are preserved. Requires image_url." })
  declare mask_image: any;

  @prop({ type: "list[LoRAInput]", default: [], description: "List of LoRA weights to apply (maximum 3)." })
  declare loras: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "enum", default: "both", values: ["both", "horizontal", "vertical"], description: "Tiling direction: 'both' (omnidirectional), 'horizontal' (left-right only), 'vertical' (top-bottom only)." })
  declare tiling_mode: any;

  @prop({ type: "int", default: 64, description: "Tile stride in latent space. (32 = 256px, 64 = 512px, 128 = 1024px)." })
  declare tile_stride: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png", "webp"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "int", default: 128, description: "Tile size in latent space (64 = 512px, 128 = 1024px, 256 = 2048px)." })
  declare tile_size: any;

  @prop({ type: "image", default: "", description: "URL of an image for image-to-image or inpainting. When provided without mask_image_url, performs image-to-image; with mask_image_url, performs inpainting." })
  declare image: any;

  @prop({ type: "float", default: 0.6, description: "How much to transform the input image. Only used when image_url is provided." })
  declare strength: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: false, description: "Whether to enable prompt expansion. Note: this will increase the price by 0.0025 credits per request." })
  declare enable_prompt_expansion: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 8, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const imageSize = String(this.image_size ?? "square_hd");
    const acceleration = String(this.acceleration ?? "regular");
    const loras = String(this.loras ?? []);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const tilingMode = String(this.tiling_mode ?? "both");
    const tileStride = Number(this.tile_stride ?? 64);
    const numImages = Number(this.num_images ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const tileSize = Number(this.tile_size ?? 128);
    const strength = Number(this.strength ?? 0.6);
    const syncMode = Boolean(this.sync_mode ?? false);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? false);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 8);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "image_size": imageSize,
      "acceleration": acceleration,
      "loras": loras,
      "enable_safety_checker": enableSafetyChecker,
      "tiling_mode": tilingMode,
      "tile_stride": tileStride,
      "num_images": numImages,
      "output_format": outputFormat,
      "tile_size": tileSize,
      "strength": strength,
      "sync_mode": syncMode,
      "enable_prompt_expansion": enablePromptExpansion,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
    };

    const maskImageRef = this.mask_image as Record<string, unknown> | undefined;
    if (isRefSet(maskImageRef)) {
      const maskImageUrl = await imageToDataUrl(maskImageRef!) ?? await assetToFalUrl(apiKey, maskImageRef!);
      if (maskImageUrl) args["mask_image_url"] = maskImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/z-image/turbo/tiling/lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class ImagineartImagineart15PreviewTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.ImagineartImagineart15PreviewTextToImage";
  static readonly title = "Imagineart Imagineart15 Preview Text To Image";
  static readonly description = `Imagineart 1.5 Preview
generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "imagineart/imagineart-1.5-preview/text-to-image",
    unitPrice: 0.00007,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt describing the desired image" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:1", "1:3", "3:2", "2:3"], description: "Image aspect ratio: 1:1, 3:1, 1:3, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3" })
  declare aspect_ratio: any;

  @prop({ type: "int", default: -1, description: "Seed for the image generation" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "ImagineArt/imagineart-1.5-preview/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class ImagineartImagineart15ProPreviewTextToImage extends FalNode {
  static readonly nodeType = "fal.text_to_image.ImagineartImagineart15ProPreviewTextToImage";
  static readonly title = "Imagineart Imagineart15 Pro Preview Text To Image";
  static readonly description = `ImagineArt 1.5 Pro Preview
generation, text-to-image, txt2img, ai-art, professional`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "images": "list[Image]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "imagineart/imagineart-1.5-pro-preview/text-to-image",
    unitPrice: 0.00007,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Text prompt describing the desired image" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:1", "1:3", "3:2", "2:3"], description: "Image aspect ratio: 1:1, 3:1, 1:3, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3" })
  declare aspect_ratio: any;

  @prop({ type: "int", default: -1, description: "Seed for the image generation" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "ImagineArt/imagineart-1.5-pro-preview/text-to-image", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class RundiffusionFalJuggernautFluxLora extends FalNode {
  static readonly nodeType = "fal.text_to_image.RundiffusionFalJuggernautFluxLora";
  static readonly title = "Rundiffusion Fal Juggernaut Flux Lora";
  static readonly description = `Juggernaut Base Flux LoRA by RunDiffusion is a drop-in replacement for Flux [Dev] that delivers sharper details, richer colors, and enhanced realism to all your LoRAs and LyCORIS with full compatibility.
flux, generation, text-to-image, txt2img, ai-art, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "rundiffusion-fal/juggernaut-flux-lora",
    unitPrice: 0.045,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "bool", default: false, description: "\n            If set to true, the function will wait for the image to be generated and uploaded\n            before returning the response. This will increase the latency of the function but\n            it allows you to get the image directly in the response without going through the CDN.\n        " })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "int", default: -1, description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "jpeg");
    const loras = String(this.loras ?? []);
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const seed = Number(this.seed ?? -1);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "loras": loras,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "rundiffusion-fal/juggernaut-flux-lora", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class RundiffusionFalJuggernautFluxBase extends FalNode {
  static readonly nodeType = "fal.text_to_image.RundiffusionFalJuggernautFluxBase";
  static readonly title = "Rundiffusion Fal Juggernaut Flux Base";
  static readonly description = `Juggernaut Base Flux by RunDiffusion is a drop-in replacement for Flux [Dev] that delivers sharper details, richer colors, and enhanced realism, while instantly boosting LoRAs and LyCORIS with full compatibility.
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "rundiffusion-fal/juggernaut-flux/base",
    unitPrice: 0.035,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "int", default: -1, description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = Number(this.seed ?? -1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "rundiffusion-fal/juggernaut-flux/base", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class RundiffusionFalJuggernautFluxLightning extends FalNode {
  static readonly nodeType = "fal.text_to_image.RundiffusionFalJuggernautFluxLightning";
  static readonly title = "Rundiffusion Fal Juggernaut Flux Lightning";
  static readonly description = `Juggernaut Lightning Flux by RunDiffusion provides blazing-fast, high-quality images rendered at five times the speed of Flux. Perfect for mood boards and mass ideation, this model excels in both realism and prompt adherence.
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "rundiffusion-fal/juggernaut-flux/lightning",
    unitPrice: 0.006,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  @prop({ type: "int", default: -1, description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 4, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const seed = Number(this.seed ?? -1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "enable_safety_checker": enableSafetyChecker,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "rundiffusion-fal/juggernaut-flux/lightning", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class RundiffusionFalJuggernautFluxPro extends FalNode {
  static readonly nodeType = "fal.text_to_image.RundiffusionFalJuggernautFluxPro";
  static readonly title = "Rundiffusion Fal Juggernaut Flux Pro";
  static readonly description = `Juggernaut Pro Flux by RunDiffusion is the flagship Juggernaut model rivaling some of the most advanced image models available, often surpassing them in realism. It combines Juggernaut Base with RunDiffusion Photo and features enhancements like reduced background blurriness.
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "rundiffusion-fal/juggernaut-flux/pro",
    unitPrice: 0.055,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "png", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "If 'True', the media will be returned as a data URI and the output data won't be available in the request history." })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "int", default: -1, description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "png");
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = Number(this.seed ?? -1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "rundiffusion-fal/juggernaut-flux/pro", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export class RundiffusionFalRundiffusionPhotoFlux extends FalNode {
  static readonly nodeType = "fal.text_to_image.RundiffusionFalRundiffusionPhotoFlux";
  static readonly title = "Rundiffusion Fal Rundiffusion Photo Flux";
  static readonly description = `RunDiffusion Photo Flux provides insane realism. With this enhancer, textures and skin details burst to life, turning your favorite prompts into vivid, lifelike creations. Recommended to keep it at 0.65 to 0.80 weight. Supports resolutions up to 1536x1536.
flux, generation, text-to-image, txt2img, ai-art`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "prompt": "str", "images": "list[Image]", "timings": "dict[str, any]", "has_nsfw_concepts": "list[bool]", "seed": "int" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "rundiffusion-fal/rundiffusion-photo-flux",
    unitPrice: 0.045,
    billingUnit: "megapixels",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The prompt to generate an image from." })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate." })
  declare num_images: any;

  @prop({ type: "str", default: "landscape_4_3", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "jpeg", values: ["jpeg", "png"], description: "The format of the generated image." })
  declare output_format: any;

  @prop({ type: "list[LoraWeight]", default: [], description: "\n            The LoRAs to use for the image generation. You can use any number of LoRAs\n            and they will be merged together to generate the final image.\n        " })
  declare loras: any;

  @prop({ type: "bool", default: false, description: "\n            If set to true, the function will wait for the image to be generated and uploaded\n            before returning the response. This will increase the latency of the function but\n            it allows you to get the image directly in the response without going through the CDN.\n        " })
  declare sync_mode: any;

  @prop({ type: "float", default: 3.5, description: "\n            The CFG (Classifier Free Guidance) scale is a measure of how close you want\n            the model to stick to your prompt when looking for a related image to show you.\n        " })
  declare guidance_scale: any;

  @prop({ type: "int", default: 28, description: "The number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 0.75, description: "LoRA Scale of the photo lora model" })
  declare photo_lora_scale: any;

  @prop({ type: "int", default: -1, description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "If set to true, the safety checker will be enabled." })
  declare enable_safety_checker: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const numImages = Number(this.num_images ?? 1);
    const imageSize = String(this.image_size ?? "landscape_4_3");
    const outputFormat = String(this.output_format ?? "jpeg");
    const loras = String(this.loras ?? []);
    const syncMode = Boolean(this.sync_mode ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const photoLoraScale = Number(this.photo_lora_scale ?? 0.75);
    const seed = Number(this.seed ?? -1);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "num_images": numImages,
      "image_size": imageSize,
      "output_format": outputFormat,
      "loras": loras,
      "sync_mode": syncMode,
      "guidance_scale": guidanceScale,
      "num_inference_steps": numInferenceSteps,
      "photo_lora_scale": photoLoraScale,
      "seed": seed,
      "enable_safety_checker": enableSafetyChecker,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "rundiffusion-fal/rundiffusion-photo-flux", args);
    const _r = res as Record<string, unknown>;
    const _arr = _r.images;
    const _one = _r.image;
    let _url: string | undefined;
    if (Array.isArray(_arr) && _arr.length > 0) {
      const u = (_arr[0] as { url?: unknown })?.url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined && _one && typeof _one === "object") {
      const u = (_one as { url?: unknown }).url;
      if (typeof u === "string") _url = u;
    }
    if (_url === undefined) {
      throw new Error("FAL image response missing url (expected images[] or image)");
    }
    return { "output": { type: "image", uri: _url } };
  }
}

export const FAL_TEXT_TO_IMAGE_NODES: readonly NodeClass[] = [
  BriaFibo_bbqGenerate,
  BriaFiboLiteGenerate,
  BriaFiboGenerate,
  BriaTextToImage32,
  AuraFlow,
  Bagel,
  Bitdance,
  BytedanceDreaminaV31TextToImage,
  BytedanceSeedreamV3TextToImage,
  BytedanceSeedreamV45TextToImage,
  BytedanceSeedreamV4TextToImage,
  BytedanceSeedreamV5LiteTextToImage,
  Cogview4,
  Dreamo,
  Emu35ImageTextToImage,
  FLiteStandard,
  FLiteTexture,
  FastLightningSdxl,
  FastSdxl,
  Flux1Dev,
  Flux1Krea,
  Flux1Schnell,
  Flux1Srpo,
  Flux2,
  Flux2Flex,
  Flux2Klein4B,
  Flux2Klein4BBase,
  Flux2Klein4BBaseLora,
  Flux2Klein4bDistilledLora,
  Flux2Klein9B,
  Flux2Klein9BBase,
  Flux2Klein9BBaseLora,
  Flux2Klein9bD4BetaLora,
  Flux2LoraGalleryBallpointPenSketch,
  Flux2LoraGalleryDigitalComicArt,
  Flux2LoraGalleryHdrStyle,
  Flux2LoraGalleryRealism,
  Flux2LoraGallerySatelliteViewStyle,
  Flux2LoraGallerySepiaVintage,
  Flux2Max,
  Flux2Pro,
  Flux2Flash,
  Flux2Lora,
  Flux2Turbo,
  FluxControlLoraCanny,
  FluxControlLoraDepth,
  FluxGeneral,
  FluxKontextLoraTextToImage,
  FluxKreaLora,
  FluxKreaLoraStream,
  FluxLora,
  FluxLoraStream,
  FluxLoraInpainting,
  FluxProKontextMaxTextToImage,
  FluxProKontextTextToImage,
  FluxV1ProUltra,
  FluxProV11UltraFinetuned,
  FluxDev,
  FluxKrea,
  FluxSchnell,
  FluxSrpo,
  Gemini25FlashImage,
  Gemini3ProImagePreview,
  Gemini31FlashImagePreview,
  GlmImage,
  GptImage1Mini,
  GptImage15,
  GptImage1TextToImage,
  HidreamI1Dev,
  HidreamI1Fast,
  HidreamI1Full,
  HunyuanImageV3InstructTextToImage,
  HunyuanImageV21TextToImage,
  HunyuanImageV3TextToImage,
  IdeogramV2,
  IdeogramV2a,
  IdeogramV2aTurbo,
  IdeogramV3,
  Imagen4Preview,
  Imagen4PreviewFast,
  Imagen4PreviewUltra,
  KlingImageO3TextToImage,
  KlingImageV3TextToImage,
  LongcatImage,
  Lora,
  LuminaImageV2,
  MinimaxImage01,
  NanoBanana,
  NanoBanana2,
  NanoBananaPro,
  OmniGenV1,
  OmnigenV2,
  OvisImage,
  Phota,
  Piflow,
  PlaygroundV25,
  PonyV7,
  QwenImage,
  QwenImage2ProTextToImage,
  QwenImage2TextToImage,
  QwenImage2512,
  QwenImage2512Lora,
  QwenImageMaxTextToImage,
  Recraft20b,
  RecraftV3TextToImage,
  RecraftV4ProTextToImage,
  RecraftV4ProTextToVector,
  RecraftV4TextToImage,
  RecraftV4TextToVector,
  Sana,
  SanaSprint,
  SdxlControlnetUnion,
  StableCascade,
  StableDiffusionV3Medium,
  StableDiffusionV35Large,
  Vecglypher,
  ViduQ2TextToImage,
  Wan25PreviewTextToImage,
  WanV26TextToImage,
  WanV225BTextToImage,
  WanV22A14BTextToImage,
  WanV22A14BTextToImageLora,
  Xai,
  ZImageBase,
  ZImageBaseLora,
  ZImageTurbo,
  ZImageTurboLora,
  ZImageTurboTiling,
  ZImageTurboTilingLora,
  ImagineartImagineart15PreviewTextToImage,
  ImagineartImagineart15ProPreviewTextToImage,
  RundiffusionFalJuggernautFluxLora,
  RundiffusionFalJuggernautFluxBase,
  RundiffusionFalJuggernautFluxLightning,
  RundiffusionFalJuggernautFluxPro,
  RundiffusionFalRundiffusionPhotoFlux,
] as const;