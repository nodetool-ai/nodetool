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

export class BecomeImage extends ReplicateNode {
  static readonly nodeType = "replicate.image_face.BecomeImage";
  static readonly title = "Become Image";
  static readonly description = `Adapt any picture of a face into another image
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Fix the random seed for reproducibility" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "An image of a person to be converted" })
  declare image: any;

  @prop({ type: "str", default: "a person" })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "Any image to convert the person to" })
  declare image_to_become: any;

  @prop({ type: "str", default: "", description: "Things you do not want in the image" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 2, description: "Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original." })
  declare prompt_strength: any;

  @prop({ type: "int", default: 2, description: "Number of images to generate" })
  declare number_of_images: any;

  @prop({ type: "float", default: 1, description: "How much of the original image of the person to keep. 1 is the complete destruction of the original image, 0 is the original image" })
  declare denoising_strength: any;

  @prop({ type: "float", default: 1, description: "How strong the InstantID will be." })
  declare instant_id_strength: any;

  @prop({ type: "float", default: 0.3, description: "How much noise to add to the style image before processing. An alternative way of controlling stength." })
  declare image_to_become_noise: any;

  @prop({ type: "float", default: 0.8, description: "Strength of depth controlnet. The bigger this is, the more controlnet affects the output." })
  declare control_depth_strength: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images" })
  declare disable_safety_checker: any;

  @prop({ type: "float", default: 0.75, description: "How strong the style will be applied" })
  declare image_to_become_strength: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "a person");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 2);
    const numberOfImages = Number(inputs.number_of_images ?? this.number_of_images ?? 2);
    const denoisingStrength = Number(inputs.denoising_strength ?? this.denoising_strength ?? 1);
    const instantIdStrength = Number(inputs.instant_id_strength ?? this.instant_id_strength ?? 1);
    const imageToBecomeNoise = Number(inputs.image_to_become_noise ?? this.image_to_become_noise ?? 0.3);
    const controlDepthStrength = Number(inputs.control_depth_strength ?? this.control_depth_strength ?? 0.8);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);
    const imageToBecomeStrength = Number(inputs.image_to_become_strength ?? this.image_to_become_strength ?? 0.75);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
      "number_of_images": numberOfImages,
      "denoising_strength": denoisingStrength,
      "instant_id_strength": instantIdStrength,
      "image_to_become_noise": imageToBecomeNoise,
      "control_depth_strength": controlDepthStrength,
      "disable_safety_checker": disableSafetyChecker,
      "image_to_become_strength": imageToBecomeStrength,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }

    const imageToBecomeRef = inputs.image_to_become as Record<string, unknown> | undefined;
    if (isRefSet(imageToBecomeRef)) {
      const imageToBecomeUrl = assetToUrl(imageToBecomeRef!);
      if (imageToBecomeUrl) args["image_to_become"] = imageToBecomeUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fofr/become-image", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class FaceToMany extends ReplicateNode {
  static readonly nodeType = "replicate.image_face.FaceToMany";
  static readonly title = "Face To Many";
  static readonly description = `Turn a face into 3D, emoji, pixel art, video game, claymation or toy
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Fix the random seed for reproducibility" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "An image of a person to be converted" })
  declare image: any;

  @prop({ type: "enum", default: "3D", values: ["3D", "Emoji", "Video game", "Pixels", "Clay", "Toy"], description: "Style to convert to" })
  declare style: any;

  @prop({ type: "str", default: "a person" })
  declare prompt: any;

  @prop({ type: "float", default: 1, description: "How strong the LoRA will be" })
  declare lora_scale: any;

  @prop({ type: "str", default: "", description: "URL to a Replicate custom LoRA. Must be in the format https://replicate.delivery/pbxt/[id]/trained_model.tar or https://pbxt.replicate.delivery/[id]/trained_model.tar" })
  declare custom_lora_url: any;

  @prop({ type: "str", default: "", description: "Things you do not want in the image" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 4.5, description: "Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original." })
  declare prompt_strength: any;

  @prop({ type: "float", default: 0.65, description: "How much of the original image to keep. 1 is the complete destruction of the original image, 0 is the original image" })
  declare denoising_strength: any;

  @prop({ type: "float", default: 1, description: "How strong the InstantID will be." })
  declare instant_id_strength: any;

  @prop({ type: "float", default: 0.8, description: "Strength of depth controlnet. The bigger this is, the more controlnet affects the output." })
  declare control_depth_strength: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const style = String(inputs.style ?? this.style ?? "3D");
    const prompt = String(inputs.prompt ?? this.prompt ?? "a person");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 1);
    const customLoraUrl = String(inputs.custom_lora_url ?? this.custom_lora_url ?? "");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 4.5);
    const denoisingStrength = Number(inputs.denoising_strength ?? this.denoising_strength ?? 0.65);
    const instantIdStrength = Number(inputs.instant_id_strength ?? this.instant_id_strength ?? 1);
    const controlDepthStrength = Number(inputs.control_depth_strength ?? this.control_depth_strength ?? 0.8);

    const args: Record<string, unknown> = {
      "seed": seed,
      "style": style,
      "prompt": prompt,
      "lora_scale": loraScale,
      "custom_lora_url": customLoraUrl,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
      "denoising_strength": denoisingStrength,
      "instant_id_strength": instantIdStrength,
      "control_depth_strength": controlDepthStrength,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fofr/face-to-many", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class FaceToSticker extends ReplicateNode {
  static readonly nodeType = "replicate.image_face.FaceToSticker";
  static readonly title = "Face To Sticker";
  static readonly description = `Turn a face into a sticker
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Fix the random seed for reproducibility" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "An image of a person to be converted to a sticker" })
  declare image: any;

  @prop({ type: "int", default: 20 })
  declare steps: any;

  @prop({ type: "int", default: 1024 })
  declare width: any;

  @prop({ type: "int", default: 1024 })
  declare height: any;

  @prop({ type: "str", default: "a person" })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "2x upscale the sticker" })
  declare upscale: any;

  @prop({ type: "int", default: 10, description: "Number of steps to upscale" })
  declare upscale_steps: any;

  @prop({ type: "str", default: "", description: "Things you do not want in the image" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 7, description: "Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original." })
  declare prompt_strength: any;

  @prop({ type: "float", default: 0.5, description: "How much noise is added to the IP adapter input" })
  declare ip_adapter_noise: any;

  @prop({ type: "float", default: 0.2, description: "How much the IP adapter will influence the image" })
  declare ip_adapter_weight: any;

  @prop({ type: "float", default: 1, description: "How strong the InstantID will be." })
  declare instant_id_strength: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const steps = Number(inputs.steps ?? this.steps ?? 20);
    const width = Number(inputs.width ?? this.width ?? 1024);
    const height = Number(inputs.height ?? this.height ?? 1024);
    const prompt = String(inputs.prompt ?? this.prompt ?? "a person");
    const upscale = Boolean(inputs.upscale ?? this.upscale ?? false);
    const upscaleSteps = Number(inputs.upscale_steps ?? this.upscale_steps ?? 10);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const promptStrength = Number(inputs.prompt_strength ?? this.prompt_strength ?? 7);
    const ipAdapterNoise = Number(inputs.ip_adapter_noise ?? this.ip_adapter_noise ?? 0.5);
    const ipAdapterWeight = Number(inputs.ip_adapter_weight ?? this.ip_adapter_weight ?? 0.2);
    const instantIdStrength = Number(inputs.instant_id_strength ?? this.instant_id_strength ?? 1);

    const args: Record<string, unknown> = {
      "seed": seed,
      "steps": steps,
      "width": width,
      "height": height,
      "prompt": prompt,
      "upscale": upscale,
      "upscale_steps": upscaleSteps,
      "negative_prompt": negativePrompt,
      "prompt_strength": promptStrength,
      "ip_adapter_noise": ipAdapterNoise,
      "ip_adapter_weight": ipAdapterWeight,
      "instant_id_strength": instantIdStrength,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fofr/face-to-sticker", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class InstantId extends ReplicateNode {
  static readonly nodeType = "replicate.image_face.InstantId";
  static readonly title = "Instant Id";
  static readonly description = `Make realistic images of real people instantly
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input face image" })
  declare image: any;

  @prop({ type: "str", default: "a person", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "EulerDiscreteScheduler", values: ["DEISMultistepScheduler", "HeunDiscreteScheduler", "EulerDiscreteScheduler", "DPMSolverMultistepScheduler", "DPMSolverMultistepScheduler-Karras", "DPMSolverMultistepScheduler-Karras-SDE"], description: "Scheduler" })
  declare scheduler: any;

  @prop({ type: "bool", default: false, description: "Enable Fast Inference with LCM (Latent Consistency Models) - speeds up inference steps, trade-off is the quality of the generated image. Performs better with close-up portrait face images" })
  declare enable_lcm: any;

  @prop({ type: "image", default: "", description: "(Optional) reference pose image" })
  declare pose_image: any;

  @prop({ type: "int", default: 1, description: "Number of images to output" })
  declare num_outputs: any;

  @prop({ type: "enum", default: "stable-diffusion-xl-base-1.0", values: ["stable-diffusion-xl-base-1.0", "juggernaut-xl-v8", "afrodite-xl-v2", "albedobase-xl-20", "albedobase-xl-v13", "animagine-xl-30", "anime-art-diffusion-xl", "anime-illust-diffusion-xl", "dreamshaper-xl", "dynavision-xl-v0610", "guofeng4-xl", "nightvision-xl-0791", "omnigen-xl", "pony-diffusion-v6-xl", "protovision-xl-high-fidel", "RealVisXL_V3.0_Turbo", "RealVisXL_V4.0_Lightning"], description: "Pick which base weights you want to use" })
  declare sdxl_weights: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "float", default: 0.4, description: "Openpose ControlNet strength, effective only if 'enable_pose_controlnet' is true" })
  declare pose_strength: any;

  @prop({ type: "float", default: 0.3, description: "Canny ControlNet strength, effective only if 'enable_canny_controlnet' is true" })
  declare canny_strength: any;

  @prop({ type: "float", default: 0.5, description: "Depth ControlNet strength, effective only if 'enable_depth_controlnet' is true" })
  declare depth_strength: any;

  @prop({ type: "float", default: 7.5, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 80, description: "Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality." })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.8, description: "Scale for image adapter strength (for detail)" })
  declare ip_adapter_scale: any;

  @prop({ type: "float", default: 1.5, description: "Only used when 'enable_lcm' is set to True, Scale for classifier-free guidance when using LCM" })
  declare lcm_guidance_scale: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images" })
  declare disable_safety_checker: any;

  @prop({ type: "bool", default: true, description: "Enable Openpose ControlNet, overrides strength if set to false" })
  declare enable_pose_controlnet: any;

  @prop({ type: "bool", default: true, description: "Enhance non-face region" })
  declare enhance_nonface_region: any;

  @prop({ type: "bool", default: false, description: "Enable Canny ControlNet, overrides strength if set to false" })
  declare enable_canny_controlnet: any;

  @prop({ type: "bool", default: false, description: "Enable Depth ControlNet, overrides strength if set to false" })
  declare enable_depth_controlnet: any;

  @prop({ type: "int", default: 5, description: "Only used when 'enable_lcm' is set to True, Number of denoising steps when using LCM" })
  declare lcm_num_inference_steps: any;

  @prop({ type: "int", default: 640, description: "Width of the input image for face detection" })
  declare face_detection_input_width: any;

  @prop({ type: "int", default: 640, description: "Height of the input image for face detection" })
  declare face_detection_input_height: any;

  @prop({ type: "float", default: 0.8, description: "Scale for IdentityNet strength (for fidelity)" })
  declare controlnet_conditioning_scale: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "a person");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "EulerDiscreteScheduler");
    const enableLcm = Boolean(inputs.enable_lcm ?? this.enable_lcm ?? false);
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const sdxlWeights = String(inputs.sdxl_weights ?? this.sdxl_weights ?? "stable-diffusion-xl-base-1.0");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const poseStrength = Number(inputs.pose_strength ?? this.pose_strength ?? 0.4);
    const cannyStrength = Number(inputs.canny_strength ?? this.canny_strength ?? 0.3);
    const depthStrength = Number(inputs.depth_strength ?? this.depth_strength ?? 0.5);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const ipAdapterScale = Number(inputs.ip_adapter_scale ?? this.ip_adapter_scale ?? 0.8);
    const lcmGuidanceScale = Number(inputs.lcm_guidance_scale ?? this.lcm_guidance_scale ?? 1.5);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 30);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);
    const enablePoseControlnet = Boolean(inputs.enable_pose_controlnet ?? this.enable_pose_controlnet ?? true);
    const enhanceNonfaceRegion = Boolean(inputs.enhance_nonface_region ?? this.enhance_nonface_region ?? true);
    const enableCannyControlnet = Boolean(inputs.enable_canny_controlnet ?? this.enable_canny_controlnet ?? false);
    const enableDepthControlnet = Boolean(inputs.enable_depth_controlnet ?? this.enable_depth_controlnet ?? false);
    const lcmNumInferenceSteps = Number(inputs.lcm_num_inference_steps ?? this.lcm_num_inference_steps ?? 5);
    const faceDetectionInputWidth = Number(inputs.face_detection_input_width ?? this.face_detection_input_width ?? 640);
    const faceDetectionInputHeight = Number(inputs.face_detection_input_height ?? this.face_detection_input_height ?? 640);
    const controlnetConditioningScale = Number(inputs.controlnet_conditioning_scale ?? this.controlnet_conditioning_scale ?? 0.8);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "scheduler": scheduler,
      "enable_lcm": enableLcm,
      "num_outputs": numOutputs,
      "sdxl_weights": sdxlWeights,
      "output_format": outputFormat,
      "pose_strength": poseStrength,
      "canny_strength": cannyStrength,
      "depth_strength": depthStrength,
      "guidance_scale": guidanceScale,
      "output_quality": outputQuality,
      "negative_prompt": negativePrompt,
      "ip_adapter_scale": ipAdapterScale,
      "lcm_guidance_scale": lcmGuidanceScale,
      "num_inference_steps": numInferenceSteps,
      "disable_safety_checker": disableSafetyChecker,
      "enable_pose_controlnet": enablePoseControlnet,
      "enhance_nonface_region": enhanceNonfaceRegion,
      "enable_canny_controlnet": enableCannyControlnet,
      "enable_depth_controlnet": enableDepthControlnet,
      "lcm_num_inference_steps": lcmNumInferenceSteps,
      "face_detection_input_width": faceDetectionInputWidth,
      "face_detection_input_height": faceDetectionInputHeight,
      "controlnet_conditioning_scale": controlnetConditioningScale,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }

    const poseImageRef = inputs.pose_image as Record<string, unknown> | undefined;
    if (isRefSet(poseImageRef)) {
      const poseImageUrl = assetToUrl(poseImageRef!);
      if (poseImageUrl) args["pose_image"] = poseImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "zsxkib/instant-id", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Instant_ID_Artistic extends ReplicateNode {
  static readonly nodeType = "replicate.image_face.Instant_ID_Artistic";
  static readonly title = "Instant_ I D_ Artistic";
  static readonly description = `InstantID : Zero-shot Identity-Preserving Generation in Seconds. Using Dreamshaper-XL as the base model to encourage artistic generations
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "int", default: 640, description: "Width of output image" })
  declare width: any;

  @prop({ type: "int", default: 640, description: "Height of output image" })
  declare height: any;

  @prop({ type: "str", default: "analog film photo of a man. faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, stained, highly detailed, found footage, masterpiece, best quality", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "float", default: 5, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.8, description: "Scale for IP adapter" })
  declare ip_adapter_scale: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 0.8, description: "Scale for ControlNet conditioning" })
  declare controlnet_conditioning_scale: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const width = Number(inputs.width ?? this.width ?? 640);
    const height = Number(inputs.height ?? this.height ?? 640);
    const prompt = String(inputs.prompt ?? this.prompt ?? "analog film photo of a man. faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, stained, highly detailed, found footage, masterpiece, best quality");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 5);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const ipAdapterScale = Number(inputs.ip_adapter_scale ?? this.ip_adapter_scale ?? 0.8);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 30);
    const controlnetConditioningScale = Number(inputs.controlnet_conditioning_scale ?? this.controlnet_conditioning_scale ?? 0.8);

    const args: Record<string, unknown> = {
      "width": width,
      "height": height,
      "prompt": prompt,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "ip_adapter_scale": ipAdapterScale,
      "num_inference_steps": numInferenceSteps,
      "controlnet_conditioning_scale": controlnetConditioningScale,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "grandlineai/instant-id-artistic", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class Instant_ID_Photorealistic extends ReplicateNode {
  static readonly nodeType = "replicate.image_face.Instant_ID_Photorealistic";
  static readonly title = "Instant_ I D_ Photorealistic";
  static readonly description = `InstantID : Zero-shot Identity-Preserving Generation in Seconds. Using Juggernaut-XL v8 as the base model to encourage photorealism
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "int", default: 640, description: "Width of output image" })
  declare width: any;

  @prop({ type: "int", default: 640, description: "Height of output image" })
  declare height: any;

  @prop({ type: "str", default: "analog film photo of a man. faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, stained, highly detailed, found footage, masterpiece, best quality", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "float", default: 5, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Input Negative Prompt" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.8, description: "Scale for IP adapter" })
  declare ip_adapter_scale: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({ type: "float", default: 0.8, description: "Scale for ControlNet conditioning" })
  declare controlnet_conditioning_scale: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const width = Number(inputs.width ?? this.width ?? 640);
    const height = Number(inputs.height ?? this.height ?? 640);
    const prompt = String(inputs.prompt ?? this.prompt ?? "analog film photo of a man. faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, stained, highly detailed, found footage, masterpiece, best quality");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 5);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const ipAdapterScale = Number(inputs.ip_adapter_scale ?? this.ip_adapter_scale ?? 0.8);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 30);
    const controlnetConditioningScale = Number(inputs.controlnet_conditioning_scale ?? this.controlnet_conditioning_scale ?? 0.8);

    const args: Record<string, unknown> = {
      "width": width,
      "height": height,
      "prompt": prompt,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "ip_adapter_scale": ipAdapterScale,
      "num_inference_steps": numInferenceSteps,
      "controlnet_conditioning_scale": controlnetConditioningScale,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "grandlineai/instant-id-photorealistic", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class PhotoMaker extends ReplicateNode {
  static readonly nodeType = "replicate.image_face.PhotoMaker";
  static readonly title = "Photo Maker";
  static readonly description = `Create photos, paintings and avatars for anyone in any style within seconds.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Seed. Leave blank to use a random number" })
  declare seed: any;

  @prop({ type: "str", default: "A photo of a person img", description: "Prompt. Example: 'a photo of a man/woman img'. The phrase 'img' is the trigger word." })
  declare prompt: any;

  @prop({ type: "int", default: 20, description: "Number of sample steps" })
  declare num_steps: any;

  @prop({ type: "enum", default: "Photographic (Default)", values: ["(No style)", "Cinematic", "Disney Charactor", "Digital Art", "Photographic (Default)", "Fantasy art", "Neonpunk", "Enhance", "Comic book", "Lowpoly", "Line art"], description: "Style template. The style template will add a style-specific prompt and negative prompt to the user's prompt." })
  declare style_name: any;

  @prop({ type: "str", default: "", description: "The input image, for example a photo of your face." })
  declare input_image: any;

  @prop({ type: "int", default: 1, description: "Number of output images" })
  declare num_outputs: any;

  @prop({ type: "str", default: "", description: "Additional input image (optional)" })
  declare input_image2: any;

  @prop({ type: "str", default: "", description: "Additional input image (optional)" })
  declare input_image3: any;

  @prop({ type: "str", default: "", description: "Additional input image (optional)" })
  declare input_image4: any;

  @prop({ type: "float", default: 5, description: "Guidance scale. A guidance scale of 1 corresponds to doing no classifier free guidance." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry", description: "Negative Prompt. The negative prompt should NOT contain the trigger word." })
  declare negative_prompt: any;

  @prop({ type: "float", default: 20, description: "Style strength (%)" })
  declare style_strength_ratio: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "A photo of a person img");
    const numSteps = Number(inputs.num_steps ?? this.num_steps ?? 20);
    const styleName = String(inputs.style_name ?? this.style_name ?? "Photographic (Default)");
    const inputImage = String(inputs.input_image ?? this.input_image ?? "");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const inputImage2 = String(inputs.input_image2 ?? this.input_image2 ?? "");
    const inputImage3 = String(inputs.input_image3 ?? this.input_image3 ?? "");
    const inputImage4 = String(inputs.input_image4 ?? this.input_image4 ?? "");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 5);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry");
    const styleStrengthRatio = Number(inputs.style_strength_ratio ?? this.style_strength_ratio ?? 20);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "num_steps": numSteps,
      "style_name": styleName,
      "input_image": inputImage,
      "num_outputs": numOutputs,
      "input_image2": inputImage2,
      "input_image3": inputImage3,
      "input_image4": inputImage4,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "style_strength_ratio": styleStrengthRatio,
      "disable_safety_checker": disableSafetyChecker,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "tencentarc/photomaker", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class PhotoMakerStyle extends ReplicateNode {
  static readonly nodeType = "replicate.image_face.PhotoMakerStyle";
  static readonly title = "Photo Maker Style";
  static readonly description = `Create photos, paintings and avatars for anyone in any style within seconds.  (Stylization version)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Seed. Leave blank to use a random number" })
  declare seed: any;

  @prop({ type: "str", default: "A photo of a person img", description: "Prompt. Example: 'a photo of a man/woman img'. The phrase 'img' is the trigger word." })
  declare prompt: any;

  @prop({ type: "int", default: 20, description: "Number of sample steps" })
  declare num_steps: any;

  @prop({ type: "enum", default: "(No style)", values: ["(No style)", "Cinematic", "Disney Charactor", "Digital Art", "Photographic (Default)", "Fantasy art", "Neonpunk", "Enhance", "Comic book", "Lowpoly", "Line art"], description: "Style template. The style template will add a style-specific prompt and negative prompt to the user's prompt." })
  declare style_name: any;

  @prop({ type: "image", default: "", description: "The input image, for example a photo of your face." })
  declare input_image: any;

  @prop({ type: "int", default: 1, description: "Number of output images" })
  declare num_outputs: any;

  @prop({ type: "image", default: "", description: "Additional input image (optional)" })
  declare input_image2: any;

  @prop({ type: "image", default: "", description: "Additional input image (optional)" })
  declare input_image3: any;

  @prop({ type: "image", default: "", description: "Additional input image (optional)" })
  declare input_image4: any;

  @prop({ type: "float", default: 5, description: "Guidance scale. A guidance scale of 1 corresponds to doing no classifier free guidance." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry", description: "Negative Prompt. The negative prompt should NOT contain the trigger word." })
  declare negative_prompt: any;

  @prop({ type: "float", default: 20, description: "Style strength (%)" })
  declare style_strength_ratio: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated images." })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "A photo of a person img");
    const numSteps = Number(inputs.num_steps ?? this.num_steps ?? 20);
    const styleName = String(inputs.style_name ?? this.style_name ?? "(No style)");
    const numOutputs = Number(inputs.num_outputs ?? this.num_outputs ?? 1);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 5);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry");
    const styleStrengthRatio = Number(inputs.style_strength_ratio ?? this.style_strength_ratio ?? 20);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "num_steps": numSteps,
      "style_name": styleName,
      "num_outputs": numOutputs,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "style_strength_ratio": styleStrengthRatio,
      "disable_safety_checker": disableSafetyChecker,
    };

    const inputImageRef = inputs.input_image as Record<string, unknown> | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = assetToUrl(inputImageRef!);
      if (inputImageUrl) args["input_image"] = inputImageUrl;
    }

    const inputImage2Ref = inputs.input_image2 as Record<string, unknown> | undefined;
    if (isRefSet(inputImage2Ref)) {
      const inputImage2Url = assetToUrl(inputImage2Ref!);
      if (inputImage2Url) args["input_image2"] = inputImage2Url;
    }

    const inputImage3Ref = inputs.input_image3 as Record<string, unknown> | undefined;
    if (isRefSet(inputImage3Ref)) {
      const inputImage3Url = assetToUrl(inputImage3Ref!);
      if (inputImage3Url) args["input_image3"] = inputImage3Url;
    }

    const inputImage4Ref = inputs.input_image4 as Record<string, unknown> | undefined;
    if (isRefSet(inputImage4Ref)) {
      const inputImage4Url = assetToUrl(inputImage4Ref!);
      if (inputImage4Url) args["input_image4"] = inputImage4Url;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "tencentarc/photomaker-style", args);
    return { output: outputToImageRef(res.output) };
  }
}

export const REPLICATE_IMAGE_FACE_NODES: readonly NodeClass[] = [
  BecomeImage,
  FaceToMany,
  FaceToSticker,
  InstantId,
  Instant_ID_Artistic,
  Instant_ID_Photorealistic,
  PhotoMaker,
  PhotoMakerStyle,
] as const;