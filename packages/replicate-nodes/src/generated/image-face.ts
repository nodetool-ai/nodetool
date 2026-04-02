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

export class FaceToMany extends ReplicateNode {
  static readonly nodeType = "replicate.image.face.FaceToMany";
  static readonly title = "Face To Many";
  static readonly description = `Turn a face into 3D, emoji, pixel art, video game, claymation or toy
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Strength of depth controlnet. The bigger this is, the more controlnet affects the output."
  })
  declare control_depth_strength: any;

  @prop({
    type: "str",
    default: "",
    description:
      "URL to a Replicate custom LoRA. Must be in the format https://replicate.delivery/pbxt/[id]/trained_model.tar or https://pbxt.replicate.delivery/[id]/trained_model.tar"
  })
  declare custom_lora_url: any;

  @prop({
    type: "float",
    default: 0.65,
    description:
      "How much of the original image to keep. 1 is the complete destruction of the original image, 0 is the original image"
  })
  declare denoising_strength: any;

  @prop({
    type: "image",
    default: "",
    description: "An image of a person to be converted"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 1,
    description: "How strong the InstantID will be."
  })
  declare instant_id_strength: any;

  @prop({
    type: "float",
    default: 1,
    description: "How strong the LoRA will be"
  })
  declare lora_scale: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want in the image"
  })
  declare negative_prompt: any;

  @prop({ type: "str", default: "a person" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 4.5,
    description:
      "Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original."
  })
  declare prompt_strength: any;

  @prop({
    type: "int",
    default: -1,
    description: "Fix the random seed for reproducibility"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "3D",
    values: ["3D", "Emoji", "Video game", "Pixels", "Clay", "Toy"],
    description: "Style to convert to"
  })
  declare style: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const controlDepthStrength = Number(this.control_depth_strength ?? 0.8);
    const customLoraUrl = String(this.custom_lora_url ?? "");
    const denoisingStrength = Number(this.denoising_strength ?? 0.65);
    const instantIdStrength = Number(this.instant_id_strength ?? 1);
    const loraScale = Number(this.lora_scale ?? 1);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "a person");
    const promptStrength = Number(this.prompt_strength ?? 4.5);
    const seed = Number(this.seed ?? -1);
    const style = String(this.style ?? "3D");

    const args: Record<string, unknown> = {
      control_depth_strength: controlDepthStrength,
      custom_lora_url: customLoraUrl,
      denoising_strength: denoisingStrength,
      instant_id_strength: instantIdStrength,
      lora_scale: loraScale,
      negative_prompt: negativePrompt,
      prompt: prompt,
      prompt_strength: promptStrength,
      seed: seed,
      style: style
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fofr/face-to-many:a07f252abbbd832009640b27f063ea52d87d7a23a185ca165bec23b5adc8deaf",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class BecomeImage extends ReplicateNode {
  static readonly nodeType = "replicate.image.face.BecomeImage";
  static readonly title = "Become Image";
  static readonly description = `Adapt any picture of a face into another image
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 0.8,
    description:
      "Strength of depth controlnet. The bigger this is, the more controlnet affects the output."
  })
  declare control_depth_strength: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "How much of the original image of the person to keep. 1 is the complete destruction of the original image, 0 is the original image"
  })
  declare denoising_strength: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "image",
    default: "",
    description: "An image of a person to be converted"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description: "Any image to convert the person to"
  })
  declare image_to_become: any;

  @prop({
    type: "float",
    default: 0.3,
    description:
      "How much noise to add to the style image before processing. An alternative way of controlling stength."
  })
  declare image_to_become_noise: any;

  @prop({
    type: "float",
    default: 0.75,
    description: "How strong the style will be applied"
  })
  declare image_to_become_strength: any;

  @prop({
    type: "float",
    default: 1,
    description: "How strong the InstantID will be."
  })
  declare instant_id_strength: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want in the image"
  })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 2,
    description: "Number of images to generate"
  })
  declare number_of_images: any;

  @prop({ type: "str", default: "a person" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 2,
    description:
      "Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original."
  })
  declare prompt_strength: any;

  @prop({
    type: "int",
    default: -1,
    description: "Fix the random seed for reproducibility"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const controlDepthStrength = Number(this.control_depth_strength ?? 0.8);
    const denoisingStrength = Number(this.denoising_strength ?? 1);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const imageToBecomeNoise = Number(this.image_to_become_noise ?? 0.3);
    const imageToBecomeStrength = Number(this.image_to_become_strength ?? 0.75);
    const instantIdStrength = Number(this.instant_id_strength ?? 1);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numberOfImages = Number(this.number_of_images ?? 2);
    const prompt = String(this.prompt ?? "a person");
    const promptStrength = Number(this.prompt_strength ?? 2);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      control_depth_strength: controlDepthStrength,
      denoising_strength: denoisingStrength,
      disable_safety_checker: disableSafetyChecker,
      image_to_become_noise: imageToBecomeNoise,
      image_to_become_strength: imageToBecomeStrength,
      instant_id_strength: instantIdStrength,
      negative_prompt: negativePrompt,
      number_of_images: numberOfImages,
      prompt: prompt,
      prompt_strength: promptStrength,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const imageToBecomeRef = this.image_to_become as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageToBecomeRef)) {
      const imageToBecomeUrl = await assetToUrl(imageToBecomeRef!, apiKey);
      if (imageToBecomeUrl) args["image_to_become"] = imageToBecomeUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fofr/become-image:8d0b076a2aff3904dfcec3253c778e0310a68f78483c4699c7fd800f3051d2b3",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class PhotoMaker extends ReplicateNode {
  static readonly nodeType = "replicate.image.face.PhotoMaker";
  static readonly title = "Photo Maker";
  static readonly description = `Create photos, paintings and avatars for anyone in any style within seconds.
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
    default: 5,
    description:
      "Guidance scale. A guidance scale of 1 corresponds to doing no classifier free guidance."
  })
  declare guidance_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "The input image, for example a photo of your face."
  })
  declare input_image: any;

  @prop({
    type: "image",
    default: "",
    description: "Additional input image (optional)"
  })
  declare input_image2: any;

  @prop({
    type: "image",
    default: "",
    description: "Additional input image (optional)"
  })
  declare input_image3: any;

  @prop({
    type: "image",
    default: "",
    description: "Additional input image (optional)"
  })
  declare input_image4: any;

  @prop({
    type: "str",
    default:
      "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
    description:
      "Negative Prompt. The negative prompt should NOT contain the trigger word."
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 1, description: "Number of output images" })
  declare num_outputs: any;

  @prop({ type: "int", default: 20, description: "Number of sample steps" })
  declare num_steps: any;

  @prop({
    type: "str",
    default: "A photo of a person img",
    description:
      "Prompt. Example: 'a photo of a man/woman img'. The phrase 'img' is the trigger word."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Seed. Leave blank to use a random number"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "Photographic (Default)",
    values: [
      "(No style)",
      "Cinematic",
      "Disney Charactor",
      "Digital Art",
      "Photographic (Default)",
      "Fantasy art",
      "Neonpunk",
      "Enhance",
      "Comic book",
      "Lowpoly",
      "Line art"
    ],
    description:
      "Style template. The style template will add a style-specific prompt and negative prompt to the user's prompt."
  })
  declare style_name: any;

  @prop({ type: "float", default: 20, description: "Style strength (%)" })
  declare style_strength_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const negativePrompt = String(
      this.negative_prompt ??
        "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry"
    );
    const numOutputs = Number(this.num_outputs ?? 1);
    const numSteps = Number(this.num_steps ?? 20);
    const prompt = String(this.prompt ?? "A photo of a person img");
    const seed = Number(this.seed ?? -1);
    const styleName = String(this.style_name ?? "Photographic (Default)");
    const styleStrengthRatio = Number(this.style_strength_ratio ?? 20);

    const args: Record<string, unknown> = {
      disable_safety_checker: disableSafetyChecker,
      guidance_scale: guidanceScale,
      negative_prompt: negativePrompt,
      num_outputs: numOutputs,
      num_steps: numSteps,
      prompt: prompt,
      seed: seed,
      style_name: styleName,
      style_strength_ratio: styleStrengthRatio
    };

    const inputImageRef = this.input_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await assetToUrl(inputImageRef!, apiKey);
      if (inputImageUrl) args["input_image"] = inputImageUrl;
    }

    const inputImage2Ref = this.input_image2 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImage2Ref)) {
      const inputImage2Url = await assetToUrl(inputImage2Ref!, apiKey);
      if (inputImage2Url) args["input_image2"] = inputImage2Url;
    }

    const inputImage3Ref = this.input_image3 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImage3Ref)) {
      const inputImage3Url = await assetToUrl(inputImage3Ref!, apiKey);
      if (inputImage3Url) args["input_image3"] = inputImage3Url;
    }

    const inputImage4Ref = this.input_image4 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImage4Ref)) {
      const inputImage4Url = await assetToUrl(inputImage4Ref!, apiKey);
      if (inputImage4Url) args["input_image4"] = inputImage4Url;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "tencentarc/photomaker:ddfc2b08d209f9fa8c1eca692712918bd449f695dabb4a958da31802a9570fe4",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class PhotoMakerStyle extends ReplicateNode {
  static readonly nodeType = "replicate.image.face.PhotoMakerStyle";
  static readonly title = "Photo Maker Style";
  static readonly description = `Create photos, paintings and avatars for anyone in any style within seconds.  (Stylization version)
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
    default: 5,
    description:
      "Guidance scale. A guidance scale of 1 corresponds to doing no classifier free guidance."
  })
  declare guidance_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "The input image, for example a photo of your face."
  })
  declare input_image: any;

  @prop({
    type: "image",
    default: "",
    description: "Additional input image (optional)"
  })
  declare input_image2: any;

  @prop({
    type: "image",
    default: "",
    description: "Additional input image (optional)"
  })
  declare input_image3: any;

  @prop({
    type: "image",
    default: "",
    description: "Additional input image (optional)"
  })
  declare input_image4: any;

  @prop({
    type: "str",
    default:
      "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
    description:
      "Negative Prompt. The negative prompt should NOT contain the trigger word."
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 1, description: "Number of output images" })
  declare num_outputs: any;

  @prop({ type: "int", default: 20, description: "Number of sample steps" })
  declare num_steps: any;

  @prop({
    type: "str",
    default: "A photo of a person img",
    description:
      "Prompt. Example: 'a photo of a man/woman img'. The phrase 'img' is the trigger word."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Seed. Leave blank to use a random number"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "(No style)",
    values: [
      "(No style)",
      "Cinematic",
      "Disney Charactor",
      "Digital Art",
      "Photographic (Default)",
      "Fantasy art",
      "Neonpunk",
      "Enhance",
      "Comic book",
      "Lowpoly",
      "Line art"
    ],
    description:
      "Style template. The style template will add a style-specific prompt and negative prompt to the user's prompt."
  })
  declare style_name: any;

  @prop({ type: "float", default: 20, description: "Style strength (%)" })
  declare style_strength_ratio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const negativePrompt = String(
      this.negative_prompt ??
        "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry"
    );
    const numOutputs = Number(this.num_outputs ?? 1);
    const numSteps = Number(this.num_steps ?? 20);
    const prompt = String(this.prompt ?? "A photo of a person img");
    const seed = Number(this.seed ?? -1);
    const styleName = String(this.style_name ?? "(No style)");
    const styleStrengthRatio = Number(this.style_strength_ratio ?? 20);

    const args: Record<string, unknown> = {
      disable_safety_checker: disableSafetyChecker,
      guidance_scale: guidanceScale,
      negative_prompt: negativePrompt,
      num_outputs: numOutputs,
      num_steps: numSteps,
      prompt: prompt,
      seed: seed,
      style_name: styleName,
      style_strength_ratio: styleStrengthRatio
    };

    const inputImageRef = this.input_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await assetToUrl(inputImageRef!, apiKey);
      if (inputImageUrl) args["input_image"] = inputImageUrl;
    }

    const inputImage2Ref = this.input_image2 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImage2Ref)) {
      const inputImage2Url = await assetToUrl(inputImage2Ref!, apiKey);
      if (inputImage2Url) args["input_image2"] = inputImage2Url;
    }

    const inputImage3Ref = this.input_image3 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImage3Ref)) {
      const inputImage3Url = await assetToUrl(inputImage3Ref!, apiKey);
      if (inputImage3Url) args["input_image3"] = inputImage3Url;
    }

    const inputImage4Ref = this.input_image4 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImage4Ref)) {
      const inputImage4Url = await assetToUrl(inputImage4Ref!, apiKey);
      if (inputImage4Url) args["input_image4"] = inputImage4Url;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "tencentarc/photomaker-style:467d062309da518648ba89d226490e02b8ed09b5abc15026e54e31c5a8cd0769",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class FaceToSticker extends ReplicateNode {
  static readonly nodeType = "replicate.image.face.FaceToSticker";
  static readonly title = "Face To Sticker";
  static readonly description = `Turn a face into a sticker
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "int", default: 1024 })
  declare height: any;

  @prop({
    type: "image",
    default: "",
    description: "An image of a person to be converted to a sticker"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 1,
    description: "How strong the InstantID will be."
  })
  declare instant_id_strength: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "How much noise is added to the IP adapter input"
  })
  declare ip_adapter_noise: any;

  @prop({
    type: "float",
    default: 0.2,
    description: "How much the IP adapter will influence the image"
  })
  declare ip_adapter_weight: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want in the image"
  })
  declare negative_prompt: any;

  @prop({ type: "str", default: "a person" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 7,
    description:
      "Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original."
  })
  declare prompt_strength: any;

  @prop({
    type: "int",
    default: -1,
    description: "Fix the random seed for reproducibility"
  })
  declare seed: any;

  @prop({ type: "int", default: 20 })
  declare steps: any;

  @prop({ type: "bool", default: false, description: "2x upscale the sticker" })
  declare upscale: any;

  @prop({ type: "int", default: 10, description: "Number of steps to upscale" })
  declare upscale_steps: any;

  @prop({ type: "int", default: 1024 })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const height = Number(this.height ?? 1024);
    const instantIdStrength = Number(this.instant_id_strength ?? 1);
    const ipAdapterNoise = Number(this.ip_adapter_noise ?? 0.5);
    const ipAdapterWeight = Number(this.ip_adapter_weight ?? 0.2);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "a person");
    const promptStrength = Number(this.prompt_strength ?? 7);
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 20);
    const upscale = Boolean(this.upscale ?? false);
    const upscaleSteps = Number(this.upscale_steps ?? 10);
    const width = Number(this.width ?? 1024);

    const args: Record<string, unknown> = {
      height: height,
      instant_id_strength: instantIdStrength,
      ip_adapter_noise: ipAdapterNoise,
      ip_adapter_weight: ipAdapterWeight,
      negative_prompt: negativePrompt,
      prompt: prompt,
      prompt_strength: promptStrength,
      seed: seed,
      steps: steps,
      upscale: upscale,
      upscale_steps: upscaleSteps,
      width: width
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fofr/face-to-sticker:764d4827ea159608a07cdde8ddf1c6000019627515eb02b6b449695fd547e5ef",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class InstantId extends ReplicateNode {
  static readonly nodeType = "replicate.image.face.InstantId";
  static readonly title = "Instant Id";
  static readonly description = `Make realistic images of real people instantly
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 0.3,
    description:
      "Canny ControlNet strength, effective only if 'enable_canny_controlnet' is true"
  })
  declare canny_strength: any;

  @prop({
    type: "float",
    default: 0.8,
    description: "Scale for IdentityNet strength (for fidelity)"
  })
  declare controlnet_conditioning_scale: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Depth ControlNet strength, effective only if 'enable_depth_controlnet' is true"
  })
  declare depth_strength: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated images"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable Canny ControlNet, overrides strength if set to false"
  })
  declare enable_canny_controlnet: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable Depth ControlNet, overrides strength if set to false"
  })
  declare enable_depth_controlnet: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Enable Fast Inference with LCM (Latent Consistency Models) - speeds up inference steps, trade-off is the quality of the generated image. Performs better with close-up portrait face images"
  })
  declare enable_lcm: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Enable Openpose ControlNet, overrides strength if set to false"
  })
  declare enable_pose_controlnet: any;

  @prop({ type: "bool", default: true, description: "Enhance non-face region" })
  declare enhance_nonface_region: any;

  @prop({
    type: "int",
    default: 640,
    description: "Height of the input image for face detection"
  })
  declare face_detection_input_height: any;

  @prop({
    type: "int",
    default: 640,
    description: "Width of the input image for face detection"
  })
  declare face_detection_input_width: any;

  @prop({
    type: "float",
    default: 7.5,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "image", default: "", description: "Input face image" })
  declare image: any;

  @prop({
    type: "float",
    default: 0.8,
    description: "Scale for image adapter strength (for detail)"
  })
  declare ip_adapter_scale: any;

  @prop({
    type: "float",
    default: 1.5,
    description:
      "Only used when 'enable_lcm' is set to True, Scale for classifier-free guidance when using LCM"
  })
  declare lcm_guidance_scale: any;

  @prop({
    type: "int",
    default: 5,
    description:
      "Only used when 'enable_lcm' is set to True, Number of denoising steps when using LCM"
  })
  declare lcm_num_inference_steps: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 1, description: "Number of images to output" })
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
      "Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality."
  })
  declare output_quality: any;

  @prop({
    type: "image",
    default: "",
    description: "(Optional) reference pose image"
  })
  declare pose_image: any;

  @prop({
    type: "float",
    default: 0.4,
    description:
      "Openpose ControlNet strength, effective only if 'enable_pose_controlnet' is true"
  })
  declare pose_strength: any;

  @prop({ type: "str", default: "a person", description: "Input prompt" })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "EulerDiscreteScheduler",
    values: [
      "DEISMultistepScheduler",
      "HeunDiscreteScheduler",
      "EulerDiscreteScheduler",
      "DPMSolverMultistepScheduler",
      "DPMSolverMultistepScheduler-Karras",
      "DPMSolverMultistepScheduler-Karras-SDE"
    ],
    description: "Scheduler"
  })
  declare scheduler: any;

  @prop({
    type: "enum",
    default: "stable-diffusion-xl-base-1.0",
    values: [
      "stable-diffusion-xl-base-1.0",
      "juggernaut-xl-v8",
      "afrodite-xl-v2",
      "albedobase-xl-20",
      "albedobase-xl-v13",
      "animagine-xl-30",
      "anime-art-diffusion-xl",
      "anime-illust-diffusion-xl",
      "dreamshaper-xl",
      "dynavision-xl-v0610",
      "guofeng4-xl",
      "nightvision-xl-0791",
      "omnigen-xl",
      "pony-diffusion-v6-xl",
      "protovision-xl-high-fidel",
      "RealVisXL_V3.0_Turbo",
      "RealVisXL_V4.0_Lightning"
    ],
    description: "Pick which base weights you want to use"
  })
  declare sdxl_weights: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cannyStrength = Number(this.canny_strength ?? 0.3);
    const controlnetConditioningScale = Number(
      this.controlnet_conditioning_scale ?? 0.8
    );
    const depthStrength = Number(this.depth_strength ?? 0.5);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const enableCannyControlnet = Boolean(
      this.enable_canny_controlnet ?? false
    );
    const enableDepthControlnet = Boolean(
      this.enable_depth_controlnet ?? false
    );
    const enableLcm = Boolean(this.enable_lcm ?? false);
    const enablePoseControlnet = Boolean(this.enable_pose_controlnet ?? true);
    const enhanceNonfaceRegion = Boolean(this.enhance_nonface_region ?? true);
    const faceDetectionInputHeight = Number(
      this.face_detection_input_height ?? 640
    );
    const faceDetectionInputWidth = Number(
      this.face_detection_input_width ?? 640
    );
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const ipAdapterScale = Number(this.ip_adapter_scale ?? 0.8);
    const lcmGuidanceScale = Number(this.lcm_guidance_scale ?? 1.5);
    const lcmNumInferenceSteps = Number(this.lcm_num_inference_steps ?? 5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const numOutputs = Number(this.num_outputs ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const poseStrength = Number(this.pose_strength ?? 0.4);
    const prompt = String(this.prompt ?? "a person");
    const scheduler = String(this.scheduler ?? "EulerDiscreteScheduler");
    const sdxlWeights = String(
      this.sdxl_weights ?? "stable-diffusion-xl-base-1.0"
    );
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      canny_strength: cannyStrength,
      controlnet_conditioning_scale: controlnetConditioningScale,
      depth_strength: depthStrength,
      disable_safety_checker: disableSafetyChecker,
      enable_canny_controlnet: enableCannyControlnet,
      enable_depth_controlnet: enableDepthControlnet,
      enable_lcm: enableLcm,
      enable_pose_controlnet: enablePoseControlnet,
      enhance_nonface_region: enhanceNonfaceRegion,
      face_detection_input_height: faceDetectionInputHeight,
      face_detection_input_width: faceDetectionInputWidth,
      guidance_scale: guidanceScale,
      ip_adapter_scale: ipAdapterScale,
      lcm_guidance_scale: lcmGuidanceScale,
      lcm_num_inference_steps: lcmNumInferenceSteps,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      num_outputs: numOutputs,
      output_format: outputFormat,
      output_quality: outputQuality,
      pose_strength: poseStrength,
      prompt: prompt,
      scheduler: scheduler,
      sdxl_weights: sdxlWeights,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const poseImageRef = this.pose_image as Record<string, unknown> | undefined;
    if (isRefSet(poseImageRef)) {
      const poseImageUrl = await assetToUrl(poseImageRef!, apiKey);
      if (poseImageUrl) args["pose_image"] = poseImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/instant-id:2e4785a4d80dadf580077b2244c8d7c05d8e3faac04a04c02d8e099dd2876789",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Instant_ID_Photorealistic extends ReplicateNode {
  static readonly nodeType = "replicate.image.face.Instant_ID_Photorealistic";
  static readonly title = "Instant_ I D_ Photorealistic";
  static readonly description = `InstantID : Zero-shot Identity-Preserving Generation in Seconds. Using Juggernaut-XL v8 as the base model to encourage photorealism
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 0.8,
    description: "Scale for ControlNet conditioning"
  })
  declare controlnet_conditioning_scale: any;

  @prop({
    type: "float",
    default: 5,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 640, description: "Height of output image" })
  declare height: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "float", default: 0.8, description: "Scale for IP adapter" })
  declare ip_adapter_scale: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default:
      "analog film photo of a man. faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, stained, highly detailed, found footage, masterpiece, best quality",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({ type: "int", default: 640, description: "Width of output image" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const controlnetConditioningScale = Number(
      this.controlnet_conditioning_scale ?? 0.8
    );
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const height = Number(this.height ?? 640);
    const ipAdapterScale = Number(this.ip_adapter_scale ?? 0.8);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const prompt = String(
      this.prompt ??
        "analog film photo of a man. faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, stained, highly detailed, found footage, masterpiece, best quality"
    );
    const width = Number(this.width ?? 640);

    const args: Record<string, unknown> = {
      controlnet_conditioning_scale: controlnetConditioningScale,
      guidance_scale: guidanceScale,
      height: height,
      ip_adapter_scale: ipAdapterScale,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      prompt: prompt,
      width: width
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "grandlineai/instant-id-photorealistic:03914a0c3326bf44383d0cd84b06822618af879229ce5d1d53bef38d93b68279",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class Instant_ID_Artistic extends ReplicateNode {
  static readonly nodeType = "replicate.image.face.Instant_ID_Artistic";
  static readonly title = "Instant_ I D_ Artistic";
  static readonly description = `InstantID : Zero-shot Identity-Preserving Generation in Seconds. Using Dreamshaper-XL as the base model to encourage artistic generations
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "float",
    default: 0.8,
    description: "Scale for ControlNet conditioning"
  })
  declare controlnet_conditioning_scale: any;

  @prop({
    type: "float",
    default: 5,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 640, description: "Height of output image" })
  declare height: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "float", default: 0.8, description: "Scale for IP adapter" })
  declare ip_adapter_scale: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default:
      "analog film photo of a man. faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, stained, highly detailed, found footage, masterpiece, best quality",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({ type: "int", default: 640, description: "Width of output image" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const controlnetConditioningScale = Number(
      this.controlnet_conditioning_scale ?? 0.8
    );
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const height = Number(this.height ?? 640);
    const ipAdapterScale = Number(this.ip_adapter_scale ?? 0.8);
    const negativePrompt = String(this.negative_prompt ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const prompt = String(
      this.prompt ??
        "analog film photo of a man. faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, stained, highly detailed, found footage, masterpiece, best quality"
    );
    const width = Number(this.width ?? 640);

    const args: Record<string, unknown> = {
      controlnet_conditioning_scale: controlnetConditioningScale,
      guidance_scale: guidanceScale,
      height: height,
      ip_adapter_scale: ipAdapterScale,
      negative_prompt: negativePrompt,
      num_inference_steps: numInferenceSteps,
      prompt: prompt,
      width: width
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "grandlineai/instant-id-artistic:9cad10c7870bac9d6b587f406aef28208f964454abff5c4152f7dec9b0212a9a",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export const REPLICATE_IMAGE_FACE_NODES: readonly NodeClass[] = [
  FaceToMany,
  BecomeImage,
  PhotoMaker,
  PhotoMakerStyle,
  FaceToSticker,
  InstantId,
  Instant_ID_Photorealistic,
  Instant_ID_Artistic
] as const;
