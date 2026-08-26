import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getApiKey,
  kieExecuteTask,
  isRefSet,
  uploadImageInput,
} from "../kie-base.js";

export class BytedanceSeedreamV4TextToImageNode extends BaseNode {
  static readonly nodeType = "kie.image.BytedanceSeedreamV4TextToImage";
  static readonly title = "Seedream4.0 - Text to Image";
  static readonly description = `Seedream4.0 - Text to Image via Kie.ai.

    kie, image, ai

    High-quality photorealistic image generation powered by Seedream4.0's advanced AI model`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt"];

  @prop({ type: "str", default: "", title: "Prompt", description: "The text prompt used to generate the image (Max length: 5000 characters)", max: 5000 })
  declare prompt: any;

  @prop({ type: "enum", default: "square_hd", values: ["square","square_hd","portrait_4_3","portrait_3_2","portrait_16_9","landscape_4_3","landscape_3_2","landscape_16_9","landscape_21_9"], title: "Image Size", description: "The size of the generated image." })
  declare image_size: any;

  @prop({ type: "enum", default: "1K", values: ["1K","2K","4K"], title: "Image Resolution", description: "Final image resolution is determined by combining image_size (aspect ratio) and image_resolution (pixel scale). For example, choosing 4:3 + 4K gives 4096 × 3072px" })
  declare image_resolution: any;

  @prop({ type: "float", default: 1, title: "Max Images", description: "Set this value (1–6) to cap how many images a single generation run can produce in one set—because they’re created in one shot rather than separate requests, you must also state the exact number you want in the prompt so both settings align. (Min: 1, Max: 6, Step: 1) (step: 1)", min: 1, max: 6 })
  declare max_images: any;

  @prop({ type: "int", default: 0, title: "Seed", description: "Random seed to control the stochasticity of image generation" })
  declare seed: any;

  @prop({ type: "bool", default: false, title: "Nsfw Checker", description: "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements." })
  declare nsfw_checker: any;

  async process(context?: Parameters<BaseNode["process"]>[0]): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim()) throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["image_size"] = String(this.image_size ?? "square_hd");
    params["image_resolution"] = String(this.image_resolution ?? "1K");
    params["max_images"] = Number(this.max_images ?? 1);
    params["seed"] = Number(this.seed ?? 0);
    params["nsfw_checker"] = Boolean(this.nsfw_checker ?? false);

    const result = await kieExecuteTask(apiKey, "bytedance/seedream-v4-text-to-image", params, 1500, 400);
    return { output: { type: "image", data: result.data } };
  }
}

export class GoogleNanoBananaEditNode extends BaseNode {
  static readonly nodeType = "kie.image.GoogleNanoBananaEdit";
  static readonly title = "Google - Nano Banana Edit";
  static readonly description = `Google - Nano Banana Edit via Kie.ai.

    kie, image, ai

    Image editing using Google's Nano Banana Edit model`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt","images"];

  @prop({ type: "str", default: "", title: "Prompt", description: "The prompt for image editing (Max length: 5000 characters)", max: 5000 })
  declare prompt: any;

  @prop({ type: "list[image]", default: [], title: "Images", description: "List of URLs of input images for editing,up to 10 images. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)", max: 10 })
  declare images: any;

  @prop({ type: "enum", default: "png", values: ["png","jpeg"], title: "Output Format", description: "Output format for the images" })
  declare output_format: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1","9:16","16:9","3:4","4:3","3:2","2:3","5:4","4:5","21:9","auto"], title: "Aspect Ratio", description: "Radio description" })
  declare aspect_ratio: any;

  async process(context?: Parameters<BaseNode["process"]>[0]): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim()) throw new Error("Prompt is required");
    const imagesUrls: string[] = [];
    const imagesList = Array.isArray(this.images) ? this.images : [];
    for (const item of imagesList) {
      if (isRefSet(item)) imagesUrls.push(await uploadImageInput(apiKey, item, context));
    }
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["output_format"] = String(this.output_format ?? "png");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    if (imagesUrls.length) params["image_urls"] = imagesUrls;

    const result = await kieExecuteTask(apiKey, "google/nano-banana-edit", params, 1500, 400);
    return { output: { type: "image", data: result.data } };
  }
}

export class GrokImagineImage20SegmentEditNode extends BaseNode {
  static readonly nodeType = "kie.image.GrokImagineImage20SegmentEdit";
  static readonly title = "Grok Imagine Image 2.0 Segment Edit";
  static readonly description = `Grok Imagine Image 2.0 Segment Edit via Kie.ai.

    kie, image, ai

    ## Create Task`;
  static readonly metadataOutputTypes = { output: "image" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt"];

  @prop({ type: "str", default: "", title: "Prompt", description: "Text prompt describing the desired image." })
  declare prompt: any;

  @prop({ type: "str", default: "", title: "Task Id", description: "The source task ID to use for image editing(This can be a task ID generated by the 'grok-imagine-image-2-0/text-to-image' model, or a task ID generated by the 'grok-imagine-image-2-0/segment-map' model by passing an 'image_url'.)." })
  declare task_id: any;

  @prop({ type: "list[int]", default: [], title: "Mask Indexs", description: "Please enter the index numbers of the segment array items you want to use.", min: 1 })
  declare mask_indexs: any;

  async process(context?: Parameters<BaseNode["process"]>[0]): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim()) throw new Error("Prompt is required");
    if (!String(this.task_id ?? "").trim()) throw new Error("Task Id is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["task_id"] = String(this.task_id ?? "");
    const maskIndexsList = Array.isArray(this.mask_indexs) ? this.mask_indexs : [];
    if (maskIndexsList.length) params["mask_indexs"] = maskIndexsList;

    const result = await kieExecuteTask(apiKey, "grok-imagine-image-2-0/segment-edit", params, 1500, 400);
    return { output: { type: "image", data: result.data } };
  }
}

export const KIE_IMAGE_NODES: readonly NodeClass[] = [
  BytedanceSeedreamV4TextToImageNode,
  GoogleNanoBananaEditNode,
  GrokImagineImage20SegmentEditNode,
] as const;
