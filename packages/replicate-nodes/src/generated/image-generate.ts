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

export class AdInpaint extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.AdInpaint";
  static readonly title = "Ad Inpaint";
  static readonly description = `Product advertising image generator
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "str",
    default: "",
    description: "OpenAI api_key, enhance prompt with ChatGPT if provided"
  })
  declare api_key: any;

  @prop({ type: "float", default: 7.5, description: "Guidance Scale" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 1, description: "Number of image to generate" })
  declare image_num: any;

  @prop({ type: "image", default: "", description: "input image" })
  declare image_path: any;

  @prop({ type: "int", default: -1, description: "Manual Seed" })
  declare manual_seed: any;

  @prop({
    type: "str",
    default:
      "low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement",
    description: "Anything you don't want in the photo"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 20, description: "Inference Steps" })
  declare num_inference_steps: any;

  @prop({
    type: "enum",
    default: "512 * 512",
    values: ["512 * 512", "768 * 768", "1024 * 1024"],
    description: "image total pixel"
  })
  declare pixel: any;

  @prop({
    type: "enum",
    default: "Original",
    values: [
      "Original",
      "0.6 * width",
      "0.5 * width",
      "0.4 * width",
      "0.3 * width",
      "0.2 * width"
    ],
    description: "Max product size"
  })
  declare product_size: any;

  @prop({ type: "str", default: "", description: "Product name or prompt" })
  declare prompt: any;

  @prop({
    type: "int",
    default: 3,
    description: "Factor to scale image by (maximum: 4)"
  })
  declare scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const field_apiKey = String(this.api_key ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const imageNum = Number(this.image_num ?? 1);
    const manualSeed = Number(this.manual_seed ?? -1);
    const negativePrompt = String(
      this.negative_prompt ??
        "low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 20);
    const pixel = String(this.pixel ?? "512 * 512");
    const productSize = String(this.product_size ?? "Original");
    const prompt = String(this.prompt ?? "");
    const scale = Number(this.scale ?? 3);

    const args: Record<string, unknown> = {
      api_key: field_apiKey,
      guidance_scale: guidanceScale,
      image_num: imageNum,
      manual_seed: manualSeed,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      pixel: pixel,
      product_size: productSize,
      prompt: prompt,
      scale: scale
    };

    const imagePathRef = this.image_path as Record<string, unknown> | undefined;
    if (isRefSet(imagePathRef)) {
      const imagePathUrl = await assetToUrl(imagePathRef!, apiKey);
      if (imagePathUrl) args["image_path"] = imagePathUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "logerzhu/ad-inpaint:b1c17d148455c1fda435ababe9ab1e03bc0d917cc3cf4251916f22c45c83c7df",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class ConsistentCharacter extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.ConsistentCharacter";
  static readonly title = "Consistent Character";
  static readonly description = `Create images of a given character in different poses
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want to see in your image"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 1,
    description: "The number of images to generate for each pose."
  })
  declare number_of_images_per_pose: any;

  @prop({
    type: "int",
    default: 3,
    description: "The number of images to generate."
  })
  declare number_of_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality."
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "A headshot photo",
    description:
      "Describe the subject. Include clothes and hairstyle for more consistency."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Randomise the poses used."
  })
  declare randomise_poses: any;

  @prop({
    type: "int",
    default: -1,
    description: "Set a seed for reproducibility. Random by default."
  })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An image of a person. Best images are square close ups of a face, but they do not have to be."
  })
  declare subject: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numberOfImagesPerPose = Number(this.number_of_images_per_pose ?? 1);
    const numberOfOutputs = Number(this.number_of_outputs ?? 3);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "A headshot photo");
    const randomisePoses = Boolean(this.randomise_poses ?? true);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      disable_safety_checker: disableSafetyChecker,
      negative_prompt: negativePrompt,
      number_of_images_per_pose: numberOfImagesPerPose,
      number_of_outputs: numberOfOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      randomise_poses: randomisePoses,
      seed: seed
    };

    const subjectRef = this.subject as Record<string, unknown> | undefined;
    if (isRefSet(subjectRef)) {
      const subjectUrl = await assetToUrl(subjectRef!, apiKey);
      if (subjectUrl) args["subject"] = subjectUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "sdxl-based/consistent-character:9c77a3c2f884193fcee4d89645f02a0b9def9434f9e03cb98460456b831c8772",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class PulidBase extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.PulidBase";
  static readonly title = "Pulid Base";
  static readonly description = `Use a face to make images. Uses SDXL fine-tuned checkpoints.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "general - dreamshaperXL_alpha2Xl10",
    values: [
      "general - albedobaseXL_v21",
      "general - dreamshaperXL_alpha2Xl10",
      "animated - starlightXLAnimated_v3",
      "animated - pixlAnimeCartoonComic_v10",
      "realistic - rundiffusionXL_beta",
      "realistic - RealVisXL_V4.0",
      "realistic - sdxlUnstableDiffusers_nihilmania",
      "cinematic - CinematicRedmond"
    ],
    description: "Model to use for the generation"
  })
  declare checkpoint_model: any;

  @prop({
    type: "image",
    default: "",
    description: "The face image to use for the generation"
  })
  declare face_image: any;

  @prop({
    type: "enum",
    default: "high-fidelity",
    values: ["high-fidelity", "stylized"],
    description: "Style of the face"
  })
  declare face_style: any;

  @prop({
    type: "int",
    default: 1024,
    description: "Height of the output image (ignored if structure image given)"
  })
  declare height: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want to see in your image"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of images to generate"
  })
  declare number_of_images: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality."
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "A photo of a person",
    description:
      "You might need to include a gender in the prompt to get the desired result"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Set a seed for reproducibility. Random by default."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 1024,
    description: "Width of the output image (ignored if structure image given)"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const checkpointModel = String(
      this.checkpoint_model ?? "general - dreamshaperXL_alpha2Xl10"
    );
    const faceStyle = String(this.face_style ?? "high-fidelity");
    const height = Number(this.height ?? 1024);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numberOfImages = Number(this.number_of_images ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "A photo of a person");
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      checkpoint_model: checkpointModel,
      face_style: faceStyle,
      height: height,
      negative_prompt: negativePrompt,
      number_of_images: numberOfImages,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed,
      width: width
    };

    const faceImageRef = this.face_image as Record<string, unknown> | undefined;
    if (isRefSet(faceImageRef)) {
      const faceImageUrl = await assetToUrl(faceImageRef!, apiKey);
      if (faceImageUrl) args["face_image"] = faceImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fofr/pulid-base:65ea75658bf120abbbdacab07e89e78a74a6a1b1f504349f4c4e3b01a655ee7a",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusion extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.StableDiffusion";
  static readonly title = "Stable Diffusion";
  static readonly description = `A latent text-to-image diffusion model capable of generating photo-realistic images given any text input
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 7.5,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: 768,
    values: [
      "64",
      "128",
      "192",
      "256",
      "320",
      "384",
      "448",
      "512",
      "576",
      "640",
      "704",
      "768",
      "832",
      "896",
      "960",
      "1024"
    ],
    description:
      "Height of generated image in pixels. Needs to be a multiple of 64"
  })
  declare height: any;

  @prop({
    type: "str",
    default: "",
    description: "Specify things to not see in the output"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of images to generate."
  })
  declare num_outputs: any;

  @prop({
    type: "str",
    default: "a vision of paradise. unreal engine",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "DPMSolverMultistep",
    values: [
      "DDIM",
      "K_EULER",
      "DPMSolverMultistep",
      "K_EULER_ANCESTRAL",
      "PNDM",
      "KLMS"
    ],
    description: "Choose a scheduler."
  })
  declare scheduler: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: 768,
    values: [
      "64",
      "128",
      "192",
      "256",
      "320",
      "384",
      "448",
      "512",
      "576",
      "640",
      "704",
      "768",
      "832",
      "896",
      "960",
      "1024"
    ],
    description:
      "Width of generated image in pixels. Needs to be a multiple of 64"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const height = String(this.height ?? 768);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(this.prompt ?? "a vision of paradise. unreal engine");
    const scheduler = String(this.scheduler ?? "DPMSolverMultistep");
    const seed = Number(this.seed ?? -1);
    const width = String(this.width ?? 768);

    const args: Record<string, unknown> = {
      guidance_scale: guidanceScale,
      height: height,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      scheduler: scheduler,
      seed: seed,
      width: width
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "stability-ai/stable-diffusion:ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusion3_5_Medium extends ReplicateNode {
  static readonly nodeType =
    "replicate.image.generate.StableDiffusion3_5_Medium";
  static readonly title = "Stable Diffusion3_5_ Medium";
  static readonly description = `2.5 billion parameter image model with improved MMDiT-X architecture
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: ["16:9", "1:1", "21:9", "2:3", "3:2", "4:5", "5:4", "9:16", "9:21"],
    description:
      "The aspect ratio of your output image. This value is ignored if you are using an input image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "The guidance scale tells the model how similar the output should be to the prompt."
  })
  declare cfg: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for image to image mode. The aspect ratio of your output will match this image."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "What you do not want to see in the image"
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.85,
    description:
      "Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image."
  })
  declare prompt_strength: any;

  @prop({
    type: "int",
    default: -1,
    description: "Set a seed for reproducibility. Random by default."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const cfg = Number(this.cfg ?? 5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const outputFormat = String(this.output_format ?? "webp");
    const prompt = String(this.prompt ?? "");
    const promptStrength = Number(this.prompt_strength ?? 0.85);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      cfg: cfg,
      negative_prompt: negativePrompt,
      output_format: outputFormat,
      prompt: prompt,
      prompt_strength: promptStrength,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "stability-ai/stable-diffusion-3.5-medium:1323a3a68cbf2b58c708f38fba9557e39d68a77cb287a8d7372ba0443f6f0767",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusion3_5_Large extends ReplicateNode {
  static readonly nodeType =
    "replicate.image.generate.StableDiffusion3_5_Large";
  static readonly title = "Stable Diffusion3_5_ Large";
  static readonly description = `A text-to-image model that generates high-resolution images with fine details. It supports various artistic styles and produces diverse outputs from the same prompt, thanks to Query-Key Normalization.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: ["16:9", "1:1", "21:9", "2:3", "3:2", "4:5", "5:4", "9:16", "9:21"],
    description:
      "The aspect ratio of your output image. This value is ignored if you are using an input image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 5,
    description:
      "The guidance scale tells the model how similar the output should be to the prompt."
  })
  declare cfg: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for image to image mode. The aspect ratio of your output will match this image."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "What you do not want to see in the image"
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.85,
    description:
      "Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image."
  })
  declare prompt_strength: any;

  @prop({
    type: "int",
    default: -1,
    description: "Set a seed for reproducibility. Random by default."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const cfg = Number(this.cfg ?? 5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const outputFormat = String(this.output_format ?? "webp");
    const prompt = String(this.prompt ?? "");
    const promptStrength = Number(this.prompt_strength ?? 0.85);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      cfg: cfg,
      negative_prompt: negativePrompt,
      output_format: outputFormat,
      prompt: prompt,
      prompt_strength: promptStrength,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "stability-ai/stable-diffusion-3.5-large:2fdf9488b53c1e0fd3aef7b477def1c00d1856a38466733711f9c769942598f5",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusion3_5_Large_Turbo extends ReplicateNode {
  static readonly nodeType =
    "replicate.image.generate.StableDiffusion3_5_Large_Turbo";
  static readonly title = "Stable Diffusion3_5_ Large_ Turbo";
  static readonly description = `A text-to-image model that generates high-resolution images with fine details. It supports various artistic styles and produces diverse outputs from the same prompt, with a focus on fewer inference steps
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: ["16:9", "1:1", "21:9", "2:3", "3:2", "4:5", "5:4", "9:16", "9:21"],
    description:
      "The aspect ratio of your output image. This value is ignored if you are using an input image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The guidance scale tells the model how similar the output should be to the prompt."
  })
  declare cfg: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for image to image mode. The aspect ratio of your output will match this image."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "What you do not want to see in the image"
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.85,
    description:
      "Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image."
  })
  declare prompt_strength: any;

  @prop({
    type: "int",
    default: -1,
    description: "Set a seed for reproducibility. Random by default."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const cfg = Number(this.cfg ?? 1);
    const negativePrompt = String(this.negative_prompt ?? "");
    const outputFormat = String(this.output_format ?? "webp");
    const prompt = String(this.prompt ?? "");
    const promptStrength = Number(this.prompt_strength ?? 0.85);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      cfg: cfg,
      negative_prompt: negativePrompt,
      output_format: outputFormat,
      prompt: prompt,
      prompt_strength: promptStrength,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "stability-ai/stable-diffusion-3.5-large-turbo:6ce89263555dde3393564e799f1310ee247c5339c3c665250b5dd5d26b7bcc3d",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Photon_Flash extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Photon_Flash";
  static readonly title = "Photon_ Flash";
  static readonly description = `Accelerated variant of Photon prioritizing speed while maintaining quality
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description: "Character reference image to guide generation"
  })
  declare character_reference: any;

  @prop({
    type: "image",
    default: "",
    description: "Deprecated: Use character_reference instead"
  })
  declare character_reference_url: any;

  @prop({
    type: "image",
    default: "",
    description: "Reference image to guide generation"
  })
  declare image_reference: any;

  @prop({
    type: "image",
    default: "",
    description: "Deprecated: Use image_reference instead"
  })
  declare image_reference_url: any;

  @prop({
    type: "float",
    default: 0.85,
    description:
      "Weight of the reference image. Larger values will make the reference image have a stronger influence on the generated image."
  })
  declare image_reference_weight: any;

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
    type: "image",
    default: "",
    description: "Style reference image to guide generation"
  })
  declare style_reference: any;

  @prop({
    type: "image",
    default: "",
    description: "Deprecated: Use style_reference instead"
  })
  declare style_reference_url: any;

  @prop({
    type: "float",
    default: 0.85,
    description: "Weight of the style reference image"
  })
  declare style_reference_weight: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const imageReferenceWeight = Number(this.image_reference_weight ?? 0.85);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const styleReferenceWeight = Number(this.style_reference_weight ?? 0.85);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      image_reference_weight: imageReferenceWeight,
      prompt: prompt,
      seed: seed,
      style_reference_weight: styleReferenceWeight
    };

    const characterReferenceRef = this.character_reference as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(characterReferenceRef)) {
      const characterReferenceUrl = await assetToUrl(
        characterReferenceRef!,
        apiKey
      );
      if (characterReferenceUrl)
        args["character_reference"] = characterReferenceUrl;
    }

    const characterReferenceUrlRef = this.character_reference_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(characterReferenceUrlRef)) {
      const characterReferenceUrlUrl = await assetToUrl(
        characterReferenceUrlRef!,
        apiKey
      );
      if (characterReferenceUrlUrl)
        args["character_reference_url"] = characterReferenceUrlUrl;
    }

    const imageReferenceRef = this.image_reference as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageReferenceRef)) {
      const imageReferenceUrl = await assetToUrl(imageReferenceRef!, apiKey);
      if (imageReferenceUrl) args["image_reference"] = imageReferenceUrl;
    }

    const imageReferenceUrlRef = this.image_reference_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageReferenceUrlRef)) {
      const imageReferenceUrlUrl = await assetToUrl(
        imageReferenceUrlRef!,
        apiKey
      );
      if (imageReferenceUrlUrl)
        args["image_reference_url"] = imageReferenceUrlUrl;
    }

    const styleReferenceRef = this.style_reference as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(styleReferenceRef)) {
      const styleReferenceUrl = await assetToUrl(styleReferenceRef!, apiKey);
      if (styleReferenceUrl) args["style_reference"] = styleReferenceUrl;
    }

    const styleReferenceUrlRef = this.style_reference_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(styleReferenceUrlRef)) {
      const styleReferenceUrlUrl = await assetToUrl(
        styleReferenceUrlRef!,
        apiKey
      );
      if (styleReferenceUrlUrl)
        args["style_reference_url"] = styleReferenceUrlUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "luma/photon-flash:8cee7d47f81d8f4f77c1aec44ffb3d1ce09d36388db637ceaa8a6cbcf30b63e1",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusionXL extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.StableDiffusionXL";
  static readonly title = "Stable Diffusion X L";
  static readonly description = `A text-to-image generative AI model that creates beautiful images
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
    type: "bool",
    default: false,
    description:
      "Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 7.5,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({
    type: "float",
    default: 0.8,
    description: "For expert_ensemble_refiner, the fraction of noise to use"
  })
  declare high_noise_frac: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for img2img or inpaint mode"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0.6,
    description: "LoRA additive scale. Only applicable on trained models."
  })
  declare lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted."
  })
  declare mask: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({
    type: "str",
    default: "An astronaut riding a rainbow unicorn",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "enum",
    default: "no_refiner",
    values: ["no_refiner", "expert_ensemble_refiner", "base_image_refiner"],
    description: "Which refine style to use"
  })
  declare refine: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "For base_image_refiner, the number of steps to refine, defaults to num_inference_steps"
  })
  declare refine_steps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Replicate LoRA weights to use. Leave blank to use the default weights."
  })
  declare replicate_weights: any;

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

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const applyWatermark = Boolean(this.apply_watermark ?? true);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const height = Number(this.height ?? 1024);
    const highNoiseFrac = Number(this.high_noise_frac ?? 0.8);
    const loraScale = Number(this.lora_scale ?? 0.6);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(
      this.prompt ?? "An astronaut riding a rainbow unicorn"
    );
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const refine = String(this.refine ?? "no_refiner");
    const refineSteps = Number(this.refine_steps ?? 0);
    const replicateWeights = String(this.replicate_weights ?? "");
    const scheduler = String(this.scheduler ?? "K_EULER");
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      apply_watermark: applyWatermark,
      disable_safety_checker: disableSafetyChecker,
      guidance_scale: guidanceScale,
      height: height,
      high_noise_frac: highNoiseFrac,
      lora_scale: loraScale,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      prompt_strength: promptStrength,
      refine: refine,
      refine_steps: refineSteps,
      replicate_weights: replicateWeights,
      scheduler: scheduler,
      seed: seed,
      width: width
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
      "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class SDXL_Pixar extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.SDXL_Pixar";
  static readonly title = "S D X L_ Pixar";
  static readonly description = `Create Pixar poster easily with SDXL Pixar.
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
    type: "bool",
    default: false,
    description:
      "Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 7.5,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({
    type: "float",
    default: 0.8,
    description: "For expert_ensemble_refiner, the fraction of noise to use"
  })
  declare high_noise_frac: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for img2img or inpaint mode"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0.6,
    description: "LoRA additive scale. Only applicable on trained models."
  })
  declare lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted."
  })
  declare mask: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({
    type: "str",
    default: "An astronaut riding a rainbow unicorn",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "enum",
    default: "no_refiner",
    values: ["no_refiner", "expert_ensemble_refiner", "base_image_refiner"],
    description: "Which refine style to use"
  })
  declare refine: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "For base_image_refiner, the number of steps to refine, defaults to num_inference_steps"
  })
  declare refine_steps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Replicate LoRA weights to use. Leave blank to use the default weights."
  })
  declare replicate_weights: any;

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

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const applyWatermark = Boolean(this.apply_watermark ?? true);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const height = Number(this.height ?? 1024);
    const highNoiseFrac = Number(this.high_noise_frac ?? 0.8);
    const loraScale = Number(this.lora_scale ?? 0.6);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(
      this.prompt ?? "An astronaut riding a rainbow unicorn"
    );
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const refine = String(this.refine ?? "no_refiner");
    const refineSteps = Number(this.refine_steps ?? 0);
    const replicateWeights = String(this.replicate_weights ?? "");
    const scheduler = String(this.scheduler ?? "K_EULER");
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      apply_watermark: applyWatermark,
      disable_safety_checker: disableSafetyChecker,
      guidance_scale: guidanceScale,
      height: height,
      high_noise_frac: highNoiseFrac,
      lora_scale: loraScale,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      prompt_strength: promptStrength,
      refine: refine,
      refine_steps: refineSteps,
      replicate_weights: replicateWeights,
      scheduler: scheduler,
      seed: seed,
      width: width
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
      "swartype/sdxl-pixar:81f8bbd3463056c8521eb528feb10509cc1385e2fabef590747f159848589048",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class SDXL_Emoji extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.SDXL_Emoji";
  static readonly title = "S D X L_ Emoji";
  static readonly description = `An SDXL fine-tune based on Apple Emojis
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
    type: "bool",
    default: false,
    description:
      "Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 7.5,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({
    type: "float",
    default: 0.8,
    description: "For expert_ensemble_refiner, the fraction of noise to use"
  })
  declare high_noise_frac: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for img2img or inpaint mode"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0.6,
    description: "LoRA additive scale. Only applicable on trained models."
  })
  declare lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted."
  })
  declare mask: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({
    type: "str",
    default: "An astronaut riding a rainbow unicorn",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "enum",
    default: "no_refiner",
    values: ["no_refiner", "expert_ensemble_refiner", "base_image_refiner"],
    description: "Which refine style to use"
  })
  declare refine: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "For base_image_refiner, the number of steps to refine, defaults to num_inference_steps"
  })
  declare refine_steps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Replicate LoRA weights to use. Leave blank to use the default weights."
  })
  declare replicate_weights: any;

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

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const applyWatermark = Boolean(this.apply_watermark ?? true);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const height = Number(this.height ?? 1024);
    const highNoiseFrac = Number(this.high_noise_frac ?? 0.8);
    const loraScale = Number(this.lora_scale ?? 0.6);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(
      this.prompt ?? "An astronaut riding a rainbow unicorn"
    );
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const refine = String(this.refine ?? "no_refiner");
    const refineSteps = Number(this.refine_steps ?? 0);
    const replicateWeights = String(this.replicate_weights ?? "");
    const scheduler = String(this.scheduler ?? "K_EULER");
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      apply_watermark: applyWatermark,
      disable_safety_checker: disableSafetyChecker,
      guidance_scale: guidanceScale,
      height: height,
      high_noise_frac: highNoiseFrac,
      lora_scale: loraScale,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      prompt_strength: promptStrength,
      refine: refine,
      refine_steps: refineSteps,
      replicate_weights: replicateWeights,
      scheduler: scheduler,
      seed: seed,
      width: width
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
      "fofr/sdxl-emoji:dee76b5afde21b0f01ed7925f0665b7e879c50ee718c5f78a9d38e04d523cc5e",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusionInpainting extends ReplicateNode {
  static readonly nodeType =
    "replicate.image.generate.StableDiffusionInpainting";
  static readonly title = "Stable Diffusion Inpainting";
  static readonly description = `Fill in masked parts of images with Stable Diffusion
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 7.5,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({
    type: "enum",
    default: 512,
    values: [
      "64",
      "128",
      "192",
      "256",
      "320",
      "384",
      "448",
      "512",
      "576",
      "640",
      "704",
      "768",
      "832",
      "896",
      "960",
      "1024"
    ],
    description:
      "Height of generated image in pixels. Needs to be a multiple of 64"
  })
  declare height: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Initial image to generate variations of. Will be resized to height x width"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Black and white image to use as mask for inpainting over the image provided. White pixels are inpainted and black pixels are preserved."
  })
  declare mask: any;

  @prop({
    type: "str",
    default: "",
    description: "Specify things to not see in the output"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of images to generate."
  })
  declare num_outputs: any;

  @prop({
    type: "str",
    default: "a vision of paradise. unreal engine",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "DPMSolverMultistep",
    values: [
      "DDIM",
      "K_EULER",
      "DPMSolverMultistep",
      "K_EULER_ANCESTRAL",
      "PNDM",
      "KLMS"
    ],
    description: "Choose a scheduler."
  })
  declare scheduler: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: 512,
    values: [
      "64",
      "128",
      "192",
      "256",
      "320",
      "384",
      "448",
      "512",
      "576",
      "640",
      "704",
      "768",
      "832",
      "896",
      "960",
      "1024"
    ],
    description:
      "Width of generated image in pixels. Needs to be a multiple of 64"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const height = String(this.height ?? 512);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(this.prompt ?? "a vision of paradise. unreal engine");
    const scheduler = String(this.scheduler ?? "DPMSolverMultistep");
    const seed = Number(this.seed ?? -1);
    const width = String(this.width ?? 512);

    const args: Record<string, unknown> = {
      disable_safety_checker: disableSafetyChecker,
      guidance_scale: guidanceScale,
      height: height,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      scheduler: scheduler,
      seed: seed,
      width: width
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
      "stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Kandinsky extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Kandinsky";
  static readonly title = "Kandinsky";
  static readonly description = `multilingual text2image latent diffusion model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: 512,
    values: [
      "384",
      "512",
      "576",
      "640",
      "704",
      "768",
      "960",
      "1024",
      "1152",
      "1280",
      "1536",
      "1792",
      "2048"
    ],
    description:
      "Height of output image. Lower the setting if hits memory limits."
  })
  declare height: any;

  @prop({
    type: "str",
    default: "",
    description: "Specify things to not see in the output"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 75, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 25,
    description: "Number of denoising steps for priors"
  })
  declare num_inference_steps_prior: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpeg", "png"],
    description: "Output image format"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "A moss covered astronaut with a black background",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: 512,
    values: [
      "384",
      "512",
      "576",
      "640",
      "704",
      "768",
      "960",
      "1024",
      "1152",
      "1280",
      "1536",
      "1792",
      "2048"
    ],
    description:
      "Width of output image. Lower the setting if hits memory limits."
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const height = String(this.height ?? 512);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 75);
    const numInferenceStepsPrior = Number(this.num_inference_steps_prior ?? 25);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const prompt = String(
      this.prompt ?? "A moss covered astronaut with a black background"
    );
    const seed = Number(this.seed ?? -1);
    const width = String(this.width ?? 512);

    const args: Record<string, unknown> = {
      height: height,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_inference_steps_prior: numInferenceStepsPrior,
      num_outputs: numOutputs,
      output_format: outputFormat,
      prompt: prompt,
      seed: seed,
      width: width
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "ai-forever/kandinsky-2.2:ad9d7879fbffa2874e1d909d1d37d9bc682889cc65b31f7bb00d2362619f194a",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Schnell extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Schnell";
  static readonly title = "Flux_ Schnell";
  static readonly description = `The fastest image generation model tailored for local development and personal use
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21"
    ],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16. Note that outputs will not be deterministic when this is enabled, even if you set a seed."
  })
  declare go_fast: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25"],
    description: "Approximate number of megapixels for generated image"
  })
  declare megapixels: any;

  @prop({
    type: "int",
    default: 4,
    description:
      "Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const goFast = Boolean(this.go_fast ?? true);
    const megapixels = String(this.megapixels ?? "1");
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      go_fast: goFast,
      megapixels: megapixels,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-schnell:c846a69991daf4c0e5d016514849d14ee5b2e6846ce6b9d6f21369e564cfe51e",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Dev extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Dev";
  static readonly title = "Flux_ Dev";
  static readonly description = `A 12 billion parameter rectified flow transformer capable of generating images from text descriptions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21"
    ],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "bool",
    default: true,
    description: "Run faster predictions with additional optimizations."
  })
  declare go_fast: any;

  @prop({
    type: "float",
    default: 3.5,
    description:
      "Guidance for generated image. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5"
  })
  declare guidance: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for image to image mode. The aspect ratio of your output will match this image"
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25"],
    description: "Approximate number of megapixels for generated image"
  })
  declare megapixels: any;

  @prop({
    type: "int",
    default: 28,
    description:
      "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const goFast = Boolean(this.go_fast ?? true);
    const guidance = Number(this.guidance ?? 3.5);
    const megapixels = String(this.megapixels ?? "1");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      go_fast: goFast,
      guidance: guidance,
      megapixels: megapixels,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      prompt_strength: promptStrength,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-dev:6e4a938f85952bdabcc15aa329178c4d681c52bf25a0342403287dc26944661d",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Pro";
  static readonly title = "Flux_ Pro";
  static readonly description = `State-of-the-art image generation with top of the line prompt following, visual quality, image detail and output diversity.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "custom",
      "1:1",
      "16:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "9:16",
      "3:4",
      "4:3"
    ],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 3,
    description:
      "Controls the balance between adherence to the text prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt."
  })
  declare guidance: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Height of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes."
  })
  declare height: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image to use with Flux Redux. This is used together with the text prompt to guide the generation towards the composition of the image_prompt. Must be jpeg, png, gif, or webp."
  })
  declare image_prompt: any;

  @prop({ type: "float", default: 2, description: "Deprecated" })
  declare interval: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images."
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Automatically modify the prompt for more creative generation"
  })
  declare prompt_upsampling: any;

  @prop({
    type: "int",
    default: 2,
    description: "Safety tolerance, 1 is most strict and 6 is most permissive"
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({ type: "int", default: 25, description: "Deprecated" })
  declare steps: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Width of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes."
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const guidance = Number(this.guidance ?? 3);
    const height = Number(this.height ?? 0);
    const interval = Number(this.interval ?? 2);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const promptUpsampling = Boolean(this.prompt_upsampling ?? false);
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 25);
    const width = Number(this.width ?? 0);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      guidance: guidance,
      height: height,
      interval: interval,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      prompt_upsampling: promptUpsampling,
      safety_tolerance: safetyTolerance,
      seed: seed,
      steps: steps,
      width: width
    };

    const imagePromptRef = this.image_prompt as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imagePromptRef)) {
      const imagePromptUrl = await assetToUrl(imagePromptRef!, apiKey);
      if (imagePromptUrl) args["image_prompt"] = imagePromptUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-pro:ce4035b99fc7bac18bc2f0384632858f126f6b4d96c88603a898a76b8e0c4ac2",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_1_1_Pro_Ultra extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_1_1_Pro_Ultra";
  static readonly title = "Flux_1_1_ Pro_ Ultra";
  static readonly description = `FLUX1.1 [pro] in ultra and raw modes. Images are up to 4 megapixels. Use raw mode for realism.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "21:9",
      "16:9",
      "3:2",
      "4:3",
      "5:4",
      "1:1",
      "4:5",
      "3:4",
      "2:3",
      "9:16",
      "9:21"
    ],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image to use with Flux Redux. This is used together with the text prompt to guide the generation towards the composition of the image_prompt. Must be jpeg, png, gif, or webp."
  })
  declare image_prompt: any;

  @prop({
    type: "float",
    default: 0.1,
    description: "Blend between the prompt and the image prompt."
  })
  declare image_prompt_strength: any;

  @prop({
    type: "enum",
    default: "jpg",
    values: ["jpg", "png"],
    description: "Format of the output images."
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Generate less processed, more natural-looking images"
  })
  declare raw: any;

  @prop({
    type: "int",
    default: 2,
    description: "Safety tolerance, 1 is most strict and 6 is most permissive"
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const imagePromptStrength = Number(this.image_prompt_strength ?? 0.1);
    const outputFormat = String(this.output_format ?? "jpg");
    const prompt = String(this.prompt ?? "");
    const raw = Boolean(this.raw ?? false);
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      image_prompt_strength: imagePromptStrength,
      output_format: outputFormat,
      prompt: prompt,
      raw: raw,
      safety_tolerance: safetyTolerance,
      seed: seed
    };

    const imagePromptRef = this.image_prompt as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imagePromptRef)) {
      const imagePromptUrl = await assetToUrl(imagePromptRef!, apiKey);
      if (imagePromptUrl) args["image_prompt"] = imagePromptUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-1.1-pro-ultra:5ea10f739af9f6d4002fae9aee4c15be14c3c8d7f8b309e634bf68df09159863",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Dev_Lora extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Dev_Lora";
  static readonly title = "Flux_ Dev_ Lora";
  static readonly description = `A version of flux-dev, a text to image model, that supports fast fine-tuned lora inference
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21"
    ],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Civitai API token. If you're using a civitai lora that needs authentication, you'll need to provide an API token."
  })
  declare civitai_api_token: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'"
  })
  declare extra_lora: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare extra_lora_scale: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16. Note that outputs will not be deterministic when this is enabled, even if you set a seed."
  })
  declare go_fast: any;

  @prop({
    type: "float",
    default: 3,
    description: "Guidance for generated image"
  })
  declare guidance: any;

  @prop({
    type: "str",
    default: "",
    description:
      "HuggingFace API token. If you're using a hf lora that needs authentication, you'll need to provide an API token."
  })
  declare hf_api_token: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for image to image mode. The aspect ratio of your output will match this image"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare lora_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>[/<lora-weights-file.safetensors>], CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet, including signed URLs. For example, 'fofr/flux-pixar-cars'. Civit AI and HuggingFace LoRAs may require an API token to access, which you can provide in the 'civitai_api_token' and 'hf_api_token' inputs respectively."
  })
  declare lora_weights: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25"],
    description: "Approximate number of megapixels for generated image"
  })
  declare megapixels: any;

  @prop({
    type: "int",
    default: 28,
    description:
      "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const civitaiApiToken = String(this.civitai_api_token ?? "");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const extraLora = String(this.extra_lora ?? "");
    const extraLoraScale = Number(this.extra_lora_scale ?? 1);
    const goFast = Boolean(this.go_fast ?? true);
    const guidance = Number(this.guidance ?? 3);
    const hfApiToken = String(this.hf_api_token ?? "");
    const loraScale = Number(this.lora_scale ?? 1);
    const loraWeights = String(this.lora_weights ?? "");
    const megapixels = String(this.megapixels ?? "1");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      civitai_api_token: civitaiApiToken,
      disable_safety_checker: disableSafetyChecker,
      extra_lora: extraLora,
      extra_lora_scale: extraLoraScale,
      go_fast: goFast,
      guidance: guidance,
      hf_api_token: hfApiToken,
      lora_scale: loraScale,
      lora_weights: loraWeights,
      megapixels: megapixels,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      prompt_strength: promptStrength,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-dev-lora:ae0d7d645446924cf1871e3ca8796e8318f72465d2b5af9323a835df93bf0917",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Schnell_Lora extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Schnell_Lora";
  static readonly title = "Flux_ Schnell_ Lora";
  static readonly description = `The fastest image generation model tailored for fine-tuned use
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21"
    ],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16. Note that outputs will not be deterministic when this is enabled, even if you set a seed."
  })
  declare go_fast: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare lora_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'"
  })
  declare lora_weights: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25"],
    description: "Approximate number of megapixels for generated image"
  })
  declare megapixels: any;

  @prop({
    type: "int",
    default: 4,
    description:
      "Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const goFast = Boolean(this.go_fast ?? true);
    const loraScale = Number(this.lora_scale ?? 1);
    const loraWeights = String(this.lora_weights ?? "");
    const megapixels = String(this.megapixels ?? "1");
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      go_fast: goFast,
      lora_scale: loraScale,
      lora_weights: loraWeights,
      megapixels: megapixels,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-schnell-lora:83180e3ae073b7f87cd85b8bb649337412fd006d10db49e04ea5e821e87fbeb3",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Depth_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Depth_Pro";
  static readonly title = "Flux_ Depth_ Pro";
  static readonly description = `Professional depth-aware image generation. Edit images while preserving spatial relationships.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "Image to use as control input. Must be jpeg, png, gif, or webp."
  })
  declare control_image: any;

  @prop({
    type: "float",
    default: 30,
    description:
      "Controls the balance between adherence to the text as well as image prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt."
  })
  declare guidance: any;

  @prop({
    type: "enum",
    default: "jpg",
    values: ["jpg", "png"],
    description: "Format of the output images."
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Automatically modify the prompt for more creative generation"
  })
  declare prompt_upsampling: any;

  @prop({
    type: "int",
    default: 2,
    description: "Safety tolerance, 1 is most strict and 6 is most permissive"
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 50,
    description:
      "Number of diffusion steps. Higher values yield finer details but increase processing time."
  })
  declare steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const guidance = Number(this.guidance ?? 30);
    const outputFormat = String(this.output_format ?? "jpg");
    const prompt = String(this.prompt ?? "");
    const promptUpsampling = Boolean(this.prompt_upsampling ?? false);
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 50);

    const args: Record<string, unknown> = {
      guidance: guidance,
      output_format: outputFormat,
      prompt: prompt,
      prompt_upsampling: promptUpsampling,
      safety_tolerance: safetyTolerance,
      seed: seed,
      steps: steps
    };

    const controlImageRef = this.control_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(controlImageRef)) {
      const controlImageUrl = await assetToUrl(controlImageRef!, apiKey);
      if (controlImageUrl) args["control_image"] = controlImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-depth-pro:0e370dce5fdf15aa8b5fe2491474be45628756e8fba97574bfb3bcab46d09fff",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Canny_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Canny_Pro";
  static readonly title = "Flux_ Canny_ Pro";
  static readonly description = `Professional edge-guided image generation. Control structure and composition using Canny edge detection
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "Image to use as control input. Must be jpeg, png, gif, or webp."
  })
  declare control_image: any;

  @prop({
    type: "float",
    default: 30,
    description:
      "Controls the balance between adherence to the text as well as image prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt."
  })
  declare guidance: any;

  @prop({
    type: "enum",
    default: "jpg",
    values: ["jpg", "png"],
    description: "Format of the output images."
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Automatically modify the prompt for more creative generation"
  })
  declare prompt_upsampling: any;

  @prop({
    type: "int",
    default: 2,
    description: "Safety tolerance, 1 is most strict and 6 is most permissive"
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 50,
    description:
      "Number of diffusion steps. Higher values yield finer details but increase processing time."
  })
  declare steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const guidance = Number(this.guidance ?? 30);
    const outputFormat = String(this.output_format ?? "jpg");
    const prompt = String(this.prompt ?? "");
    const promptUpsampling = Boolean(this.prompt_upsampling ?? false);
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 50);

    const args: Record<string, unknown> = {
      guidance: guidance,
      output_format: outputFormat,
      prompt: prompt,
      prompt_upsampling: promptUpsampling,
      safety_tolerance: safetyTolerance,
      seed: seed,
      steps: steps
    };

    const controlImageRef = this.control_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(controlImageRef)) {
      const controlImageUrl = await assetToUrl(controlImageRef!, apiKey);
      if (controlImageUrl) args["control_image"] = controlImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-canny-pro:835f0372c2cf4b2e494c2b8626288212ea5c2694ccc2e29f00dfb8cbf2a5e0ce",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Fill_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Fill_Pro";
  static readonly title = "Flux_ Fill_ Pro";
  static readonly description = `Professional inpainting and outpainting model with state-of-the-art performance. Edit or extend images with natural, seamless results.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 60,
    description:
      "Controls the balance between adherence to the text prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt."
  })
  declare guidance: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The image to inpaint. Can contain an alpha mask. Must be jpeg, png, gif, or webp."
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "A black-and-white image that describes the part of the image to inpaint. Black areas will be preserved while white areas will be inpainted. Must have the same size as image. Optional if you provide an alpha mask in the original image. Must be jpeg, png, gif, or webp."
  })
  declare mask: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Zoom out 1.5x",
      "Zoom out 2x",
      "Make square",
      "Left outpaint",
      "Right outpaint",
      "Top outpaint",
      "Bottom outpaint"
    ],
    description:
      "A quick option for outpainting an input image. Mask will be ignored."
  })
  declare outpaint: any;

  @prop({
    type: "enum",
    default: "jpg",
    values: ["jpg", "png"],
    description: "Format of the output images."
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Automatically modify the prompt for more creative generation"
  })
  declare prompt_upsampling: any;

  @prop({
    type: "int",
    default: 2,
    description: "Safety tolerance, 1 is most strict and 6 is most permissive"
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 50,
    description:
      "Number of diffusion steps. Higher values yield finer details but increase processing time."
  })
  declare steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const guidance = Number(this.guidance ?? 60);
    const outpaint = String(this.outpaint ?? "None");
    const outputFormat = String(this.output_format ?? "jpg");
    const prompt = String(this.prompt ?? "");
    const promptUpsampling = Boolean(this.prompt_upsampling ?? false);
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 50);

    const args: Record<string, unknown> = {
      guidance: guidance,
      outpaint: outpaint,
      output_format: outputFormat,
      prompt: prompt,
      prompt_upsampling: promptUpsampling,
      safety_tolerance: safetyTolerance,
      seed: seed,
      steps: steps
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
      "black-forest-labs/flux-fill-pro:2d4197724d8ed13cc78191e794ebbe6aeedcfe4c5b36f464794732d5ccb9735f",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Depth_Dev extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Depth_Dev";
  static readonly title = "Flux_ Depth_ Dev";
  static readonly description = `Open-weight depth-aware image generation. Edit images while preserving spatial relationships.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "Image used to control the generation. The depth map will be automatically generated."
  })
  declare control_image: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 10,
    description: "Guidance for generated image"
  })
  declare guidance: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25", "match_input"],
    description:
      "Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels)"
  })
  declare megapixels: any;

  @prop({
    type: "int",
    default: 28,
    description:
      "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidance = Number(this.guidance ?? 10);
    const megapixels = String(this.megapixels ?? "1");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      disable_safety_checker: disableSafetyChecker,
      guidance: guidance,
      megapixels: megapixels,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed
    };

    const controlImageRef = this.control_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(controlImageRef)) {
      const controlImageUrl = await assetToUrl(controlImageRef!, apiKey);
      if (controlImageUrl) args["control_image"] = controlImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-depth-dev:fc4f1401056237174d207056c49cd2afd44ede232ba286a3d40eb6376b726600",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Hyper_Flux_8Step extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Hyper_Flux_8Step";
  static readonly title = "Hyper_ Flux_8 Step";
  static readonly description = `Hyper FLUX 8-step by ByteDance
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21",
      "custom"
    ],
    description:
      "Aspect ratio for the generated image. The size will always be 1 megapixel, i.e. 1024x1024 if aspect ratio is 1:1. To use arbitrary width and height, set aspect ratio to 'custom'."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 3.5,
    description: "Guidance scale for the diffusion process"
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 848,
    description:
      "Height of the generated image. Optional, only used when aspect_ratio=custom. Must be a multiple of 16 (if it's not, it will be rounded to nearest multiple of 16)"
  })
  declare height: any;

  @prop({ type: "int", default: 8, description: "Number of inference steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({
    type: "int",
    default: 0,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 848,
    description:
      "Width of the generated image. Optional, only used when aspect_ratio=custom. Must be a multiple of 16 (if it's not, it will be rounded to nearest multiple of 16)"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const height = Number(this.height ?? 848);
    const numInferenceSteps = Number(this.num_inference_steps ?? 8);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? 0);
    const width = Number(this.width ?? 848);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      guidance_scale: guidanceScale,
      height: height,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed,
      width: width
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bytedance/hyper-flux-8step:16084e9731223a4367228928a6cb393b21736da2a0ca6a5a492ce311f0a97143",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Mona_Lisa extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Mona_Lisa";
  static readonly title = "Flux_ Mona_ Lisa";
  static readonly description = `Flux lora, use the term "MNALSA" to trigger generation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21",
      "custom"
    ],
    description:
      "Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'"
  })
  declare extra_lora: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare extra_lora_scale: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16"
  })
  declare go_fast: any;

  @prop({
    type: "float",
    default: 3,
    description:
      "Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5"
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Height of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation"
  })
  declare height: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored."
  })
  declare image: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored."
  })
  declare mask: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25"],
    description: "Approximate number of megapixels for generated image"
  })
  declare megapixels: any;

  @prop({
    type: "enum",
    default: "dev",
    values: ["dev", "schnell"],
    description:
      "Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps."
  })
  declare model: any;

  @prop({
    type: "int",
    default: 28,
    description:
      "Number of denoising steps. More steps can give more detailed images, but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Prompt for generated image. If you include the 'trigger_word' used in the training process you are more likely to activate the trained object, style, or concept in the resulting image."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'"
  })
  declare replicate_weights: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Width of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const extraLora = String(this.extra_lora ?? "");
    const extraLoraScale = Number(this.extra_lora_scale ?? 1);
    const goFast = Boolean(this.go_fast ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const height = Number(this.height ?? 0);
    const loraScale = Number(this.lora_scale ?? 1);
    const megapixels = String(this.megapixels ?? "1");
    const model = String(this.model ?? "dev");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const replicateWeights = String(this.replicate_weights ?? "");
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 0);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      extra_lora: extraLora,
      extra_lora_scale: extraLoraScale,
      go_fast: goFast,
      guidance_scale: guidanceScale,
      height: height,
      lora_scale: loraScale,
      megapixels: megapixels,
      model: model,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      prompt_strength: promptStrength,
      replicate_weights: replicateWeights,
      seed: seed,
      width: width
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
      "fofr/flux-mona-lisa:6e7e34b8d739ab9d4d9a468ef773b5cd85a5c36b11f885379061ba2c70219d41",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Cinestill extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Cinestill";
  static readonly title = "Flux_ Cinestill";
  static readonly description = `Flux lora, use "CNSTLL" to trigger
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21",
      "custom"
    ],
    description:
      "Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'"
  })
  declare extra_lora: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare extra_lora_scale: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16"
  })
  declare go_fast: any;

  @prop({
    type: "float",
    default: 3,
    description:
      "Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5"
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Height of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation"
  })
  declare height: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored."
  })
  declare image: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored."
  })
  declare mask: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25"],
    description: "Approximate number of megapixels for generated image"
  })
  declare megapixels: any;

  @prop({
    type: "enum",
    default: "dev",
    values: ["dev", "schnell"],
    description:
      "Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps."
  })
  declare model: any;

  @prop({
    type: "int",
    default: 28,
    description:
      "Number of denoising steps. More steps can give more detailed images, but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Prompt for generated image. If you include the 'trigger_word' used in the training process you are more likely to activate the trained object, style, or concept in the resulting image."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'"
  })
  declare replicate_weights: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Width of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const extraLora = String(this.extra_lora ?? "");
    const extraLoraScale = Number(this.extra_lora_scale ?? 1);
    const goFast = Boolean(this.go_fast ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const height = Number(this.height ?? 0);
    const loraScale = Number(this.lora_scale ?? 1);
    const megapixels = String(this.megapixels ?? "1");
    const model = String(this.model ?? "dev");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const replicateWeights = String(this.replicate_weights ?? "");
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 0);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      extra_lora: extraLora,
      extra_lora_scale: extraLoraScale,
      go_fast: goFast,
      guidance_scale: guidanceScale,
      height: height,
      lora_scale: loraScale,
      megapixels: megapixels,
      model: model,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      prompt_strength: promptStrength,
      replicate_weights: replicateWeights,
      seed: seed,
      width: width
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
      "adirik/flux-cinestill:216a43b9975de9768114644bbf8cd0cba54a923c6d0f65adceaccfc9383a938f",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Black_Light extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Black_Light";
  static readonly title = "Flux_ Black_ Light";
  static readonly description = `A flux lora fine-tuned on black light images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21",
      "custom"
    ],
    description:
      "Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'"
  })
  declare extra_lora: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare extra_lora_scale: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16"
  })
  declare go_fast: any;

  @prop({
    type: "float",
    default: 3,
    description:
      "Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5"
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Height of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation"
  })
  declare height: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored."
  })
  declare image: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored."
  })
  declare mask: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25"],
    description: "Approximate number of megapixels for generated image"
  })
  declare megapixels: any;

  @prop({
    type: "enum",
    default: "dev",
    values: ["dev", "schnell"],
    description:
      "Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps."
  })
  declare model: any;

  @prop({
    type: "int",
    default: 28,
    description:
      "Number of denoising steps. More steps can give more detailed images, but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Prompt for generated image. If you include the 'trigger_word' used in the training process you are more likely to activate the trained object, style, or concept in the resulting image."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'"
  })
  declare replicate_weights: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Width of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const extraLora = String(this.extra_lora ?? "");
    const extraLoraScale = Number(this.extra_lora_scale ?? 1);
    const goFast = Boolean(this.go_fast ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const height = Number(this.height ?? 0);
    const loraScale = Number(this.lora_scale ?? 1);
    const megapixels = String(this.megapixels ?? "1");
    const model = String(this.model ?? "dev");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const replicateWeights = String(this.replicate_weights ?? "");
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 0);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      extra_lora: extraLora,
      extra_lora_scale: extraLoraScale,
      go_fast: goFast,
      guidance_scale: guidanceScale,
      height: height,
      lora_scale: loraScale,
      megapixels: megapixels,
      model: model,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      prompt_strength: promptStrength,
      replicate_weights: replicateWeights,
      seed: seed,
      width: width
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
      "fofr/flux-black-light:d0d48e298dcb51118c3f903817c833bba063936637a33ac52a8ffd6a94859af7",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_360 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_360";
  static readonly title = "Flux_360";
  static readonly description = `Generate 360 panorama images.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21",
      "custom"
    ],
    description:
      "Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'"
  })
  declare extra_lora: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare extra_lora_scale: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16"
  })
  declare go_fast: any;

  @prop({
    type: "float",
    default: 3,
    description:
      "Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5"
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Height of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation"
  })
  declare height: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored."
  })
  declare image: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored."
  })
  declare mask: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25"],
    description: "Approximate number of megapixels for generated image"
  })
  declare megapixels: any;

  @prop({
    type: "enum",
    default: "dev",
    values: ["dev", "schnell"],
    description:
      "Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps."
  })
  declare model: any;

  @prop({
    type: "int",
    default: 28,
    description:
      "Number of denoising steps. More steps can give more detailed images, but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Prompt for generated image. If you include the 'trigger_word' used in the training process you are more likely to activate the trained object, style, or concept in the resulting image."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'"
  })
  declare replicate_weights: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Width of generated image. Only works if 'aspect_ratio' is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const extraLora = String(this.extra_lora ?? "");
    const extraLoraScale = Number(this.extra_lora_scale ?? 1);
    const goFast = Boolean(this.go_fast ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const height = Number(this.height ?? 0);
    const loraScale = Number(this.lora_scale ?? 1);
    const megapixels = String(this.megapixels ?? "1");
    const model = String(this.model ?? "dev");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const replicateWeights = String(this.replicate_weights ?? "");
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 0);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      extra_lora: extraLora,
      extra_lora_scale: extraLoraScale,
      go_fast: goFast,
      guidance_scale: guidanceScale,
      height: height,
      lora_scale: loraScale,
      megapixels: megapixels,
      model: model,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      prompt_strength: promptStrength,
      replicate_weights: replicateWeights,
      seed: seed,
      width: width
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
      "igorriti/flux-360:d26037255a2b298408505e2fbd0bf7703521daca8f07e8c8f335ba874b4aa11a",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_V3 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Recraft_V3";
  static readonly title = "Recraft_ V3";
  static readonly description = `Recraft V3 (code-named red_panda) is a text-to-image model with the ability to generate long texts, and images in a wide list of styles. As of today, it is SOTA in image generation, proven by the Text-to-Image Benchmark by Artificial Analysis
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "Not set",
    values: [
      "Not set",
      "1:1",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:9",
      "9:16",
      "1:2",
      "2:1",
      "7:5",
      "5:7",
      "4:5",
      "5:4",
      "3:5",
      "5:3"
    ],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1024x1024",
    values: [
      "1024x1024",
      "1365x1024",
      "1024x1365",
      "1536x1024",
      "1024x1536",
      "1820x1024",
      "1024x1820",
      "1024x2048",
      "2048x1024",
      "1434x1024",
      "1024x1434",
      "1024x1280",
      "1280x1024",
      "1024x1707",
      "1707x1024"
    ],
    description:
      "Width and height of the generated image. Size is ignored if an aspect ratio is set."
  })
  declare size: any;

  @prop({
    type: "enum",
    default: "any",
    values: [
      "any",
      "realistic_image",
      "digital_illustration",
      "digital_illustration/pixel_art",
      "digital_illustration/hand_drawn",
      "digital_illustration/grain",
      "digital_illustration/infantile_sketch",
      "digital_illustration/2d_art_poster",
      "digital_illustration/handmade_3d",
      "digital_illustration/hand_drawn_outline",
      "digital_illustration/engraving_color",
      "digital_illustration/2d_art_poster_2",
      "realistic_image/b_and_w",
      "realistic_image/hard_flash",
      "realistic_image/hdr",
      "realistic_image/natural_light",
      "realistic_image/studio_portrait",
      "realistic_image/enterprise",
      "realistic_image/motion_blur"
    ],
    description: "Style of the generated image."
  })
  declare style: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "Not set");
    const prompt = String(this.prompt ?? "");
    const size = String(this.size ?? "1024x1024");
    const style = String(this.style ?? "any");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      size: size,
      style: style
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "recraft-ai/recraft-v3:9507e61ddace8b3a238371b17a61be203747c5081ea6070fecd3c40d27318922",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_20B extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Recraft_20B";
  static readonly title = "Recraft_20 B";
  static readonly description = `Affordable and fast images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "Not set",
    values: [
      "Not set",
      "1:1",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:9",
      "9:16",
      "1:2",
      "2:1",
      "7:5",
      "5:7",
      "4:5",
      "5:4",
      "3:5",
      "5:3"
    ],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1024x1024",
    values: [
      "1024x1024",
      "1365x1024",
      "1024x1365",
      "1536x1024",
      "1024x1536",
      "1820x1024",
      "1024x1820",
      "1024x2048",
      "2048x1024",
      "1434x1024",
      "1024x1434",
      "1024x1280",
      "1280x1024",
      "1024x1707",
      "1707x1024"
    ],
    description:
      "Width and height of the generated image. Size is ignored if an aspect ratio is set."
  })
  declare size: any;

  @prop({
    type: "enum",
    default: "realistic_image",
    values: [
      "realistic_image",
      "realistic_image/b_and_w",
      "realistic_image/enterprise",
      "realistic_image/hard_flash",
      "realistic_image/hdr",
      "realistic_image/motion_blur",
      "realistic_image/natural_light",
      "realistic_image/studio_portrait",
      "digital_illustration",
      "digital_illustration/2d_art_poster",
      "digital_illustration/2d_art_poster_2",
      "digital_illustration/3d",
      "digital_illustration/80s",
      "digital_illustration/engraving_color",
      "digital_illustration/glow",
      "digital_illustration/grain",
      "digital_illustration/hand_drawn",
      "digital_illustration/hand_drawn_outline",
      "digital_illustration/handmade_3d",
      "digital_illustration/infantile_sketch",
      "digital_illustration/kawaii",
      "digital_illustration/pixel_art",
      "digital_illustration/psychedelic",
      "digital_illustration/seamless",
      "digital_illustration/voxel",
      "digital_illustration/watercolor"
    ],
    description: "Style of the generated image."
  })
  declare style: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "Not set");
    const prompt = String(this.prompt ?? "");
    const size = String(this.size ?? "1024x1024");
    const style = String(this.style ?? "realistic_image");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      size: size,
      style: style
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "recraft-ai/recraft-20b:c303fbbc72c026aa4315e5efc5dd9d8a1dfb60927c84c8c32214cd1d39028701",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_20B_SVG extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Recraft_20B_SVG";
  static readonly title = "Recraft_20 B_ S V G";
  static readonly description = `Affordable and fast vector images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "Not set",
    values: [
      "Not set",
      "1:1",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:9",
      "9:16",
      "1:2",
      "2:1",
      "7:5",
      "5:7",
      "4:5",
      "5:4",
      "3:5",
      "5:3"
    ],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1024x1024",
    values: [
      "1024x1024",
      "1365x1024",
      "1024x1365",
      "1536x1024",
      "1024x1536",
      "1820x1024",
      "1024x1820",
      "1024x2048",
      "2048x1024",
      "1434x1024",
      "1024x1434",
      "1024x1280",
      "1280x1024",
      "1024x1707",
      "1707x1024"
    ],
    description:
      "Width and height of the generated image. Size is ignored if an aspect ratio is set."
  })
  declare size: any;

  @prop({
    type: "enum",
    default: "vector_illustration",
    values: [
      "vector_illustration",
      "vector_illustration/cartoon",
      "vector_illustration/doodle_line_art",
      "vector_illustration/engraving",
      "vector_illustration/flat_2",
      "vector_illustration/kawaii",
      "vector_illustration/line_art",
      "vector_illustration/line_circuit",
      "vector_illustration/linocut",
      "vector_illustration/seamless",
      "icon",
      "icon/broken_line",
      "icon/colored_outline",
      "icon/colored_shapes",
      "icon/colored_shapes_gradient",
      "icon/doodle_fill",
      "icon/doodle_offset_fill",
      "icon/offset_fill",
      "icon/outline",
      "icon/outline_gradient",
      "icon/uneven_fill"
    ],
    description: "Style of the generated image."
  })
  declare style: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "Not set");
    const prompt = String(this.prompt ?? "");
    const size = String(this.size ?? "1024x1024");
    const style = String(this.style ?? "vector_illustration");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      size: size,
      style: style
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "recraft-ai/recraft-20b-svg:666dcf90f18786723e083609cee6c84a0f162cc73d7066fd2d3ad3cb6ba88b1c",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_V3_SVG extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Recraft_V3_SVG";
  static readonly title = "Recraft_ V3_ S V G";
  static readonly description = `Recraft V3 SVG (code-named red_panda) is a text-to-image model with the ability to generate high quality SVG images including logotypes, and icons. The model supports a wide list of styles.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "Not set",
    values: [
      "Not set",
      "1:1",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:9",
      "9:16",
      "1:2",
      "2:1",
      "7:5",
      "5:7",
      "4:5",
      "5:4",
      "3:5",
      "5:3"
    ],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1024x1024",
    values: [
      "1024x1024",
      "1365x1024",
      "1024x1365",
      "1536x1024",
      "1024x1536",
      "1820x1024",
      "1024x1820",
      "1024x2048",
      "2048x1024",
      "1434x1024",
      "1024x1434",
      "1024x1280",
      "1280x1024",
      "1024x1707",
      "1707x1024"
    ],
    description:
      "Width and height of the generated image. Size is ignored if an aspect ratio is set."
  })
  declare size: any;

  @prop({
    type: "enum",
    default: "any",
    values: ["any", "engraving", "line_art", "line_circuit", "linocut"],
    description: "Style of the generated image."
  })
  declare style: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "Not set");
    const prompt = String(this.prompt ?? "");
    const size = String(this.size ?? "1024x1024");
    const style = String(this.style ?? "any");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      size: size,
      style: style
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "recraft-ai/recraft-v3-svg:df041379628fa1d16bd406409930775b0904dc2bc0f3e3f38ecd2a4389e9329d",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Canny_Dev extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Canny_Dev";
  static readonly title = "Flux_ Canny_ Dev";
  static readonly description = `Open-weight edge-guided image generation. Control structure and composition using Canny edge detection.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "Image used to control the generation. The canny edge detection will be automatically generated."
  })
  declare control_image: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 30,
    description: "Guidance for generated image"
  })
  declare guidance: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25", "match_input"],
    description:
      "Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels)"
  })
  declare megapixels: any;

  @prop({
    type: "int",
    default: 28,
    description:
      "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidance = Number(this.guidance ?? 30);
    const megapixels = String(this.megapixels ?? "1");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      disable_safety_checker: disableSafetyChecker,
      guidance: guidance,
      megapixels: megapixels,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed
    };

    const controlImageRef = this.control_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(controlImageRef)) {
      const controlImageUrl = await assetToUrl(controlImageRef!, apiKey);
      if (controlImageUrl) args["control_image"] = controlImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-canny-dev:aeb2a8dbfe2580e25d41d8881cc1df1a0b1e52c87de99c1a65fc587ac3918179",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Fill_Dev extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Fill_Dev";
  static readonly title = "Flux_ Fill_ Dev";
  static readonly description = `Open-weight inpainting model for editing and extending images. Guidance-distilled from FLUX.1 Fill [pro].
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 30,
    description: "Guidance for generated image"
  })
  declare guidance: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The image to inpaint. Can contain alpha mask. If the image width or height are not multiples of 32, they will be scaled to the closest multiple of 32. If the image dimensions don't fit within 1440x1440, it will be scaled down to fit."
  })
  declare image: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora."
  })
  declare lora_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'"
  })
  declare lora_weights: any;

  @prop({
    type: "image",
    default: "",
    description:
      "A black-and-white image that describes the part of the image to inpaint. Black areas will be preserved while white areas will be inpainted."
  })
  declare mask: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25", "match_input"],
    description:
      "Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels)"
  })
  declare megapixels: any;

  @prop({
    type: "int",
    default: 28,
    description:
      "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidance = Number(this.guidance ?? 30);
    const loraScale = Number(this.lora_scale ?? 1);
    const loraWeights = String(this.lora_weights ?? "");
    const megapixels = String(this.megapixels ?? "1");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      disable_safety_checker: disableSafetyChecker,
      guidance: guidance,
      lora_scale: loraScale,
      lora_weights: loraWeights,
      megapixels: megapixels,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed
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
      "black-forest-labs/flux-fill-dev:a053f84125613d83e65328a289e14eb6639e10725c243e8fb0c24128e5573f4c",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Redux_Schnell extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Redux_Schnell";
  static readonly title = "Flux_ Redux_ Schnell";
  static readonly description = `Fast, efficient image variation model for rapid iteration and experimentation.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21"
    ],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25"],
    description: "Approximate number of megapixels for generated image"
  })
  declare megapixels: any;

  @prop({
    type: "int",
    default: 4,
    description:
      "Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image to condition your output on. This replaces prompt for FLUX.1 Redux models"
  })
  declare redux_image: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const megapixels = String(this.megapixels ?? "1");
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      megapixels: megapixels,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      seed: seed
    };

    const reduxImageRef = this.redux_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(reduxImageRef)) {
      const reduxImageUrl = await assetToUrl(reduxImageRef!, apiKey);
      if (reduxImageUrl) args["redux_image"] = reduxImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-redux-schnell:8a9ff6ce228b950c7079005fd0804f54c74c0113cda3f3c07eff10ab943f32a1",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Redux_Dev extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Redux_Dev";
  static readonly title = "Flux_ Redux_ Dev";
  static readonly description = `Open-weight image variation model. Create new versions while preserving key elements of your original.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21"
    ],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 3,
    description: "Guidance for generated image"
  })
  declare guidance: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["1", "0.25"],
    description: "Approximate number of megapixels for generated image"
  })
  declare megapixels: any;

  @prop({
    type: "int",
    default: 28,
    description: "Number of denoising steps. Recommended range is 28-50"
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of outputs to generate"
  })
  declare num_outputs: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image to condition your output on. This replaces prompt for FLUX.1 Redux models"
  })
  declare redux_image: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidance = Number(this.guidance ?? 3);
    const megapixels = String(this.megapixels ?? "1");
    const numInferenceSteps = Number(this.num_inference_steps ?? 28);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      guidance: guidance,
      megapixels: megapixels,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      seed: seed
    };

    const reduxImageRef = this.redux_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(reduxImageRef)) {
      const reduxImageUrl = await assetToUrl(reduxImageRef!, apiKey);
      if (reduxImageUrl) args["redux_image"] = reduxImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-redux-dev:96b56814e57dfa601f3f524f82a2b336ef49012cda68828cb37cde66f481b7cb",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class SDXL_Controlnet extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.SDXL_Controlnet";
  static readonly title = "S D X L_ Controlnet";
  static readonly description = `SDXL ControlNet - Canny
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 0.5,
    description: "controlnet conditioning scale for generalization"
  })
  declare condition_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for img2img or inpaint mode"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "low quality, bad quality, sketches",
    description: "Input Negative Prompt"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default:
      "aerial view, a futuristic research complex in a bright foggy jungle, hard lighting",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 0,
    description: "Random seed. Set to 0 to randomize the seed"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const conditionScale = Number(this.condition_scale ?? 0.5);
    const negativePrompt = String(
      this.negative_prompt ?? "low quality, bad quality, sketches"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const prompt = String(
      this.prompt ??
        "aerial view, a futuristic research complex in a bright foggy jungle, hard lighting"
    );
    const seed = Number(this.seed ?? 0);

    const args: Record<string, unknown> = {
      condition_scale: conditionScale,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      prompt: prompt,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/sdxl-controlnet:06d6fae3b75ab68a28cd2900afa6033166910dd09fd9751047043a5bbb4c184b",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class SDXL_Ad_Inpaint extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.SDXL_Ad_Inpaint";
  static readonly title = "S D X L_ Ad_ Inpaint";
  static readonly description = `Product advertising image generator using SDXL
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: true,
    description: "Applies the original product image to the final result"
  })
  declare apply_img: any;

  @prop({
    type: "float",
    default: 0.9,
    description: "controlnet conditioning scale for generalization"
  })
  declare condition_scale: any;

  @prop({ type: "float", default: 7.5, description: "Guidance Scale" })
  declare guidance_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "Remove background from this image"
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "1024, 1024",
    values: [
      "512, 2048",
      "512, 1984",
      "512, 1920",
      "512, 1856",
      "576, 1792",
      "576, 1728",
      "576, 1664",
      "640, 1600",
      "640, 1536",
      "704, 1472",
      "704, 1408",
      "704, 1344",
      "768, 1344",
      "768, 1280",
      "832, 1216",
      "832, 1152",
      "896, 1152",
      "896, 1088",
      "960, 1088",
      "960, 1024",
      "1024, 1024",
      "1024, 960",
      "1088, 960",
      "1088, 896",
      "1152, 896",
      "1152, 832",
      "1216, 832",
      "1280, 768",
      "1344, 768",
      "1408, 704",
      "1472, 704",
      "1536, 640",
      "1600, 640",
      "1664, 576",
      "1728, 576",
      "1792, 576",
      "1856, 512",
      "1920, 512",
      "1984, 512",
      "2048, 512"
    ],
    description: "Possible SDXL image sizes"
  })
  declare img_size: any;

  @prop({
    type: "str",
    default:
      "low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement",
    description: "Describe what you do not want in your setting"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 40, description: "Inference Steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 10, description: "Number of steps to refine" })
  declare num_refine_steps: any;

  @prop({
    type: "enum",
    default: "Original",
    values: ["Original", "80", "70", "60", "50", "40", "30", "20"],
    description: "What percentage of the image width to fill with product"
  })
  declare product_fill: any;

  @prop({
    type: "str",
    default: "",
    description: "Describe the new setting for your product"
  })
  declare prompt: any;

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
    default: 0,
    description: "Empty or 0 for a random image"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const applyImg = Boolean(this.apply_img ?? true);
    const conditionScale = Number(this.condition_scale ?? 0.9);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const imgSize = String(this.img_size ?? "1024, 1024");
    const negativePrompt = String(
      this.negative_prompt ??
        "low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const numRefineSteps = Number(this.num_refine_steps ?? 10);
    const productFill = String(this.product_fill ?? "Original");
    const prompt = String(this.prompt ?? "");
    const scheduler = String(this.scheduler ?? "K_EULER");
    const seed = Number(this.seed ?? 0);

    const args: Record<string, unknown> = {
      apply_img: applyImg,
      condition_scale: conditionScale,
      guidance_scale: guidanceScale,
      img_size: imgSize,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_refine_steps: numRefineSteps,
      product_fill: productFill,
      prompt: prompt,
      scheduler: scheduler,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "catacolabs/sdxl-ad-inpaint:9c0cb4c579c54432431d96c70924afcca18983de872e8a221777fb1416253359",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class StableDiffusionXLLightning extends ReplicateNode {
  static readonly nodeType =
    "replicate.image.generate.StableDiffusionXLLightning";
  static readonly title = "Stable Diffusion X L Lightning";
  static readonly description = `SDXL-Lightning by ByteDance: a fast text-to-image model that makes high-quality images in 4 steps
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 0,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 1024,
    description: "Height of output image. Recommended 1024 or 1280"
  })
  declare height: any;

  @prop({
    type: "str",
    default: "worst quality, low quality",
    description: "Negative Input prompt"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 4,
    description: "Number of denoising steps. 4 for best results"
  })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({
    type: "str",
    default: "self-portrait of a woman, lightning in the background",
    description: "Input prompt"
  })
  declare prompt: any;

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
      "PNDM",
      "DPM++2MSDE"
    ],
    description: "scheduler"
  })
  declare scheduler: any;

  @prop({
    type: "int",
    default: 0,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 1024,
    description: "Width of output image. Recommended 1024 or 1280"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 0);
    const height = Number(this.height ?? 1024);
    const negativePrompt = String(
      this.negative_prompt ?? "worst quality, low quality"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 4);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(
      this.prompt ?? "self-portrait of a woman, lightning in the background"
    );
    const scheduler = String(this.scheduler ?? "K_EULER");
    const seed = Number(this.seed ?? 0);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      disable_safety_checker: disableSafetyChecker,
      guidance_scale: guidanceScale,
      height: height,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      scheduler: scheduler,
      seed: seed,
      width: width
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bytedance/sdxl-lightning-4step:6f7a773af6fc3e8de9d5a3c00be77c17308914bf67772726aff83496ba1e3bbe",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class PlaygroundV2 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.PlaygroundV2";
  static readonly title = "Playground V2";
  static readonly description = `Playground v2.5 is the state-of-the-art open-source model in aesthetic quality
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
    type: "bool",
    default: false,
    description:
      "Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 3,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for img2img or inpaint mode"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted."
  })
  declare mask: any;

  @prop({
    type: "str",
    default: "ugly, deformed, noisy, blurry, distorted",
    description: "Negative Input prompt"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 25, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({
    type: "str",
    default:
      "Astronaut in a jungle, cold color palette, muted colors, detailed, 8k",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "enum",
    default: "DPMSolver++",
    values: [
      "DDIM",
      "DPMSolverMultistep",
      "HeunDiscrete",
      "K_EULER_ANCESTRAL",
      "K_EULER",
      "PNDM",
      "DPM++2MKarras",
      "DPMSolver++"
    ],
    description:
      "Scheduler. DPMSolver++ or DPM++2MKarras is recommended for most cases"
  })
  declare scheduler: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const applyWatermark = Boolean(this.apply_watermark ?? true);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const height = Number(this.height ?? 1024);
    const negativePrompt = String(
      this.negative_prompt ?? "ugly, deformed, noisy, blurry, distorted"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 25);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(
      this.prompt ??
        "Astronaut in a jungle, cold color palette, muted colors, detailed, 8k"
    );
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const scheduler = String(this.scheduler ?? "DPMSolver++");
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      apply_watermark: applyWatermark,
      disable_safety_checker: disableSafetyChecker,
      guidance_scale: guidanceScale,
      height: height,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      prompt_strength: promptStrength,
      scheduler: scheduler,
      seed: seed,
      width: width
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
      "playgroundai/playground-v2.5-1024px-aesthetic:a45f82a1382bed5c7aeb861dac7c7d191b0fdf74d8d57c4a0e6ed7d4d0bf7d24",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Proteus_V_02 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Proteus_V_02";
  static readonly title = "Proteus_ V_02";
  static readonly description = `Proteus v0.2 shows subtle yet significant improvements over Version 0.1. It demonstrates enhanced prompt understanding that surpasses MJ6, while also approaching its stylistic capabilities.
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
    type: "bool",
    default: false,
    description:
      "Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 7.5,
    description: "Scale for classifier-free guidance. Recommended 7-8"
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for img2img or inpaint mode"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted."
  })
  declare mask: any;

  @prop({
    type: "str",
    default: "worst quality, low quality",
    description: "Negative Input prompt"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 20,
    description:
      "Number of denoising steps. 20 to 35 steps for more detail, 20 steps for faster results."
  })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({
    type: "str",
    default:
      "black fluffy gorgeous dangerous cat animal creature, large orange eyes, big fluffy ears, piercing gaze, full moon, dark ambiance, best quality, extremely detailed",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "enum",
    default: "KarrasDPM",
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

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const applyWatermark = Boolean(this.apply_watermark ?? true);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const height = Number(this.height ?? 1024);
    const negativePrompt = String(
      this.negative_prompt ?? "worst quality, low quality"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 20);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(
      this.prompt ??
        "black fluffy gorgeous dangerous cat animal creature, large orange eyes, big fluffy ears, piercing gaze, full moon, dark ambiance, best quality, extremely detailed"
    );
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const scheduler = String(this.scheduler ?? "KarrasDPM");
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      apply_watermark: applyWatermark,
      disable_safety_checker: disableSafetyChecker,
      guidance_scale: guidanceScale,
      height: height,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      prompt_strength: promptStrength,
      scheduler: scheduler,
      seed: seed,
      width: width
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
      "datacte/proteus-v0.2:06775cd262843edbde5abab958abdbb65a0a6b58ca301c9fd78fa55c775fc019",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Proteus_V_03 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Proteus_V_03";
  static readonly title = "Proteus_ V_03";
  static readonly description = `ProteusV0.3: The Anime Update
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
    type: "bool",
    default: false,
    description:
      "Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "float",
    default: 7.5,
    description: "Scale for classifier-free guidance. Recommended 7-8"
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 1024,
    description: "Height of output image. Recommended 1024 or 1280"
  })
  declare height: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for img2img or inpaint mode"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted."
  })
  declare mask: any;

  @prop({
    type: "str",
    default: "worst quality, low quality",
    description: "Negative Input prompt"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 20,
    description:
      "Number of denoising steps. 20 to 60 steps for more detail, 20 steps for faster results."
  })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({
    type: "str",
    default:
      "Anime full body portrait of a swordsman holding his weapon in front of him. He is facing the camera with a fierce look on his face. Anime key visual (best quality, HD, ~+~aesthetic~+~:1.2)",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({
    type: "enum",
    default: "DPM++2MSDE",
    values: [
      "DDIM",
      "DPMSolverMultistep",
      "HeunDiscrete",
      "KarrasDPM",
      "K_EULER_ANCESTRAL",
      "K_EULER",
      "PNDM",
      "DPM++2MSDE"
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
    type: "int",
    default: 1024,
    description: "Width of output image. Recommended 1024 or 1280"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const applyWatermark = Boolean(this.apply_watermark ?? true);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const height = Number(this.height ?? 1024);
    const negativePrompt = String(
      this.negative_prompt ?? "worst quality, low quality"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 20);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(
      this.prompt ??
        "Anime full body portrait of a swordsman holding his weapon in front of him. He is facing the camera with a fierce look on his face. Anime key visual (best quality, HD, ~+~aesthetic~+~:1.2)"
    );
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const scheduler = String(this.scheduler ?? "DPM++2MSDE");
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      apply_watermark: applyWatermark,
      disable_safety_checker: disableSafetyChecker,
      guidance_scale: guidanceScale,
      height: height,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      prompt_strength: promptStrength,
      scheduler: scheduler,
      seed: seed,
      width: width
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
      "datacte/proteus-v0.3:b28b79d725c8548b173b6a19ff9bffd16b9b80df5b18b8dc5cb9e1ee471bfa48",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class StickerMaker extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.StickerMaker";
  static readonly title = "Sticker Maker";
  static readonly description = `Make stickers with AI. Generates graphics with transparent backgrounds.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "int", default: 1152 })
  declare height: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want in the image"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of images to generate"
  })
  declare number_of_images: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 90,
    description:
      "Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality."
  })
  declare output_quality: any;

  @prop({ type: "str", default: "a cute cat" })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Fix the random seed for reproducibility"
  })
  declare seed: any;

  @prop({ type: "int", default: 17 })
  declare steps: any;

  @prop({ type: "int", default: 1152 })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const height = Number(this.height ?? 1152);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numberOfImages = Number(this.number_of_images ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 90);
    const prompt = String(this.prompt ?? "a cute cat");
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 17);
    const width = Number(this.width ?? 1152);

    const args: Record<string, unknown> = {
      height: height,
      negative_prompt: negativePrompt,
      number_of_images: numberOfImages,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed,
      steps: steps,
      width: width
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fofr/sticker-maker:4acb778eb059772225ec213948f0660867b2e03f277448f18cf1800b96a65a1a",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class StyleTransfer extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.StyleTransfer";
  static readonly title = "Style Transfer";
  static readonly description = `Transfer the style of one image to another
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "int",
    default: 1024,
    description: "Height of the output image (ignored if structure image given)"
  })
  declare height: any;

  @prop({
    type: "enum",
    default: "fast",
    values: ["fast", "high-quality", "realistic", "cinematic", "animated"],
    description: "Model to use for the generation"
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want to see in your image"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of images to generate"
  })
  declare number_of_images: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality."
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "An astronaut riding a unicorn",
    description: "Prompt for the image"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Set a seed for reproducibility. Random by default."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0.65,
    description:
      "How much of the original image (and colors) to preserve (0 is all, 1 is none, 0.65 is a good balance)"
  })
  declare structure_denoising_strength: any;

  @prop({
    type: "float",
    default: 1,
    description: "Strength of the depth controlnet"
  })
  declare structure_depth_strength: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional image to copy structure from. Output images will use the same aspect ratio."
  })
  declare structure_image: any;

  @prop({
    type: "image",
    default: "",
    description: "Copy the style from this image"
  })
  declare style_image: any;

  @prop({
    type: "int",
    default: 1024,
    description: "Width of the output image (ignored if structure image given)"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const height = Number(this.height ?? 1024);
    const model = String(this.model ?? "fast");
    const negativePrompt = String(this.negative_prompt ?? "");
    const numberOfImages = Number(this.number_of_images ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "An astronaut riding a unicorn");
    const seed = Number(this.seed ?? -1);
    const structureDenoisingStrength = Number(
      this.structure_denoising_strength ?? 0.65
    );
    const structureDepthStrength = Number(this.structure_depth_strength ?? 1);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      height: height,
      model: model,
      negative_prompt: negativePrompt,
      number_of_images: numberOfImages,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed,
      structure_denoising_strength: structureDenoisingStrength,
      structure_depth_strength: structureDepthStrength,
      width: width
    };

    const structureImageRef = this.structure_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(structureImageRef)) {
      const structureImageUrl = await assetToUrl(structureImageRef!, apiKey);
      if (structureImageUrl) args["structure_image"] = structureImageUrl;
    }

    const styleImageRef = this.style_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(styleImageRef)) {
      const styleImageUrl = await assetToUrl(styleImageRef!, apiKey);
      if (styleImageUrl) args["style_image"] = styleImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fofr/style-transfer:f1023890703bc0a5a3a2c21b5e498833be5f6ef6e70e9daf6b9b3a4fd8309cf0",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Illusions extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Illusions";
  static readonly title = "Illusions";
  static readonly description = `Create illusions with img2img and masking support
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Control image" })
  declare control_image: any;

  @prop({
    type: "float",
    default: 0.75,
    description: "How strong the controlnet conditioning is"
  })
  declare controlnet_conditioning_scale: any;

  @prop({
    type: "float",
    default: 1,
    description: "When controlnet conditioning ends"
  })
  declare controlnet_end: any;

  @prop({
    type: "float",
    default: 0,
    description: "When controlnet conditioning starts"
  })
  declare controlnet_start: any;

  @prop({
    type: "float",
    default: 7.5,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 768 })
  declare height: any;

  @prop({ type: "image", default: "", description: "Optional img2img" })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description: "Optional mask for inpainting"
  })
  declare mask_image: any;

  @prop({
    type: "str",
    default: "ugly, disfigured, low quality, blurry, nsfw",
    description: "The negative prompt to guide image generation."
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 40, description: "Number of diffusion steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of outputs" })
  declare num_outputs: any;

  @prop({ type: "str", default: "a painting of a 19th century town" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image"
  })
  declare prompt_strength: any;

  @prop({ type: "int", default: 0 })
  declare seed: any;

  @prop({
    type: "enum",
    default: "width/height",
    values: ["width/height", "input_image", "control_image"],
    description:
      "Decide how to resize images – use width/height, resize based on input image or control image"
  })
  declare sizing_strategy: any;

  @prop({ type: "int", default: 768 })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const controlnetConditioningScale = Number(
      this.controlnet_conditioning_scale ?? 0.75
    );
    const controlnetEnd = Number(this.controlnet_end ?? 1);
    const controlnetStart = Number(this.controlnet_start ?? 0);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const height = Number(this.height ?? 768);
    const negativePrompt = String(
      this.negative_prompt ?? "ugly, disfigured, low quality, blurry, nsfw"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(this.prompt ?? "a painting of a 19th century town");
    const promptStrength = Number(this.prompt_strength ?? 0.8);
    const seed = Number(this.seed ?? 0);
    const sizingStrategy = String(this.sizing_strategy ?? "width/height");
    const width = Number(this.width ?? 768);

    const args: Record<string, unknown> = {
      controlnet_conditioning_scale: controlnetConditioningScale,
      controlnet_end: controlnetEnd,
      controlnet_start: controlnetStart,
      guidance_scale: guidanceScale,
      height: height,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      prompt_strength: promptStrength,
      seed: seed,
      sizing_strategy: sizingStrategy,
      width: width
    };

    const controlImageRef = this.control_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(controlImageRef)) {
      const controlImageUrl = await assetToUrl(controlImageRef!, apiKey);
      if (controlImageUrl) args["control_image"] = controlImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const maskImageRef = this.mask_image as Record<string, unknown> | undefined;
    if (isRefSet(maskImageRef)) {
      const maskImageUrl = await assetToUrl(maskImageRef!, apiKey);
      if (maskImageUrl) args["mask_image"] = maskImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fofr/illusions:579b32db82b24584c3c6155fe3ae12e8fce50ba28b575c23e8a1f5f3a5e99ed8",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_V2 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Ideogram_V2";
  static readonly title = "Ideogram_ V2";
  static readonly description = `An excellent image model with state of the art inpainting, prompt comprehension and text rendering
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:10",
      "10:16",
      "3:1",
      "1:3"
    ],
    description:
      "Aspect ratio. Ignored if a resolution or inpainting image is given."
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An image file to use for inpainting. You must also use a mask."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: ["Auto", "On", "Off"],
    description:
      "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages."
  })
  declare magic_prompt_option: any;

  @prop({
    type: "image",
    default: "",
    description:
      "A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size."
  })
  declare mask: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want to see in the generated image."
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "512x1536",
      "576x1408",
      "576x1472",
      "576x1536",
      "640x1344",
      "640x1408",
      "640x1472",
      "640x1536",
      "704x1152",
      "704x1216",
      "704x1280",
      "704x1344",
      "704x1408",
      "704x1472",
      "736x1312",
      "768x1088",
      "768x1216",
      "768x1280",
      "768x1344",
      "832x960",
      "832x1024",
      "832x1088",
      "832x1152",
      "832x1216",
      "832x1248",
      "864x1152",
      "896x960",
      "896x1024",
      "896x1088",
      "896x1120",
      "896x1152",
      "960x832",
      "960x896",
      "960x1024",
      "960x1088",
      "1024x832",
      "1024x896",
      "1024x960",
      "1024x1024",
      "1088x768",
      "1088x832",
      "1088x896",
      "1088x960",
      "1120x896",
      "1152x704",
      "1152x832",
      "1152x864",
      "1152x896",
      "1216x704",
      "1216x768",
      "1216x832",
      "1248x832",
      "1280x704",
      "1280x768",
      "1280x800",
      "1312x736",
      "1344x640",
      "1344x704",
      "1344x768",
      "1408x576",
      "1408x640",
      "1408x704",
      "1472x576",
      "1472x640",
      "1472x704",
      "1536x512",
      "1536x576",
      "1536x640"
    ],
    description:
      "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Auto",
      "General",
      "Realistic",
      "Design",
      "Render 3D",
      "Anime"
    ],
    description:
      "The styles help define the specific aesthetic of the image you want to generate."
  })
  declare style_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const magicPromptOption = String(this.magic_prompt_option ?? "Auto");
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "None");
    const seed = Number(this.seed ?? -1);
    const styleType = String(this.style_type ?? "None");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      magic_prompt_option: magicPromptOption,
      negative_prompt: negativePrompt,
      prompt: prompt,
      resolution: resolution,
      seed: seed,
      style_type: styleType
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
      "ideogram-ai/ideogram-v2:3e6071946ab5319b3bcc37a4d00083e743dfdff5be386df6a2ff1f212fc7365b",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_V2_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Ideogram_V2_Turbo";
  static readonly title = "Ideogram_ V2_ Turbo";
  static readonly description = `A fast image model with state of the art inpainting, prompt comprehension and text rendering.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:10",
      "10:16",
      "3:1",
      "1:3"
    ],
    description:
      "Aspect ratio. Ignored if a resolution or inpainting image is given."
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An image file to use for inpainting. You must also use a mask."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: ["Auto", "On", "Off"],
    description:
      "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages."
  })
  declare magic_prompt_option: any;

  @prop({
    type: "image",
    default: "",
    description:
      "A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size."
  })
  declare mask: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want to see in the generated image."
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "512x1536",
      "576x1408",
      "576x1472",
      "576x1536",
      "640x1344",
      "640x1408",
      "640x1472",
      "640x1536",
      "704x1152",
      "704x1216",
      "704x1280",
      "704x1344",
      "704x1408",
      "704x1472",
      "736x1312",
      "768x1088",
      "768x1216",
      "768x1280",
      "768x1344",
      "832x960",
      "832x1024",
      "832x1088",
      "832x1152",
      "832x1216",
      "832x1248",
      "864x1152",
      "896x960",
      "896x1024",
      "896x1088",
      "896x1120",
      "896x1152",
      "960x832",
      "960x896",
      "960x1024",
      "960x1088",
      "1024x832",
      "1024x896",
      "1024x960",
      "1024x1024",
      "1088x768",
      "1088x832",
      "1088x896",
      "1088x960",
      "1120x896",
      "1152x704",
      "1152x832",
      "1152x864",
      "1152x896",
      "1216x704",
      "1216x768",
      "1216x832",
      "1248x832",
      "1280x704",
      "1280x768",
      "1280x800",
      "1312x736",
      "1344x640",
      "1344x704",
      "1344x768",
      "1408x576",
      "1408x640",
      "1408x704",
      "1472x576",
      "1472x640",
      "1472x704",
      "1536x512",
      "1536x576",
      "1536x640"
    ],
    description:
      "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Auto",
      "General",
      "Realistic",
      "Design",
      "Render 3D",
      "Anime"
    ],
    description:
      "The styles help define the specific aesthetic of the image you want to generate."
  })
  declare style_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const magicPromptOption = String(this.magic_prompt_option ?? "Auto");
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "None");
    const seed = Number(this.seed ?? -1);
    const styleType = String(this.style_type ?? "None");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      magic_prompt_option: magicPromptOption,
      negative_prompt: negativePrompt,
      prompt: prompt,
      resolution: resolution,
      seed: seed,
      style_type: styleType
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
      "ideogram-ai/ideogram-v2-turbo:7cef9d520d672bb802588ad0d13151bc51aee9a408c270aebf25d6530045dd29",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_V2A extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Ideogram_V2A";
  static readonly title = "Ideogram_ V2 A";
  static readonly description = `Like Ideogram v2, but faster and cheaper
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:10",
      "10:16",
      "3:1",
      "1:3"
    ],
    description:
      "Aspect ratio. Ignored if a resolution or inpainting image is given."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: ["Auto", "On", "Off"],
    description:
      "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages."
  })
  declare magic_prompt_option: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "512x1536",
      "576x1408",
      "576x1472",
      "576x1536",
      "640x1344",
      "640x1408",
      "640x1472",
      "640x1536",
      "704x1152",
      "704x1216",
      "704x1280",
      "704x1344",
      "704x1408",
      "704x1472",
      "736x1312",
      "768x1088",
      "768x1216",
      "768x1280",
      "768x1344",
      "832x960",
      "832x1024",
      "832x1088",
      "832x1152",
      "832x1216",
      "832x1248",
      "864x1152",
      "896x960",
      "896x1024",
      "896x1088",
      "896x1120",
      "896x1152",
      "960x832",
      "960x896",
      "960x1024",
      "960x1088",
      "1024x832",
      "1024x896",
      "1024x960",
      "1024x1024",
      "1088x768",
      "1088x832",
      "1088x896",
      "1088x960",
      "1120x896",
      "1152x704",
      "1152x832",
      "1152x864",
      "1152x896",
      "1216x704",
      "1216x768",
      "1216x832",
      "1248x832",
      "1280x704",
      "1280x768",
      "1280x800",
      "1312x736",
      "1344x640",
      "1344x704",
      "1344x768",
      "1408x576",
      "1408x640",
      "1408x704",
      "1472x576",
      "1472x640",
      "1472x704",
      "1536x512",
      "1536x576",
      "1536x640"
    ],
    description:
      "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Auto",
      "General",
      "Realistic",
      "Design",
      "Render 3D",
      "Anime"
    ],
    description:
      "The styles help define the specific aesthetic of the image you want to generate."
  })
  declare style_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const magicPromptOption = String(this.magic_prompt_option ?? "Auto");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "None");
    const seed = Number(this.seed ?? -1);
    const styleType = String(this.style_type ?? "None");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      magic_prompt_option: magicPromptOption,
      prompt: prompt,
      resolution: resolution,
      seed: seed,
      style_type: styleType
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "ideogram-ai/ideogram-v2a:8b85e4363b03c25f1d248d0f7e3e118503f2b33773a51bab414603bd52f6112d",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Imagen_3 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Imagen_3";
  static readonly title = "Imagen_3";
  static readonly description = `Google's highest quality text-to-image model, capable of generating images with detail, rich lighting and beauty
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

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
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "block_only_high",
    values: [
      "block_low_and_above",
      "block_medium_and_above",
      "block_only_high"
    ],
    description:
      "block_low_and_above is strictest, block_medium_and_above blocks some prompts, block_only_high is most permissive but some prompts will still be blocked"
  })
  declare safety_filter_level: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const outputFormat = String(this.output_format ?? "jpg");
    const prompt = String(this.prompt ?? "");
    const safetyFilterLevel = String(
      this.safety_filter_level ?? "block_only_high"
    );

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      prompt: prompt,
      safety_filter_level: safetyFilterLevel
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/imagen-3:dd38058a6e74c700dcd05db62896386817f3af627bbe71f869f9a43f02773fd4",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Qwen_Image extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Qwen_Image";
  static readonly title = "Qwen_ Image";
  static readonly description = `An image generation foundation model in the Qwen series that achieves significant advances in complex text rendering.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enhance the prompt with positive magic."
  })
  declare enhance_prompt: any;

  @prop({
    type: "list[float]",
    default: [],
    description:
      "Scales for additional LoRAs as an array of numbers (e.g., [0.5, 0.7]). Must match the number of weights in extra_lora_weights."
  })
  declare extra_lora_scale: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "Additional LoRA weights as an array of URLs. Same formats supported as lora_weights (e.g., ['https://huggingface.co/flymy-ai/qwen-image-lora/resolve/main/pytorch_lora_weights.safetensors', 'https://huggingface.co/flymy-ai/qwen-image-realism-lora/resolve/main/flymy_realism.safetensors'])"
  })
  declare extra_lora_weights: any;

  @prop({
    type: "bool",
    default: true,
    description: "Run faster predictions with additional optimizations."
  })
  declare go_fast: any;

  @prop({
    type: "float",
    default: 3,
    description:
      "Guidance for generated image. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5"
  })
  declare guidance: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for img2img pipeline"
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "optimize_for_quality",
    values: ["optimize_for_quality", "optimize_for_speed"],
    description: "Image size for the generated image"
  })
  declare image_size: any;

  @prop({
    type: "float",
    default: 1,
    description: "Determines how strongly the main LoRA should be applied."
  })
  declare lora_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Only works with text to image pipeline. Supports arbitrary .safetensors URLs, tar files, and zip files from the Internet (for example, 'https://huggingface.co/flymy-ai/qwen-image-lora/resolve/main/pytorch_lora_weights.safetensors', 'https://example.com/lora_weights.tar.gz', or 'https://example.com/lora_weights.zip')"
  })
  declare lora_weights: any;

  @prop({
    type: "str",
    default: " ",
    description: "Negative prompt for generated image"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 30,
    description:
      "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster."
  })
  declare num_inference_steps: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Prompt for generated image" })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights from Replicate training. Only works with text to image pipeline. Supports arbitrary .safetensors URLs, tar files, and zip files from the Internet."
  })
  declare replicate_weights: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0.9,
    description: "Strength for img2img pipeline"
  })
  declare strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const enhancePrompt = Boolean(this.enhance_prompt ?? false);
    const extraLoraScale = String(this.extra_lora_scale ?? []);
    const extraLoraWeights = String(this.extra_lora_weights ?? []);
    const goFast = Boolean(this.go_fast ?? true);
    const guidance = Number(this.guidance ?? 3);
    const imageSize = String(this.image_size ?? "optimize_for_quality");
    const loraScale = Number(this.lora_scale ?? 1);
    const loraWeights = String(this.lora_weights ?? "");
    const negativePrompt = String(this.negative_prompt ?? " ");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const replicateWeights = String(this.replicate_weights ?? "");
    const seed = Number(this.seed ?? -1);
    const strength = Number(this.strength ?? 0.9);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      enhance_prompt: enhancePrompt,
      extra_lora_scale: extraLoraScale,
      extra_lora_weights: extraLoraWeights,
      go_fast: goFast,
      guidance: guidance,
      image_size: imageSize,
      lora_scale: loraScale,
      lora_weights: loraWeights,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      replicate_weights: replicateWeights,
      seed: seed,
      strength: strength
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "qwen/qwen-image:0bba9e70f78437359725e0989ead45ca8b09e6c12a070dfe9a09e6856b43a44d",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Qwen_Image_Edit extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Qwen_Image_Edit";
  static readonly title = "Qwen_ Image_ Edit";
  static readonly description = `Edit images using a prompt. This model extends Qwen-Image’s unique text rendering capabilities to image editing tasks, enabling precise text editing
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "match_input_image",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4", "match_input_image"],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "bool",
    default: true,
    description: "Run faster predictions with additional optimizations."
  })
  declare go_fast: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use as reference. Must be jpeg, png, gif, or webp."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 95,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description: "Text instruction on how to edit the given image."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const goFast = Boolean(this.go_fast ?? true);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 95);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      go_fast: goFast,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "qwen/qwen-image-edit:a072e0d160ef0501120a390f602404655e467a6f591f6574f5742df0b67cbba7",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Seedream_4 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Seedream_4";
  static readonly title = "Seedream_4";
  static readonly description = `Unified text-to-image generation and precise single-sentence editing at up to 4K resolution
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
      "4:3",
      "3:4",
      "16:9",
      "9:16",
      "3:2",
      "2:3",
      "21:9"
    ],
    description:
      "Image aspect ratio. Only used when size is not 'custom'. Use 'match_input_image' to automatically match the input image's aspect ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Enable prompt enhancement for higher quality results, this will take longer to generate."
  })
  declare enhance_prompt: any;

  @prop({
    type: "int",
    default: 2048,
    description:
      "Custom image height (only used when size='custom'). Range: 1024-4096 pixels."
  })
  declare height: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Input image(s) for image-to-image generation. List of 1-10 images for single or multi-reference generation."
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Maximum number of images to generate when sequential_image_generation='auto'. Range: 1-15. Total images (input + generated) cannot exceed 15."
  })
  declare max_images: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "disabled",
    values: ["disabled", "auto"],
    description:
      "Group image generation mode. 'disabled' generates a single image. 'auto' lets the model decide whether to generate multiple related images (e.g., story scenes, character variations)."
  })
  declare sequential_image_generation: any;

  @prop({
    type: "enum",
    default: "2K",
    values: ["1K", "2K", "4K", "custom"],
    description:
      "Image resolution: 1K (1024px), 2K (2048px), 4K (4096px), or 'custom' for specific dimensions."
  })
  declare size: any;

  @prop({
    type: "int",
    default: 2048,
    description:
      "Custom image width (only used when size='custom'). Range: 1024-4096 pixels."
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const enhancePrompt = Boolean(this.enhance_prompt ?? true);
    const height = Number(this.height ?? 2048);
    const maxImages = Number(this.max_images ?? 1);
    const prompt = String(this.prompt ?? "");
    const sequentialImageGeneration = String(
      this.sequential_image_generation ?? "disabled"
    );
    const size = String(this.size ?? "2K");
    const width = Number(this.width ?? 2048);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      enhance_prompt: enhancePrompt,
      height: height,
      max_images: maxImages,
      prompt: prompt,
      sequential_image_generation: sequentialImageGeneration,
      size: size,
      width: width
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
      "bytedance/seedream-4:cf7d431991436f19d1c8dad83fe463c729c816d7a21056c5105e75c84a0aa7e9",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Minimax_Image_01 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Minimax_Image_01";
  static readonly title = "Minimax_ Image_01";
  static readonly description = `Minimax's first image model, with character reference support
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"],
    description: "Image aspect ratio"
  })
  declare aspect_ratio: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of images to generate"
  })
  declare number_of_images: any;

  @prop({ type: "str", default: "", description: "Text prompt for generation" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Use prompt optimizer" })
  declare prompt_optimizer: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional character reference image (human face) to use as the subject in the generated image(s)."
  })
  declare subject_reference: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const numberOfImages = Number(this.number_of_images ?? 1);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      number_of_images: numberOfImages,
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };

    const subjectReferenceRef = this.subject_reference as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(subjectReferenceRef)) {
      const subjectReferenceUrl = await assetToUrl(
        subjectReferenceRef!,
        apiKey
      );
      if (subjectReferenceUrl) args["subject_reference"] = subjectReferenceUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/image-01:928f3bd6ac899108d0ab8cf7f91dfa39a03eda0175e94c9b4cd075776dececf0",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_2_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_2_Pro";
  static readonly title = "Flux_2_ Pro";
  static readonly description = `High-quality image generation and editing with support for eight reference images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "match_input_image",
      "custom",
      "1:1",
      "16:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "9:16",
      "3:4",
      "4:3"
    ],
    description:
      "Aspect ratio for the generated image. Use 'match_input_image' to match the first input image's aspect ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Height of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 16 (if it's not, it will be rounded to nearest multiple of 16)."
  })
  declare height: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "List of input images for image-to-image generation. Maximum 8 images. Must be jpeg, png, gif, or webp."
  })
  declare input_images: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images."
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1 MP",
    values: ["match_input_image", "0.5 MP", "1 MP", "2 MP", "4 MP"],
    description:
      "Resolution in megapixels. Up to 4 MP is possible, but 2 MP or below is recommended. The maximum image size is 2048x2048, which means that high-resolution images may not respect the resolution if aspect ratio is not 1:1.\n\nResolution is not used when aspect_ratio is 'custom'. When aspect_ratio is 'match_input_image', use 'match_input_image' to match the input image's resolution (clamped to 0.5-4 MP)."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: 2,
    description: "Safety tolerance, 1 is most strict and 5 is most permissive"
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Width of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 16 (if it's not, it will be rounded to nearest multiple of 16)."
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const height = Number(this.height ?? 0);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1 MP");
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 0);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      height: height,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      resolution: resolution,
      safety_tolerance: safetyTolerance,
      seed: seed,
      width: width
    };

    const inputImagesRef = this.input_images as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImagesRef)) {
      const inputImagesUrl = await assetToUrl(inputImagesRef!, apiKey);
      if (inputImagesUrl) args["input_images"] = inputImagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-2-pro:00b07c32e314ceb5152c1d08e73400e6a61d7d22ba60a405fc76314fc807910c",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_2_Flex extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_2_Flex";
  static readonly title = "Flux_2_ Flex";
  static readonly description = `Max-quality image generation and editing with support for ten reference images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "match_input_image",
      "custom",
      "1:1",
      "16:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "9:16",
      "3:4",
      "4:3"
    ],
    description:
      "Aspect ratio for the generated image. Use 'match_input_image' to match the first input image's aspect ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 4.5,
    description:
      "Guidance scale for generation. Controls how closely the output follows the prompt"
  })
  declare guidance: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Height of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)."
  })
  declare height: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "List of input images for image-to-image generation. Maximum 10 images. Must be jpeg, png, gif, or webp."
  })
  declare input_images: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images."
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: true,
    description: "Automatically modify the prompt for more creative generation"
  })
  declare prompt_upsampling: any;

  @prop({
    type: "enum",
    default: "1 MP",
    values: ["match_input_image", "0.5 MP", "1 MP", "2 MP", "4 MP"],
    description:
      "Resolution in megapixels. Up to 4 MP is possible, but 2 MP or below is recommended. The maximum image size is 2048x2048, which means that high-resolution images may not respect the resolution if aspect ratio is not 1:1.\n\nResolution is not used when aspect_ratio is 'custom'. When aspect_ratio is 'match_input_image', use 'match_input_image' to match the input image's resolution (clamped to 0.5-4 MP)."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: 2,
    description: "Safety tolerance, 1 is most strict and 5 is most permissive"
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({ type: "int", default: 30, description: "Number of inference steps" })
  declare steps: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Width of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)."
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const guidance = Number(this.guidance ?? 4.5);
    const height = Number(this.height ?? 0);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const promptUpsampling = Boolean(this.prompt_upsampling ?? true);
    const resolution = String(this.resolution ?? "1 MP");
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 30);
    const width = Number(this.width ?? 0);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      guidance: guidance,
      height: height,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      prompt_upsampling: promptUpsampling,
      resolution: resolution,
      safety_tolerance: safetyTolerance,
      seed: seed,
      steps: steps,
      width: width
    };

    const inputImagesRef = this.input_images as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImagesRef)) {
      const inputImagesUrl = await assetToUrl(inputImagesRef!, apiKey);
      if (inputImagesUrl) args["input_images"] = inputImagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-2-flex:4139a7655e86b5d2f51450b52491369ec5b1250ff9af033f5de28cd121c24906",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class GPT_Image_1_5 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.GPT_Image_1_5";
  static readonly title = "G P T_ Image_1_5";
  static readonly description = `OpenAI's latest image generation model with better instruction following and adherence to prompts
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "3:2", "2:3"],
    description: "The aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "transparent", "opaque"],
    description:
      "Set whether the background is transparent or opaque or choose automatically"
  })
  declare background: any;

  @prop({
    type: "enum",
    default: "low",
    values: ["low", "high"],
    description:
      "Control how much effort the model will exert to match the style and features, especially facial features, of input images"
  })
  declare input_fidelity: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "A list of images to use as input for the generation"
  })
  declare input_images: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["auto", "low"],
    description: "Content moderation level"
  })
  declare moderation: any;

  @prop({
    type: "int",
    default: 1,
    description: "Number of images to generate (1-10)"
  })
  declare number_of_images: any;

  @prop({
    type: "str",
    default: "",
    description: "Your OpenAI API key (optional - uses proxy if not provided)"
  })
  declare openai_api_key: any;

  @prop({ type: "int", default: 90, description: "Compression level (0-100%)" })
  declare output_compression: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["png", "jpeg", "webp"],
    description: "Output format"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "A text description of the desired image"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["low", "medium", "high", "auto"],
    description: "The quality of the generated image"
  })
  declare quality: any;

  @prop({
    type: "str",
    default: "",
    description:
      "An optional unique identifier representing your end-user. This helps OpenAI monitor and detect abuse."
  })
  declare user_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const background = String(this.background ?? "auto");
    const inputFidelity = String(this.input_fidelity ?? "low");
    const moderation = String(this.moderation ?? "auto");
    const numberOfImages = Number(this.number_of_images ?? 1);
    const openaiApiKey = String(this.openai_api_key ?? "");
    const outputCompression = Number(this.output_compression ?? 90);
    const outputFormat = String(this.output_format ?? "webp");
    const prompt = String(this.prompt ?? "");
    const quality = String(this.quality ?? "auto");
    const userId = String(this.user_id ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      background: background,
      input_fidelity: inputFidelity,
      moderation: moderation,
      number_of_images: numberOfImages,
      openai_api_key: openaiApiKey,
      output_compression: outputCompression,
      output_format: outputFormat,
      prompt: prompt,
      quality: quality,
      user_id: userId
    };

    const inputImagesRef = this.input_images as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImagesRef)) {
      const inputImagesUrl = await assetToUrl(inputImagesRef!, apiKey);
      if (inputImagesUrl) args["input_images"] = inputImagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-image-1.5:118f53498ea7319519229b2d5bd0d4a69e3d77eb60d6292d5db38125534dc1ca",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_2_Max extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_2_Max";
  static readonly title = "Flux_2_ Max";
  static readonly description = `The highest fidelity image model from Black Forest Labs
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "match_input_image",
      "custom",
      "1:1",
      "16:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "9:16",
      "3:4",
      "4:3"
    ],
    description:
      "Aspect ratio for the generated image. Use 'match_input_image' to match the first input image's aspect ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Height of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)."
  })
  declare height: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "List of input images for image-to-image generation. Maximum 8 images. Must be jpeg, png, gif, or webp."
  })
  declare input_images: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images."
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1 MP",
    values: ["match_input_image", "0.5 MP", "1 MP", "2 MP", "4 MP"],
    description:
      "Resolution in megapixels. Up to 4 MP is possible, but 2 MP or below is recommended. The maximum image size is 2048x2048, which means that high-resolution images may not respect the resolution if aspect ratio is not 1:1.\n\nResolution is not used when aspect_ratio is 'custom'. When aspect_ratio is 'match_input_image', use 'match_input_image' to match the input image's resolution (clamped to 0.5-4 MP)."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: 2,
    description: "Safety tolerance, 1 is most strict and 5 is most permissive"
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Width of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)."
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const height = Number(this.height ?? 0);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1 MP");
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 0);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      height: height,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      resolution: resolution,
      safety_tolerance: safetyTolerance,
      seed: seed,
      width: width
    };

    const inputImagesRef = this.input_images as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImagesRef)) {
      const inputImagesUrl = await assetToUrl(inputImagesRef!, apiKey);
      if (inputImagesUrl) args["input_images"] = inputImagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-2-max:c9a020854ba37d5fe801ab712570d7e437b17c148843fe96dbcb7cadd160a8f7",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Imagen_4_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Imagen_4_Fast";
  static readonly title = "Imagen_4_ Fast";
  static readonly description = `Use this fast version of Imagen 4 when speed and cost are more important than quality
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

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
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "block_only_high",
    values: [
      "block_low_and_above",
      "block_medium_and_above",
      "block_only_high"
    ],
    description:
      "block_low_and_above is strictest, block_medium_and_above blocks some prompts, block_only_high is most permissive but some prompts will still be blocked"
  })
  declare safety_filter_level: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const outputFormat = String(this.output_format ?? "jpg");
    const prompt = String(this.prompt ?? "");
    const safetyFilterLevel = String(
      this.safety_filter_level ?? "block_only_high"
    );

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      prompt: prompt,
      safety_filter_level: safetyFilterLevel
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/imagen-4-fast:f677c74739e4502130a6db1d02798e99ca80c27810e263a012535e69e1f56b74",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_V3_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Ideogram_V3_Turbo";
  static readonly title = "Ideogram_ V3_ Turbo";
  static readonly description = `Turbo is the fastest and cheapest Ideogram v3. v3 creates images with stunning realism, creative designs, and consistent styles
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:3",
      "3:1",
      "1:2",
      "2:1",
      "9:16",
      "16:9",
      "10:16",
      "16:10",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "1:1"
    ],
    description:
      "Aspect ratio. Ignored if a resolution or inpainting image is given."
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An image file to use for inpainting. You must also use a mask."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: ["Auto", "On", "Off"],
    description:
      "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages."
  })
  declare magic_prompt_option: any;

  @prop({
    type: "image",
    default: "",
    description:
      "A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size."
  })
  declare mask: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "512x1536",
      "576x1408",
      "576x1472",
      "576x1536",
      "640x1344",
      "640x1408",
      "640x1472",
      "640x1536",
      "704x1152",
      "704x1216",
      "704x1280",
      "704x1344",
      "704x1408",
      "704x1472",
      "736x1312",
      "768x1088",
      "768x1216",
      "768x1280",
      "768x1344",
      "800x1280",
      "832x960",
      "832x1024",
      "832x1088",
      "832x1152",
      "832x1216",
      "832x1248",
      "864x1152",
      "896x960",
      "896x1024",
      "896x1088",
      "896x1120",
      "896x1152",
      "960x832",
      "960x896",
      "960x1024",
      "960x1088",
      "1024x832",
      "1024x896",
      "1024x960",
      "1024x1024",
      "1088x768",
      "1088x832",
      "1088x896",
      "1088x960",
      "1120x896",
      "1152x704",
      "1152x832",
      "1152x864",
      "1152x896",
      "1216x704",
      "1216x768",
      "1216x832",
      "1248x832",
      "1280x704",
      "1280x768",
      "1280x800",
      "1312x736",
      "1344x640",
      "1344x704",
      "1344x768",
      "1408x576",
      "1408x640",
      "1408x704",
      "1472x576",
      "1472x640",
      "1472x704",
      "1536x512",
      "1536x576",
      "1536x640"
    ],
    description:
      "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "80s Illustration",
      "90s Nostalgia",
      "Abstract Organic",
      "Analog Nostalgia",
      "Art Brut",
      "Art Deco",
      "Art Poster",
      "Aura",
      "Avant Garde",
      "Bauhaus",
      "Blueprint",
      "Blurry Motion",
      "Bright Art",
      "C4D Cartoon",
      "Children's Book",
      "Collage",
      "Coloring Book I",
      "Coloring Book II",
      "Cubism",
      "Dark Aura",
      "Doodle",
      "Double Exposure",
      "Dramatic Cinema",
      "Editorial",
      "Emotional Minimal",
      "Ethereal Party",
      "Expired Film",
      "Flat Art",
      "Flat Vector",
      "Forest Reverie",
      "Geo Minimalist",
      "Glass Prism",
      "Golden Hour",
      "Graffiti I",
      "Graffiti II",
      "Halftone Print",
      "High Contrast",
      "Hippie Era",
      "Iconic",
      "Japandi Fusion",
      "Jazzy",
      "Long Exposure",
      "Magazine Editorial",
      "Minimal Illustration",
      "Mixed Media",
      "Monochrome",
      "Nightlife",
      "Oil Painting",
      "Old Cartoons",
      "Paint Gesture",
      "Pop Art",
      "Retro Etching",
      "Riviera Pop",
      "Spotlight 80s",
      "Stylized Red",
      "Surreal Collage",
      "Travel Poster",
      "Vintage Geo",
      "Vintage Poster",
      "Watercolor",
      "Weird",
      "Woodblock Print"
    ],
    description:
      "Apply a predefined artistic style to the generated image (V3 models only)."
  })
  declare style_preset: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "A list of images to use as style references."
  })
  declare style_reference_images: any;

  @prop({
    type: "enum",
    default: "None",
    values: ["None", "Auto", "General", "Realistic", "Design"],
    description:
      "The styles help define the specific aesthetic of the image you want to generate."
  })
  declare style_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const magicPromptOption = String(this.magic_prompt_option ?? "Auto");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "None");
    const seed = Number(this.seed ?? -1);
    const stylePreset = String(this.style_preset ?? "None");
    const styleType = String(this.style_type ?? "None");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      magic_prompt_option: magicPromptOption,
      prompt: prompt,
      resolution: resolution,
      seed: seed,
      style_preset: stylePreset,
      style_type: styleType
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

    const styleReferenceImagesRef = this.style_reference_images as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(styleReferenceImagesRef)) {
      const styleReferenceImagesUrl = await assetToUrl(
        styleReferenceImagesRef!,
        apiKey
      );
      if (styleReferenceImagesUrl)
        args["style_reference_images"] = styleReferenceImagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "ideogram-ai/ideogram-v3-turbo:d9b3748f95c0fe3e71f010f8cc5d80e8f5252acd0e74b1c294ee889eea52a47b",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Kontext_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Kontext_Pro";
  static readonly title = "Flux_ Kontext_ Pro";
  static readonly description = `A state-of-the-art text-based image editing model that delivers high-quality outputs with excellent prompt following and consistent results for transforming images through natural language
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
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "21:9",
      "9:21",
      "2:1",
      "1:2"
    ],
    description:
      "Aspect ratio of the generated image. Use 'match_input_image' to match the aspect ratio of the input image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use as reference. Must be jpeg, png, gif, or webp."
  })
  declare input_image: any;

  @prop({
    type: "enum",
    default: "png",
    values: ["jpg", "png"],
    description: "Output format for the generated image"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text description of what you want to generate, or the instruction on how to edit the given image."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Automatic prompt improvement"
  })
  declare prompt_upsampling: any;

  @prop({
    type: "int",
    default: 2,
    description:
      "Safety tolerance, 0 is most strict and 6 is most permissive. 2 is currently the maximum allowed when input images are used."
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const outputFormat = String(this.output_format ?? "png");
    const prompt = String(this.prompt ?? "");
    const promptUpsampling = Boolean(this.prompt_upsampling ?? false);
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      prompt: prompt,
      prompt_upsampling: promptUpsampling,
      safety_tolerance: safetyTolerance,
      seed: seed
    };

    const inputImageRef = this.input_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await assetToUrl(inputImageRef!, apiKey);
      if (inputImageUrl) args["input_image"] = inputImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-kontext-pro:897a70f5a7dbd8a0611413b3b98cf417b45f266bd595c571a22947619d9ae462",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Seedream_4_5 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Seedream_4_5";
  static readonly title = "Seedream_4_5";
  static readonly description = `Seedream 4.5: Upgraded Bytedance image model with stronger spatial understanding and world knowledge
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
      "4:3",
      "3:4",
      "16:9",
      "9:16",
      "3:2",
      "2:3",
      "21:9"
    ],
    description:
      "Image aspect ratio. Only used when size is not 'custom'. Use 'match_input_image' to automatically match the input image's aspect ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "int",
    default: 2048,
    description:
      "Custom image height (only used when size='custom'). Range: 1024-4096 pixels."
  })
  declare height: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Input image(s) for image-to-image generation. List of 1-14 images for single or multi-reference generation."
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Maximum number of images to generate when sequential_image_generation='auto'. Range: 1-15. Total images (input + generated) cannot exceed 15."
  })
  declare max_images: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "disabled",
    values: ["disabled", "auto"],
    description:
      "Group image generation mode. 'disabled' generates a single image. 'auto' lets the model decide whether to generate multiple related images (e.g., story scenes, character variations)."
  })
  declare sequential_image_generation: any;

  @prop({
    type: "enum",
    default: "2K",
    values: ["2K", "4K", "custom"],
    description:
      "Image resolution: 2K (2048px), 4K (4096px), or 'custom' for specific dimensions. Note: 1K resolution is not supported in Seedream 4.5."
  })
  declare size: any;

  @prop({
    type: "int",
    default: 2048,
    description:
      "Custom image width (only used when size='custom'). Range: 1024-4096 pixels."
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const height = Number(this.height ?? 2048);
    const maxImages = Number(this.max_images ?? 1);
    const prompt = String(this.prompt ?? "");
    const sequentialImageGeneration = String(
      this.sequential_image_generation ?? "disabled"
    );
    const size = String(this.size ?? "2K");
    const width = Number(this.width ?? 2048);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      height: height,
      max_images: maxImages,
      prompt: prompt,
      sequential_image_generation: sequentialImageGeneration,
      size: size,
      width: width
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
      "bytedance/seedream-4.5:8356ab00a2acd0f79338ecf1ffa0e32493c6f7cdfc7178b5cfbdb1461202fdc2",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Seedream_5_Lite extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Seedream_5_Lite";
  static readonly title = "Seedream_5_ Lite";
  static readonly description = `Seedream 5.0 lite: image generation with built-in reasoning, example-based editing, and deep domain knowledge
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
      "4:3",
      "3:4",
      "16:9",
      "9:16",
      "3:2",
      "2:3",
      "21:9"
    ],
    description:
      "Image aspect ratio. Use 'match_input_image' to automatically match the input image's aspect ratio."
  })
  declare aspect_ratio: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Input image(s) for image-to-image generation. List of 1-14 images for single or multi-reference generation."
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Maximum number of images to generate when sequential_image_generation='auto'. Range: 1-15. Total images (input + generated) cannot exceed 15."
  })
  declare max_images: any;

  @prop({
    type: "enum",
    default: "png",
    values: ["png", "jpeg"],
    description: "Output image format."
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "disabled",
    values: ["disabled", "auto"],
    description:
      "Group image generation mode. 'disabled' generates a single image. 'auto' lets the model decide whether to generate multiple related images (e.g., story scenes, character variations)."
  })
  declare sequential_image_generation: any;

  @prop({
    type: "enum",
    default: "2K",
    values: ["2K", "3K"],
    description: "Image resolution: 2K (2048px) or 3K (3072px)."
  })
  declare size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const maxImages = Number(this.max_images ?? 1);
    const outputFormat = String(this.output_format ?? "png");
    const prompt = String(this.prompt ?? "");
    const sequentialImageGeneration = String(
      this.sequential_image_generation ?? "disabled"
    );
    const size = String(this.size ?? "2K");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      max_images: maxImages,
      output_format: outputFormat,
      prompt: prompt,
      sequential_image_generation: sequentialImageGeneration,
      size: size
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
      "bytedance/seedream-5-lite:eeb2857d94c49a5bcbc9d6c6057416e1d3b1a2735a16e08e4def9bf7ee22ec71",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Seedream_3 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Seedream_3";
  static readonly title = "Seedream_3";
  static readonly description = `A text-to-image model with support for native high-resolution (2K) image generation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: [
      "1:1",
      "3:4",
      "4:3",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "21:9",
      "custom"
    ],
    description:
      "Image aspect ratio. Set to 'custom' to specify width and height."
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 2.5,
    description: "Prompt adherence. Higher = more literal."
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 2048, description: "Image height" })
  declare height: any;

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
    type: "enum",
    default: "regular",
    values: ["small", "regular", "big"],
    description:
      "Big images will have their longest dimension be 2048px. Small images will have their shortest dimension be 512px. Regular images will always be 1 megapixel. Ignored if aspect ratio is custom."
  })
  declare size: any;

  @prop({ type: "int", default: 2048, description: "Image width" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const guidanceScale = Number(this.guidance_scale ?? 2.5);
    const height = Number(this.height ?? 2048);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const size = String(this.size ?? "regular");
    const width = Number(this.width ?? 2048);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      guidance_scale: guidanceScale,
      height: height,
      prompt: prompt,
      seed: seed,
      size: size,
      width: width
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bytedance/seedream-3:ed344813bc9f4996be6de4febd8b9c14c7849ad7b21ab047572e3620ee374ee7",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_V4 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Recraft_V4";
  static readonly title = "Recraft_ V4";
  static readonly description = `Recraft's latest image generation model, built around design taste. Strong prompt accuracy, art-directed composition, and integrated text rendering. Fast and cost-efficient at standard resolution.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "Not set",
    values: [
      "Not set",
      "1:1",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:9",
      "9:16",
      "1:2",
      "2:1",
      "14:10",
      "10:14",
      "4:5",
      "5:4",
      "6:10"
    ],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation (up to 10,000 characters)"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1024x1024",
    values: [
      "1024x1024",
      "1536x768",
      "768x1536",
      "1280x832",
      "832x1280",
      "1216x896",
      "896x1216",
      "1152x896",
      "896x1152",
      "832x1344",
      "1280x896",
      "896x1280",
      "1344x768",
      "768x1344"
    ],
    description:
      "Width and height of the generated image. Size is ignored if an aspect ratio is set."
  })
  declare size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "Not set");
    const prompt = String(this.prompt ?? "");
    const size = String(this.size ?? "1024x1024");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      size: size
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "recraft-ai/recraft-v4:a8bc7377c37baeea1e01568f88b6abfb38939135071a38ca4267c8f82c3cbbf0",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_V4_SVG extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Recraft_V4_SVG";
  static readonly title = "Recraft_ V4_ S V G";
  static readonly description = `Generate production-ready SVG vector images from text prompts. Recraft V4's design taste applied to vector output — clean geometry, structured layers, and editable paths.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "Not set",
    values: [
      "Not set",
      "1:1",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:9",
      "9:16",
      "1:2",
      "2:1",
      "14:10",
      "10:14",
      "4:5",
      "5:4",
      "6:10"
    ],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation (up to 10,000 characters)"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1024x1024",
    values: [
      "1024x1024",
      "1536x768",
      "768x1536",
      "1280x832",
      "832x1280",
      "1216x896",
      "896x1216",
      "1152x896",
      "896x1152",
      "832x1344",
      "1280x896",
      "896x1280",
      "1344x768",
      "768x1344"
    ],
    description:
      "Width and height of the generated image. Size is ignored if an aspect ratio is set."
  })
  declare size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "Not set");
    const prompt = String(this.prompt ?? "");
    const size = String(this.size ?? "1024x1024");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      size: size
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "recraft-ai/recraft-v4-svg:93cbef8f201b974654d36b1247314072205583f6ff489a1582126f34f2f93635",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_V4_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Recraft_V4_Pro";
  static readonly title = "Recraft_ V4_ Pro";
  static readonly description = `Recraft's latest image generation model at ~2048px resolution. Same design taste and prompt accuracy as V4, with higher resolution for print-ready and large-scale work.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "Not set",
    values: [
      "Not set",
      "1:1",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:9",
      "9:16",
      "1:2",
      "2:1",
      "4:5",
      "5:4",
      "6:10",
      "14:10",
      "10:14"
    ],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation (up to 10,000 characters)"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "2048x2048",
    values: [
      "2048x2048",
      "3072x1536",
      "1536x3072",
      "2560x1664",
      "1664x2560",
      "2432x1792",
      "1792x2432",
      "2304x1792",
      "1792x2304",
      "1664x2688",
      "2560x1792",
      "1792x2560",
      "2688x1536",
      "1536x2688"
    ],
    description:
      "Width and height of the generated image. Size is ignored if an aspect ratio is set."
  })
  declare size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "Not set");
    const prompt = String(this.prompt ?? "");
    const size = String(this.size ?? "2048x2048");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      size: size
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "recraft-ai/recraft-v4-pro:da14602f43a83d1a85654e8cbce5afc0d4cca59b41c0c13f73be8ca84d54d6b6",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Recraft_V4_Pro_SVG extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Recraft_V4_Pro_SVG";
  static readonly title = "Recraft_ V4_ Pro_ S V G";
  static readonly description = `Generate detailed SVG vector graphics from text prompts. Recraft V4 Pro's design taste with more geometric detail and finer paths — clean layers, editable output, and scalable to any size.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "Not set",
    values: [
      "Not set",
      "1:1",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:9",
      "9:16",
      "1:2",
      "2:1",
      "4:5",
      "5:4",
      "6:10",
      "14:10",
      "10:14"
    ],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation (up to 10,000 characters)"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "2048x2048",
    values: [
      "2048x2048",
      "3072x1536",
      "1536x3072",
      "2560x1664",
      "1664x2560",
      "2432x1792",
      "1792x2432",
      "2304x1792",
      "1792x2304",
      "1664x2688",
      "2560x1792",
      "1792x2560",
      "2688x1536",
      "1536x2688"
    ],
    description:
      "Width and height of the generated image. Size is ignored if an aspect ratio is set."
  })
  declare size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "Not set");
    const prompt = String(this.prompt ?? "");
    const size = String(this.size ?? "2048x2048");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      size: size
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "recraft-ai/recraft-v4-pro-svg:b31f9d3b20f09d3029aee2d983641c36e7cbc2118d2c9d2fcb7a4f248b6e3538",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_V3_Balanced extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Ideogram_V3_Balanced";
  static readonly title = "Ideogram_ V3_ Balanced";
  static readonly description = `Balance speed, quality and cost. Ideogram v3 creates images with stunning realism, creative designs, and consistent styles
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:3",
      "3:1",
      "1:2",
      "2:1",
      "9:16",
      "16:9",
      "10:16",
      "16:10",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "1:1"
    ],
    description:
      "Aspect ratio. Ignored if a resolution or inpainting image is given."
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An image file to use for inpainting. You must also use a mask."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: ["Auto", "On", "Off"],
    description:
      "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages."
  })
  declare magic_prompt_option: any;

  @prop({
    type: "image",
    default: "",
    description:
      "A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size."
  })
  declare mask: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "512x1536",
      "576x1408",
      "576x1472",
      "576x1536",
      "640x1344",
      "640x1408",
      "640x1472",
      "640x1536",
      "704x1152",
      "704x1216",
      "704x1280",
      "704x1344",
      "704x1408",
      "704x1472",
      "736x1312",
      "768x1088",
      "768x1216",
      "768x1280",
      "768x1344",
      "800x1280",
      "832x960",
      "832x1024",
      "832x1088",
      "832x1152",
      "832x1216",
      "832x1248",
      "864x1152",
      "896x960",
      "896x1024",
      "896x1088",
      "896x1120",
      "896x1152",
      "960x832",
      "960x896",
      "960x1024",
      "960x1088",
      "1024x832",
      "1024x896",
      "1024x960",
      "1024x1024",
      "1088x768",
      "1088x832",
      "1088x896",
      "1088x960",
      "1120x896",
      "1152x704",
      "1152x832",
      "1152x864",
      "1152x896",
      "1216x704",
      "1216x768",
      "1216x832",
      "1248x832",
      "1280x704",
      "1280x768",
      "1280x800",
      "1312x736",
      "1344x640",
      "1344x704",
      "1344x768",
      "1408x576",
      "1408x640",
      "1408x704",
      "1472x576",
      "1472x640",
      "1472x704",
      "1536x512",
      "1536x576",
      "1536x640"
    ],
    description:
      "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "80s Illustration",
      "90s Nostalgia",
      "Abstract Organic",
      "Analog Nostalgia",
      "Art Brut",
      "Art Deco",
      "Art Poster",
      "Aura",
      "Avant Garde",
      "Bauhaus",
      "Blueprint",
      "Blurry Motion",
      "Bright Art",
      "C4D Cartoon",
      "Children's Book",
      "Collage",
      "Coloring Book I",
      "Coloring Book II",
      "Cubism",
      "Dark Aura",
      "Doodle",
      "Double Exposure",
      "Dramatic Cinema",
      "Editorial",
      "Emotional Minimal",
      "Ethereal Party",
      "Expired Film",
      "Flat Art",
      "Flat Vector",
      "Forest Reverie",
      "Geo Minimalist",
      "Glass Prism",
      "Golden Hour",
      "Graffiti I",
      "Graffiti II",
      "Halftone Print",
      "High Contrast",
      "Hippie Era",
      "Iconic",
      "Japandi Fusion",
      "Jazzy",
      "Long Exposure",
      "Magazine Editorial",
      "Minimal Illustration",
      "Mixed Media",
      "Monochrome",
      "Nightlife",
      "Oil Painting",
      "Old Cartoons",
      "Paint Gesture",
      "Pop Art",
      "Retro Etching",
      "Riviera Pop",
      "Spotlight 80s",
      "Stylized Red",
      "Surreal Collage",
      "Travel Poster",
      "Vintage Geo",
      "Vintage Poster",
      "Watercolor",
      "Weird",
      "Woodblock Print"
    ],
    description:
      "Apply a predefined artistic style to the generated image (V3 models only)."
  })
  declare style_preset: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "A list of images to use as style references."
  })
  declare style_reference_images: any;

  @prop({
    type: "enum",
    default: "None",
    values: ["None", "Auto", "General", "Realistic", "Design"],
    description:
      "The styles help define the specific aesthetic of the image you want to generate."
  })
  declare style_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const magicPromptOption = String(this.magic_prompt_option ?? "Auto");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "None");
    const seed = Number(this.seed ?? -1);
    const stylePreset = String(this.style_preset ?? "None");
    const styleType = String(this.style_type ?? "None");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      magic_prompt_option: magicPromptOption,
      prompt: prompt,
      resolution: resolution,
      seed: seed,
      style_preset: stylePreset,
      style_type: styleType
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

    const styleReferenceImagesRef = this.style_reference_images as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(styleReferenceImagesRef)) {
      const styleReferenceImagesUrl = await assetToUrl(
        styleReferenceImagesRef!,
        apiKey
      );
      if (styleReferenceImagesUrl)
        args["style_reference_images"] = styleReferenceImagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "ideogram-ai/ideogram-v3-balanced:41f9f0d4bf6c470dd0f5085dadc6c14ffb8ed4ce1f6bffbbc10b03ecf5b053fb",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_V3_Quality extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Ideogram_V3_Quality";
  static readonly title = "Ideogram_ V3_ Quality";
  static readonly description = `The highest quality Ideogram v3 model. v3 creates images with stunning realism, creative designs, and consistent styles
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:3",
      "3:1",
      "1:2",
      "2:1",
      "9:16",
      "16:9",
      "10:16",
      "16:10",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "1:1"
    ],
    description:
      "Aspect ratio. Ignored if a resolution or inpainting image is given."
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An image file to use for inpainting. You must also use a mask."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: ["Auto", "On", "Off"],
    description:
      "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages."
  })
  declare magic_prompt_option: any;

  @prop({
    type: "image",
    default: "",
    description:
      "A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size."
  })
  declare mask: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "512x1536",
      "576x1408",
      "576x1472",
      "576x1536",
      "640x1344",
      "640x1408",
      "640x1472",
      "640x1536",
      "704x1152",
      "704x1216",
      "704x1280",
      "704x1344",
      "704x1408",
      "704x1472",
      "736x1312",
      "768x1088",
      "768x1216",
      "768x1280",
      "768x1344",
      "800x1280",
      "832x960",
      "832x1024",
      "832x1088",
      "832x1152",
      "832x1216",
      "832x1248",
      "864x1152",
      "896x960",
      "896x1024",
      "896x1088",
      "896x1120",
      "896x1152",
      "960x832",
      "960x896",
      "960x1024",
      "960x1088",
      "1024x832",
      "1024x896",
      "1024x960",
      "1024x1024",
      "1088x768",
      "1088x832",
      "1088x896",
      "1088x960",
      "1120x896",
      "1152x704",
      "1152x832",
      "1152x864",
      "1152x896",
      "1216x704",
      "1216x768",
      "1216x832",
      "1248x832",
      "1280x704",
      "1280x768",
      "1280x800",
      "1312x736",
      "1344x640",
      "1344x704",
      "1344x768",
      "1408x576",
      "1408x640",
      "1408x704",
      "1472x576",
      "1472x640",
      "1472x704",
      "1536x512",
      "1536x576",
      "1536x640"
    ],
    description:
      "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "80s Illustration",
      "90s Nostalgia",
      "Abstract Organic",
      "Analog Nostalgia",
      "Art Brut",
      "Art Deco",
      "Art Poster",
      "Aura",
      "Avant Garde",
      "Bauhaus",
      "Blueprint",
      "Blurry Motion",
      "Bright Art",
      "C4D Cartoon",
      "Children's Book",
      "Collage",
      "Coloring Book I",
      "Coloring Book II",
      "Cubism",
      "Dark Aura",
      "Doodle",
      "Double Exposure",
      "Dramatic Cinema",
      "Editorial",
      "Emotional Minimal",
      "Ethereal Party",
      "Expired Film",
      "Flat Art",
      "Flat Vector",
      "Forest Reverie",
      "Geo Minimalist",
      "Glass Prism",
      "Golden Hour",
      "Graffiti I",
      "Graffiti II",
      "Halftone Print",
      "High Contrast",
      "Hippie Era",
      "Iconic",
      "Japandi Fusion",
      "Jazzy",
      "Long Exposure",
      "Magazine Editorial",
      "Minimal Illustration",
      "Mixed Media",
      "Monochrome",
      "Nightlife",
      "Oil Painting",
      "Old Cartoons",
      "Paint Gesture",
      "Pop Art",
      "Retro Etching",
      "Riviera Pop",
      "Spotlight 80s",
      "Stylized Red",
      "Surreal Collage",
      "Travel Poster",
      "Vintage Geo",
      "Vintage Poster",
      "Watercolor",
      "Weird",
      "Woodblock Print"
    ],
    description:
      "Apply a predefined artistic style to the generated image (V3 models only)."
  })
  declare style_preset: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "A list of images to use as style references."
  })
  declare style_reference_images: any;

  @prop({
    type: "enum",
    default: "None",
    values: ["None", "Auto", "General", "Realistic", "Design"],
    description:
      "The styles help define the specific aesthetic of the image you want to generate."
  })
  declare style_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const magicPromptOption = String(this.magic_prompt_option ?? "Auto");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "None");
    const seed = Number(this.seed ?? -1);
    const stylePreset = String(this.style_preset ?? "None");
    const styleType = String(this.style_type ?? "None");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      magic_prompt_option: magicPromptOption,
      prompt: prompt,
      resolution: resolution,
      seed: seed,
      style_preset: stylePreset,
      style_type: styleType
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

    const styleReferenceImagesRef = this.style_reference_images as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(styleReferenceImagesRef)) {
      const styleReferenceImagesUrl = await assetToUrl(
        styleReferenceImagesRef!,
        apiKey
      );
      if (styleReferenceImagesUrl)
        args["style_reference_images"] = styleReferenceImagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "ideogram-ai/ideogram-v3-quality:6dafa89a04b1547f0d1c1680b8dcd41ebb2f82c4e2f0c8a92d4bf5ea5250150b",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_V2A_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Ideogram_V2A_Turbo";
  static readonly title = "Ideogram_ V2 A_ Turbo";
  static readonly description = `Like Ideogram v2 turbo, but now faster and cheaper
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "16:10",
      "10:16",
      "3:1",
      "1:3"
    ],
    description:
      "Aspect ratio. Ignored if a resolution or inpainting image is given."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: ["Auto", "On", "Off"],
    description:
      "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages."
  })
  declare magic_prompt_option: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "512x1536",
      "576x1408",
      "576x1472",
      "576x1536",
      "640x1344",
      "640x1408",
      "640x1472",
      "640x1536",
      "704x1152",
      "704x1216",
      "704x1280",
      "704x1344",
      "704x1408",
      "704x1472",
      "736x1312",
      "768x1088",
      "768x1216",
      "768x1280",
      "768x1344",
      "832x960",
      "832x1024",
      "832x1088",
      "832x1152",
      "832x1216",
      "832x1248",
      "864x1152",
      "896x960",
      "896x1024",
      "896x1088",
      "896x1120",
      "896x1152",
      "960x832",
      "960x896",
      "960x1024",
      "960x1088",
      "1024x832",
      "1024x896",
      "1024x960",
      "1024x1024",
      "1088x768",
      "1088x832",
      "1088x896",
      "1088x960",
      "1120x896",
      "1152x704",
      "1152x832",
      "1152x864",
      "1152x896",
      "1216x704",
      "1216x768",
      "1216x832",
      "1248x832",
      "1280x704",
      "1280x768",
      "1280x800",
      "1312x736",
      "1344x640",
      "1344x704",
      "1344x768",
      "1408x576",
      "1408x640",
      "1408x704",
      "1472x576",
      "1472x640",
      "1472x704",
      "1536x512",
      "1536x576",
      "1536x640"
    ],
    description:
      "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Auto",
      "General",
      "Realistic",
      "Design",
      "Render 3D",
      "Anime"
    ],
    description:
      "The styles help define the specific aesthetic of the image you want to generate."
  })
  declare style_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const magicPromptOption = String(this.magic_prompt_option ?? "Auto");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "None");
    const seed = Number(this.seed ?? -1);
    const styleType = String(this.style_type ?? "None");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      magic_prompt_option: magicPromptOption,
      prompt: prompt,
      resolution: resolution,
      seed: seed,
      style_type: styleType
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "ideogram-ai/ideogram-v2a-turbo:0afb968f42d1f96ab92f9c8d669c0e819fa36ccc74f02a7cd057595c9e42da01",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Imagen_4 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Imagen_4";
  static readonly title = "Imagen_4";
  static readonly description = `Google's Imagen 4 flagship model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "1K",
    values: ["1K", "2K"],
    description: "Resolution of the generated image"
  })
  declare image_size: any;

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
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "block_only_high",
    values: [
      "block_low_and_above",
      "block_medium_and_above",
      "block_only_high"
    ],
    description:
      "block_low_and_above is strictest, block_medium_and_above blocks some prompts, block_only_high is most permissive but some prompts will still be blocked"
  })
  declare safety_filter_level: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const imageSize = String(this.image_size ?? "1K");
    const outputFormat = String(this.output_format ?? "jpg");
    const prompt = String(this.prompt ?? "");
    const safetyFilterLevel = String(
      this.safety_filter_level ?? "block_only_high"
    );

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      image_size: imageSize,
      output_format: outputFormat,
      prompt: prompt,
      safety_filter_level: safetyFilterLevel
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/imagen-4:19335492dbe879d4b5983bff2149f597db8314ccc7fe374e6313af7c2b52792f",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Imagen_4_Ultra extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Imagen_4_Ultra";
  static readonly title = "Imagen_4_ Ultra";
  static readonly description = `Use this ultra version of Imagen 4 when quality matters more than speed and cost
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "1K",
    values: ["1K", "2K"],
    description: "Resolution of the generated image"
  })
  declare image_size: any;

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
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "block_only_high",
    values: [
      "block_low_and_above",
      "block_medium_and_above",
      "block_only_high"
    ],
    description:
      "block_low_and_above is strictest, block_medium_and_above blocks some prompts, block_only_high is most permissive but some prompts will still be blocked"
  })
  declare safety_filter_level: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const imageSize = String(this.image_size ?? "1K");
    const outputFormat = String(this.output_format ?? "jpg");
    const prompt = String(this.prompt ?? "");
    const safetyFilterLevel = String(
      this.safety_filter_level ?? "block_only_high"
    );

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      image_size: imageSize,
      output_format: outputFormat,
      prompt: prompt,
      safety_filter_level: safetyFilterLevel
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/imagen-4-ultra:1a75d7b302b3847bab8f9dbec11d52800479af35323c837612053ab5de035ee9",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Imagen_3_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Imagen_3_Fast";
  static readonly title = "Imagen_3_ Fast";
  static readonly description = `A faster and cheaper Imagen 3 model, for when price or speed are more important than final image quality
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    description: "Aspect ratio of the generated image"
  })
  declare aspect_ratio: any;

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
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "block_only_high",
    values: [
      "block_low_and_above",
      "block_medium_and_above",
      "block_only_high"
    ],
    description:
      "block_low_and_above is strictest, block_medium_and_above blocks some prompts, block_only_high is most permissive but some prompts will still be blocked"
  })
  declare safety_filter_level: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const outputFormat = String(this.output_format ?? "jpg");
    const prompt = String(this.prompt ?? "");
    const safetyFilterLevel = String(
      this.safety_filter_level ?? "block_only_high"
    );

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      prompt: prompt,
      safety_filter_level: safetyFilterLevel
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/imagen-3-fast:2d1d7f7965a9b0b37ea8eb77f156e905631d27f0f56a234de98385703b5c380e",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Nano_Banana_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Nano_Banana_Pro";
  static readonly title = "Nano_ Banana_ Pro";
  static readonly description = `Google's state of the art image generation and editing model 🍌🍌
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Fallback to another model (currently bytedance/seedream-5) if Nano Banana Pro is at capacity."
  })
  declare allow_fallback_model: any;

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
      "Input images to transform or use as reference (supports up to 14 images)"
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

  @prop({
    type: "enum",
    default: "2K",
    values: ["1K", "2K", "4K"],
    description: "Resolution of the generated image"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "block_only_high",
    values: [
      "block_low_and_above",
      "block_medium_and_above",
      "block_only_high"
    ],
    description:
      "block_low_and_above is strictest, block_medium_and_above blocks some prompts, block_only_high is most permissive but some prompts will still be blocked"
  })
  declare safety_filter_level: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const allowFallbackModel = Boolean(this.allow_fallback_model ?? false);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const outputFormat = String(this.output_format ?? "jpg");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "2K");
    const safetyFilterLevel = String(
      this.safety_filter_level ?? "block_only_high"
    );

    const args: Record<string, unknown> = {
      allow_fallback_model: allowFallbackModel,
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      prompt: prompt,
      resolution: resolution,
      safety_filter_level: safetyFilterLevel
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
      "google/nano-banana-pro:712e06a8e122fb7c8dae55dcf7ad6a8e717afb7b1c41c889fc8c5132fd42f374",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Grok_Imagine_Image extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Grok_Imagine_Image";
  static readonly title = "Grok_ Imagine_ Image";
  static readonly description = `SOTA image model from xAI
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "2:1",
      "1:2",
      "19.5:9",
      "9:19.5",
      "20:9",
      "9:20",
      "auto"
    ],
    description:
      "Aspect ratio of the generated image. Ignored when editing an image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for editing. When provided, the model edits this image based on the prompt. Supports jpg, jpeg, png, webp."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation or editing"
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "xai/grok-imagine-image:3032db31147241f86351f0d7ab1ffd5150dcb482bcb873580f15d8cb8970a812",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Fibo extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Fibo";
  static readonly title = "Fibo";
  static readonly description = `SOTA Open source model trained on licensed data, transforming intent into structured control for precise, high-quality AI image generation in enterprise and agentic workflows.
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

  @prop({ type: "int", default: 0, description: "Guidance scale (1-10)" })
  declare guidance_scale: any;

  @prop({ type: "image", default: "", description: "Image file" })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for image generation"
  })
  declare negative_prompt: any;

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
    type: "str",
    default: "",
    description:
      "Structured prompt (JSON string). Use a structured_prompt from a previous generation's response or the /v2/structured_prompt/generate endpoint for precise refinement."
  })
  declare structured_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const guidanceScale = Number(this.guidance_scale ?? 0);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const structuredPrompt = String(this.structured_prompt ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      guidance_scale: guidanceScale,
      negative_prompt: negativePrompt,
      prompt: prompt,
      seed: seed,
      structured_prompt: structuredPrompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bria/fibo:11d5854315b5c315a9e9335bb816e693eea668e47e347ca69e2ea1eac16acd6b",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Bria_Image_3_2 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Bria_Image_3_2";
  static readonly title = "Bria_ Image_3_2";
  static readonly description = `Commercial-ready, trained entirely on licensed data, text-to-image model. With only 4B parameters provides exceptional aesthetics and text rendering. Evaluated to be on par to other leading models in the market
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
    type: "bool",
    default: false,
    description: "Enhance image details and clarity"
  })
  declare enhance_image: any;

  @prop({ type: "float", default: 0, description: "Guidance scale (1-10)" })
  declare guidance_scale: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for image generation"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enhance prompt for more creative output"
  })
  declare prompt_enhancement: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const enhanceImage = Boolean(this.enhance_image ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 0);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const promptEnhancement = Boolean(this.prompt_enhancement ?? false);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      enhance_image: enhanceImage,
      guidance_scale: guidanceScale,
      negative_prompt: negativePrompt,
      prompt: prompt,
      prompt_enhancement: promptEnhancement,
      seed: seed
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bria/image-3.2:cd4f78ccda1eb0983e504cfa1e58cfbd8edc8999ea9da87e1ac2ee541c205450",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_2_Klein_4B extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_2_Klein_4B";
  static readonly title = "Flux_2_ Klein_4 B";
  static readonly description = `Very fast image generation and editing model. 4 steps distilled, sub-second inference for production and near real-time applications.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "9:16",
      "3:2",
      "2:3",
      "4:3",
      "3:4",
      "5:4",
      "4:5",
      "21:9",
      "9:21",
      "match_input_image"
    ],
    description:
      "Aspect ratio for the generated image. Use 'match_input_image' to match the aspect ratio of the first input image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "bool",
    default: false,
    description: "Run faster predictions with additional optimizations."
  })
  declare go_fast: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "List of input images for image-to-image generation. Maximum 5 images. Must be jpeg, png, gif, or webp."
  })
  declare images: any;

  @prop({
    type: "enum",
    default: "jpg",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "enum",
    default: "1",
    values: ["0.25", "0.5", "1", "2", "4"],
    description: "Resolution of the output image in megapixels"
  })
  declare output_megapixels: any;

  @prop({
    type: "int",
    default: 95,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs."
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const goFast = Boolean(this.go_fast ?? false);
    const outputFormat = String(this.output_format ?? "jpg");
    const outputMegapixels = String(this.output_megapixels ?? "1");
    const outputQuality = Number(this.output_quality ?? 95);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      go_fast: goFast,
      output_format: outputFormat,
      output_megapixels: outputMegapixels,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed
    };

    const imagesRef = this.images as Record<string, unknown> | undefined;
    if (isRefSet(imagesRef)) {
      const imagesUrl = await assetToUrl(imagesRef!, apiKey);
      if (imagesUrl) args["images"] = imagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-2-klein-4b:8e9c42d77b10a2a41af823ac4500f7545be6ebc4e745830fc3f3de10de200542",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Kontext_Max extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Kontext_Max";
  static readonly title = "Flux_ Kontext_ Max";
  static readonly description = `A premium text-based image editing model that delivers maximum performance and improved typography generation for transforming images through natural language prompts
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
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "21:9",
      "9:21",
      "2:1",
      "1:2"
    ],
    description:
      "Aspect ratio of the generated image. Use 'match_input_image' to match the aspect ratio of the input image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use as reference. Must be jpeg, png, gif, or webp."
  })
  declare input_image: any;

  @prop({
    type: "enum",
    default: "png",
    values: ["jpg", "png"],
    description: "Output format for the generated image"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text description of what you want to generate, or the instruction on how to edit the given image."
  })
  declare prompt: any;

  @prop({
    type: "bool",
    default: false,
    description: "Automatic prompt improvement"
  })
  declare prompt_upsampling: any;

  @prop({
    type: "int",
    default: 2,
    description:
      "Safety tolerance, 0 is most strict and 6 is most permissive. 2 is currently the maximum allowed when input images are used."
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const outputFormat = String(this.output_format ?? "png");
    const prompt = String(this.prompt ?? "");
    const promptUpsampling = Boolean(this.prompt_upsampling ?? false);
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      prompt: prompt,
      prompt_upsampling: promptUpsampling,
      safety_tolerance: safetyTolerance,
      seed: seed
    };

    const inputImageRef = this.input_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await assetToUrl(inputImageRef!, apiKey);
      if (inputImageUrl) args["input_image"] = inputImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "black-forest-labs/flux-kontext-max:8389ed8e4b16016c44fcdcc3ad142cf1e182e0a1ecaf0347b3e5254303f2beac",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Hunyuan_Image_3 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Hunyuan_Image_3";
  static readonly title = "Hunyuan_ Image_3";
  static readonly description = `A powerful native multimodal model for image generation (PrunaAI squeezed)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:1",
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21"
    ],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "bool",
    default: true,
    description: "Run faster predictions with additional optimizations."
  })
  declare go_fast: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 95,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const goFast = Boolean(this.go_fast ?? true);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 95);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      go_fast: goFast,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "tencent/hunyuan-image-3:080dbbefcd1504ca5aeebaa2815fd51467d5bb793d2b1fb4eb4eb32ac22a3377",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_PuLID extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_PuLID";
  static readonly title = "Flux_ Pu L I D";
  static readonly description = `⚡️FLUX PuLID: FLUX-dev based Pure and Lightning ID Customization via Contrastive Alignment🎭
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 4,
    description: "Set the guidance scale for text prompt influence (1.0-10.0)"
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 1152,
    description: "Set the height of the generated image (256-1536 pixels)"
  })
  declare height: any;

  @prop({
    type: "float",
    default: 1,
    description: "Set the weight of the ID image influence (0.0-3.0)"
  })
  declare id_weight: any;

  @prop({
    type: "image",
    default: "",
    description: "Upload an ID image for face generation"
  })
  declare main_face_image: any;

  @prop({
    type: "int",
    default: 128,
    description:
      "Set the max sequence length for prompt (T5), smaller is faster (128-512)"
  })
  declare max_sequence_length: any;

  @prop({
    type: "str",
    default:
      "bad quality, worst quality, text, signature, watermark, extra limbs, low resolution, partially rendered objects, deformed or partially rendered eyes, deformed, deformed eyeballs, cross-eyed, blurry",
    description: "Enter a negative prompt to specify what to avoid in the image"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 1,
    description: "Set the number of images to generate (1-4)"
  })
  declare num_outputs: any;

  @prop({
    type: "int",
    default: 20,
    description: "Set the number of denoising steps (1-20)"
  })
  declare num_steps: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["png", "jpg", "webp"],
    description: "Choose the format of the output image"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description: "Set the quality of the output image for jpg and webp (1-100)"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "portrait, color, cinematic",
    description: "Enter a text prompt to guide image generation"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Set a random seed for generation (leave blank or -1 for random)"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Set the timestep to start inserting ID (0-4 recommended, 0 for highest fidelity, 4 for more editability)"
  })
  declare start_step: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Set the Classifier-Free Guidance (CFG) scale. 1.0 uses standard CFG, while values >1.0 enable True CFG for more precise control over generation. Higher values increase adherence to the prompt at the cost of image quality."
  })
  declare true_cfg: any;

  @prop({
    type: "int",
    default: 896,
    description: "Set the width of the generated image (256-1536 pixels)"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const guidanceScale = Number(this.guidance_scale ?? 4);
    const height = Number(this.height ?? 1152);
    const idWeight = Number(this.id_weight ?? 1);
    const maxSequenceLength = Number(this.max_sequence_length ?? 128);
    const negativePrompt = String(
      this.negative_prompt ??
        "bad quality, worst quality, text, signature, watermark, extra limbs, low resolution, partially rendered objects, deformed or partially rendered eyes, deformed, deformed eyeballs, cross-eyed, blurry"
    );
    const numOutputs = Number(this.num_outputs ?? 1);
    const numSteps = Number(this.num_steps ?? 20);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "portrait, color, cinematic");
    const seed = Number(this.seed ?? -1);
    const startStep = Number(this.start_step ?? 0);
    const trueCfg = Number(this.true_cfg ?? 1);
    const width = Number(this.width ?? 896);

    const args: Record<string, unknown> = {
      guidance_scale: guidanceScale,
      height: height,
      id_weight: idWeight,
      max_sequence_length: maxSequenceLength,
      negative_prompt: negativePrompt,
      num_outputs: numOutputs,
      num_steps: numSteps,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed,
      start_step: startStep,
      true_cfg: trueCfg,
      width: width
    };

    const mainFaceImageRef = this.main_face_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(mainFaceImageRef)) {
      const mainFaceImageUrl = await assetToUrl(mainFaceImageRef!, apiKey);
      if (mainFaceImageUrl) args["main_face_image"] = mainFaceImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bytedance/flux-pulid:8baa7ef2255075b46f4d91cd238c21d31181b3e6a864463f967960bb0112525b",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class PuLID extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.PuLID";
  static readonly title = "Pu L I D";
  static readonly description = `📖 PuLID: Pure and Lightning ID Customization via Contrastive Alignment
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description: "Additional ID image (auxiliary)"
  })
  declare auxiliary_face_image1: any;

  @prop({
    type: "image",
    default: "",
    description: "Additional ID image (auxiliary)"
  })
  declare auxiliary_face_image2: any;

  @prop({
    type: "image",
    default: "",
    description: "Additional ID image (auxiliary)"
  })
  declare auxiliary_face_image3: any;

  @prop({
    type: "float",
    default: 1.2,
    description: "CFG, recommend value range [1, 1.5], 1 will be faster"
  })
  declare cfg_scale: any;

  @prop({
    type: "enum",
    default: "fidelity",
    values: ["fidelity", "extremely style"],
    description: "mode"
  })
  declare generation_mode: any;

  @prop({ type: "float", default: 0.8, description: "ID scale" })
  declare identity_scale: any;

  @prop({ type: "int", default: 1024, description: "Height" })
  declare image_height: any;

  @prop({ type: "int", default: 768, description: "Width" })
  declare image_width: any;

  @prop({ type: "image", default: "", description: "ID image (main)" })
  declare main_face_image: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "ID Mix (if you want to mix two ID image, please turn this on, otherwise, turn this off)"
  })
  declare mix_identities: any;

  @prop({
    type: "str",
    default:
      "flaws in the eyes, flaws in the face, flaws, lowres, non-HDRi, low quality, worst quality,artifacts noise, text, watermark, glitch, deformed, mutated, ugly, disfigured, hands, low resolution, partially rendered objects,  deformed or partially rendered eyes, deformed, deformed eyeballs, cross-eyed,blurry",
    description: "Negative Prompt"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 4, description: "Num samples" })
  declare num_samples: any;

  @prop({ type: "int", default: 4, description: "Steps" })
  declare num_steps: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality."
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "portrait,color,cinematic,in garden,soft light,detailed face",
    description: "Prompt"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cfgScale = Number(this.cfg_scale ?? 1.2);
    const generationMode = String(this.generation_mode ?? "fidelity");
    const identityScale = Number(this.identity_scale ?? 0.8);
    const imageHeight = Number(this.image_height ?? 1024);
    const imageWidth = Number(this.image_width ?? 768);
    const mixIdentities = Boolean(this.mix_identities ?? false);
    const negativePrompt = String(
      this.negative_prompt ??
        "flaws in the eyes, flaws in the face, flaws, lowres, non-HDRi, low quality, worst quality,artifacts noise, text, watermark, glitch, deformed, mutated, ugly, disfigured, hands, low resolution, partially rendered objects,  deformed or partially rendered eyes, deformed, deformed eyeballs, cross-eyed,blurry"
    );
    const numSamples = Number(this.num_samples ?? 4);
    const numSteps = Number(this.num_steps ?? 4);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(
      this.prompt ??
        "portrait,color,cinematic,in garden,soft light,detailed face"
    );
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      cfg_scale: cfgScale,
      generation_mode: generationMode,
      identity_scale: identityScale,
      image_height: imageHeight,
      image_width: imageWidth,
      mix_identities: mixIdentities,
      negative_prompt: negativePrompt,
      num_samples: numSamples,
      num_steps: numSteps,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed
    };

    const auxiliaryFaceImage1Ref = this.auxiliary_face_image1 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(auxiliaryFaceImage1Ref)) {
      const auxiliaryFaceImage1Url = await assetToUrl(
        auxiliaryFaceImage1Ref!,
        apiKey
      );
      if (auxiliaryFaceImage1Url)
        args["auxiliary_face_image1"] = auxiliaryFaceImage1Url;
    }

    const auxiliaryFaceImage2Ref = this.auxiliary_face_image2 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(auxiliaryFaceImage2Ref)) {
      const auxiliaryFaceImage2Url = await assetToUrl(
        auxiliaryFaceImage2Ref!,
        apiKey
      );
      if (auxiliaryFaceImage2Url)
        args["auxiliary_face_image2"] = auxiliaryFaceImage2Url;
    }

    const auxiliaryFaceImage3Ref = this.auxiliary_face_image3 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(auxiliaryFaceImage3Ref)) {
      const auxiliaryFaceImage3Url = await assetToUrl(
        auxiliaryFaceImage3Ref!,
        apiKey
      );
      if (auxiliaryFaceImage3Url)
        args["auxiliary_face_image3"] = auxiliaryFaceImage3Url;
    }

    const mainFaceImageRef = this.main_face_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(mainFaceImageRef)) {
      const mainFaceImageUrl = await assetToUrl(mainFaceImageRef!, apiKey);
      if (mainFaceImageUrl) args["main_face_image"] = mainFaceImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bytedance/pulid:43d309c37ab4e62361e5e29b8e9e867fb2dcbcec77ae91206a8d95ac5dd451a0",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Change_Haircut extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Change_Haircut";
  static readonly title = "Flux_ Change_ Haircut";
  static readonly description = `Quickly change someone's hair style and hair color, powered by FLUX.1 Kontext [pro]
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
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "21:9",
      "9:21",
      "2:1",
      "1:2"
    ],
    description:
      "Aspect ratio of the generated image. Use 'match_input_image' to match the aspect ratio of the input image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "male", "female"],
    description: "The gender of the person"
  })
  declare gender: any;

  @prop({
    type: "enum",
    default: "No change",
    values: [
      "No change",
      "Random",
      "Blonde",
      "Brunette",
      "Black",
      "Dark Brown",
      "Medium Brown",
      "Light Brown",
      "Auburn",
      "Copper",
      "Red",
      "Strawberry Blonde",
      "Platinum Blonde",
      "Silver",
      "White",
      "Blue",
      "Purple",
      "Pink",
      "Green",
      "Blue-Black",
      "Golden Blonde",
      "Honey Blonde",
      "Caramel",
      "Chestnut",
      "Mahogany",
      "Burgundy",
      "Jet Black",
      "Ash Brown",
      "Ash Blonde",
      "Titanium",
      "Rose Gold"
    ],
    description: "The color of the person's hair"
  })
  declare hair_color: any;

  @prop({
    type: "enum",
    default: "No change",
    values: [
      "No change",
      "Random",
      "Straight",
      "Wavy",
      "Curly",
      "Bob",
      "Pixie Cut",
      "Layered",
      "Messy Bun",
      "High Ponytail",
      "Low Ponytail",
      "Braided Ponytail",
      "French Braid",
      "Dutch Braid",
      "Fishtail Braid",
      "Space Buns",
      "Top Knot",
      "Undercut",
      "Mohawk",
      "Crew Cut",
      "Faux Hawk",
      "Slicked Back",
      "Side-Parted",
      "Center-Parted",
      "Blunt Bangs",
      "Side-Swept Bangs",
      "Shag",
      "Lob",
      "Angled Bob",
      "A-Line Bob",
      "Asymmetrical Bob",
      "Graduated Bob",
      "Inverted Bob",
      "Layered Shag",
      "Choppy Layers",
      "Razor Cut",
      "Perm",
      "Ombré",
      "Straightened",
      "Soft Waves",
      "Glamorous Waves",
      "Hollywood Waves",
      "Finger Waves",
      "Tousled",
      "Feathered",
      "Pageboy",
      "Pigtails",
      "Pin Curls",
      "Rollerset",
      "Twist Out",
      "Bantu Knots",
      "Dreadlocks",
      "Cornrows",
      "Box Braids",
      "Crochet Braids",
      "Double Dutch Braids",
      "French Fishtail Braid",
      "Waterfall Braid",
      "Rope Braid",
      "Heart Braid",
      "Halo Braid",
      "Crown Braid",
      "Braided Crown",
      "Bubble Braid",
      "Bubble Ponytail",
      "Ballerina Braids",
      "Milkmaid Braids",
      "Bohemian Braids",
      "Flat Twist",
      "Crown Twist",
      "Twisted Bun",
      "Twisted Half-Updo",
      "Twist and Pin Updo",
      "Chignon",
      "Simple Chignon",
      "Messy Chignon",
      "French Twist",
      "French Twist Updo",
      "French Roll",
      "Updo",
      "Messy Updo",
      "Knotted Updo",
      "Ballerina Bun",
      "Banana Clip Updo",
      "Beehive",
      "Bouffant",
      "Hair Bow",
      "Half-Up Top Knot",
      "Half-Up, Half-Down",
      "Messy Bun with a Headband",
      "Messy Bun with a Scarf",
      "Messy Fishtail Braid",
      "Sideswept Pixie",
      "Mohawk Fade",
      "Zig-Zag Part",
      "Victory Rolls"
    ],
    description: "The haircut to give them"
  })
  declare haircut: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image of the person's haircut you want to edit. Must be jpeg, png, gif, or webp."
  })
  declare input_image: any;

  @prop({
    type: "enum",
    default: "png",
    values: ["jpg", "png"],
    description: "Output format for the generated image"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 2,
    description:
      "Safety tolerance, 0 is most strict and 2 is most permissive. 2 is currently the maximum allowed."
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const gender = String(this.gender ?? "none");
    const hairColor = String(this.hair_color ?? "No change");
    const haircut = String(this.haircut ?? "No change");
    const outputFormat = String(this.output_format ?? "png");
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      gender: gender,
      hair_color: hairColor,
      haircut: haircut,
      output_format: outputFormat,
      safety_tolerance: safetyTolerance,
      seed: seed
    };

    const inputImageRef = this.input_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await assetToUrl(inputImageRef!, apiKey);
      if (inputImageUrl) args["input_image"] = inputImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "flux-kontext-apps/change-haircut:e30b995ea7834dd440ee987205fffe1841ce28c638f2ec8d599972e904fe69f8",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Professional_Headshot extends ReplicateNode {
  static readonly nodeType =
    "replicate.image.generate.Flux_Professional_Headshot";
  static readonly title = "Flux_ Professional_ Headshot";
  static readonly description = `Create a professional headshot photo from any single image
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
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "21:9",
      "9:21",
      "2:1",
      "1:2"
    ],
    description:
      "Aspect ratio of the generated image. Use 'match_input_image' to match the aspect ratio of the input image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "neutral",
    values: ["white", "black", "neutral", "gray", "office"],
    description: "The background of the headshot"
  })
  declare background: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "male", "female"],
    description: "The gender of the person"
  })
  declare gender: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image of the person to create a professional headshot for. Must be jpeg, png, gif, or webp."
  })
  declare input_image: any;

  @prop({
    type: "enum",
    default: "png",
    values: ["jpg", "png"],
    description: "Output format for the generated image"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 2,
    description:
      "Safety tolerance, 0 is most strict and 2 is most permissive. 2 is currently the maximum allowed."
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const background = String(this.background ?? "neutral");
    const gender = String(this.gender ?? "none");
    const outputFormat = String(this.output_format ?? "png");
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      background: background,
      gender: gender,
      output_format: outputFormat,
      safety_tolerance: safetyTolerance,
      seed: seed
    };

    const inputImageRef = this.input_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await assetToUrl(inputImageRef!, apiKey);
      if (inputImageUrl) args["input_image"] = inputImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "flux-kontext-apps/professional-headshot:383e326b60ec0bd451af148f204579fc9dcc13c030df51ff2af628b2d2cdb21e",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Restore_Image extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Restore_Image";
  static readonly title = "Flux_ Restore_ Image";
  static readonly description = `Use FLUX Kontext to restore, fix scratches and damage, and colorize old photos
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: "",
    description: "Image to restore. Must be jpeg, png, gif, or webp."
  })
  declare input_image: any;

  @prop({
    type: "enum",
    default: "png",
    values: ["jpg", "png"],
    description: "Output format for the generated image"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 2,
    description:
      "Safety tolerance, 0 is most strict and 2 is most permissive. 2 is currently the maximum allowed."
  })
  declare safety_tolerance: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const outputFormat = String(this.output_format ?? "png");
    const safetyTolerance = Number(this.safety_tolerance ?? 2);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      output_format: outputFormat,
      safety_tolerance: safetyTolerance,
      seed: seed
    };

    const inputImageRef = this.input_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await assetToUrl(inputImageRef!, apiKey);
      if (inputImageUrl) args["input_image"] = inputImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "flux-kontext-apps/restore-image:da7613a13aac59a1a3231023f0f30cf27991695ee0fe7ef52959ec1e02311c25",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Ideogram_Character extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Ideogram_Character";
  static readonly title = "Ideogram_ Character";
  static readonly description = `Generate consistent characters from a single reference image. Outputs can be in many styles. You can also use inpainting to add your character to an existing image.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "1:1",
    values: [
      "1:3",
      "3:1",
      "1:2",
      "2:1",
      "9:16",
      "16:9",
      "10:16",
      "16:10",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "1:1"
    ],
    description:
      "Aspect ratio. Ignored if a resolution or inpainting image is given."
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description: "An image to use as a character reference."
  })
  declare character_reference_image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An image file to use for inpainting. You must also use a mask."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: ["Auto", "On", "Off"],
    description:
      "Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages."
  })
  declare magic_prompt_option: any;

  @prop({
    type: "image",
    default: "",
    description:
      "A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size."
  })
  declare mask: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "Default",
    values: ["Default", "Turbo", "Quality"],
    description:
      "Rendering speed. Turbo for faster and cheaper generation, quality for higher quality and more expensive generation, default for balanced."
  })
  declare rendering_speed: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "512x1536",
      "576x1408",
      "576x1472",
      "576x1536",
      "640x1344",
      "640x1408",
      "640x1472",
      "640x1536",
      "704x1152",
      "704x1216",
      "704x1280",
      "704x1344",
      "704x1408",
      "704x1472",
      "736x1312",
      "768x1088",
      "768x1216",
      "768x1280",
      "768x1344",
      "800x1280",
      "832x960",
      "832x1024",
      "832x1088",
      "832x1152",
      "832x1216",
      "832x1248",
      "864x1152",
      "896x960",
      "896x1024",
      "896x1088",
      "896x1120",
      "896x1152",
      "960x832",
      "960x896",
      "960x1024",
      "960x1088",
      "1024x832",
      "1024x896",
      "1024x960",
      "1024x1024",
      "1088x768",
      "1088x832",
      "1088x896",
      "1088x960",
      "1120x896",
      "1152x704",
      "1152x832",
      "1152x864",
      "1152x896",
      "1216x704",
      "1216x768",
      "1216x832",
      "1248x832",
      "1280x704",
      "1280x768",
      "1280x800",
      "1312x736",
      "1344x640",
      "1344x704",
      "1344x768",
      "1408x576",
      "1408x640",
      "1408x704",
      "1472x576",
      "1472x640",
      "1472x704",
      "1536x512",
      "1536x576",
      "1536x640"
    ],
    description:
      "Resolution. Overrides aspect ratio. Ignored if an inpainting image is given."
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "Auto",
    values: ["Auto", "Fiction", "Realistic"],
    description: "The character style type. Auto, Fiction, or Realistic."
  })
  declare style_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const magicPromptOption = String(this.magic_prompt_option ?? "Auto");
    const prompt = String(this.prompt ?? "");
    const renderingSpeed = String(this.rendering_speed ?? "Default");
    const resolution = String(this.resolution ?? "None");
    const seed = Number(this.seed ?? -1);
    const styleType = String(this.style_type ?? "Auto");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      magic_prompt_option: magicPromptOption,
      prompt: prompt,
      rendering_speed: renderingSpeed,
      resolution: resolution,
      seed: seed,
      style_type: styleType
    };

    const characterReferenceImageRef = this.character_reference_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(characterReferenceImageRef)) {
      const characterReferenceImageUrl = await assetToUrl(
        characterReferenceImageRef!,
        apiKey
      );
      if (characterReferenceImageUrl)
        args["character_reference_image"] = characterReferenceImageUrl;
    }

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
      "ideogram-ai/ideogram-character:1f8e198263a0d8171b76c55907c294e933e1e7d55e2d0c54f319c0e4a42c723d",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class OmniGen2 extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.OmniGen2";
  static readonly title = "Omni Gen2";
  static readonly description = `OmniGen2: a powerful and efficient unified multimodal model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "float", default: 1, description: "CFG range end" })
  declare cfg_range_end: any;

  @prop({ type: "float", default: 0, description: "CFG range start" })
  declare cfg_range_start: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({ type: "image", default: "", description: "Input image to edit" })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description: "Optional second input image for multi-image operations"
  })
  declare image_2: any;

  @prop({
    type: "image",
    default: "",
    description: "Optional third input image for multi-image operations"
  })
  declare image_3: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "Guidance scale for input image. Higher values increase consistency with input image"
  })
  declare image_guidance_scale: any;

  @prop({
    type: "int",
    default: 2048,
    description: "Maximum input image side length"
  })
  declare max_input_image_side_length: any;

  @prop({
    type: "int",
    default: 1048576,
    description: "Maximum number of pixels in output"
  })
  declare max_pixels: any;

  @prop({
    type: "str",
    default:
      "(((deformed))), blurry, over saturation, bad anatomy, disfigured, poorly drawn face, mutation, mutated, (extra_limb), (ugly), (poorly drawn hands), fused fingers, messy drawing, broken legs censor, censored, censor_bar",
    description: "Negative prompt to guide what should not be in the image"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "Make the person smile",
    description: "Text prompt describing the desired image edit"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "euler",
    values: ["euler", "dpmsolver"],
    description: "Scheduler to use"
  })
  declare scheduler: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set to -1 for random seed"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 5,
    description: "Guidance scale for text prompt"
  })
  declare text_guidance_scale: any;

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cfgRangeEnd = Number(this.cfg_range_end ?? 1);
    const cfgRangeStart = Number(this.cfg_range_start ?? 0);
    const height = Number(this.height ?? 1024);
    const imageGuidanceScale = Number(this.image_guidance_scale ?? 2);
    const maxInputImageSideLength = Number(
      this.max_input_image_side_length ?? 2048
    );
    const maxPixels = Number(this.max_pixels ?? 1048576);
    const negativePrompt = String(
      this.negative_prompt ??
        "(((deformed))), blurry, over saturation, bad anatomy, disfigured, poorly drawn face, mutation, mutated, (extra_limb), (ugly), (poorly drawn hands), fused fingers, messy drawing, broken legs censor, censored, censor_bar"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const prompt = String(this.prompt ?? "Make the person smile");
    const scheduler = String(this.scheduler ?? "euler");
    const seed = Number(this.seed ?? -1);
    const textGuidanceScale = Number(this.text_guidance_scale ?? 5);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      cfg_range_end: cfgRangeEnd,
      cfg_range_start: cfgRangeStart,
      height: height,
      image_guidance_scale: imageGuidanceScale,
      max_input_image_side_length: maxInputImageSideLength,
      max_pixels: maxPixels,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      prompt: prompt,
      scheduler: scheduler,
      seed: seed,
      text_guidance_scale: textGuidanceScale,
      width: width
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const image_2Ref = this.image_2 as Record<string, unknown> | undefined;
    if (isRefSet(image_2Ref)) {
      const image_2Url = await assetToUrl(image_2Ref!, apiKey);
      if (image_2Url) args["image_2"] = image_2Url;
    }

    const image_3Ref = this.image_3 as Record<string, unknown> | undefined;
    if (isRefSet(image_3Ref)) {
      const image_3Url = await assetToUrl(image_3Ref!, apiKey);
      if (image_3Url) args["image_3"] = image_3Url;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/omnigen2:5b9ea1d0821a60be9c861ebfc3513d121ecd8cab1932d3aa8d703e517988502e",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Flux_Kontext_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Flux_Kontext_Fast";
  static readonly title = "Flux_ Kontext_ Fast";
  static readonly description = `Ultra fast flux kontext endpoint
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
      "16:9",
      "21:9",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "3:4",
      "4:3",
      "9:16",
      "9:21"
    ],
    description: "Aspect ratio of the output image"
  })
  declare aspect_ratio: any;

  @prop({ type: "float", default: 3.5, description: "Guidance scale" })
  declare guidance: any;

  @prop({
    type: "int",
    default: 1024,
    description: "Base image size (longest side)"
  })
  declare image_size: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for image to image mode. The aspect ratio of your output will match this image"
  })
  declare img_cond_path: any;

  @prop({ type: "int", default: 30, description: "Number of inference steps" })
  declare num_inference_steps: any;

  @prop({
    type: "enum",
    default: "jpg",
    values: ["png", "jpg", "webp"],
    description: "Output format"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description: "Output quality (for jpg and webp)"
  })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({ type: "int", default: -1, description: "Seed" })
  declare seed: any;

  @prop({
    type: "enum",
    default: "Extra Juiced 🔥 (more speed)",
    values: [
      "Lightly Juiced 🍊 (more consistent)",
      "Juiced 🔥 (default)",
      "Extra Juiced 🔥 (more speed)",
      "Blink of an eye 👁️",
      "Real Time"
    ],
    description: "Speed optimization level"
  })
  declare speed_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const guidance = Number(this.guidance ?? 3.5);
    const imageSize = Number(this.image_size ?? 1024);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const outputFormat = String(this.output_format ?? "jpg");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const speedMode = String(this.speed_mode ?? "Extra Juiced 🔥 (more speed)");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      guidance: guidance,
      image_size: imageSize,
      num_inference_steps: numInferenceSteps,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed,
      speed_mode: speedMode
    };

    const imgCondPathRef = this.img_cond_path as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imgCondPathRef)) {
      const imgCondPathUrl = await assetToUrl(imgCondPathRef!, apiKey);
      if (imgCondPathUrl) args["img_cond_path"] = imgCondPathUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "prunaai/flux-kontext-fast:6efb57153457f8c51fb813c6d15f45d896f1916dd7d732af49d6a4b09488e2a6",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class P_Image_Edit extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.P_Image_Edit";
  static readonly title = "P_ Image_ Edit";
  static readonly description = `A sub 1 second 0.01$ multi-image editing model built for production use cases. For image generation, check out p-image here: https://replicate.com/prunaai/p-image
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
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3"
    ],
    description:
      "Aspect ratio for the generated image. 'match_input_image' will match the aspect ratio of the first image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Images to use as a reference. For editing task, provide the main image as the first image."
  })
  declare images: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for image generation. Make sure to describe your edit task clearly. You can refer to the images as 'image 1' and 'image 2' and so on."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "default",
    values: [
      "default",
      "multiple_angles",
      "relight",
      "light_restoration",
      "white_to_scene",
      "fusion",
      "add_characters",
      "next_scene",
      "style_consistency",
      "subject_consistency",
      "scene_consistency",
      "to_anime",
      "to_3dchibi",
      "to_caricature",
      "photous",
      "extract_texture",
      "apply_texture",
      "upscale",
      "anything_to_real",
      "white_film_to_rendering"
    ],
    description: "Task to perform with P-Edit."
  })
  declare replicate_weights: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation."
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If turned on, the model will run faster with additional optimizations. For complicated tasks, it is recommended to turn this off."
  })
  declare turbo: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const prompt = String(this.prompt ?? "");
    const replicateWeights = String(this.replicate_weights ?? "default");
    const seed = Number(this.seed ?? -1);
    const turbo = Boolean(this.turbo ?? true);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      prompt: prompt,
      replicate_weights: replicateWeights,
      seed: seed,
      turbo: turbo
    };

    const imagesRef = this.images as Record<string, unknown> | undefined;
    if (isRefSet(imagesRef)) {
      const imagesUrl = await assetToUrl(imagesRef!, apiKey);
      if (imagesUrl) args["images"] = imagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "prunaai/p-image-edit:21572612bd5577c2cddc926e177b7e50640a8fae9cd51a69677f0d29d37e3df5",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Qwen_Image_Edit_Plus extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Qwen_Image_Edit_Plus";
  static readonly title = "Qwen_ Image_ Edit_ Plus";
  static readonly description = `The latest Qwen-Image’s iteration with improved multi-image editing, single-image consistency, and native support for ControlNet
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "match_input_image",
    values: ["1:1", "16:9", "9:16", "4:3", "3:4", "match_input_image"],
    description: "Aspect ratio for the generated image"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "bool",
    default: true,
    description: "Run faster predictions with additional optimizations."
  })
  declare go_fast: any;

  @prop({
    type: "image",
    default: [],
    description: "Images to use as reference. Must be jpeg, png, gif, or webp."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Format of the output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 95,
    description:
      "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description: "Text instruction on how to edit the given image."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "match_input_image");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const goFast = Boolean(this.go_fast ?? true);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 95);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      go_fast: goFast,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "qwen/qwen-image-edit-plus:7677b9cc9967f7725fcf5e814a5a3446bf1d4b6ab0f9c15534dbbc54c7a088f2",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Gen4_Image extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Gen4_Image";
  static readonly title = "Gen4_ Image";
  static readonly description = `Runway's Gen-4 Image model with references. Use up to 3 reference images to create the exact image you need. Capture every angle.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    description: "Image aspect ratio"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Up to 3 reference images. Images must be between 0.5 and 2 aspect ratio."
  })
  declare reference_images: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "An optional tag for each of your reference images. Tags must be alphanumeric and start with a letter. You can reference them in your prompt using @tag_name. Tags must be between 3 and 15 characters."
  })
  declare reference_tags: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    description: "Image resolution"
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const prompt = String(this.prompt ?? "");
    const referenceTags = String(this.reference_tags ?? []);
    const resolution = String(this.resolution ?? "1080p");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      reference_tags: referenceTags,
      resolution: resolution,
      seed: seed
    };

    const referenceImagesRef = this.reference_images as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceImagesRef)) {
      const referenceImagesUrl = await assetToUrl(referenceImagesRef!, apiKey);
      if (referenceImagesUrl) args["reference_images"] = referenceImagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "runwayml/gen4-image:653987038aea936ca0991639ad92c07e5cbe5dfc646e89377009252a42375b46",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Gen4_Image_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Gen4_Image_Turbo";
  static readonly title = "Gen4_ Image_ Turbo";
  static readonly description = `Gen-4 Image Turbo is cheaper and 2.5x faster than Gen-4 Image. An image model with references, use up to 3 reference images to create the exact image you need. Capture every angle.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    description: "Image aspect ratio"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "You must give at least one reference image. Up to 3 reference images are supported. Images must be between 0.5 and 2 aspect ratio."
  })
  declare reference_images: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "An optional tag for each of your reference images. Tags must be alphanumeric and start with a letter. You can reference them in your prompt using @tag_name. Tags must be between 3 and 15 characters."
  })
  declare reference_tags: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    description: "Image resolution"
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const prompt = String(this.prompt ?? "");
    const referenceTags = String(this.reference_tags ?? []);
    const resolution = String(this.resolution ?? "1080p");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      reference_tags: referenceTags,
      resolution: resolution,
      seed: seed
    };

    const referenceImagesRef = this.reference_images as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceImagesRef)) {
      const referenceImagesUrl = await assetToUrl(referenceImagesRef!, apiKey);
      if (referenceImagesUrl) args["reference_images"] = referenceImagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "runwayml/gen4-image-turbo:d22ea0d0c36ad63c18519dda6fc42dca46f5b84b4864678fb070b2370fea5f59",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class IC_Light_Background extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.IC_Light_Background";
  static readonly title = "I C_ Light_ Background";
  static readonly description = `🖼️✨Background images + prompts to auto-magically relights your images (+normal maps🗺️)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "str",
    default: "best quality",
    description:
      "Additional text to be appended to the main prompt, enhancing image quality"
  })
  declare appended_prompt: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The background image that will be used to relight the main foreground image"
  })
  declare background_image: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "Classifier-Free Guidance scale - higher values encourage adherence to prompt, lower values encourage more creative interpretation"
  })
  declare cfg: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to compute the normal maps (slower but provides additional output images)"
  })
  declare compute_normal: any;

  @prop({
    type: "enum",
    default: 640,
    values: [
      "256",
      "320",
      "384",
      "448",
      "512",
      "576",
      "640",
      "704",
      "768",
      "832",
      "896",
      "960",
      "1024"
    ],
    description: "The height of the generated images in pixels"
  })
  declare height: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Controls the amount of denoising applied when refining the high resolution output (higher = more adherence to the upscaled latent, lower = more creative details added)"
  })
  declare highres_denoise: any;

  @prop({
    type: "float",
    default: 1.5,
    description:
      "The multiplier for the final output resolution relative to the initial latent resolution"
  })
  declare highres_scale: any;

  @prop({
    type: "enum",
    default: "Use Background Image",
    values: [
      "Use Background Image",
      "Use Flipped Background Image",
      "Left Light",
      "Right Light",
      "Top Light",
      "Bottom Light",
      "Ambient"
    ],
    description:
      "The type and position of lighting to apply to the initial background latent"
  })
  declare light_source: any;

  @prop({
    type: "str",
    default: "lowres, bad anatomy, bad hands, cropped, worst quality",
    description:
      "A text description of attributes to avoid in the generated images"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "The number of unique images to generate from the given input and settings"
  })
  declare number_of_images: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "The image file format of the generated output images"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "The image compression quality (for lossy formats like JPEG and WebP). 100 = best quality, 0 = lowest quality."
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A text description guiding the relighting and generation process"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "A fixed random seed for reproducible results (omit this parameter for a randomized seed)"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 25,
    description:
      "The number of diffusion steps to perform during generation (more steps generally improves image quality but increases processing time)"
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description: "The main foreground image to be relighted"
  })
  declare subject_image: any;

  @prop({
    type: "enum",
    default: 512,
    values: [
      "256",
      "320",
      "384",
      "448",
      "512",
      "576",
      "640",
      "704",
      "768",
      "832",
      "896",
      "960",
      "1024"
    ],
    description: "The width of the generated images in pixels"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const appendedPrompt = String(this.appended_prompt ?? "best quality");
    const cfg = Number(this.cfg ?? 2);
    const computeNormal = Boolean(this.compute_normal ?? false);
    const height = String(this.height ?? 640);
    const highresDenoise = Number(this.highres_denoise ?? 0.5);
    const highresScale = Number(this.highres_scale ?? 1.5);
    const lightSource = String(this.light_source ?? "Use Background Image");
    const negativePrompt = String(
      this.negative_prompt ??
        "lowres, bad anatomy, bad hands, cropped, worst quality"
    );
    const numberOfImages = Number(this.number_of_images ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 25);
    const width = String(this.width ?? 512);

    const args: Record<string, unknown> = {
      appended_prompt: appendedPrompt,
      cfg: cfg,
      compute_normal: computeNormal,
      height: height,
      highres_denoise: highresDenoise,
      highres_scale: highresScale,
      light_source: lightSource,
      negative_prompt: negativePrompt,
      number_of_images: numberOfImages,
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed,
      steps: steps,
      width: width
    };

    const backgroundImageRef = this.background_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(backgroundImageRef)) {
      const backgroundImageUrl = await assetToUrl(backgroundImageRef!, apiKey);
      if (backgroundImageUrl) args["background_image"] = backgroundImageUrl;
    }

    const subjectImageRef = this.subject_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(subjectImageRef)) {
      const subjectImageUrl = await assetToUrl(subjectImageRef!, apiKey);
      if (subjectImageUrl) args["subject_image"] = subjectImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/ic-light-background:60015df78a8a795470da6494822982140d57b150b9ef14354e79302ff89f69e3",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Step1X_Edit extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Step1X_Edit";
  static readonly title = "Step1 X_ Edit";
  static readonly description = `✍️Step1X-Edit by stepfun-ai, Edit an image using text prompt📸
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["webp", "jpg", "png"],
    description: "Output image format"
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 80,
    description: "Compression quality for JPEG / WebP (1-100)"
  })
  declare output_quality: any;

  @prop({
    type: "str",
    default: "Remove the person from the image.",
    description: "Editing instruction prompt"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed for reproducible results (leave blank for random)"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: 512,
    values: ["512", "768", "1024"],
    description:
      "Internal resolution (larger values process slower but may capture finer details)"
  })
  declare size_level: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const prompt = String(this.prompt ?? "Remove the person from the image.");
    const seed = Number(this.seed ?? -1);
    const sizeLevel = String(this.size_level ?? 512);

    const args: Record<string, unknown> = {
      output_format: outputFormat,
      output_quality: outputQuality,
      prompt: prompt,
      seed: seed,
      size_level: sizeLevel
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/step1x-edit:12b5a5a61e3419f792eb56cfc16eed046252740ebf5d470228f9b4cf2c861610",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Color_Matcher extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.Color_Matcher";
  static readonly title = "Color_ Matcher";
  static readonly description = `Color match and white balance fixes for images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Apply automatic white balance to input image (before color transfer)"
  })
  declare fix_white_balance: any;

  @prop({ type: "image", default: "", description: "The input image" })
  declare input_image: any;

  @prop({
    type: "enum",
    default: "mkl",
    values: ["mkl", "hm", "reinhard", "mvgd", "hm-mvgd-hm", "hm-mkl-hm"],
    description: "The method to use for color transfer"
  })
  declare method: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The reference image. If not provided, only white balance fixes will be applied."
  })
  declare reference_image: any;

  @prop({
    type: "float",
    default: 1,
    description: "Strength of the color transfer effect (0.0 to 1.0)"
  })
  declare strength: any;

  @prop({
    type: "float",
    default: 95,
    description: "Percentile for white balance calculation (0.0 to 100.0)"
  })
  declare white_balance_percentile: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const fixWhiteBalance = Boolean(this.fix_white_balance ?? false);
    const method = String(this.method ?? "mkl");
    const strength = Number(this.strength ?? 1);
    const whiteBalancePercentile = Number(this.white_balance_percentile ?? 95);

    const args: Record<string, unknown> = {
      fix_white_balance: fixWhiteBalance,
      method: method,
      strength: strength,
      white_balance_percentile: whiteBalancePercentile
    };

    const inputImageRef = this.input_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await assetToUrl(inputImageRef!, apiKey);
      if (inputImageUrl) args["input_image"] = inputImageUrl;
    }

    const referenceImageRef = this.reference_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceImageRef)) {
      const referenceImageUrl = await assetToUrl(referenceImageRef!, apiKey);
      if (referenceImageUrl) args["reference_image"] = referenceImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fofr/color-matcher:9870c2ebd9f6f747c39c23815cb58489e8df129e0bace4d61cf8ba3ddd03cb26",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class ControlNet_Tile extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.ControlNet_Tile";
  static readonly title = "Control Net_ Tile";
  static readonly description = `Controlnet v1.1 - Tile Version
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "int", default: 32, description: "Number of inference steps" })
  declare num_inference_steps: any;

  @prop({
    type: "enum",
    default: 2,
    values: ["2", "4", "8", "16"],
    description: "Scale multiplier"
  })
  declare scale: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "Strength of the diffusion"
  })
  declare strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const numInferenceSteps = Number(this.num_inference_steps ?? 32);
    const scale = String(this.scale ?? 2);
    const seed = Number(this.seed ?? -1);
    const strength = Number(this.strength ?? 0.5);

    const args: Record<string, unknown> = {
      num_inference_steps: numInferenceSteps,
      scale: scale,
      seed: seed,
      strength: strength
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/controlnet-tile:f688ff774c27a4843c819c9264c0f949925970bb278669ed9140364c8389869c",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class IP_Adapter_FaceID extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.IP_Adapter_FaceID";
  static readonly title = "I P_ Adapter_ Face I D";
  static readonly description = `(Research only) IP-Adapter-FaceID can generate various style images conditioned on a face with only text prompts
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "You must agree to use this model only for research. It is not for commercial use."
  })
  declare agree_to_research_only: any;

  @prop({ type: "image", default: "", description: "Input face image" })
  declare face_image: any;

  @prop({ type: "int", default: 1024, description: "Height of output image" })
  declare height: any;

  @prop({
    type: "str",
    default:
      "monochrome, lowres, bad anatomy, worst quality, low quality, blurry",
    description: "Input Negative Prompt"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output" })
  declare num_outputs: any;

  @prop({
    type: "str",
    default: "photo of a woman in red dress in a garden",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({ type: "int", default: 1024, description: "Width of output image" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const agreeToResearchOnly = Boolean(this.agree_to_research_only ?? false);
    const height = Number(this.height ?? 1024);
    const negativePrompt = String(
      this.negative_prompt ??
        "monochrome, lowres, bad anatomy, worst quality, low quality, blurry"
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(
      this.prompt ?? "photo of a woman in red dress in a garden"
    );
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      agree_to_research_only: agreeToResearchOnly,
      height: height,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      seed: seed,
      width: width
    };

    const faceImageRef = this.face_image as Record<string, unknown> | undefined;
    if (isRefSet(faceImageRef)) {
      const faceImageUrl = await assetToUrl(faceImageRef!, apiKey);
      if (faceImageUrl) args["face_image"] = faceImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/ip-adapter-faceid:fb81ef963e74776af72e6f380949013533d46dd5c6228a9e586c57db6303d7cd",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class IP_Adapter_Face_Inpaint extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.IP_Adapter_Face_Inpaint";
  static readonly title = "I P_ Adapter_ Face_ Inpaint";
  static readonly description = `A combination of ip_adapter SDv1.5 and mediapipe-face to inpaint a face
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 0,
    description: "Blur to apply to mask to face"
  })
  declare blur_amount: any;

  @prop({ type: "image", default: "", description: "Input face image" })
  declare face_image: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Source image of body" })
  declare source_image: any;

  @prop({ type: "float", default: 0.7, description: "mask strength" })
  declare strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const blurAmount = Number(this.blur_amount ?? 0);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const strength = Number(this.strength ?? 0.7);

    const args: Record<string, unknown> = {
      blur_amount: blurAmount,
      num_outputs: numOutputs,
      prompt: prompt,
      seed: seed,
      strength: strength
    };

    const faceImageRef = this.face_image as Record<string, unknown> | undefined;
    if (isRefSet(faceImageRef)) {
      const faceImageUrl = await assetToUrl(faceImageRef!, apiKey);
      if (faceImageUrl) args["face_image"] = faceImageUrl;
    }

    const sourceImageRef = this.source_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(sourceImageRef)) {
      const sourceImageUrl = await assetToUrl(sourceImageRef!, apiKey);
      if (sourceImageUrl) args["source_image"] = sourceImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/ip_adapter-face-inpaint:b199f118e2133894551cc59ff0777276e275cf64e9e8e0369ca6c4c599097890",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class IP_Adapter_SDXL_Face extends ReplicateNode {
  static readonly nodeType = "replicate.image.generate.IP_Adapter_SDXL_Face";
  static readonly title = "I P_ Adapter_ S D X L_ Face";
  static readonly description = `The image prompt adapter is designed to enable a pretrained text-to-image diffusion model to generate SDXL images with an image prompt
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Input face image" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output." })
  declare num_outputs: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt (leave blank for image variations)"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.6,
    description: "Scale (influence of input image on generation)"
  })
  declare scale: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const numOutputs = Number(this.num_outputs ?? 1);
    const prompt = String(this.prompt ?? "");
    const scale = Number(this.scale ?? 0.6);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      prompt: prompt,
      scale: scale,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/ip_adapter-sdxl-face:226c6bf67a75a129b0f978e518fed33e1fb13956e15761c1ac53c9d2f898c9af",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export const REPLICATE_IMAGE_GENERATE_NODES: readonly NodeClass[] = [
  AdInpaint,
  ConsistentCharacter,
  PulidBase,
  StableDiffusion,
  StableDiffusion3_5_Medium,
  StableDiffusion3_5_Large,
  StableDiffusion3_5_Large_Turbo,
  Photon_Flash,
  StableDiffusionXL,
  SDXL_Pixar,
  SDXL_Emoji,
  StableDiffusionInpainting,
  Kandinsky,
  Flux_Schnell,
  Flux_Dev,
  Flux_Pro,
  Flux_1_1_Pro_Ultra,
  Flux_Dev_Lora,
  Flux_Schnell_Lora,
  Flux_Depth_Pro,
  Flux_Canny_Pro,
  Flux_Fill_Pro,
  Flux_Depth_Dev,
  Hyper_Flux_8Step,
  Flux_Mona_Lisa,
  Flux_Cinestill,
  Flux_Black_Light,
  Flux_360,
  Recraft_V3,
  Recraft_20B,
  Recraft_20B_SVG,
  Recraft_V3_SVG,
  Flux_Canny_Dev,
  Flux_Fill_Dev,
  Flux_Redux_Schnell,
  Flux_Redux_Dev,
  SDXL_Controlnet,
  SDXL_Ad_Inpaint,
  StableDiffusionXLLightning,
  PlaygroundV2,
  Proteus_V_02,
  Proteus_V_03,
  StickerMaker,
  StyleTransfer,
  Illusions,
  Ideogram_V2,
  Ideogram_V2_Turbo,
  Ideogram_V2A,
  Imagen_3,
  Qwen_Image,
  Qwen_Image_Edit,
  Seedream_4,
  Minimax_Image_01,
  Flux_2_Pro,
  Flux_2_Flex,
  GPT_Image_1_5,
  Flux_2_Max,
  Imagen_4_Fast,
  Ideogram_V3_Turbo,
  Flux_Kontext_Pro,
  Seedream_4_5,
  Seedream_5_Lite,
  Seedream_3,
  Recraft_V4,
  Recraft_V4_SVG,
  Recraft_V4_Pro,
  Recraft_V4_Pro_SVG,
  Ideogram_V3_Balanced,
  Ideogram_V3_Quality,
  Ideogram_V2A_Turbo,
  Imagen_4,
  Imagen_4_Ultra,
  Imagen_3_Fast,
  Nano_Banana_Pro,
  Grok_Imagine_Image,
  Fibo,
  Bria_Image_3_2,
  Flux_2_Klein_4B,
  Flux_Kontext_Max,
  Hunyuan_Image_3,
  Flux_PuLID,
  PuLID,
  Flux_Change_Haircut,
  Flux_Professional_Headshot,
  Flux_Restore_Image,
  Ideogram_Character,
  OmniGen2,
  Flux_Kontext_Fast,
  P_Image_Edit,
  Qwen_Image_Edit_Plus,
  Gen4_Image,
  Gen4_Image_Turbo,
  IC_Light_Background,
  Step1X_Edit,
  Color_Matcher,
  ControlNet_Tile,
  IP_Adapter_FaceID,
  IP_Adapter_Face_Inpaint,
  IP_Adapter_SDXL_Face
] as const;
