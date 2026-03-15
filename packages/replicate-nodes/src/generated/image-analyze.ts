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

export class Blip extends ReplicateNode {
  static readonly nodeType = "replicate.image_analyze.Blip";
  static readonly title = "Blip";
  static readonly description = `Generate image captions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "image_captioning", values: ["image_captioning", "visual_question_answering", "image_text_matching"], description: "Choose a task." })
  declare task: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Type caption for the input image for image text matching task." })
  declare caption: any;

  @prop({ type: "str", default: "", description: "Type question for the input image for visual question answering task." })
  declare question: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const task = String(inputs.task ?? this.task ?? "image_captioning");
    const caption = String(inputs.caption ?? this.caption ?? "");
    const question = String(inputs.question ?? this.question ?? "");

    const args: Record<string, unknown> = {
      "task": task,
      "caption": caption,
      "question": question,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "salesforce/blip", args);
    return { output: outputToString(res.output) };
  }
}

export class Blip2 extends ReplicateNode {
  static readonly nodeType = "replicate.image_analyze.Blip2";
  static readonly title = "Blip2";
  static readonly description = `Answers questions about images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input image to query or caption" })
  declare image: any;

  @prop({ type: "bool", default: false, description: "Select if you want to generate image captions instead of asking questions" })
  declare caption: any;

  @prop({ type: "str", default: "", description: "Optional - previous questions and answers to be used as context for answering current question" })
  declare context: any;

  @prop({ type: "str", default: "What is this a picture of?", description: "Question to ask about this image. Leave blank for captioning" })
  declare question: any;

  @prop({ type: "float", default: 1, description: "Temperature for use with nucleus sampling" })
  declare temperature: any;

  @prop({ type: "bool", default: false, description: "Toggles the model using nucleus sampling to generate responses" })
  declare use_nucleus_sampling: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const caption = Boolean(inputs.caption ?? this.caption ?? false);
    const context = String(inputs.context ?? this.context ?? "");
    const question = String(inputs.question ?? this.question ?? "What is this a picture of?");
    const temperature = Number(inputs.temperature ?? this.temperature ?? 1);
    const useNucleusSampling = Boolean(inputs.use_nucleus_sampling ?? this.use_nucleus_sampling ?? false);

    const args: Record<string, unknown> = {
      "caption": caption,
      "context": context,
      "question": question,
      "temperature": temperature,
      "use_nucleus_sampling": useNucleusSampling,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "andreasjansson/blip-2", args);
    return { output: outputToString(res.output) };
  }
}

export class ClipFeatures extends ReplicateNode {
  static readonly nodeType = "replicate.image_analyze.ClipFeatures";
  static readonly title = "Clip Features";
  static readonly description = `Return CLIP features for the clip-vit-large-patch14 model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "a\nb", description: "Newline-separated inputs. Can either be strings of text or image URIs starting with http[s]://" })
  declare inputs: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const field_inputs = String(inputs.inputs ?? this.inputs ?? "a\nb");

    const args: Record<string, unknown> = {
      "inputs": field_inputs,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "andreasjansson/clip-features", args);
    return { output: outputToString(res.output) };
  }
}

export class ClipInterrogator extends ReplicateNode {
  static readonly nodeType = "replicate.image_analyze.ClipInterrogator";
  static readonly title = "Clip Interrogator";
  static readonly description = `The CLIP Interrogator is a prompt engineering tool that combines OpenAI's CLIP and Salesforce's BLIP to optimize text prompts to match a given image. Use the resulting prompts with text-to-image models like Stable Diffusion to create cool art!
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "best", values: ["best", "classic", "fast", "negative"], description: "Prompt mode (best takes 10-20 seconds, fast takes 1-2 seconds)." })
  declare mode: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "enum", default: "ViT-L-14/openai", values: ["ViT-L-14/openai", "ViT-H-14/laion2b_s32b_b79k", "ViT-bigG-14/laion2b_s39b_b160k"], description: "Choose ViT-L for Stable Diffusion 1, ViT-H for Stable Diffusion 2, or ViT-bigG for Stable Diffusion XL." })
  declare clip_model_name: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const mode = String(inputs.mode ?? this.mode ?? "best");
    const clipModelName = String(inputs.clip_model_name ?? this.clip_model_name ?? "ViT-L-14/openai");

    const args: Record<string, unknown> = {
      "mode": mode,
      "clip_model_name": clipModelName,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "pharmapsychotic/clip-interrogator", args);
    return { output: outputToString(res.output) };
  }
}

export class Img2Prompt extends ReplicateNode {
  static readonly nodeType = "replicate.image_analyze.Img2Prompt";
  static readonly title = "Img2 Prompt";
  static readonly description = `Get an approximate text prompt, with style, matching an image.  (Optimized for stable-diffusion (clip ViT-L/14))
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

    const res = await replicateSubmit(apiKey, "methexis-inc/img2prompt", args);
    return { output: outputToString(res.output) };
  }
}

export class Llava13b extends ReplicateNode {
  static readonly nodeType = "replicate.image_analyze.Llava13b";
  static readonly title = "Llava13b";
  static readonly description = `Visual instruction tuning towards large language and vision models with GPT-4 level capabilities
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "float", default: 1, description: "When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens" })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "Prompt to use for text generation" })
  declare prompt: any;

  @prop({ type: "int", default: 1024, description: "Maximum number of tokens to generate. A word is generally 2-3 tokens" })
  declare max_tokens: any;

  @prop({ type: "float", default: 0.2, description: "Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic" })
  declare temperature: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const topP = Number(inputs.top_p ?? this.top_p ?? 1);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const maxTokens = Number(inputs.max_tokens ?? this.max_tokens ?? 1024);
    const temperature = Number(inputs.temperature ?? this.temperature ?? 0.2);

    const args: Record<string, unknown> = {
      "top_p": topP,
      "prompt": prompt,
      "max_tokens": maxTokens,
      "temperature": temperature,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "yorickvp/llava-13b", args);
    return { output: outputToString(res.output) };
  }
}

export class Moondream2 extends ReplicateNode {
  static readonly nodeType = "replicate.image_analyze.Moondream2";
  static readonly title = "Moondream2";
  static readonly description = `moondream2 is a small vision language model designed to run efficiently on edge devices
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "str", default: "Describe this image", description: "Input prompt" })
  declare prompt: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "Describe this image");

    const args: Record<string, unknown> = {
      "prompt": prompt,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "lucataco/moondream2", args);
    return { output: outputToString(res.output) };
  }
}

export class NSFWImageDetection extends ReplicateNode {
  static readonly nodeType = "replicate.image_analyze.NSFWImageDetection";
  static readonly title = "N S F W Image Detection";
  static readonly description = `Fine-Tuned Vision Transformer (ViT) for NSFW Image Classification
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Input image" })
  declare image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const image = String(inputs.image ?? this.image ?? "");

    const args: Record<string, unknown> = {
      "image": image,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "falcons-ai/nsfw_image_detection", args);
    return { output: outputToString(res.output) };
  }
}

export class SDXLClipInterrogator extends ReplicateNode {
  static readonly nodeType = "replicate.image_analyze.SDXLClipInterrogator";
  static readonly title = "S D X L Clip Interrogator";
  static readonly description = `CLIP Interrogator for SDXL optimizes text prompts to match a given image
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "best", values: ["best", "fast"], description: "Prompt Mode: fast takes 1-2 seconds, best takes 15-25 seconds." })
  declare mode: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const mode = String(inputs.mode ?? this.mode ?? "best");

    const args: Record<string, unknown> = {
      "mode": mode,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "lucataco/sdxl-clip-interrogator", args);
    return { output: outputToString(res.output) };
  }
}

export const REPLICATE_IMAGE_ANALYZE_NODES: readonly NodeClass[] = [
  Blip,
  Blip2,
  ClipFeatures,
  ClipInterrogator,
  Img2Prompt,
  Llava13b,
  Moondream2,
  NSFWImageDetection,
  SDXLClipInterrogator,
] as const;