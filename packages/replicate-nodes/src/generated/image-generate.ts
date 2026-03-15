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

export class AdInpaint extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.AdInpaint";
  static readonly title = "Ad Inpaint";
  static readonly description = `Product advertising image generator
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "512 * 512", values: ["512 * 512", "768 * 768", "1024 * 1024"], description: "image total pixel" })
  declare pixel: any;

  @prop({ type: "int", default: 3, description: "Factor to scale image by (maximum: 4)" })
  declare scale: any;

  @prop({ type: "str", default: "", description: "Product name or prompt" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of image to generate" })
  declare image_num: any;

  @prop({ type: "image", default: "", description: "input image" })
  declare image_path: any;

  @prop({ type: "int", default: -1, description: "Manual Seed" })
  declare manual_seed: any;

  @prop({ type: "enum", default: "Original", values: ["Original", "0.6 * width", "0.5 * width", "0.4 * width", "0.3 * width", "0.2 * width"], description: "Max product size" })
  declare product_size: any;

  @prop({ type: "float", default: 7.5, description: "Guidance Scale" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement", description: "Anything you don't want in the photo" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 20, description: "Inference Steps" })
  declare num_inference_steps: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const pixel = String(inputs.pixel ?? this.pixel ?? "512 * 512");
    const scale = Number(inputs.scale ?? this.scale ?? 3);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const imageNum = Number(inputs.image_num ?? this.image_num ?? 1);
    const manualSeed = Number(inputs.manual_seed ?? this.manual_seed ?? -1);
    const productSize = String(inputs.product_size ?? this.product_size ?? "Original");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 20);

    const args: Record<string, unknown> = {
      "pixel": pixel,
      "scale": scale,
      "prompt": prompt,
      "image_num": imageNum,
      "manual_seed": manualSeed,
      "product_size": productSize,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
    };

    const imagePathRef = inputs.image_path as Record<string, unknown> | undefined;
    if (isRefSet(imagePathRef)) {
      const imagePathUrl = assetToUrl(imagePathRef!);
      if (imagePathUrl) args["image_path"] = imagePathUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "logerzhu/ad-inpaint", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class ConsistentCharacter extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.ConsistentCharacter";
  static readonly title = "Consistent Character";
  static readonly description = `Create images of a given character in different poses
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Set a seed for reproducibility. Random by default." })
  declare seed: any;

  @prop({ type: "str", default: "A headshot photo", description: "Describe the subject. Include clothes and hairstyle for more consistency." })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "An image of a person. Best images are square close ups of a face, but they do not have to be." })
  declare subject: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality." })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Things you do not want to see in your image" })
  declare negative_prompt: any;

  @prop({ type: "bool", default: true, description: "Randomise the poses used." })
  declare randomise_poses: any;

  @prop({ type: "int", default: 3, description: "The number of images to generate." })
  declare number_of_outputs: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  @prop({ type: "int", default: 1, description: "The number of images to generate for each pose." })
  declare number_of_images_per_pose: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "A headshot photo");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const randomisePoses = Boolean(inputs.randomise_poses ?? this.randomise_poses ?? true);
    const numberOfOutputs = Number(inputs.number_of_outputs ?? this.number_of_outputs ?? 3);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);
    const numberOfImagesPerPose = Number(inputs.number_of_images_per_pose ?? this.number_of_images_per_pose ?? 1);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "negative_prompt": negativePrompt,
      "randomise_poses": randomisePoses,
      "number_of_outputs": numberOfOutputs,
      "disable_safety_checker": disableSafetyChecker,
      "number_of_images_per_pose": numberOfImagesPerPose,
    };

    const subjectRef = inputs.subject as Record<string, unknown> | undefined;
    if (isRefSet(subjectRef)) {
      const subjectUrl = assetToUrl(subjectRef!);
      if (subjectUrl) args["subject"] = subjectUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "sdxl-based/consistent-character", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_1_1_Pro_Ultra extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_1_1_Pro_Ultra";
  static readonly title = "Flux_1_1_ Pro_ Ultra";
  static readonly description = `FLUX1.1 [pro] in ultra and raw modes. Images are up to 4 megapixels. Use raw mode for realism.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "bool", default: false, description: "Generate less processed, more natural-looking images" })
  declare raw: any;

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16", "9:21"], description: "Aspect ratio for the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Image to use with Flux Redux. This is used together with the text prompt to guide the generation towards the composition of the image_prompt. Must be jpeg, png, gif, or webp." })
  declare image_prompt: any;

  @prop({ type: "enum", default: "jpg", values: ["jpg", "png"], description: "Format of the output images." })
  declare output_format: any;

  @prop({ type: "int", default: 2, description: "Safety tolerance, 1 is most strict and 6 is most permissive" })
  declare safety_tolerance: any;

  @prop({ type: "float", default: 0.1, description: "Blend between the prompt and the image prompt." })
  declare image_prompt_strength: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const raw = Boolean(inputs.raw ?? this.raw ?? false);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const imagePrompt = String(inputs.image_prompt ?? this.image_prompt ?? "");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "jpg");
    const safetyTolerance = Number(inputs.safety_tolerance ?? this.safety_tolerance ?? 2);
    const imagePromptStrength = Number(inputs.image_prompt_strength ?? this.image_prompt_strength ?? 0.1);

    const args: Record<string, unknown> = {
      "raw": raw,
      "seed": seed,
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "image_prompt": imagePrompt,
      "output_format": outputFormat,
      "safety_tolerance": safetyTolerance,
      "image_prompt_strength": imagePromptStrength,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-1.1-pro-ultra", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_2_Flex extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_2_Flex";
  static readonly title = "Flux_2_ Flex";
  static readonly description = `Max-quality image generation and editing with support for ten reference images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "int", default: 30, description: "Number of inference steps" })
  declare steps: any;

  @prop({ type: "int", default: "", description: "Width of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)." })
  declare width: any;

  @prop({ type: "int", default: "", description: "Height of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)." })
  declare height: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "float", default: 4.5, description: "Guidance scale for generation. Controls how closely the output follows the prompt" })
  declare guidance: any;

  @prop({ type: "enum", default: "1 MP", values: ["match_input_image", "0.5 MP", "1 MP", "2 MP", "4 MP"], description: "Resolution in megapixels. Up to 4 MP is possible, but 2 MP or below is recommended. The maximum image size is 2048x2048, which means that high-resolution images may not respect the resolution if aspect ratio is not 1:1.\n\nResolution is not used when aspect_ratio is 'custom'. When aspect_ratio is 'match_input_image', use 'match_input_image' to match the input image's resolution (clamped to 0.5-4 MP)." })
  declare resolution: any;

  @prop({ type: "enum", default: "1:1", values: ["match_input_image", "custom", "1:1", "16:9", "3:2", "2:3", "4:5", "5:4", "9:16", "3:4", "4:3"], description: "Aspect ratio for the generated image. Use 'match_input_image' to match the first input image's aspect ratio." })
  declare aspect_ratio: any;

  @prop({ type: "any", default: [], description: "List of input images for image-to-image generation. Maximum 10 images. Must be jpeg, png, gif, or webp." })
  declare input_images: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images." })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 2, description: "Safety tolerance, 1 is most strict and 5 is most permissive" })
  declare safety_tolerance: any;

  @prop({ type: "bool", default: true, description: "Automatically modify the prompt for more creative generation" })
  declare prompt_upsampling: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const steps = Number(inputs.steps ?? this.steps ?? 30);
    const width = Number(inputs.width ?? this.width ?? "");
    const height = Number(inputs.height ?? this.height ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const guidance = Number(inputs.guidance ?? this.guidance ?? 4.5);
    const resolution = String(inputs.resolution ?? this.resolution ?? "1 MP");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const inputImages = String(inputs.input_images ?? this.input_images ?? []);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const safetyTolerance = Number(inputs.safety_tolerance ?? this.safety_tolerance ?? 2);
    const promptUpsampling = Boolean(inputs.prompt_upsampling ?? this.prompt_upsampling ?? true);

    const args: Record<string, unknown> = {
      "seed": seed,
      "steps": steps,
      "width": width,
      "height": height,
      "prompt": prompt,
      "guidance": guidance,
      "resolution": resolution,
      "aspect_ratio": aspectRatio,
      "input_images": inputImages,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "safety_tolerance": safetyTolerance,
      "prompt_upsampling": promptUpsampling,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-2-flex", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_2_Max extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_2_Max";
  static readonly title = "Flux_2_ Max";
  static readonly description = `The highest fidelity image model from Black Forest Labs
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "int", default: "", description: "Width of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)." })
  declare width: any;

  @prop({ type: "int", default: "", description: "Height of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)." })
  declare height: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "1 MP", values: ["match_input_image", "0.5 MP", "1 MP", "2 MP", "4 MP"], description: "Resolution in megapixels. Up to 4 MP is possible, but 2 MP or below is recommended. The maximum image size is 2048x2048, which means that high-resolution images may not respect the resolution if aspect ratio is not 1:1.\n\nResolution is not used when aspect_ratio is 'custom'. When aspect_ratio is 'match_input_image', use 'match_input_image' to match the input image's resolution (clamped to 0.5-4 MP)." })
  declare resolution: any;

  @prop({ type: "enum", default: "1:1", values: ["match_input_image", "custom", "1:1", "16:9", "3:2", "2:3", "4:5", "5:4", "9:16", "3:4", "4:3"], description: "Aspect ratio for the generated image. Use 'match_input_image' to match the first input image's aspect ratio." })
  declare aspect_ratio: any;

  @prop({ type: "any", default: [], description: "List of input images for image-to-image generation. Maximum 8 images. Must be jpeg, png, gif, or webp." })
  declare input_images: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images." })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 2, description: "Safety tolerance, 1 is most strict and 5 is most permissive" })
  declare safety_tolerance: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = Number(inputs.width ?? this.width ?? "");
    const height = Number(inputs.height ?? this.height ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const resolution = String(inputs.resolution ?? this.resolution ?? "1 MP");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const inputImages = String(inputs.input_images ?? this.input_images ?? []);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const safetyTolerance = Number(inputs.safety_tolerance ?? this.safety_tolerance ?? 2);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "resolution": resolution,
      "aspect_ratio": aspectRatio,
      "input_images": inputImages,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "safety_tolerance": safetyTolerance,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-2-max", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_2_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_2_Pro";
  static readonly title = "Flux_2_ Pro";
  static readonly description = `High-quality image generation and editing with support for eight reference images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "int", default: "", description: "Width of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)." })
  declare width: any;

  @prop({ type: "int", default: "", description: "Height of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)." })
  declare height: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "1 MP", values: ["match_input_image", "0.5 MP", "1 MP", "2 MP", "4 MP"], description: "Resolution in megapixels. Up to 4 MP is possible, but 2 MP or below is recommended. The maximum image size is 2048x2048, which means that high-resolution images may not respect the resolution if aspect ratio is not 1:1.\n\nResolution is not used when aspect_ratio is 'custom'. When aspect_ratio is 'match_input_image', use 'match_input_image' to match the input image's resolution (clamped to 0.5-4 MP)." })
  declare resolution: any;

  @prop({ type: "enum", default: "1:1", values: ["match_input_image", "custom", "1:1", "16:9", "3:2", "2:3", "4:5", "5:4", "9:16", "3:4", "4:3"], description: "Aspect ratio for the generated image. Use 'match_input_image' to match the first input image's aspect ratio." })
  declare aspect_ratio: any;

  @prop({ type: "any", default: [], description: "List of input images for image-to-image generation. Maximum 8 images. Must be jpeg, png, gif, or webp." })
  declare input_images: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images." })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 2, description: "Safety tolerance, 1 is most strict and 5 is most permissive" })
  declare safety_tolerance: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = Number(inputs.width ?? this.width ?? "");
    const height = Number(inputs.height ?? this.height ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const resolution = String(inputs.resolution ?? this.resolution ?? "1 MP");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const inputImages = String(inputs.input_images ?? this.input_images ?? []);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const safetyTolerance = Number(inputs.safety_tolerance ?? this.safety_tolerance ?? 2);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "resolution": resolution,
      "aspect_ratio": aspectRatio,
      "input_images": inputImages,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "safety_tolerance": safetyTolerance,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-2-pro", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_360 extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_360";
  static readonly title = "Flux_360";
  static readonly description = `Generate 360 panorama images.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored." })
  declare image: any;

  @prop({ type: "enum", default: "dev", values: ["dev", "schnell"], description: "Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps." })
  declare model: any;

  @prop({ type: "int", default: "", description: "Width of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation" })
  declare width: any;

  @prop({ type: "int", default: "", description: "Height of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation" })
  declare height: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image. If you include the 'trigger_word' used in the training process you are more likely to activate the trained object, style, or concept in the resulting image." })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16" })
  declare go_fast: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'" })
  declare extra_lora: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25"], description: "Approximate number of megapixels for generated image" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21", "custom"], description: "Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "float", default: 3, description: "Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare extra_lora_scale: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'" })
  declare replicate_weights: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. More steps can give more detailed images, but take longer." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const model = String(inputs.model ?? this.model ?? "dev");
    const width = Number(inputs.width ?? this.width ?? "");
    const height = Number(inputs.height ?? this.height ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? false);
    const extraLora = String(inputs.extra_lora ?? this.extra_lora ?? "");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 1);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 3);
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const extraLoraScale = Number(inputs.extra_lora_scale ?? this.extra_lora_scale ?? 1);
    const replicateWeights = String(inputs.replicate_weights ?? this.replicate_weights ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 28);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "model": model,
      "width": width,
      "height": height,
      "prompt": prompt,
      "go_fast": goFast,
      "extra_lora": extraLora,
      "lora_scale": loraScale,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "guidance_scale": guidanceScale,
      "output_quality": outputQuality,
      "prompt_strength": promptStrength,
      "extra_lora_scale": extraLoraScale,
      "replicate_weights": replicateWeights,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "igorriti/flux-360", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Black_Light extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Black_Light";
  static readonly title = "Flux_ Black_ Light";
  static readonly description = `A flux lora fine-tuned on black light images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored." })
  declare image: any;

  @prop({ type: "enum", default: "dev", values: ["dev", "schnell"], description: "Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps." })
  declare model: any;

  @prop({ type: "int", default: "", description: "Width of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation" })
  declare width: any;

  @prop({ type: "int", default: "", description: "Height of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation" })
  declare height: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image. If you include the 'trigger_word' used in the training process you are more likely to activate the trained object, style, or concept in the resulting image." })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16" })
  declare go_fast: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'" })
  declare extra_lora: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25"], description: "Approximate number of megapixels for generated image" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21", "custom"], description: "Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "float", default: 3, description: "Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare extra_lora_scale: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'" })
  declare replicate_weights: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. More steps can give more detailed images, but take longer." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const model = String(inputs.model ?? this.model ?? "dev");
    const width = Number(inputs.width ?? this.width ?? "");
    const height = Number(inputs.height ?? this.height ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? false);
    const extraLora = String(inputs.extra_lora ?? this.extra_lora ?? "");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 1);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 3);
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const extraLoraScale = Number(inputs.extra_lora_scale ?? this.extra_lora_scale ?? 1);
    const replicateWeights = String(inputs.replicate_weights ?? this.replicate_weights ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 28);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "model": model,
      "width": width,
      "height": height,
      "prompt": prompt,
      "go_fast": goFast,
      "extra_lora": extraLora,
      "lora_scale": loraScale,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "guidance_scale": guidanceScale,
      "output_quality": outputQuality,
      "prompt_strength": promptStrength,
      "extra_lora_scale": extraLoraScale,
      "replicate_weights": replicateWeights,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fofr/flux-black-light", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Canny_Dev extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Canny_Dev";
  static readonly title = "Flux_ Canny_ Dev";
  static readonly description = `Open-weight edge-guided image generation. Control structure and composition using Canny edge detection.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({ type: "float", default: 30, description: "Guidance for generated image" })
  declare guidance: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25", "match_input"], description: "Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels)" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "image", default: "", description: "Image used to control the generation. The canny edge detection will be automatically generated." })
  declare control_image: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const guidance = Number(inputs.guidance ?? this.guidance ?? 30);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 28);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "guidance": guidance,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const controlImageRef = inputs.control_image as Record<string, unknown> | undefined;
    if (isRefSet(controlImageRef)) {
      const controlImageUrl = assetToUrl(controlImageRef!);
      if (controlImageUrl) args["control_image"] = controlImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-canny-dev", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Canny_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Canny_Pro";
  static readonly title = "Flux_ Canny_ Pro";
  static readonly description = `Professional edge-guided image generation. Control structure and composition using Canny edge detection
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "int", default: 50, description: "Number of diffusion steps. Higher values yield finer details but increase processing time." })
  declare steps: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "float", default: 30, description: "Controls the balance between adherence to the text as well as image prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt." })
  declare guidance: any;

  @prop({ type: "image", default: "", description: "Image to use as control input. Must be jpeg, png, gif, or webp." })
  declare control_image: any;

  @prop({ type: "enum", default: "jpg", values: ["jpg", "png"], description: "Format of the output images." })
  declare output_format: any;

  @prop({ type: "int", default: 2, description: "Safety tolerance, 1 is most strict and 6 is most permissive" })
  declare safety_tolerance: any;

  @prop({ type: "bool", default: false, description: "Automatically modify the prompt for more creative generation" })
  declare prompt_upsampling: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const steps = Number(inputs.steps ?? this.steps ?? 50);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const guidance = Number(inputs.guidance ?? this.guidance ?? 30);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "jpg");
    const safetyTolerance = Number(inputs.safety_tolerance ?? this.safety_tolerance ?? 2);
    const promptUpsampling = Boolean(inputs.prompt_upsampling ?? this.prompt_upsampling ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "steps": steps,
      "prompt": prompt,
      "guidance": guidance,
      "output_format": outputFormat,
      "safety_tolerance": safetyTolerance,
      "prompt_upsampling": promptUpsampling,
    };

    const controlImageRef = inputs.control_image as Record<string, unknown> | undefined;
    if (isRefSet(controlImageRef)) {
      const controlImageUrl = assetToUrl(controlImageRef!);
      if (controlImageUrl) args["control_image"] = controlImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-canny-pro", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Cinestill extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Cinestill";
  static readonly title = "Flux_ Cinestill";
  static readonly description = `Flux lora, use "CNSTLL" to trigger
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored." })
  declare image: any;

  @prop({ type: "enum", default: "dev", values: ["dev", "schnell"], description: "Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps." })
  declare model: any;

  @prop({ type: "int", default: "", description: "Width of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation" })
  declare width: any;

  @prop({ type: "int", default: "", description: "Height of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation" })
  declare height: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image. If you include the 'trigger_word' used in the training process you are more likely to activate the trained object, style, or concept in the resulting image." })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16" })
  declare go_fast: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'" })
  declare extra_lora: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25"], description: "Approximate number of megapixels for generated image" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21", "custom"], description: "Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "float", default: 3, description: "Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare extra_lora_scale: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'" })
  declare replicate_weights: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. More steps can give more detailed images, but take longer." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const model = String(inputs.model ?? this.model ?? "dev");
    const width = Number(inputs.width ?? this.width ?? "");
    const height = Number(inputs.height ?? this.height ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? false);
    const extraLora = String(inputs.extra_lora ?? this.extra_lora ?? "");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 1);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 3);
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const extraLoraScale = Number(inputs.extra_lora_scale ?? this.extra_lora_scale ?? 1);
    const replicateWeights = String(inputs.replicate_weights ?? this.replicate_weights ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 28);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "model": model,
      "width": width,
      "height": height,
      "prompt": prompt,
      "go_fast": goFast,
      "extra_lora": extraLora,
      "lora_scale": loraScale,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "guidance_scale": guidanceScale,
      "output_quality": outputQuality,
      "prompt_strength": promptStrength,
      "extra_lora_scale": extraLoraScale,
      "replicate_weights": replicateWeights,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "adirik/flux-cinestill", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Depth_Dev extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Depth_Dev";
  static readonly title = "Flux_ Depth_ Dev";
  static readonly description = `Open-weight depth-aware image generation. Edit images while preserving spatial relationships.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({ type: "float", default: 10, description: "Guidance for generated image" })
  declare guidance: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25", "match_input"], description: "Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels)" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "image", default: "", description: "Image used to control the generation. The depth map will be automatically generated." })
  declare control_image: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const guidance = Number(inputs.guidance ?? this.guidance ?? 10);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 28);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "guidance": guidance,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const controlImageRef = inputs.control_image as Record<string, unknown> | undefined;
    if (isRefSet(controlImageRef)) {
      const controlImageUrl = assetToUrl(controlImageRef!);
      if (controlImageUrl) args["control_image"] = controlImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-depth-dev", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Depth_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Depth_Pro";
  static readonly title = "Flux_ Depth_ Pro";
  static readonly description = `Professional depth-aware image generation. Edit images while preserving spatial relationships.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "int", default: 50, description: "Number of diffusion steps. Higher values yield finer details but increase processing time." })
  declare steps: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "float", default: 30, description: "Controls the balance between adherence to the text as well as image prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt." })
  declare guidance: any;

  @prop({ type: "image", default: "", description: "Image to use as control input. Must be jpeg, png, gif, or webp." })
  declare control_image: any;

  @prop({ type: "enum", default: "jpg", values: ["jpg", "png"], description: "Format of the output images." })
  declare output_format: any;

  @prop({ type: "int", default: 2, description: "Safety tolerance, 1 is most strict and 6 is most permissive" })
  declare safety_tolerance: any;

  @prop({ type: "bool", default: false, description: "Automatically modify the prompt for more creative generation" })
  declare prompt_upsampling: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const steps = Number(inputs.steps ?? this.steps ?? 50);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const guidance = Number(inputs.guidance ?? this.guidance ?? 30);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "jpg");
    const safetyTolerance = Number(inputs.safety_tolerance ?? this.safety_tolerance ?? 2);
    const promptUpsampling = Boolean(inputs.prompt_upsampling ?? this.prompt_upsampling ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "steps": steps,
      "prompt": prompt,
      "guidance": guidance,
      "output_format": outputFormat,
      "safety_tolerance": safetyTolerance,
      "prompt_upsampling": promptUpsampling,
    };

    const controlImageRef = inputs.control_image as Record<string, unknown> | undefined;
    if (isRefSet(controlImageRef)) {
      const controlImageUrl = assetToUrl(controlImageRef!);
      if (controlImageUrl) args["control_image"] = controlImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-depth-pro", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Dev extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Dev";
  static readonly title = "Flux_ Dev";
  static readonly description = `A 12 billion parameter rectified flow transformer capable of generating images from text descriptions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Input image for image to image mode. The aspect ratio of your output will match this image" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16. Note that outputs will not be deterministic when this is enabled, even if you set a seed." })
  declare go_fast: any;

  @prop({ type: "float", default: 3, description: "Guidance for generated image" })
  declare guidance: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25"], description: "Approximate number of megapixels for generated image" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21"], description: "Aspect ratio for the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const image = String(inputs.image ?? this.image ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? true);
    const guidance = Number(inputs.guidance ?? this.guidance ?? 3);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 28);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "image": image,
      "prompt": prompt,
      "go_fast": goFast,
      "guidance": guidance,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "prompt_strength": promptStrength,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-dev", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Dev_Lora extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Dev_Lora";
  static readonly title = "Flux_ Dev_ Lora";
  static readonly description = `A version of flux-dev, a text to image model, that supports fast fine-tuned lora inference
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for image to image mode. The aspect ratio of your output will match this image" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16. Note that outputs will not be deterministic when this is enabled, even if you set a seed." })
  declare go_fast: any;

  @prop({ type: "float", default: 3, description: "Guidance for generated image" })
  declare guidance: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'" })
  declare extra_lora: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25"], description: "Approximate number of megapixels for generated image" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21"], description: "Aspect ratio for the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "HuggingFace API token. If you're using a hf lora that needs authentication, you'll need to provide an API token." })
  declare hf_api_token: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>[/<lora-weights-file.safetensors>], CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet, including signed URLs. For example, 'fofr/flux-pixar-cars'. Civit AI and HuggingFace LoRAs may require an API token to access, which you can provide in the 'civitai_api_token' and 'hf_api_token' inputs respectively." })
  declare lora_weights: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare extra_lora_scale: any;

  @prop({ type: "str", default: "", description: "Civitai API token. If you're using a civitai lora that needs authentication, you'll need to provide an API token." })
  declare civitai_api_token: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? true);
    const guidance = Number(inputs.guidance ?? this.guidance ?? 3);
    const extraLora = String(inputs.extra_lora ?? this.extra_lora ?? "");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 1);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const hfApiToken = String(inputs.hf_api_token ?? this.hf_api_token ?? "");
    const loraWeights = String(inputs.lora_weights ?? this.lora_weights ?? "");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const extraLoraScale = Number(inputs.extra_lora_scale ?? this.extra_lora_scale ?? 1);
    const civitaiApiToken = String(inputs.civitai_api_token ?? this.civitai_api_token ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 28);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "go_fast": goFast,
      "guidance": guidance,
      "extra_lora": extraLora,
      "lora_scale": loraScale,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "aspect_ratio": aspectRatio,
      "hf_api_token": hfApiToken,
      "lora_weights": loraWeights,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "prompt_strength": promptStrength,
      "extra_lora_scale": extraLoraScale,
      "civitai_api_token": civitaiApiToken,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-dev-lora", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Fill_Dev extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Fill_Dev";
  static readonly title = "Flux_ Fill_ Dev";
  static readonly description = `Open-weight inpainting model for editing and extending images. Guidance-distilled from FLUX.1 Fill [pro].
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "A black-and-white image that describes the part of the image to inpaint. Black areas will be preserved while white areas will be inpainted." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "The image to inpaint. Can contain alpha mask. If the image width or height are not multiples of 32, they will be scaled to the closest multiple of 32. If the image dimensions don't fit within 1440x1440, it will be scaled down to fit." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({ type: "float", default: 30, description: "Guidance for generated image" })
  declare guidance: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25", "match_input"], description: "Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels)" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'" })
  declare lora_weights: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const mask = String(inputs.mask ?? this.mask ?? "");
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const image = String(inputs.image ?? this.image ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const guidance = Number(inputs.guidance ?? this.guidance ?? 30);
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 1);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const loraWeights = String(inputs.lora_weights ?? this.lora_weights ?? "");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 28);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "mask": mask,
      "seed": seed,
      "image": image,
      "prompt": prompt,
      "guidance": guidance,
      "lora_scale": loraScale,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "lora_weights": loraWeights,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-fill-dev", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Fill_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Fill_Pro";
  static readonly title = "Flux_ Fill_ Pro";
  static readonly description = `Professional inpainting and outpainting model with state-of-the-art performance. Edit or extend images with natural, seamless results.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "A black-and-white image that describes the part of the image to inpaint. Black areas will be preserved while white areas will be inpainted. Must have the same size as image. Optional if you provide an alpha mask in the original image. Must be jpeg, png, gif, or webp." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "The image to inpaint. Can contain an alpha mask. Must be jpeg, png, gif, or webp." })
  declare image: any;

  @prop({ type: "int", default: 50, description: "Number of diffusion steps. Higher values yield finer details but increase processing time." })
  declare steps: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "float", default: 60, description: "Controls the balance between adherence to the text prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt." })
  declare guidance: any;

  @prop({ type: "enum", default: "None", values: ["None", "Zoom out 1.5x", "Zoom out 2x", "Make square", "Left outpaint", "Right outpaint", "Top outpaint", "Bottom outpaint"], description: "A quick option for outpainting an input image. Mask will be ignored." })
  declare outpaint: any;

  @prop({ type: "enum", default: "jpg", values: ["jpg", "png"], description: "Format of the output images." })
  declare output_format: any;

  @prop({ type: "int", default: 2, description: "Safety tolerance, 1 is most strict and 6 is most permissive" })
  declare safety_tolerance: any;

  @prop({ type: "bool", default: false, description: "Automatically modify the prompt for more creative generation" })
  declare prompt_upsampling: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const mask = String(inputs.mask ?? this.mask ?? "");
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const image = String(inputs.image ?? this.image ?? "");
    const steps = Number(inputs.steps ?? this.steps ?? 50);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const guidance = Number(inputs.guidance ?? this.guidance ?? 60);
    const outpaint = String(inputs.outpaint ?? this.outpaint ?? "None");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "jpg");
    const safetyTolerance = Number(inputs.safety_tolerance ?? this.safety_tolerance ?? 2);
    const promptUpsampling = Boolean(inputs.prompt_upsampling ?? this.prompt_upsampling ?? false);

    const args: Record<string, unknown> = {
      "mask": mask,
      "seed": seed,
      "image": image,
      "steps": steps,
      "prompt": prompt,
      "guidance": guidance,
      "outpaint": outpaint,
      "output_format": outputFormat,
      "safety_tolerance": safetyTolerance,
      "prompt_upsampling": promptUpsampling,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-fill-pro", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Kontext_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Kontext_Pro";
  static readonly title = "Flux_ Kontext_ Pro";
  static readonly description = `A state-of-the-art text-based image editing model that delivers high-quality outputs with excellent prompt following and consistent results for transforming images through natural language
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Text description of what you want to generate, or the instruction on how to edit the given image." })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "Image to use as reference. Must be jpeg, png, gif, or webp." })
  declare input_image: any;

  @prop({ type: "enum", default: "match_input_image", values: ["match_input_image", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "21:9", "9:21", "2:1", "1:2"], description: "Aspect ratio of the generated image. Use 'match_input_image' to match the aspect ratio of the input image." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "png", values: ["jpg", "png"], description: "Output format for the generated image" })
  declare output_format: any;

  @prop({ type: "int", default: 2, description: "Safety tolerance, 0 is most strict and 6 is most permissive. 2 is currently the maximum allowed when input images are used." })
  declare safety_tolerance: any;

  @prop({ type: "bool", default: false, description: "Automatic prompt improvement" })
  declare prompt_upsampling: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const inputImage = String(inputs.input_image ?? this.input_image ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "match_input_image");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "png");
    const safetyTolerance = Number(inputs.safety_tolerance ?? this.safety_tolerance ?? 2);
    const promptUpsampling = Boolean(inputs.prompt_upsampling ?? this.prompt_upsampling ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "input_image": inputImage,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "safety_tolerance": safetyTolerance,
      "prompt_upsampling": promptUpsampling,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-kontext-pro", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Mona_Lisa extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Mona_Lisa";
  static readonly title = "Flux_ Mona_ Lisa";
  static readonly description = `Flux lora, use the term "MNALSA" to trigger generation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored." })
  declare image: any;

  @prop({ type: "enum", default: "dev", values: ["dev", "schnell"], description: "Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps." })
  declare model: any;

  @prop({ type: "int", default: "", description: "Width of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation" })
  declare width: any;

  @prop({ type: "int", default: "", description: "Height of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation" })
  declare height: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image. If you include the 'trigger_word' used in the training process you are more likely to activate the trained object, style, or concept in the resulting image." })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16" })
  declare go_fast: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'" })
  declare extra_lora: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25"], description: "Approximate number of megapixels for generated image" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21", "custom"], description: "Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "float", default: 3, description: "Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare extra_lora_scale: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'" })
  declare replicate_weights: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. More steps can give more detailed images, but take longer." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const model = String(inputs.model ?? this.model ?? "dev");
    const width = Number(inputs.width ?? this.width ?? "");
    const height = Number(inputs.height ?? this.height ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? false);
    const extraLora = String(inputs.extra_lora ?? this.extra_lora ?? "");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 1);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 3);
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const extraLoraScale = Number(inputs.extra_lora_scale ?? this.extra_lora_scale ?? 1);
    const replicateWeights = String(inputs.replicate_weights ?? this.replicate_weights ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 28);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "model": model,
      "width": width,
      "height": height,
      "prompt": prompt,
      "go_fast": goFast,
      "extra_lora": extraLora,
      "lora_scale": loraScale,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "guidance_scale": guidanceScale,
      "output_quality": outputQuality,
      "prompt_strength": promptStrength,
      "extra_lora_scale": extraLoraScale,
      "replicate_weights": replicateWeights,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fofr/flux-mona-lisa", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Pro";
  static readonly title = "Flux_ Pro";
  static readonly description = `State-of-the-art image generation with top of the line prompt following, visual quality, image detail and output diversity.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "int", default: 25, description: "Deprecated" })
  declare steps: any;

  @prop({ type: "int", default: "", description: "Width of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes." })
  declare width: any;

  @prop({ type: "int", default: "", description: "Height of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes." })
  declare height: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "float", default: 3, description: "Controls the balance between adherence to the text prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt." })
  declare guidance: any;

  @prop({ type: "float", default: 2, description: "Deprecated" })
  declare interval: any;

  @prop({ type: "enum", default: "1:1", values: ["custom", "1:1", "16:9", "3:2", "2:3", "4:5", "5:4", "9:16", "3:4", "4:3"], description: "Aspect ratio for the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Image to use with Flux Redux. This is used together with the text prompt to guide the generation towards the composition of the image_prompt. Must be jpeg, png, gif, or webp." })
  declare image_prompt: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images." })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 2, description: "Safety tolerance, 1 is most strict and 6 is most permissive" })
  declare safety_tolerance: any;

  @prop({ type: "bool", default: false, description: "Automatically modify the prompt for more creative generation" })
  declare prompt_upsampling: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const steps = Number(inputs.steps ?? this.steps ?? 25);
    const width = Number(inputs.width ?? this.width ?? "");
    const height = Number(inputs.height ?? this.height ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const guidance = Number(inputs.guidance ?? this.guidance ?? 3);
    const interval = Number(inputs.interval ?? this.interval ?? 2);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const imagePrompt = String(inputs.image_prompt ?? this.image_prompt ?? "");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const safetyTolerance = Number(inputs.safety_tolerance ?? this.safety_tolerance ?? 2);
    const promptUpsampling = Boolean(inputs.prompt_upsampling ?? this.prompt_upsampling ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "steps": steps,
      "width": width,
      "height": height,
      "prompt": prompt,
      "guidance": guidance,
      "interval": interval,
      "aspect_ratio": aspectRatio,
      "image_prompt": imagePrompt,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "safety_tolerance": safetyTolerance,
      "prompt_upsampling": promptUpsampling,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-pro", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Redux_Dev extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Redux_Dev";
  static readonly title = "Flux_ Redux_ Dev";
  static readonly description = `Open-weight image variation model. Create new versions while preserving key elements of your original.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "float", default: 3, description: "Guidance for generated image" })
  declare guidance: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25"], description: "Approximate number of megapixels for generated image" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "image", default: "", description: "Input image to condition your output on. This replaces prompt for FLUX.1 Redux models" })
  declare redux_image: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21"], description: "Aspect ratio for the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 28, description: "Number of denoising steps. Recommended range is 28-50" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const guidance = Number(inputs.guidance ?? this.guidance ?? 3);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 28);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "guidance": guidance,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const reduxImageRef = inputs.redux_image as Record<string, unknown> | undefined;
    if (isRefSet(reduxImageRef)) {
      const reduxImageUrl = assetToUrl(reduxImageRef!);
      if (reduxImageUrl) args["redux_image"] = reduxImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-redux-dev", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Redux_Schnell extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Redux_Schnell";
  static readonly title = "Flux_ Redux_ Schnell";
  static readonly description = `Fast, efficient image variation model for rapid iteration and experimentation.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25"], description: "Approximate number of megapixels for generated image" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "image", default: "", description: "Input image to condition your output on. This replaces prompt for FLUX.1 Redux models" })
  declare redux_image: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21"], description: "Aspect ratio for the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 4, description: "Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 4);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const reduxImageRef = inputs.redux_image as Record<string, unknown> | undefined;
    if (isRefSet(reduxImageRef)) {
      const reduxImageUrl = assetToUrl(reduxImageRef!);
      if (reduxImageUrl) args["redux_image"] = reduxImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-redux-schnell", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Schnell extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Schnell";
  static readonly title = "Flux_ Schnell";
  static readonly description = `The fastest image generation model tailored for local development and personal use
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16. Note that outputs will not be deterministic when this is enabled, even if you set a seed." })
  declare go_fast: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25"], description: "Approximate number of megapixels for generated image" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21"], description: "Aspect ratio for the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 4, description: "Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? true);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 4);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "go_fast": goFast,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-schnell", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Schnell_Lora extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Flux_Schnell_Lora";
  static readonly title = "Flux_ Schnell_ Lora";
  static readonly description = `The fastest image generation model tailored for fine-tuned use
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16. Note that outputs will not be deterministic when this is enabled, even if you set a seed." })
  declare go_fast: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "1", values: ["1", "0.25"], description: "Approximate number of megapixels for generated image" })
  declare megapixels: any;

  @prop({ type: "int", default: 1, description: "Number of outputs to generate" })
  declare num_outputs: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21"], description: "Aspect ratio for the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'" })
  declare lora_weights: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 4, description: "Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? true);
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 1);
    const megapixels = String(inputs.megapixels ?? this.megapixels ?? "1");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const loraWeights = String(inputs.lora_weights ?? this.lora_weights ?? "");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 4);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "go_fast": goFast,
      "lora_scale": loraScale,
      "megapixels": megapixels,
      "num_outputs": numOutputs,
      "aspect_ratio": aspectRatio,
      "lora_weights": loraWeights,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "black-forest-labs/flux-schnell-lora", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class GPT_Image_1_5 extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.GPT_Image_1_5";
  static readonly title = "G P T_ Image_1_5";
  static readonly description = `OpenAI's latest image generation model with better instruction following and adherence to prompts
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "A text description of the desired image" })
  declare prompt: any;

  @prop({ type: "enum", default: "auto", values: ["low", "medium", "high", "auto"], description: "The quality of the generated image" })
  declare quality: any;

  @prop({ type: "str", default: "", description: "An optional unique identifier representing your end-user. This helps OpenAI monitor and detect abuse." })
  declare user_id: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "transparent", "opaque"], description: "Set whether the background is transparent or opaque or choose automatically" })
  declare background: any;

  @prop({ type: "enum", default: "auto", values: ["auto", "low"], description: "Content moderation level" })
  declare moderation: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "3:2", "2:3"], description: "The aspect ratio of the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "any", default: "", description: "A list of images to use as input for the generation" })
  declare input_images: any;

  @prop({ type: "enum", default: "webp", values: ["png", "jpeg", "webp"], description: "Output format" })
  declare output_format: any;

  @prop({ type: "enum", default: "low", values: ["low", "high"], description: "Control how much effort the model will exert to match the style and features, especially facial features, of input images" })
  declare input_fidelity: any;

  @prop({ type: "str", default: "", description: "Your OpenAI API key (optional - uses proxy if not provided)" })
  declare openai_api_key: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate (1-10)" })
  declare number_of_images: any;

  @prop({ type: "int", default: 90, description: "Compression level (0-100%)" })
  declare output_compression: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const quality = String(inputs.quality ?? this.quality ?? "auto");
    const userId = String(inputs.user_id ?? this.user_id ?? "");
    const background = String(inputs.background ?? this.background ?? "auto");
    const moderation = String(inputs.moderation ?? this.moderation ?? "auto");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const inputImages = String(inputs.input_images ?? this.input_images ?? "");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const inputFidelity = String(inputs.input_fidelity ?? this.input_fidelity ?? "low");
    const openaiApiKey = String(inputs.openai_api_key ?? this.openai_api_key ?? "");
    const numberOfImages = Number(inputs.number_of_images ?? this.number_of_images ?? 1);
    const outputCompression = Number(inputs.output_compression ?? this.output_compression ?? 90);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "quality": quality,
      "user_id": userId,
      "background": background,
      "moderation": moderation,
      "aspect_ratio": aspectRatio,
      "input_images": inputImages,
      "output_format": outputFormat,
      "input_fidelity": inputFidelity,
      "openai_api_key": openaiApiKey,
      "number_of_images": numberOfImages,
      "output_compression": outputCompression,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "openai/gpt-image-1.5", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Hyper_Flux_8Step extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Hyper_Flux_8Step";
  static readonly title = "Hyper_ Flux_8 Step";
  static readonly description = `Hyper FLUX 8-step by ByteDance
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: 0, description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "int", default: 848, description: "Width of the generated image. Optional, only used when aspect_ratio=custom. Must be a multiple of 16 (if it's not, it will be rounded to nearest multiple of 16)" })
  declare width: any;

  @prop({ type: "int", default: 848, description: "Height of the generated image. Optional, only used when aspect_ratio=custom. Must be a multiple of 16 (if it's not, it will be rounded to nearest multiple of 16)" })
  declare height: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21", "custom"], description: "Aspect ratio for the generated image. The size will always be 1 megapixel, i.e. 1024x1024 if aspect ratio is 1:1. To use arbitrary width and height, set aspect ratio to 'custom'." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "float", default: 3.5, description: "Guidance scale for the diffusion process" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "int", default: 8, description: "Number of inference steps" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)" })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? 0);
    const width = Number(inputs.width ?? this.width ?? 848);
    const height = Number(inputs.height ?? this.height ?? 848);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 3.5);
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 8);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "num_outputs": numOutputs,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "guidance_scale": guidanceScale,
      "output_quality": outputQuality,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "bytedance/hyper-flux-8step", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_V2 extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Ideogram_V2";
  static readonly title = "Ideogram_ V2";
  static readonly description = `An excellent image model with state of the art inpainting, prompt comprehension and text rendering
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "An image file to use for inpainting. You must also use a mask." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "None", values: ["None", "512x1536", "576x1408", "576x1472", "576x1536", "640x1344", "640x1408", "640x1472", "640x1536", "704x1152", "704x1216", "704x1280", "704x1344", "704x1408", "704x1472", "736x1312", "768x1088", "768x1216", "768x1280", "768x1344", "832x960", "832x1024", "832x1088", "832x1152", "832x1216", "832x1248", "864x1152", "896x960", "896x1024", "896x1088", "896x1120", "896x1152", "960x832", "960x896", "960x1024", "960x1088", "1024x832", "1024x896", "1024x960", "1024x1024", "1088x768", "1088x832", "1088x896", "1088x960", "1120x896", "1152x704", "1152x832", "1152x864", "1152x896", "1216x704", "1216x768", "1216x832", "1248x832", "1280x704", "1280x768", "1280x800", "1312x736", "1344x640", "1344x704", "1344x768", "1408x576", "1408x640", "1408x704", "1472x576", "1472x640", "1472x704", "1536x512", "1536x576", "1536x640"], description: "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given." })
  declare resolution: any;

  @prop({ type: "enum", default: "None", values: ["None", "Auto", "General", "Realistic", "Design", "Render 3D", "Anime"], description: "The styles help define the specific aesthetic of the image you want to generate." })
  declare style_type: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "16:10", "10:16", "3:1", "1:3"], description: "Aspect ratio. Ignored if a resolution or inpainting image is given." })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Things you do not want to see in the generated image." })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "Auto", values: ["Auto", "On", "Off"], description: "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages." })
  declare magic_prompt_option: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const resolution = String(inputs.resolution ?? this.resolution ?? "None");
    const styleType = String(inputs.style_type ?? this.style_type ?? "None");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const magicPromptOption = String(inputs.magic_prompt_option ?? this.magic_prompt_option ?? "Auto");

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "resolution": resolution,
      "style_type": styleType,
      "aspect_ratio": aspectRatio,
      "negative_prompt": negativePrompt,
      "magic_prompt_option": magicPromptOption,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "ideogram-ai/ideogram-v2", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_V2A extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Ideogram_V2A";
  static readonly title = "Ideogram_ V2 A";
  static readonly description = `Like Ideogram v2, but faster and cheaper
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "None", values: ["None", "512x1536", "576x1408", "576x1472", "576x1536", "640x1344", "640x1408", "640x1472", "640x1536", "704x1152", "704x1216", "704x1280", "704x1344", "704x1408", "704x1472", "736x1312", "768x1088", "768x1216", "768x1280", "768x1344", "832x960", "832x1024", "832x1088", "832x1152", "832x1216", "832x1248", "864x1152", "896x960", "896x1024", "896x1088", "896x1120", "896x1152", "960x832", "960x896", "960x1024", "960x1088", "1024x832", "1024x896", "1024x960", "1024x1024", "1088x768", "1088x832", "1088x896", "1088x960", "1120x896", "1152x704", "1152x832", "1152x864", "1152x896", "1216x704", "1216x768", "1216x832", "1248x832", "1280x704", "1280x768", "1280x800", "1312x736", "1344x640", "1344x704", "1344x768", "1408x576", "1408x640", "1408x704", "1472x576", "1472x640", "1472x704", "1536x512", "1536x576", "1536x640"], description: "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given." })
  declare resolution: any;

  @prop({ type: "enum", default: "None", values: ["None", "Auto", "General", "Realistic", "Design", "Render 3D", "Anime"], description: "The styles help define the specific aesthetic of the image you want to generate." })
  declare style_type: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "16:10", "10:16", "3:1", "1:3"], description: "Aspect ratio. Ignored if a resolution or inpainting image is given." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "Auto", values: ["Auto", "On", "Off"], description: "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages." })
  declare magic_prompt_option: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const resolution = String(inputs.resolution ?? this.resolution ?? "None");
    const styleType = String(inputs.style_type ?? this.style_type ?? "None");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const magicPromptOption = String(inputs.magic_prompt_option ?? this.magic_prompt_option ?? "Auto");

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "resolution": resolution,
      "style_type": styleType,
      "aspect_ratio": aspectRatio,
      "magic_prompt_option": magicPromptOption,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "ideogram-ai/ideogram-v2a", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_V2_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Ideogram_V2_Turbo";
  static readonly title = "Ideogram_ V2_ Turbo";
  static readonly description = `A fast image model with state of the art inpainting, prompt comprehension and text rendering.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "An image file to use for inpainting. You must also use a mask." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "None", values: ["None", "512x1536", "576x1408", "576x1472", "576x1536", "640x1344", "640x1408", "640x1472", "640x1536", "704x1152", "704x1216", "704x1280", "704x1344", "704x1408", "704x1472", "736x1312", "768x1088", "768x1216", "768x1280", "768x1344", "832x960", "832x1024", "832x1088", "832x1152", "832x1216", "832x1248", "864x1152", "896x960", "896x1024", "896x1088", "896x1120", "896x1152", "960x832", "960x896", "960x1024", "960x1088", "1024x832", "1024x896", "1024x960", "1024x1024", "1088x768", "1088x832", "1088x896", "1088x960", "1120x896", "1152x704", "1152x832", "1152x864", "1152x896", "1216x704", "1216x768", "1216x832", "1248x832", "1280x704", "1280x768", "1280x800", "1312x736", "1344x640", "1344x704", "1344x768", "1408x576", "1408x640", "1408x704", "1472x576", "1472x640", "1472x704", "1536x512", "1536x576", "1536x640"], description: "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given." })
  declare resolution: any;

  @prop({ type: "enum", default: "None", values: ["None", "Auto", "General", "Realistic", "Design", "Render 3D", "Anime"], description: "The styles help define the specific aesthetic of the image you want to generate." })
  declare style_type: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "16:10", "10:16", "3:1", "1:3"], description: "Aspect ratio. Ignored if a resolution or inpainting image is given." })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Things you do not want to see in the generated image." })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "Auto", values: ["Auto", "On", "Off"], description: "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages." })
  declare magic_prompt_option: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const resolution = String(inputs.resolution ?? this.resolution ?? "None");
    const styleType = String(inputs.style_type ?? this.style_type ?? "None");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const magicPromptOption = String(inputs.magic_prompt_option ?? this.magic_prompt_option ?? "Auto");

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "resolution": resolution,
      "style_type": styleType,
      "aspect_ratio": aspectRatio,
      "negative_prompt": negativePrompt,
      "magic_prompt_option": magicPromptOption,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "ideogram-ai/ideogram-v2-turbo", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_V3_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Ideogram_V3_Turbo";
  static readonly title = "Ideogram_ V3_ Turbo";
  static readonly description = `Turbo is the fastest and cheapest Ideogram v3. v3 creates images with stunning realism, creative designs, and consistent styles
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "An image file to use for inpainting. You must also use a mask." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "None", values: ["None", "512x1536", "576x1408", "576x1472", "576x1536", "640x1344", "640x1408", "640x1472", "640x1536", "704x1152", "704x1216", "704x1280", "704x1344", "704x1408", "704x1472", "736x1312", "768x1088", "768x1216", "768x1280", "768x1344", "800x1280", "832x960", "832x1024", "832x1088", "832x1152", "832x1216", "832x1248", "864x1152", "896x960", "896x1024", "896x1088", "896x1120", "896x1152", "960x832", "960x896", "960x1024", "960x1088", "1024x832", "1024x896", "1024x960", "1024x1024", "1088x768", "1088x832", "1088x896", "1088x960", "1120x896", "1152x704", "1152x832", "1152x864", "1152x896", "1216x704", "1216x768", "1216x832", "1248x832", "1280x704", "1280x768", "1280x800", "1312x736", "1344x640", "1344x704", "1344x768", "1408x576", "1408x640", "1408x704", "1472x576", "1472x640", "1472x704", "1536x512", "1536x576", "1536x640"], description: "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given." })
  declare resolution: any;

  @prop({ type: "enum", default: "None", values: ["None", "Auto", "General", "Realistic", "Design"], description: "The styles help define the specific aesthetic of the image you want to generate." })
  declare style_type: any;

  @prop({ type: "enum", default: "1:1", values: ["1:3", "3:1", "1:2", "2:1", "9:16", "16:9", "10:16", "16:10", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "1:1"], description: "Aspect ratio. Ignored if a resolution or inpainting image is given." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "None", values: ["None", "80s Illustration", "90s Nostalgia", "Abstract Organic", "Analog Nostalgia", "Art Brut", "Art Deco", "Art Poster", "Aura", "Avant Garde", "Bauhaus", "Blueprint", "Blurry Motion", "Bright Art", "C4D Cartoon", "Children's Book", "Collage", "Coloring Book I", "Coloring Book II", "Cubism", "Dark Aura", "Doodle", "Double Exposure", "Dramatic Cinema", "Editorial", "Emotional Minimal", "Ethereal Party", "Expired Film", "Flat Art", "Flat Vector", "Forest Reverie", "Geo Minimalist", "Glass Prism", "Golden Hour", "Graffiti I", "Graffiti II", "Halftone Print", "High Contrast", "Hippie Era", "Iconic", "Japandi Fusion", "Jazzy", "Long Exposure", "Magazine Editorial", "Minimal Illustration", "Mixed Media", "Monochrome", "Nightlife", "Oil Painting", "Old Cartoons", "Paint Gesture", "Pop Art", "Retro Etching", "Riviera Pop", "Spotlight 80s", "Stylized Red", "Surreal Collage", "Travel Poster", "Vintage Geo", "Vintage Poster", "Watercolor", "Weird", "Woodblock Print"], description: "Apply a predefined artistic style to the generated image (V3 models only)." })
  declare style_preset: any;

  @prop({ type: "enum", default: "Auto", values: ["Auto", "On", "Off"], description: "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages." })
  declare magic_prompt_option: any;

  @prop({ type: "any", default: "", description: "A list of images to use as style references." })
  declare style_reference_images: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const resolution = String(inputs.resolution ?? this.resolution ?? "None");
    const styleType = String(inputs.style_type ?? this.style_type ?? "None");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const stylePreset = String(inputs.style_preset ?? this.style_preset ?? "None");
    const magicPromptOption = String(inputs.magic_prompt_option ?? this.magic_prompt_option ?? "Auto");
    const styleReferenceImages = String(inputs.style_reference_images ?? this.style_reference_images ?? "");

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "resolution": resolution,
      "style_type": styleType,
      "aspect_ratio": aspectRatio,
      "style_preset": stylePreset,
      "magic_prompt_option": magicPromptOption,
      "style_reference_images": styleReferenceImages,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "ideogram-ai/ideogram-v3-turbo", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Illusions extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Illusions";
  static readonly title = "Illusions";
  static readonly description = `Create illusions with img2img and masking support
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Optional img2img" })
  declare image: any;

  @prop({ type: "int", default: 768 })
  declare width: any;

  @prop({ type: "int", default: 768 })
  declare height: any;

  @prop({ type: "str", default: "a painting of a 19th century town" })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "Optional mask for inpainting" })
  declare mask_image: any;

  @prop({ type: "int", default: 1, description: "Number of outputs" })
  declare num_outputs: any;

  @prop({ type: "image", default: "", description: "Control image" })
  declare control_image: any;

  @prop({ type: "float", default: 1, description: "When controlnet conditioning ends" })
  declare controlnet_end: any;

  @prop({ type: "float", default: 7.5, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "ugly, disfigured, low quality, blurry, nsfw", description: "The negative prompt to guide image generation." })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "enum", default: "width/height", values: ["width/height", "input_image", "control_image"], description: "Decide how to resize images – use width/height, resize based on input image or control image" })
  declare sizing_strategy: any;

  @prop({ type: "float", default: 0, description: "When controlnet conditioning starts" })
  declare controlnet_start: any;

  @prop({ type: "int", default: 40, description: "Number of diffusion steps" })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 0.75, description: "How strong the controlnet conditioning is" })
  declare controlnet_conditioning_scale: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = Number(inputs.width ?? this.width ?? 768);
    const height = Number(inputs.height ?? this.height ?? 768);
    const prompt = String(inputs.prompt ?? this.prompt ?? "a painting of a 19th century town");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const controlnetEnd = Number(inputs.controlnet_end ?? this.controlnet_end ?? 1);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "ugly, disfigured, low quality, blurry, nsfw");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const sizingStrategy = String(inputs.sizing_strategy ?? this.sizing_strategy ?? "width/height");
    const controlnetStart = Number(inputs.controlnet_start ?? this.controlnet_start ?? 0);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 40);
    const controlnetConditioningScale = Number(inputs.controlnet_conditioning_scale ?? this.controlnet_conditioning_scale ?? 0.75);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "num_outputs": numOutputs,
      "controlnet_end": controlnetEnd,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
      "sizing_strategy": sizingStrategy,
      "controlnet_start": controlnetStart,
      "num_inference_steps": numInferenceSteps,
      "controlnet_conditioning_scale": controlnetConditioningScale,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }

    const maskImageRef = inputs.mask_image as Record<string, unknown> | undefined;
    if (isRefSet(maskImageRef)) {
      const maskImageUrl = assetToUrl(maskImageRef!);
      if (maskImageUrl) args["mask_image"] = maskImageUrl;
    }

    const controlImageRef = inputs.control_image as Record<string, unknown> | undefined;
    if (isRefSet(controlImageRef)) {
      const controlImageUrl = assetToUrl(controlImageRef!);
      if (controlImageUrl) args["control_image"] = controlImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fofr/illusions", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Imagen_3 extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Imagen_3";
  static readonly title = "Imagen_3";
  static readonly description = `Google's highest quality text-to-image model, capable of generating images with detail, rich lighting and beauty
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "9:16", "16:9", "3:4", "4:3"], description: "Aspect ratio of the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "jpg", values: ["jpg", "png"], description: "Format of the output image" })
  declare output_format: any;

  @prop({ type: "enum", default: "block_only_high", values: ["block_low_and_above", "block_medium_and_above", "block_only_high"], description: "block_low_and_above is strictest, block_medium_and_above blocks some prompts, block_only_high is most permissive but some prompts will still be blocked" })
  declare safety_filter_level: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "jpg");
    const safetyFilterLevel = String(inputs.safety_filter_level ?? this.safety_filter_level ?? "block_only_high");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "safety_filter_level": safetyFilterLevel,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "google/imagen-3", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Imagen_4_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Imagen_4_Fast";
  static readonly title = "Imagen_4_ Fast";
  static readonly description = `Use this fast version of Imagen 4 when speed and cost are more important than quality
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "9:16", "16:9", "3:4", "4:3"], description: "Aspect ratio of the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "jpg", values: ["jpg", "png"], description: "Format of the output image" })
  declare output_format: any;

  @prop({ type: "enum", default: "block_only_high", values: ["block_low_and_above", "block_medium_and_above", "block_only_high"], description: "block_low_and_above is strictest, block_medium_and_above blocks some prompts, block_only_high is most permissive but some prompts will still be blocked" })
  declare safety_filter_level: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "jpg");
    const safetyFilterLevel = String(inputs.safety_filter_level ?? this.safety_filter_level ?? "block_only_high");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "safety_filter_level": safetyFilterLevel,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "google/imagen-4-fast", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Kandinsky extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Kandinsky";
  static readonly title = "Kandinsky";
  static readonly description = `multilingual text2image latent diffusion model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "enum", default: 512, values: ["384", "512", "576", "640", "704", "768", "960", "1024", "1152", "1280", "1536", "1792", "2048"], description: "Width of output image. Lower the setting if hits memory limits." })
  declare width: any;

  @prop({ type: "enum", default: 512, values: ["384", "512", "576", "640", "704", "768", "960", "1024", "1152", "1280", "1536", "1792", "2048"], description: "Height of output image. Lower the setting if hits memory limits." })
  declare height: any;

  @prop({ type: "str", default: "A moss covered astronaut with a black background", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpeg", "png"], description: "Output image format" })
  declare output_format: any;

  @prop({ type: "str", default: "", description: "Specify things to not see in the output" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 75, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 25, description: "Number of denoising steps for priors" })
  declare num_inference_steps_prior: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = String(inputs.width ?? this.width ?? 512);
    const height = String(inputs.height ?? this.height ?? 512);
    const prompt = String(inputs.prompt ?? this.prompt ?? "A moss covered astronaut with a black background");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 75);
    const numInferenceStepsPrior = Number(inputs.num_inference_steps_prior ?? this.num_inference_steps_prior ?? 25);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "num_outputs": numOutputs,
      "output_format": outputFormat,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
      "num_inference_steps_prior": numInferenceStepsPrior,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "ai-forever/kandinsky-2.2", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Minimax_Image_01 extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Minimax_Image_01";
  static readonly title = "Minimax_ Image_01";
  static readonly description = `Minimax's first image model, with character reference support
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Text prompt for generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"], description: "Image aspect ratio" })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare number_of_images: any;

  @prop({ type: "bool", default: true, description: "Use prompt optimizer" })
  declare prompt_optimizer: any;

  @prop({ type: "str", default: "", description: "An optional character reference image (human face) to use as the subject in the generated image(s)." })
  declare subject_reference: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const numberOfImages = Number(inputs.number_of_images ?? this.number_of_images ?? 1);
    const promptOptimizer = Boolean(inputs.prompt_optimizer ?? this.prompt_optimizer ?? true);
    const subjectReference = String(inputs.subject_reference ?? this.subject_reference ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "number_of_images": numberOfImages,
      "prompt_optimizer": promptOptimizer,
      "subject_reference": subjectReference,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "minimax/image-01", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Photon_Flash extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Photon_Flash";
  static readonly title = "Photon_ Flash";
  static readonly description = `Accelerated variant of Photon prioritizing speed while maintaining quality
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "16:9", values: ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"], description: "Aspect ratio of the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Reference image to guide generation" })
  declare image_reference: any;

  @prop({ type: "str", default: "", description: "Style reference image to guide generation" })
  declare style_reference: any;

  @prop({ type: "str", default: "", description: "Character reference image to guide generation" })
  declare character_reference: any;

  @prop({ type: "image", default: "", description: "Deprecated: Use image_reference instead" })
  declare image_reference_url: any;

  @prop({ type: "image", default: "", description: "Deprecated: Use style_reference instead" })
  declare style_reference_url: any;

  @prop({ type: "float", default: 0.85, description: "Weight of the reference image. Larger values will make the reference image have a stronger influence on the generated image." })
  declare image_reference_weight: any;

  @prop({ type: "float", default: 0.85, description: "Weight of the style reference image" })
  declare style_reference_weight: any;

  @prop({ type: "image", default: "", description: "Deprecated: Use character_reference instead" })
  declare character_reference_url: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "16:9");
    const imageReference = String(inputs.image_reference ?? this.image_reference ?? "");
    const styleReference = String(inputs.style_reference ?? this.style_reference ?? "");
    const characterReference = String(inputs.character_reference ?? this.character_reference ?? "");
    const imageReferenceWeight = Number(inputs.image_reference_weight ?? this.image_reference_weight ?? 0.85);
    const styleReferenceWeight = Number(inputs.style_reference_weight ?? this.style_reference_weight ?? 0.85);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "image_reference": imageReference,
      "style_reference": styleReference,
      "character_reference": characterReference,
      "image_reference_weight": imageReferenceWeight,
      "style_reference_weight": styleReferenceWeight,
    };

    const imageReferenceUrlRef = inputs.image_reference_url as Record<string, unknown> | undefined;
    if (isRefSet(imageReferenceUrlRef)) {
      const imageReferenceUrlUrl = assetToUrl(imageReferenceUrlRef!);
      if (imageReferenceUrlUrl) args["image_reference_url"] = imageReferenceUrlUrl;
    }

    const styleReferenceUrlRef = inputs.style_reference_url as Record<string, unknown> | undefined;
    if (isRefSet(styleReferenceUrlRef)) {
      const styleReferenceUrlUrl = assetToUrl(styleReferenceUrlRef!);
      if (styleReferenceUrlUrl) args["style_reference_url"] = styleReferenceUrlUrl;
    }

    const characterReferenceUrlRef = inputs.character_reference_url as Record<string, unknown> | undefined;
    if (isRefSet(characterReferenceUrlRef)) {
      const characterReferenceUrlUrl = assetToUrl(characterReferenceUrlRef!);
      if (characterReferenceUrlUrl) args["character_reference_url"] = characterReferenceUrlUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "luma/photon-flash", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class PlaygroundV2 extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.PlaygroundV2";
  static readonly title = "Playground V2";
  static readonly description = `Playground v2.5 is the state-of-the-art open-source model in aesthetic quality
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for img2img or inpaint mode" })
  declare image: any;

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({ type: "str", default: "Astronaut in a jungle, cold color palette, muted colors, detailed, 8k", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "DPMSolver++", values: ["DDIM", "DPMSolverMultistep", "HeunDiscrete", "K_EULER_ANCESTRAL", "K_EULER", "PNDM", "DPM++2MKarras", "DPMSolver++"], description: "Scheduler. DPMSolver++ or DPM++2MKarras is recommended for most cases" })
  declare scheduler: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({ type: "float", default: 3, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "bool", default: true, description: "Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking." })
  declare apply_watermark: any;

  @prop({ type: "str", default: "ugly, deformed, noisy, blurry, distorted", description: "Negative Input prompt" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "int", default: 25, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety" })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const mask = String(inputs.mask ?? this.mask ?? "");
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = Number(inputs.width ?? this.width ?? 1024);
    const height = Number(inputs.height ?? this.height ?? 1024);
    const prompt = String(inputs.prompt ?? this.prompt ?? "Astronaut in a jungle, cold color palette, muted colors, detailed, 8k");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "DPMSolver++");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 3);
    const applyWatermark = Boolean(inputs.apply_watermark ?? this.apply_watermark ?? true);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "ugly, deformed, noisy, blurry, distorted");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 25);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "mask": mask,
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "scheduler": scheduler,
      "num_outputs": numOutputs,
      "guidance_scale": guidanceScale,
      "apply_watermark": applyWatermark,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "playgroundai/playground-v2.5-1024px-aesthetic", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Proteus_V_02 extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Proteus_V_02";
  static readonly title = "Proteus_ V_02";
  static readonly description = `Proteus v0.2 shows subtle yet significant improvements over Version 0.1. It demonstrates enhanced prompt understanding that surpasses MJ6, while also approaching its stylistic capabilities.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for img2img or inpaint mode" })
  declare image: any;

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({ type: "str", default: "black fluffy gorgeous dangerous cat animal creature, large orange eyes, big fluffy ears, piercing gaze, full moon, dark ambiance, best quality, extremely detailed", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "KarrasDPM", values: ["DDIM", "DPMSolverMultistep", "HeunDiscrete", "KarrasDPM", "K_EULER_ANCESTRAL", "K_EULER", "PNDM"], description: "scheduler" })
  declare scheduler: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({ type: "float", default: 7.5, description: "Scale for classifier-free guidance. Recommended 7-8" })
  declare guidance_scale: any;

  @prop({ type: "bool", default: true, description: "Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking." })
  declare apply_watermark: any;

  @prop({ type: "str", default: "worst quality, low quality", description: "Negative Input prompt" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "int", default: 20, description: "Number of denoising steps. 20 to 35 steps for more detail, 20 steps for faster results." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety" })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = Number(inputs.width ?? this.width ?? 1024);
    const height = Number(inputs.height ?? this.height ?? 1024);
    const prompt = String(inputs.prompt ?? this.prompt ?? "black fluffy gorgeous dangerous cat animal creature, large orange eyes, big fluffy ears, piercing gaze, full moon, dark ambiance, best quality, extremely detailed");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "KarrasDPM");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const applyWatermark = Boolean(inputs.apply_watermark ?? this.apply_watermark ?? true);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "worst quality, low quality");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 20);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "scheduler": scheduler,
      "num_outputs": numOutputs,
      "guidance_scale": guidanceScale,
      "apply_watermark": applyWatermark,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "datacte/proteus-v0.2", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Proteus_V_03 extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Proteus_V_03";
  static readonly title = "Proteus_ V_03";
  static readonly description = `ProteusV0.3: The Anime Update
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for img2img or inpaint mode" })
  declare image: any;

  @prop({ type: "int", default: 1024, description: "Width of output image. Recommended 1024 or 1280" })
  declare width: any;

  @prop({ type: "int", default: 1024, description: "Height of output image. Recommended 1024 or 1280" })
  declare height: any;

  @prop({ type: "str", default: "Anime full body portrait of a swordsman holding his weapon in front of him. He is facing the camera with a fierce look on his face. Anime key visual (best quality, HD, ~+~aesthetic~+~:1.2)", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "DPM++2MSDE", values: ["DDIM", "DPMSolverMultistep", "HeunDiscrete", "KarrasDPM", "K_EULER_ANCESTRAL", "K_EULER", "PNDM", "DPM++2MSDE"], description: "scheduler" })
  declare scheduler: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({ type: "float", default: 7.5, description: "Scale for classifier-free guidance. Recommended 7-8" })
  declare guidance_scale: any;

  @prop({ type: "bool", default: true, description: "Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking." })
  declare apply_watermark: any;

  @prop({ type: "str", default: "worst quality, low quality", description: "Negative Input prompt" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "int", default: 20, description: "Number of denoising steps. 20 to 60 steps for more detail, 20 steps for faster results." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety" })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = Number(inputs.width ?? this.width ?? 1024);
    const height = Number(inputs.height ?? this.height ?? 1024);
    const prompt = String(inputs.prompt ?? this.prompt ?? "Anime full body portrait of a swordsman holding his weapon in front of him. He is facing the camera with a fierce look on his face. Anime key visual (best quality, HD, ~+~aesthetic~+~:1.2)");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "DPM++2MSDE");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const applyWatermark = Boolean(inputs.apply_watermark ?? this.apply_watermark ?? true);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "worst quality, low quality");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 20);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "scheduler": scheduler,
      "num_outputs": numOutputs,
      "guidance_scale": guidanceScale,
      "apply_watermark": applyWatermark,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "datacte/proteus-v0.3", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class PulidBase extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.PulidBase";
  static readonly title = "Pulid Base";
  static readonly description = `Use a face to make images. Uses SDXL fine-tuned checkpoints.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Set a seed for reproducibility. Random by default." })
  declare seed: any;

  @prop({ type: "int", default: 1024, description: "Width of the output image (ignored if structure image given)" })
  declare width: any;

  @prop({ type: "int", default: 1024, description: "Height of the output image (ignored if structure image given)" })
  declare height: any;

  @prop({ type: "str", default: "A photo of a person", description: "You might need to include a gender in the prompt to get the desired result" })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "The face image to use for the generation" })
  declare face_image: any;

  @prop({ type: "enum", default: "high-fidelity", values: ["high-fidelity", "stylized"], description: "Style of the face" })
  declare face_style: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality." })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Things you do not want to see in your image" })
  declare negative_prompt: any;

  @prop({ type: "enum", default: "general - dreamshaperXL_alpha2Xl10", values: ["general - albedobaseXL_v21", "general - dreamshaperXL_alpha2Xl10", "animated - starlightXLAnimated_v3", "animated - pixlAnimeCartoonComic_v10", "realistic - rundiffusionXL_beta", "realistic - RealVisXL_V4.0", "realistic - sdxlUnstableDiffusers_nihilmania", "cinematic - CinematicRedmond"], description: "Model to use for the generation" })
  declare checkpoint_model: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare number_of_images: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = Number(inputs.width ?? this.width ?? 1024);
    const height = Number(inputs.height ?? this.height ?? 1024);
    const prompt = String(inputs.prompt ?? this.prompt ?? "A photo of a person");
    const faceStyle = String(inputs.face_style ?? this.face_style ?? "high-fidelity");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const checkpointModel = String(inputs.checkpoint_model ?? this.checkpoint_model ?? "general - dreamshaperXL_alpha2Xl10");
    const numberOfImages = Number(inputs.number_of_images ?? this.number_of_images ?? 1);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "face_style": faceStyle,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "negative_prompt": negativePrompt,
      "checkpoint_model": checkpointModel,
      "number_of_images": numberOfImages,
    };

    const faceImageRef = inputs.face_image as Record<string, unknown> | undefined;
    if (isRefSet(faceImageRef)) {
      const faceImageUrl = assetToUrl(faceImageRef!);
      if (faceImageUrl) args["face_image"] = faceImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fofr/pulid-base", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Qwen_Image extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Qwen_Image";
  static readonly title = "Qwen_ Image";
  static readonly description = `An image generation foundation model in the Qwen series that achieves significant advances in complex text rendering.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for img2img pipeline" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Run faster predictions with additional optimizations." })
  declare go_fast: any;

  @prop({ type: "float", default: 3, description: "Guidance for generated image. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5" })
  declare guidance: any;

  @prop({ type: "float", default: 0.9, description: "Strength for img2img pipeline" })
  declare strength: any;

  @prop({ type: "enum", default: "optimize_for_quality", values: ["optimize_for_quality", "optimize_for_speed"], description: "Image size for the generated image" })
  declare image_size: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the main LoRA should be applied." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "16:9", values: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"], description: "Aspect ratio for the generated image" })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Only works with text to image pipeline. Supports arbitrary .safetensors URLs, tar files, and zip files from the Internet (for example, 'https://huggingface.co/Viktor1717/scandinavian-interior-style1/resolve/main/my_first_flux_lora_v1.safetensors', 'https://example.com/lora_weights.tar.gz', or 'https://example.com/lora_weights.zip')" })
  declare lora_weights: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "bool", default: false, description: "Enhance the prompt with positive magic." })
  declare enhance_prompt: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "str", default: " ", description: "Negative prompt for generated image" })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights from Replicate training. Only works with text to image pipeline. Supports arbitrary .safetensors URLs, tar files, and zip files from the Internet." })
  declare replicate_weights: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? true);
    const guidance = Number(inputs.guidance ?? this.guidance ?? 3);
    const strength = Number(inputs.strength ?? this.strength ?? 0.9);
    const imageSize = String(inputs.image_size ?? this.image_size ?? "optimize_for_quality");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "16:9");
    const loraWeights = String(inputs.lora_weights ?? this.lora_weights ?? "");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const enhancePrompt = Boolean(inputs.enhance_prompt ?? this.enhance_prompt ?? false);
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? " ");
    const replicateWeights = String(inputs.replicate_weights ?? this.replicate_weights ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 30);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "go_fast": goFast,
      "guidance": guidance,
      "strength": strength,
      "image_size": imageSize,
      "lora_scale": loraScale,
      "aspect_ratio": aspectRatio,
      "lora_weights": loraWeights,
      "output_format": outputFormat,
      "enhance_prompt": enhancePrompt,
      "output_quality": outputQuality,
      "negative_prompt": negativePrompt,
      "replicate_weights": replicateWeights,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "qwen/qwen-image", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Qwen_Image_Edit extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Qwen_Image_Edit";
  static readonly title = "Qwen_ Image_ Edit";
  static readonly description = `Edit images using a prompt. This model extends Qwen-Image’s unique text rendering capabilities to image editing tasks, enabling precise text editing
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Image to use as reference. Must be jpeg, png, gif, or webp." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text instruction on how to edit the given image." })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Run faster predictions with additional optimizations." })
  declare go_fast: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs" })
  declare output_quality: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? true);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "go_fast": goFast,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "disable_safety_checker": disableSafetyChecker,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "qwen/qwen-image-edit", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_20B extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Recraft_20B";
  static readonly title = "Recraft_20 B";
  static readonly description = `Affordable and fast images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "1024x1024", values: ["1024x1024", "1365x1024", "1024x1365", "1536x1024", "1024x1536", "1820x1024", "1024x1820", "1024x2048", "2048x1024", "1434x1024", "1024x1434", "1024x1280", "1280x1024", "1024x1707", "1707x1024"], description: "Width and height of the generated image. Size is ignored if an aspect ratio is set." })
  declare size: any;

  @prop({ type: "enum", default: "realistic_image", values: ["realistic_image", "realistic_image/b_and_w", "realistic_image/enterprise", "realistic_image/hard_flash", "realistic_image/hdr", "realistic_image/motion_blur", "realistic_image/natural_light", "realistic_image/studio_portrait", "digital_illustration", "digital_illustration/2d_art_poster", "digital_illustration/2d_art_poster_2", "digital_illustration/3d", "digital_illustration/80s", "digital_illustration/engraving_color", "digital_illustration/glow", "digital_illustration/grain", "digital_illustration/hand_drawn", "digital_illustration/hand_drawn_outline", "digital_illustration/handmade_3d", "digital_illustration/infantile_sketch", "digital_illustration/kawaii", "digital_illustration/pixel_art", "digital_illustration/psychedelic", "digital_illustration/seamless", "digital_illustration/voxel", "digital_illustration/watercolor"], description: "Style of the generated image." })
  declare style: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "Not set", values: ["Not set", "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "1:2", "2:1", "7:5", "5:7", "4:5", "5:4", "3:5", "5:3"], description: "Aspect ratio of the generated image" })
  declare aspect_ratio: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const size = String(inputs.size ?? this.size ?? "1024x1024");
    const style = String(inputs.style ?? this.style ?? "realistic_image");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "Not set");

    const args: Record<string, unknown> = {
      "size": size,
      "style": style,
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "recraft-ai/recraft-20b", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_20B_SVG extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Recraft_20B_SVG";
  static readonly title = "Recraft_20 B_ S V G";
  static readonly description = `Affordable and fast vector images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "1024x1024", values: ["1024x1024", "1365x1024", "1024x1365", "1536x1024", "1024x1536", "1820x1024", "1024x1820", "1024x2048", "2048x1024", "1434x1024", "1024x1434", "1024x1280", "1280x1024", "1024x1707", "1707x1024"], description: "Width and height of the generated image. Size is ignored if an aspect ratio is set." })
  declare size: any;

  @prop({ type: "enum", default: "vector_illustration", values: ["vector_illustration", "vector_illustration/cartoon", "vector_illustration/doodle_line_art", "vector_illustration/engraving", "vector_illustration/flat_2", "vector_illustration/kawaii", "vector_illustration/line_art", "vector_illustration/line_circuit", "vector_illustration/linocut", "vector_illustration/seamless", "icon", "icon/broken_line", "icon/colored_outline", "icon/colored_shapes", "icon/colored_shapes_gradient", "icon/doodle_fill", "icon/doodle_offset_fill", "icon/offset_fill", "icon/outline", "icon/outline_gradient", "icon/uneven_fill"], description: "Style of the generated image." })
  declare style: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "Not set", values: ["Not set", "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "1:2", "2:1", "7:5", "5:7", "4:5", "5:4", "3:5", "5:3"], description: "Aspect ratio of the generated image" })
  declare aspect_ratio: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const size = String(inputs.size ?? this.size ?? "1024x1024");
    const style = String(inputs.style ?? this.style ?? "vector_illustration");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "Not set");

    const args: Record<string, unknown> = {
      "size": size,
      "style": style,
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "recraft-ai/recraft-20b-svg", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_V3 extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Recraft_V3";
  static readonly title = "Recraft_ V3";
  static readonly description = `Recraft V3 (code-named red_panda) is a text-to-image model with the ability to generate long texts, and images in a wide list of styles. As of today, it is SOTA in image generation, proven by the Text-to-Image Benchmark by Artificial Analysis
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "1024x1024", values: ["1024x1024", "1365x1024", "1024x1365", "1536x1024", "1024x1536", "1820x1024", "1024x1820", "1024x2048", "2048x1024", "1434x1024", "1024x1434", "1024x1280", "1280x1024", "1024x1707", "1707x1024"], description: "Width and height of the generated image. Size is ignored if an aspect ratio is set." })
  declare size: any;

  @prop({ type: "enum", default: "any", values: ["any", "realistic_image", "digital_illustration", "digital_illustration/pixel_art", "digital_illustration/hand_drawn", "digital_illustration/grain", "digital_illustration/infantile_sketch", "digital_illustration/2d_art_poster", "digital_illustration/handmade_3d", "digital_illustration/hand_drawn_outline", "digital_illustration/engraving_color", "digital_illustration/2d_art_poster_2", "realistic_image/b_and_w", "realistic_image/hard_flash", "realistic_image/hdr", "realistic_image/natural_light", "realistic_image/studio_portrait", "realistic_image/enterprise", "realistic_image/motion_blur"], description: "Style of the generated image." })
  declare style: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "Not set", values: ["Not set", "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "1:2", "2:1", "7:5", "5:7", "4:5", "5:4", "3:5", "5:3"], description: "Aspect ratio of the generated image" })
  declare aspect_ratio: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const size = String(inputs.size ?? this.size ?? "1024x1024");
    const style = String(inputs.style ?? this.style ?? "any");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "Not set");

    const args: Record<string, unknown> = {
      "size": size,
      "style": style,
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "recraft-ai/recraft-v3", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_V3_SVG extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Recraft_V3_SVG";
  static readonly title = "Recraft_ V3_ S V G";
  static readonly description = `Recraft V3 SVG (code-named red_panda) is a text-to-image model with the ability to generate high quality SVG images including logotypes, and icons. The model supports a wide list of styles.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "1024x1024", values: ["1024x1024", "1365x1024", "1024x1365", "1536x1024", "1024x1536", "1820x1024", "1024x1820", "1024x2048", "2048x1024", "1434x1024", "1024x1434", "1024x1280", "1280x1024", "1024x1707", "1707x1024"], description: "Width and height of the generated image. Size is ignored if an aspect ratio is set." })
  declare size: any;

  @prop({ type: "enum", default: "any", values: ["any", "engraving", "line_art", "line_circuit", "linocut"], description: "Style of the generated image." })
  declare style: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "Not set", values: ["Not set", "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "1:2", "2:1", "7:5", "5:7", "4:5", "5:4", "3:5", "5:3"], description: "Aspect ratio of the generated image" })
  declare aspect_ratio: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const size = String(inputs.size ?? this.size ?? "1024x1024");
    const style = String(inputs.style ?? this.style ?? "any");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "Not set");

    const args: Record<string, unknown> = {
      "size": size,
      "style": style,
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "recraft-ai/recraft-v3-svg", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class SDXL_Ad_Inpaint extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.SDXL_Ad_Inpaint";
  static readonly title = "S D X L_ Ad_ Inpaint";
  static readonly description = `Product advertising image generator using SDXL
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Empty or 0 for a random image" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Remove background from this image" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Describe the new setting for your product" })
  declare prompt: any;

  @prop({ type: "enum", default: "1024, 1024", values: ["512, 2048", "512, 1984", "512, 1920", "512, 1856", "576, 1792", "576, 1728", "576, 1664", "640, 1600", "640, 1536", "704, 1472", "704, 1408", "704, 1344", "768, 1344", "768, 1280", "832, 1216", "832, 1152", "896, 1152", "896, 1088", "960, 1088", "960, 1024", "1024, 1024", "1024, 960", "1088, 960", "1088, 896", "1152, 896", "1152, 832", "1216, 832", "1280, 768", "1344, 768", "1408, 704", "1472, 704", "1536, 640", "1600, 640", "1664, 576", "1728, 576", "1792, 576", "1856, 512", "1920, 512", "1984, 512", "2048, 512"], description: "Possible SDXL image sizes" })
  declare img_size: any;

  @prop({ type: "bool", default: true, description: "Applies the original product image to the final result" })
  declare apply_img: any;

  @prop({ type: "enum", default: "K_EULER", values: ["DDIM", "DPMSolverMultistep", "HeunDiscrete", "KarrasDPM", "K_EULER_ANCESTRAL", "K_EULER", "PNDM"], description: "scheduler" })
  declare scheduler: any;

  @prop({ type: "enum", default: "Original", values: ["Original", "80", "70", "60", "50", "40", "30", "20"], description: "What percentage of the image width to fill with product" })
  declare product_fill: any;

  @prop({ type: "float", default: 7.5, description: "Guidance Scale" })
  declare guidance_scale: any;

  @prop({ type: "float", default: 0.9, description: "controlnet conditioning scale for generalization" })
  declare condition_scale: any;

  @prop({ type: "str", default: "low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement", description: "Describe what you do not want in your setting" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 10, description: "Number of steps to refine" })
  declare num_refine_steps: any;

  @prop({ type: "int", default: 40, description: "Inference Steps" })
  declare num_inference_steps: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const imgSize = String(inputs.img_size ?? this.img_size ?? "1024, 1024");
    const applyImg = Boolean(inputs.apply_img ?? this.apply_img ?? true);
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "K_EULER");
    const productFill = String(inputs.product_fill ?? this.product_fill ?? "Original");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const conditionScale = Number(inputs.condition_scale ?? this.condition_scale ?? 0.9);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement");
    const numRefineSteps = Number(inputs.num_refine_steps ?? this.num_refine_steps ?? 10);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 40);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "img_size": imgSize,
      "apply_img": applyImg,
      "scheduler": scheduler,
      "product_fill": productFill,
      "guidance_scale": guidanceScale,
      "condition_scale": conditionScale,
      "negative_prompt": negativePrompt,
      "num_refine_steps": numRefineSteps,
      "num_inference_steps": numInferenceSteps,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "catacolabs/sdxl-ad-inpaint", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class SDXL_Controlnet extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.SDXL_Controlnet";
  static readonly title = "S D X L_ Controlnet";
  static readonly description = `SDXL ControlNet - Canny
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: 0, description: "Random seed. Set to 0 to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for img2img or inpaint mode" })
  declare image: any;

  @prop({ type: "str", default: "aerial view, a futuristic research complex in a bright foggy jungle, hard lighting", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "float", default: 0.5, description: "controlnet conditioning scale for generalization" })
  declare condition_scale: any;

  @prop({ type: "str", default: "low quality, bad quality, sketches", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? 0);
    const prompt = String(inputs.prompt ?? this.prompt ?? "aerial view, a futuristic research complex in a bright foggy jungle, hard lighting");
    const conditionScale = Number(inputs.condition_scale ?? this.condition_scale ?? 0.5);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "low quality, bad quality, sketches");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 50);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "condition_scale": conditionScale,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "lucataco/sdxl-controlnet", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class SDXL_Emoji extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.SDXL_Emoji";
  static readonly title = "S D X L_ Emoji";
  static readonly description = `An SDXL fine-tune based on Apple Emojis
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for img2img or inpaint mode" })
  declare image: any;

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({ type: "str", default: "An astronaut riding a rainbow unicorn", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "no_refiner", values: ["no_refiner", "expert_ensemble_refiner", "base_image_refiner"], description: "Which refine style to use" })
  declare refine: any;

  @prop({ type: "enum", default: "K_EULER", values: ["DDIM", "DPMSolverMultistep", "HeunDiscrete", "KarrasDPM", "K_EULER_ANCESTRAL", "K_EULER", "PNDM"], description: "scheduler" })
  declare scheduler: any;

  @prop({ type: "float", default: 0.6, description: "LoRA additive scale. Only applicable on trained models." })
  declare lora_scale: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({ type: "int", default: "", description: "For base_image_refiner, the number of steps to refine, defaults to num_inference_steps" })
  declare refine_steps: any;

  @prop({ type: "float", default: 7.5, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "bool", default: true, description: "Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking." })
  declare apply_watermark: any;

  @prop({ type: "float", default: 0.8, description: "For expert_ensemble_refiner, the fraction of noise to use" })
  declare high_noise_frac: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "str", default: "", description: "Replicate LoRA weights to use. Leave blank to use the default weights." })
  declare replicate_weights: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety" })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = Number(inputs.width ?? this.width ?? 1024);
    const height = Number(inputs.height ?? this.height ?? 1024);
    const prompt = String(inputs.prompt ?? this.prompt ?? "An astronaut riding a rainbow unicorn");
    const refine = String(inputs.refine ?? this.refine ?? "no_refiner");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "K_EULER");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 0.6);
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const refineSteps = Number(inputs.refine_steps ?? this.refine_steps ?? "");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const applyWatermark = Boolean(inputs.apply_watermark ?? this.apply_watermark ?? true);
    const highNoiseFrac = Number(inputs.high_noise_frac ?? this.high_noise_frac ?? 0.8);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const replicateWeights = String(inputs.replicate_weights ?? this.replicate_weights ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 50);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "refine": refine,
      "scheduler": scheduler,
      "lora_scale": loraScale,
      "num_outputs": numOutputs,
      "refine_steps": refineSteps,
      "guidance_scale": guidanceScale,
      "apply_watermark": applyWatermark,
      "high_noise_frac": highNoiseFrac,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
      "replicate_weights": replicateWeights,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fofr/sdxl-emoji", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class SDXL_Pixar extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.SDXL_Pixar";
  static readonly title = "S D X L_ Pixar";
  static readonly description = `Create Pixar poster easily with SDXL Pixar.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for img2img or inpaint mode" })
  declare image: any;

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({ type: "str", default: "An astronaut riding a rainbow unicorn", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "no_refiner", values: ["no_refiner", "expert_ensemble_refiner", "base_image_refiner"], description: "Which refine style to use" })
  declare refine: any;

  @prop({ type: "enum", default: "K_EULER", values: ["DDIM", "DPMSolverMultistep", "HeunDiscrete", "KarrasDPM", "K_EULER_ANCESTRAL", "K_EULER", "PNDM"], description: "scheduler" })
  declare scheduler: any;

  @prop({ type: "float", default: 0.6, description: "LoRA additive scale. Only applicable on trained models." })
  declare lora_scale: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({ type: "int", default: "", description: "For base_image_refiner, the number of steps to refine, defaults to num_inference_steps" })
  declare refine_steps: any;

  @prop({ type: "float", default: 7.5, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "bool", default: true, description: "Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking." })
  declare apply_watermark: any;

  @prop({ type: "float", default: 0.8, description: "For expert_ensemble_refiner, the fraction of noise to use" })
  declare high_noise_frac: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "str", default: "", description: "Replicate LoRA weights to use. Leave blank to use the default weights." })
  declare replicate_weights: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety" })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = Number(inputs.width ?? this.width ?? 1024);
    const height = Number(inputs.height ?? this.height ?? 1024);
    const prompt = String(inputs.prompt ?? this.prompt ?? "An astronaut riding a rainbow unicorn");
    const refine = String(inputs.refine ?? this.refine ?? "no_refiner");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "K_EULER");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 0.6);
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const refineSteps = Number(inputs.refine_steps ?? this.refine_steps ?? "");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const applyWatermark = Boolean(inputs.apply_watermark ?? this.apply_watermark ?? true);
    const highNoiseFrac = Number(inputs.high_noise_frac ?? this.high_noise_frac ?? 0.8);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const replicateWeights = String(inputs.replicate_weights ?? this.replicate_weights ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 50);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "refine": refine,
      "scheduler": scheduler,
      "lora_scale": loraScale,
      "num_outputs": numOutputs,
      "refine_steps": refineSteps,
      "guidance_scale": guidanceScale,
      "apply_watermark": applyWatermark,
      "high_noise_frac": highNoiseFrac,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
      "replicate_weights": replicateWeights,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "swartype/sdxl-pixar", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Seedream_4 extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.Seedream_4";
  static readonly title = "Seedream_4";
  static readonly description = `Unified text-to-image generation and precise single-sentence editing at up to 4K resolution
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "2K", values: ["1K", "2K", "4K", "custom"], description: "Image resolution: 1K (1024px), 2K (2048px), 4K (4096px), or 'custom' for specific dimensions." })
  declare size: any;

  @prop({ type: "int", default: 2048, description: "Custom image width (only used when size='custom'). Range: 1024-4096 pixels." })
  declare width: any;

  @prop({ type: "int", default: 2048, description: "Custom image height (only used when size='custom'). Range: 1024-4096 pixels." })
  declare height: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Maximum number of images to generate when sequential_image_generation='auto'. Range: 1-15. Total images (input + generated) cannot exceed 15." })
  declare max_images: any;

  @prop({ type: "any", default: [], description: "Input image(s) for image-to-image generation. List of 1-10 images for single or multi-reference generation." })
  declare image_input: any;

  @prop({ type: "enum", default: "match_input_image", values: ["match_input_image", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"], description: "Image aspect ratio. Only used when size is not 'custom'. Use 'match_input_image' to automatically match the input image's aspect ratio." })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: true, description: "Enable prompt enhancement for higher quality results, this will take longer to generate." })
  declare enhance_prompt: any;

  @prop({ type: "enum", default: "disabled", values: ["disabled", "auto"], description: "Group image generation mode. 'disabled' generates a single image. 'auto' lets the model decide whether to generate multiple related images (e.g., story scenes, character variations)." })
  declare sequential_image_generation: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const size = String(inputs.size ?? this.size ?? "2K");
    const width = Number(inputs.width ?? this.width ?? 2048);
    const height = Number(inputs.height ?? this.height ?? 2048);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const maxImages = Number(inputs.max_images ?? this.max_images ?? 1);
    const imageInput = String(inputs.image_input ?? this.image_input ?? []);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "match_input_image");
    const enhancePrompt = Boolean(inputs.enhance_prompt ?? this.enhance_prompt ?? true);
    const sequentialImageGeneration = String(inputs.sequential_image_generation ?? this.sequential_image_generation ?? "disabled");

    const args: Record<string, unknown> = {
      "size": size,
      "width": width,
      "height": height,
      "prompt": prompt,
      "max_images": maxImages,
      "image_input": imageInput,
      "aspect_ratio": aspectRatio,
      "enhance_prompt": enhancePrompt,
      "sequential_image_generation": sequentialImageGeneration,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "bytedance/seedream-4", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusion extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.StableDiffusion";
  static readonly title = "Stable Diffusion";
  static readonly description = `A latent text-to-image diffusion model capable of generating photo-realistic images given any text input
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "enum", default: 768, values: ["64", "128", "192", "256", "320", "384", "448", "512", "576", "640", "704", "768", "832", "896", "960", "1024"], description: "Width of generated image in pixels. Needs to be a multiple of 64" })
  declare width: any;

  @prop({ type: "enum", default: 768, values: ["64", "128", "192", "256", "320", "384", "448", "512", "576", "640", "704", "768", "832", "896", "960", "1024"], description: "Height of generated image in pixels. Needs to be a multiple of 64" })
  declare height: any;

  @prop({ type: "str", default: "a vision of paradise. unreal engine", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "DPMSolverMultistep", values: ["DDIM", "K_EULER", "DPMSolverMultistep", "K_EULER_ANCESTRAL", "PNDM", "KLMS"], description: "Choose a scheduler." })
  declare scheduler: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate." })
  declare num_outputs: any;

  @prop({ type: "float", default: 7.5, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Specify things to not see in the output" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = String(inputs.width ?? this.width ?? 768);
    const height = String(inputs.height ?? this.height ?? 768);
    const prompt = String(inputs.prompt ?? this.prompt ?? "a vision of paradise. unreal engine");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "DPMSolverMultistep");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 50);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "scheduler": scheduler,
      "num_outputs": numOutputs,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "stability-ai/stable-diffusion", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusion3_5_Large extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.StableDiffusion3_5_Large";
  static readonly title = "Stable Diffusion3_5_ Large";
  static readonly description = `A text-to-image model that generates high-resolution images with fine details. It supports various artistic styles and produces diverse outputs from the same prompt, thanks to Query-Key Normalization.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 5, description: "The guidance scale tells the model how similar the output should be to the prompt." })
  declare cfg: any;

  @prop({ type: "int", default: "", description: "Set a seed for reproducibility. Random by default." })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for image to image mode. The aspect ratio of your output will match this image." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["16:9", "1:1", "21:9", "2:3", "3:2", "4:5", "5:4", "9:16", "9:21"], description: "The aspect ratio of your output image. This value is ignored if you are using an input image." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "str", default: "", description: "What you do not want to see in the image" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.85, description: "Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image." })
  declare prompt_strength: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const cfg = Number(inputs.cfg ?? this.cfg ?? 5);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.85);

    const args: Record<string, unknown> = {
      "cfg": cfg,
      "seed": seed,
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "stability-ai/stable-diffusion-3.5-large", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusion3_5_Large_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.StableDiffusion3_5_Large_Turbo";
  static readonly title = "Stable Diffusion3_5_ Large_ Turbo";
  static readonly description = `A text-to-image model that generates high-resolution images with fine details. It supports various artistic styles and produces diverse outputs from the same prompt, with a focus on fewer inference steps
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 1, description: "The guidance scale tells the model how similar the output should be to the prompt." })
  declare cfg: any;

  @prop({ type: "int", default: "", description: "Set a seed for reproducibility. Random by default." })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for image to image mode. The aspect ratio of your output will match this image." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["16:9", "1:1", "21:9", "2:3", "3:2", "4:5", "5:4", "9:16", "9:21"], description: "The aspect ratio of your output image. This value is ignored if you are using an input image." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "str", default: "", description: "What you do not want to see in the image" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.85, description: "Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image." })
  declare prompt_strength: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const cfg = Number(inputs.cfg ?? this.cfg ?? 1);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.85);

    const args: Record<string, unknown> = {
      "cfg": cfg,
      "seed": seed,
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "stability-ai/stable-diffusion-3.5-large-turbo", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusion3_5_Medium extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.StableDiffusion3_5_Medium";
  static readonly title = "Stable Diffusion3_5_ Medium";
  static readonly description = `2.5 billion parameter image model with improved MMDiT-X architecture
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 5, description: "The guidance scale tells the model how similar the output should be to the prompt." })
  declare cfg: any;

  @prop({ type: "int", default: "", description: "Set a seed for reproducibility. Random by default." })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for image to image mode. The aspect ratio of your output will match this image." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "1:1", values: ["16:9", "1:1", "21:9", "2:3", "3:2", "4:5", "5:4", "9:16", "9:21"], description: "The aspect ratio of your output image. This value is ignored if you are using an input image." })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "str", default: "", description: "What you do not want to see in the image" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.85, description: "Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image." })
  declare prompt_strength: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const cfg = Number(inputs.cfg ?? this.cfg ?? 5);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "1:1");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.85);

    const args: Record<string, unknown> = {
      "cfg": cfg,
      "seed": seed,
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "output_format": outputFormat,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "stability-ai/stable-diffusion-3.5-medium", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusionInpainting extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.StableDiffusionInpainting";
  static readonly title = "Stable Diffusion Inpainting";
  static readonly description = `Fill in masked parts of images with Stable Diffusion
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Black and white image to use as mask for inpainting over the image provided. White pixels are inpainted and black pixels are preserved." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Initial image to generate variations of. Will be resized to height x width" })
  declare image: any;

  @prop({ type: "enum", default: 512, values: ["64", "128", "192", "256", "320", "384", "448", "512", "576", "640", "704", "768", "832", "896", "960", "1024"], description: "Width of generated image in pixels. Needs to be a multiple of 64" })
  declare width: any;

  @prop({ type: "enum", default: 512, values: ["64", "128", "192", "256", "320", "384", "448", "512", "576", "640", "704", "768", "832", "896", "960", "1024"], description: "Height of generated image in pixels. Needs to be a multiple of 64" })
  declare height: any;

  @prop({ type: "str", default: "a vision of paradise. unreal engine", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "DPMSolverMultistep", values: ["DDIM", "K_EULER", "DPMSolverMultistep", "K_EULER_ANCESTRAL", "PNDM", "KLMS"], description: "Choose a scheduler." })
  declare scheduler: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate." })
  declare num_outputs: any;

  @prop({ type: "float", default: 7.5, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Specify things to not see in the output" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)" })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = String(inputs.width ?? this.width ?? 512);
    const height = String(inputs.height ?? this.height ?? 512);
    const prompt = String(inputs.prompt ?? this.prompt ?? "a vision of paradise. unreal engine");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "DPMSolverMultistep");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 50);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "scheduler": scheduler,
      "num_outputs": numOutputs,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "stability-ai/stable-diffusion-inpainting", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusionXL extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.StableDiffusionXL";
  static readonly title = "Stable Diffusion X L";
  static readonly description = `A text-to-image generative AI model that creates beautiful images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted." })
  declare mask: any;

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image for img2img or inpaint mode" })
  declare image: any;

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({ type: "str", default: "An astronaut riding a rainbow unicorn", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "no_refiner", values: ["no_refiner", "expert_ensemble_refiner", "base_image_refiner"], description: "Which refine style to use" })
  declare refine: any;

  @prop({ type: "enum", default: "K_EULER", values: ["DDIM", "DPMSolverMultistep", "HeunDiscrete", "KarrasDPM", "K_EULER_ANCESTRAL", "K_EULER", "PNDM"], description: "scheduler" })
  declare scheduler: any;

  @prop({ type: "float", default: 0.6, description: "LoRA additive scale. Only applicable on trained models." })
  declare lora_scale: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({ type: "int", default: "", description: "For base_image_refiner, the number of steps to refine, defaults to num_inference_steps" })
  declare refine_steps: any;

  @prop({ type: "float", default: 7.5, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "bool", default: true, description: "Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking." })
  declare apply_watermark: any;

  @prop({ type: "float", default: 0.8, description: "For expert_ensemble_refiner, the fraction of noise to use" })
  declare high_noise_frac: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.8, description: "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image" })
  declare prompt_strength: any;

  @prop({ type: "str", default: "", description: "Replicate LoRA weights to use. Leave blank to use the default weights." })
  declare replicate_weights: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)" })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = Number(inputs.width ?? this.width ?? 1024);
    const height = Number(inputs.height ?? this.height ?? 1024);
    const prompt = String(inputs.prompt ?? this.prompt ?? "An astronaut riding a rainbow unicorn");
    const refine = String(inputs.refine ?? this.refine ?? "no_refiner");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "K_EULER");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 0.6);
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const refineSteps = Number(inputs.refine_steps ?? this.refine_steps ?? "");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const applyWatermark = Boolean(inputs.apply_watermark ?? this.apply_watermark ?? true);
    const highNoiseFrac = Number(inputs.high_noise_frac ?? this.high_noise_frac ?? 0.8);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 0.8);
    const replicateWeights = String(inputs.replicate_weights ?? this.replicate_weights ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 50);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "refine": refine,
      "scheduler": scheduler,
      "lora_scale": loraScale,
      "num_outputs": numOutputs,
      "refine_steps": refineSteps,
      "guidance_scale": guidanceScale,
      "apply_watermark": applyWatermark,
      "high_noise_frac": highNoiseFrac,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
      "replicate_weights": replicateWeights,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };

    const maskRef = inputs.mask as Record<string, unknown> | undefined;
    if (isRefSet(maskRef)) {
      const maskUrl = assetToUrl(maskRef!);
      if (maskUrl) args["mask"] = maskUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "stability-ai/sdxl", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusionXLLightning extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.StableDiffusionXLLightning";
  static readonly title = "Stable Diffusion X L Lightning";
  static readonly description = `SDXL-Lightning by ByteDance: a fast text-to-image model that makes high-quality images in 4 steps
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: 0, description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "int", default: 1024, description: "Width of output image. Recommended 1024 or 1280" })
  declare width: any;

  @prop({ type: "int", default: 1024, description: "Height of output image. Recommended 1024 or 1280" })
  declare height: any;

  @prop({ type: "str", default: "self-portrait of a woman, lightning in the background", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "K_EULER", values: ["DDIM", "DPMSolverMultistep", "HeunDiscrete", "KarrasDPM", "K_EULER_ANCESTRAL", "K_EULER", "PNDM", "DPM++2MSDE"], description: "scheduler" })
  declare scheduler: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({ type: "float", default: 0, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "worst quality, low quality", description: "Negative Input prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 4, description: "Number of denoising steps. 4 for best results" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images" })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? 0);
    const width = Number(inputs.width ?? this.width ?? 1024);
    const height = Number(inputs.height ?? this.height ?? 1024);
    const prompt = String(inputs.prompt ?? this.prompt ?? "self-portrait of a woman, lightning in the background");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "K_EULER");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 0);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "worst quality, low quality");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 4);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "scheduler": scheduler,
      "num_outputs": numOutputs,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "bytedance/sdxl-lightning-4step", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class StickerMaker extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.StickerMaker";
  static readonly title = "Sticker Maker";
  static readonly description = `Make stickers with AI. Generates graphics with transparent backgrounds.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Fix the random seed for reproducibility" })
  declare seed: any;

  @prop({ type: "int", default: 17 })
  declare steps: any;

  @prop({ type: "int", default: 1152 })
  declare width: any;

  @prop({ type: "int", default: 1152 })
  declare height: any;

  @prop({ type: "str", default: "a cute cat" })
  declare prompt: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 90, description: "Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality." })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Things you do not want in the image" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare number_of_images: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const steps = Number(inputs.steps ?? this.steps ?? 17);
    const width = Number(inputs.width ?? this.width ?? 1152);
    const height = Number(inputs.height ?? this.height ?? 1152);
    const prompt = String(inputs.prompt ?? this.prompt ?? "a cute cat");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 90);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const numberOfImages = Number(inputs.number_of_images ?? this.number_of_images ?? 1);

    const args: Record<string, unknown> = {
      "seed": seed,
      "steps": steps,
      "width": width,
      "height": height,
      "prompt": prompt,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "negative_prompt": negativePrompt,
      "number_of_images": numberOfImages,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fofr/sticker-maker", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class StyleTransfer extends ReplicateNode {
  static readonly nodeType = "replicate.image_generate.StyleTransfer";
  static readonly title = "Style Transfer";
  static readonly description = `Transfer the style of one image to another
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Set a seed for reproducibility. Random by default." })
  declare seed: any;

  @prop({ type: "enum", default: "fast", values: ["fast", "high-quality", "realistic", "cinematic", "animated"], description: "Model to use for the generation" })
  declare model: any;

  @prop({ type: "int", default: 1024, description: "Width of the output image (ignored if structure image given)" })
  declare width: any;

  @prop({ type: "int", default: 1024, description: "Height of the output image (ignored if structure image given)" })
  declare height: any;

  @prop({ type: "str", default: "An astronaut riding a unicorn", description: "Prompt for the image" })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "Copy the style from this image" })
  declare style_image: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality." })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Things you do not want to see in your image" })
  declare negative_prompt: any;

  @prop({ type: "image", default: "", description: "An optional image to copy structure from. Output images will use the same aspect ratio." })
  declare structure_image: any;

  @prop({ type: "int", default: 1, description: "Number of images to generate" })
  declare number_of_images: any;

  @prop({ type: "float", default: 1, description: "Strength of the depth controlnet" })
  declare structure_depth_strength: any;

  @prop({ type: "float", default: 0.65, description: "How much of the original image (and colors) to preserve (0 is all, 1 is none, 0.65 is a good balance)" })
  declare structure_denoising_strength: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const model = String(inputs.model ?? this.model ?? "fast");
    const width = Number(inputs.width ?? this.width ?? 1024);
    const height = Number(inputs.height ?? this.height ?? 1024);
    const prompt = String(inputs.prompt ?? this.prompt ?? "An astronaut riding a unicorn");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const numberOfImages = Number(inputs.number_of_images ?? this.number_of_images ?? 1);
    const structureDepthStrength = Number(inputs.structure_depth_strength ?? this.structure_depth_strength ?? 1);
    const structureDenoisingStrength = Number(inputs.structure_denoising_strength ?? this.structure_denoising_strength ?? 0.65);

    const args: Record<string, unknown> = {
      "seed": seed,
      "model": model,
      "width": width,
      "height": height,
      "prompt": prompt,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "negative_prompt": negativePrompt,
      "number_of_images": numberOfImages,
      "structure_depth_strength": structureDepthStrength,
      "structure_denoising_strength": structureDenoisingStrength,
    };

    const styleImageRef = inputs.style_image as Record<string, unknown> | undefined;
    if (isRefSet(styleImageRef)) {
      const styleImageUrl = assetToUrl(styleImageRef!);
      if (styleImageUrl) args["style_image"] = styleImageUrl;
    }

    const structureImageRef = inputs.structure_image as Record<string, unknown> | undefined;
    if (isRefSet(structureImageRef)) {
      const structureImageUrl = assetToUrl(structureImageRef!);
      if (structureImageUrl) args["structure_image"] = structureImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fofr/style-transfer", args);
    return { output: outputToImageRef(res.output) };
  }
}

export const REPLICATE_IMAGE_GENERATE_NODES: readonly NodeClass[] = [
  AdInpaint,
  ConsistentCharacter,
  Flux_1_1_Pro_Ultra,
  Flux_2_Flex,
  Flux_2_Max,
  Flux_2_Pro,
  Flux_360,
  Flux_Black_Light,
  Flux_Canny_Dev,
  Flux_Canny_Pro,
  Flux_Cinestill,
  Flux_Depth_Dev,
  Flux_Depth_Pro,
  Flux_Dev,
  Flux_Dev_Lora,
  Flux_Fill_Dev,
  Flux_Fill_Pro,
  Flux_Kontext_Pro,
  Flux_Mona_Lisa,
  Flux_Pro,
  Flux_Redux_Dev,
  Flux_Redux_Schnell,
  Flux_Schnell,
  Flux_Schnell_Lora,
  GPT_Image_1_5,
  Hyper_Flux_8Step,
  Ideogram_V2,
  Ideogram_V2A,
  Ideogram_V2_Turbo,
  Ideogram_V3_Turbo,
  Illusions,
  Imagen_3,
  Imagen_4_Fast,
  Kandinsky,
  Minimax_Image_01,
  Photon_Flash,
  PlaygroundV2,
  Proteus_V_02,
  Proteus_V_03,
  PulidBase,
  Qwen_Image,
  Qwen_Image_Edit,
  Recraft_20B,
  Recraft_20B_SVG,
  Recraft_V3,
  Recraft_V3_SVG,
  SDXL_Ad_Inpaint,
  SDXL_Controlnet,
  SDXL_Emoji,
  SDXL_Pixar,
  Seedream_4,
  StableDiffusion,
  StableDiffusion3_5_Large,
  StableDiffusion3_5_Large_Turbo,
  StableDiffusion3_5_Medium,
  StableDiffusionInpainting,
  StableDiffusionXL,
  StableDiffusionXLLightning,
  StickerMaker,
  StyleTransfer,
] as const;