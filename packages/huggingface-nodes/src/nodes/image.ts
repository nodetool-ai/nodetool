import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  cleanParams,
  getHfToken,
  hfPipelineBinary,
  hfPipelineJson,
  imageRefFromBase64,
  imageRefFromBytes,
  refToBase64,
  type MediaRef
} from "../huggingface-base.js";


const EMPTY_IMAGE = {
  type: "image",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};

// ---------------------------------------------------------------------------
// Text to Image
// ---------------------------------------------------------------------------
export class TextToImageNode extends BaseNode {
  static readonly nodeType = "huggingface.TextToImage";
  static readonly body = "content_card";
  static readonly title = "Text to Image";
  static readonly description =
    "Generate an image from a text prompt via Hugging Face Inference Providers.\n" +
    "image, text-to-image, t2i, generation, diffusion, huggingface\n\n" +
    "Use cases:\n" +
    "- Create artwork from a description\n" +
    "- Generate product or concept images\n" +
    "- Prototype visual ideas";
  static readonly inlineFields = ["prompt"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly autoSaveAsset = true;
  static readonly metadataOutputTypes = { output: "image" };

  @prop({
    type: "str",
    default: "black-forest-labs/FLUX.1-schnell",
    title: "Model",
    description:
      "Text-to-image model repo id (e.g. black-forest-labs/FLUX.1-schnell, stabilityai/stable-diffusion-xl-base-1.0)."
  })
  declare model: string;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image."
  })
  declare prompt: string;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "What the image should NOT contain."
  })
  declare negative_prompt: string;

  @prop({
    type: "int",
    default: 0,
    title: "Width",
    description: "Output width in pixels (0 = model default).",
    min: 0,
    max: 2048
  })
  declare width: number;

  @prop({
    type: "int",
    default: 0,
    title: "Height",
    description: "Output height in pixels (0 = model default).",
    min: 0,
    max: 2048
  })
  declare height: number;

  @prop({
    type: "float",
    default: 0,
    title: "Guidance Scale",
    description: "How closely to follow the prompt (0 = model default).",
    min: 0,
    max: 30
  })
  declare guidance_scale: number;

  @prop({
    type: "int",
    default: 0,
    title: "Inference Steps",
    description: "Number of denoising steps (0 = model default).",
    min: 0,
    max: 100
  })
  declare num_inference_steps: number;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Random seed (-1 = random).",
    min: -1,
    max: 4294967295
  })
  declare seed: number;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const width = Number(this.width ?? 0);
    const height = Number(this.height ?? 0);
    const guidance = Number(this.guidance_scale ?? 0);
    const steps = Number(this.num_inference_steps ?? 0);
    const seed = Number(this.seed ?? -1);

    const { bytes, mimeType } = await hfPipelineBinary(
      token,
      String(this.model ?? "black-forest-labs/FLUX.1-schnell"),
      {
        inputs: prompt,
        parameters: cleanParams({
          negative_prompt: String(this.negative_prompt ?? "") || undefined,
          width: width > 0 ? width : undefined,
          height: height > 0 ? height : undefined,
          guidance_scale: guidance > 0 ? guidance : undefined,
          num_inference_steps: steps > 0 ? steps : undefined,
          seed: seed >= 0 ? seed : undefined
        })
      }
    );

    return {
      output: imageRefFromBytes(bytes, mimeType.startsWith("image/") ? mimeType : "image/png")
    };
  }
}

// ---------------------------------------------------------------------------
// Image to Image
// ---------------------------------------------------------------------------
export class ImageToImageNode extends BaseNode {
  static readonly nodeType = "huggingface.ImageToImage";
  static readonly body = "content_card";
  static readonly title = "Image to Image";
  static readonly description =
    "Transform a source image guided by a prompt (edit, restyle, upscale).\n" +
    "image, image-to-image, edit, transform, diffusion, huggingface\n\n" +
    "Use cases:\n" +
    "- Edit or restyle an image\n" +
    "- Colorize or enhance photos\n" +
    "- Apply a target style";
  static readonly inlineFields = ["prompt"];
  static readonly inputFields = ["image"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly autoSaveAsset = true;
  static readonly metadataOutputTypes = { output: "image" };

  @prop({
    type: "str",
    default: "black-forest-labs/FLUX.1-Kontext-dev",
    title: "Model",
    description: "Image-to-image model repo id."
  })
  declare model: string;

  @prop({
    type: "image",
    default: EMPTY_IMAGE,
    title: "Image",
    description: "The source image to transform."
  })
  declare image: MediaRef;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text prompt guiding the transformation."
  })
  declare prompt: string;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "What the result should NOT contain."
  })
  declare negative_prompt: string;

  @prop({
    type: "float",
    default: 0,
    title: "Guidance Scale",
    description: "How closely to follow the prompt (0 = model default).",
    min: 0,
    max: 30
  })
  declare guidance_scale: number;

  @prop({
    type: "int",
    default: 0,
    title: "Inference Steps",
    description: "Number of denoising steps (0 = model default).",
    min: 0,
    max: 100
  })
  declare num_inference_steps: number;

  async process(
    context?: Parameters<BaseNode["process"]>[0]
  ): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const image = this.image as MediaRef | undefined;
    if (!image || (!image.uri && !image.data)) {
      throw new Error("Input image is required");
    }

    const base64 = await refToBase64(image, context);
    const guidance = Number(this.guidance_scale ?? 0);
    const steps = Number(this.num_inference_steps ?? 0);

    const { bytes, mimeType } = await hfPipelineBinary(
      token,
      String(this.model ?? "black-forest-labs/FLUX.1-Kontext-dev"),
      {
        inputs: base64,
        parameters: cleanParams({
          prompt: String(this.prompt ?? "") || undefined,
          negative_prompt: String(this.negative_prompt ?? "") || undefined,
          guidance_scale: guidance > 0 ? guidance : undefined,
          num_inference_steps: steps > 0 ? steps : undefined
        })
      }
    );

    return {
      output: imageRefFromBytes(bytes, mimeType.startsWith("image/") ? mimeType : "image/png")
    };
  }
}

// ---------------------------------------------------------------------------
// Image Classification
// ---------------------------------------------------------------------------
export class ImageClassificationNode extends BaseNode {
  static readonly nodeType = "huggingface.ImageClassification";
  static readonly title = "Image Classification";
  static readonly description =
    "Assign a label / class to an image.\n" +
    "image, classification, vision, label, huggingface\n\n" +
    "Use cases:\n" +
    "- Categorize images\n" +
    "- Content moderation (e.g. NSFW detection)\n" +
    "- Quality / defect tagging";
  static readonly inputFields = ["image"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "str", scores: "list" };

  @prop({
    type: "str",
    default: "google/vit-base-patch16-224",
    title: "Model",
    description: "Image-classification model repo id."
  })
  declare model: string;

  @prop({
    type: "image",
    default: EMPTY_IMAGE,
    title: "Image",
    description: "The image to classify."
  })
  declare image: MediaRef;

  @prop({
    type: "int",
    default: 5,
    title: "Top K",
    description: "Return the top K most probable classes.",
    min: 1,
    max: 100
  })
  declare top_k: number;

  async process(
    context?: Parameters<BaseNode["process"]>[0]
  ): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const image = this.image as MediaRef | undefined;
    if (!image || (!image.uri && !image.data)) {
      throw new Error("Input image is required");
    }

    const base64 = await refToBase64(image, context);
    const result = await hfPipelineJson<
      Array<{ label?: string; score?: number }>
    >(token, String(this.model ?? "google/vit-base-patch16-224"), {
      inputs: base64,
      parameters: { top_k: Number(this.top_k ?? 5) }
    });

    const scores = Array.isArray(result) ? result : [];
    return { output: String(scores[0]?.label ?? ""), scores };
  }
}

// ---------------------------------------------------------------------------
// Image Segmentation
// ---------------------------------------------------------------------------
export class ImageSegmentationNode extends BaseNode {
  static readonly nodeType = "huggingface.ImageSegmentation";
  static readonly title = "Image Segmentation";
  static readonly description =
    "Segment an image into labeled regions, each with a mask.\n" +
    "image, segmentation, vision, mask, huggingface\n\n" +
    "Use cases:\n" +
    "- Isolate objects from a scene\n" +
    "- Build selection masks\n" +
    "- Scene understanding";
  static readonly inputFields = ["image"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "list" };

  @prop({
    type: "str",
    default: "nvidia/segformer-b0-finetuned-ade-512-512",
    title: "Model",
    description: "Image-segmentation model repo id."
  })
  declare model: string;

  @prop({
    type: "image",
    default: EMPTY_IMAGE,
    title: "Image",
    description: "The image to segment."
  })
  declare image: MediaRef;

  async process(
    context?: Parameters<BaseNode["process"]>[0]
  ): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const image = this.image as MediaRef | undefined;
    if (!image || (!image.uri && !image.data)) {
      throw new Error("Input image is required");
    }

    const base64 = await refToBase64(image, context);
    const result = await hfPipelineJson<
      Array<{ label?: string; score?: number; mask?: string }>
    >(token, String(this.model ?? "nvidia/segformer-b0-finetuned-ade-512-512"), {
      inputs: base64
    });

    // Each segment's mask comes back as a base64 PNG — expose it as an image ref.
    const segments = (Array.isArray(result) ? result : []).map((seg) => ({
      label: String(seg.label ?? ""),
      score: seg.score != null ? Number(seg.score) : null,
      mask: seg.mask ? imageRefFromBase64(seg.mask) : null
    }));

    return { output: segments };
  }
}

// ---------------------------------------------------------------------------
// Object Detection
// ---------------------------------------------------------------------------
export class ObjectDetectionNode extends BaseNode {
  static readonly nodeType = "huggingface.ObjectDetection";
  static readonly title = "Object Detection";
  static readonly description =
    "Detect objects in an image, returning labels, scores and bounding boxes.\n" +
    "image, object-detection, vision, bounding-box, huggingface\n\n" +
    "Use cases:\n" +
    "- Locate objects in a scene\n" +
    "- Count items in an image\n" +
    "- Build vision pipelines";
  static readonly inputFields = ["image"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "list" };

  @prop({
    type: "str",
    default: "facebook/detr-resnet-50",
    title: "Model",
    description: "Object-detection model repo id."
  })
  declare model: string;

  @prop({
    type: "image",
    default: EMPTY_IMAGE,
    title: "Image",
    description: "The image to analyze."
  })
  declare image: MediaRef;

  @prop({
    type: "float",
    default: 0.5,
    title: "Threshold",
    description: "Minimum confidence for a detection to be returned.",
    min: 0,
    max: 1
  })
  declare threshold: number;

  async process(
    context?: Parameters<BaseNode["process"]>[0]
  ): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const image = this.image as MediaRef | undefined;
    if (!image || (!image.uri && !image.data)) {
      throw new Error("Input image is required");
    }

    const base64 = await refToBase64(image, context);
    const result = await hfPipelineJson<
      Array<{
        label?: string;
        score?: number;
        box?: { xmin: number; ymin: number; xmax: number; ymax: number };
      }>
    >(token, String(this.model ?? "facebook/detr-resnet-50"), {
      inputs: base64,
      parameters: { threshold: Number(this.threshold ?? 0.5) }
    });

    return { output: Array.isArray(result) ? result : [] };
  }
}

export const HUGGINGFACE_IMAGE_NODES: readonly NodeClass[] = [
  TextToImageNode,
  ImageToImageNode,
  ImageClassificationNode,
  ImageSegmentationNode,
  ObjectDetectionNode
];
