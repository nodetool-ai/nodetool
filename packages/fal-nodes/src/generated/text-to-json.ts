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

export class BriaFiboEditEditStructured_instruction extends FalNode {
  static readonly nodeType =
    "fal.text_to_json.BriaFiboEditEditStructured_instruction";
  static readonly title = "Bria Fibo Edit Edit Structured_instruction";
  static readonly description = `Structured Instructions Generation endpoint for Fibo Edit, Bria's newest editing model.
text, analysis, json, extraction`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, returns the image directly in the response (increases latency)."
  })
  declare sync_mode: any;

  @prop({
    type: "int",
    default: 5555,
    description: "Random seed for reproducibility."
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description: "Reference image mask (file or URL). Optional."
  })
  declare mask_url: any;

  @prop({
    type: "str",
    default: "",
    description: "Instruction for image editing."
  })
  declare instruction: any;

  @prop({
    type: "image",
    default: "",
    description: "Reference image (file or URL)."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = Number(this.seed ?? 5555);
    const instruction = String(this.instruction ?? "");

    const args: Record<string, unknown> = {
      sync_mode: syncMode,
      seed: seed,
      instruction: instruction
    };

    const maskUrlRef = this.mask_url as Record<string, unknown> | undefined;
    if (isRefSet(maskUrlRef)) {
      const maskUrlUrl =
        (await imageToDataUrl(maskUrlRef!)) ??
        (await assetToFalUrl(apiKey, maskUrlRef!));
      if (maskUrlUrl) args["mask_url"] = maskUrlUrl;
    }

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
      "bria/fibo-edit/edit/structured_instruction",
      args
    );
    return { output: res };
  }
}

export class BriaFiboLiteGenerateStructured_prompt extends FalNode {
  static readonly nodeType =
    "fal.text_to_json.BriaFiboLiteGenerateStructured_prompt";
  static readonly title = "Bria Fibo Lite Generate Structured_prompt";
  static readonly description = `Structured Prompt Generation endpoint for Fibo-Lite, Bria's SOTA Open source model
text, analysis, json, extraction`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "str", default: "", description: "The prompt to generate." })
  declare prompt: any;

  @prop({
    type: "int",
    default: 7,
    description: "Seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "The structured prompt to generate."
  })
  declare structured_prompt: any;

  @prop({ type: "image", default: "", description: "Input image URL" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? 7);
    const structuredPrompt = String(this.structured_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      structured_prompt: structuredPrompt
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
      "bria/fibo-lite/generate/structured_prompt",
      args
    );
    return { output: res };
  }
}

export class BriaFiboLiteGenerateStructured_promptLite extends FalNode {
  static readonly nodeType =
    "fal.text_to_json.BriaFiboLiteGenerateStructured_promptLite";
  static readonly title = "Bria Fibo Lite Generate Structured_prompt Lite";
  static readonly description = `Structured Prompt Generation endpoint for Fibo-Lite, Bria's SOTA Open source model
text, analysis, json, extraction`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt for image generation."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 5555,
    description: "Random seed for reproducibility."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "The structured prompt to generate an image from."
  })
  declare structured_prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "Reference image (file or URL)."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? 5555);
    const structuredPrompt = String(this.structured_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      structured_prompt: structuredPrompt
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
      "bria/fibo-lite/generate/structured_prompt/lite",
      args
    );
    return { output: res };
  }
}

export class BriaFiboGenerateStructured_prompt extends FalNode {
  static readonly nodeType =
    "fal.text_to_json.BriaFiboGenerateStructured_prompt";
  static readonly title = "Bria Fibo Generate Structured_prompt";
  static readonly description = `Structured Prompt Generation endpoint for Fibo, Bria's SOTA Open source model
text, analysis, json, extraction`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt for image generation."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 5555,
    description: "Random seed for reproducibility."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description: "The structured prompt to generate an image from."
  })
  declare structured_prompt: any;

  @prop({
    type: "image",
    default: "",
    description: "Reference image (file or URL)."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? 5555);
    const structuredPrompt = String(this.structured_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      seed: seed,
      structured_prompt: structuredPrompt
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
      "bria/fibo/generate/structured_prompt",
      args
    );
    return { output: res };
  }
}

export const FAL_TEXT_TO_JSON_NODES: readonly NodeClass[] = [
  BriaFiboEditEditStructured_instruction,
  BriaFiboLiteGenerateStructured_prompt,
  BriaFiboLiteGenerateStructured_promptLite,
  BriaFiboGenerateStructured_prompt
] as const;
