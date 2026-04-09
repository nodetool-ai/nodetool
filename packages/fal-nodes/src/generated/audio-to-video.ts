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

export class Ltx219BDistilledAudioToVideoLora extends FalNode {
  static readonly nodeType =
    "fal.audio_to_video.Ltx219BDistilledAudioToVideoLora";
  static readonly title = "Ltx219 B Distilled Audio To Video Lora";
  static readonly description = `LTX-2 19B Distilled
video, generation, audio-to-video, visualization, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When enabled, the number of frames will be calculated based on the audio duration and FPS. When disabled, use the specified num_frames."
  })
  declare match_audio_length: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "list[LoRAInput]",
    default: [],
    description: "The LoRAs to use for the generation."
  })
  declare loras: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "str",
    default: "landscape_4_3",
    description:
      "The size of the generated video. Use 'auto' to match the input image dimensions if provided."
  })
  declare video_size: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the video."
  })
  declare end_image: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to preprocess the audio before using it as conditioning."
  })
  declare preprocess_audio: any;

  @prop({
    type: "float",
    default: 1,
    description: "The strength of the image to use for the video generation."
  })
  declare image_strength: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional URL of an image to use as the first frame of the video."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio to generate the video from."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Values below 1.0 will allow the model to change the audio, while a value of exactly 1.0 will use the input audio without modification."
  })
  declare audio_strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const matchAudioLength = Boolean(this.match_audio_length ?? true);
    const acceleration = String(this.acceleration ?? "none");
    const prompt = String(this.prompt ?? "");
    const fps = Number(this.fps ?? 25);
    const loras = String(this.loras ?? []);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "landscape_4_3");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const preprocessAudio = Boolean(this.preprocess_audio ?? true);
    const imageStrength = Number(this.image_strength ?? 1);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = String(this.seed ?? "");
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const audioStrength = Number(this.audio_strength ?? 1);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      match_audio_length: matchAudioLength,
      acceleration: acceleration,
      prompt: prompt,
      fps: fps,
      loras: loras,
      camera_lora: cameraLora,
      video_size: videoSize,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      preprocess_audio: preprocessAudio,
      image_strength: imageStrength,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      negative_prompt: negativePrompt,
      camera_lora_scale: cameraLoraScale,
      video_quality: videoQuality,
      sync_mode: syncMode,
      seed: seed,
      end_image_strength: endImageStrength,
      enable_prompt_expansion: enablePromptExpansion,
      audio_strength: audioStrength
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/distilled/audio-to-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BAudioToVideoLora extends FalNode {
  static readonly nodeType = "fal.audio_to_video.Ltx219BAudioToVideoLora";
  static readonly title = "Ltx219 B Audio To Video Lora";
  static readonly description = `LTX-2 19B
video, generation, audio-to-video, visualization, lora`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When enabled, the number of frames will be calculated based on the audio duration and FPS. When disabled, use the specified num_frames."
  })
  declare match_audio_length: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Values below 1.0 will allow the model to change the audio, while a value of exactly 1.0 will use the input audio without modification."
  })
  declare audio_strength: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "list[LoRAInput]",
    default: [],
    description: "The LoRAs to use for the generation."
  })
  declare loras: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "str",
    default: "landscape_4_3",
    description:
      "The size of the generated video. Use 'auto' to match the input image dimensions if provided."
  })
  declare video_size: any;

  @prop({
    type: "float",
    default: 3,
    description: "The guidance scale to use."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the video."
  })
  declare end_image: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to preprocess the audio before using it as conditioning."
  })
  declare preprocess_audio: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description: "The strength of the image to use for the video generation."
  })
  declare image_strength: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional URL of an image to use as the first frame of the video."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio to generate the video from."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "int",
    default: 40,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const matchAudioLength = Boolean(this.match_audio_length ?? true);
    const acceleration = String(this.acceleration ?? "regular");
    const audioStrength = Number(this.audio_strength ?? 1);
    const prompt = String(this.prompt ?? "");
    const fps = Number(this.fps ?? 25);
    const loras = String(this.loras ?? []);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "landscape_4_3");
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const numFrames = Number(this.num_frames ?? 121);
    const preprocessAudio = Boolean(this.preprocess_audio ?? true);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const imageStrength = Number(this.image_strength ?? 1);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = String(this.seed ?? "");
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      match_audio_length: matchAudioLength,
      acceleration: acceleration,
      audio_strength: audioStrength,
      prompt: prompt,
      fps: fps,
      loras: loras,
      camera_lora: cameraLora,
      video_size: videoSize,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      preprocess_audio: preprocessAudio,
      enable_safety_checker: enableSafetyChecker,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      negative_prompt: negativePrompt,
      image_strength: imageStrength,
      camera_lora_scale: cameraLoraScale,
      video_quality: videoQuality,
      sync_mode: syncMode,
      seed: seed,
      end_image_strength: endImageStrength,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/audio-to-video/lora",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BDistilledAudioToVideo extends FalNode {
  static readonly nodeType = "fal.audio_to_video.Ltx219BDistilledAudioToVideo";
  static readonly title = "Ltx219 B Distilled Audio To Video";
  static readonly description = `LTX-2 19B Distilled
video, generation, audio-to-video, visualization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When enabled, the number of frames will be calculated based on the audio duration and FPS. When disabled, use the specified num_frames."
  })
  declare match_audio_length: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "str",
    default: "landscape_4_3",
    description:
      "The size of the generated video. Use 'auto' to match the input image dimensions if provided."
  })
  declare video_size: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the video."
  })
  declare end_image: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to preprocess the audio before using it as conditioning."
  })
  declare preprocess_audio: any;

  @prop({
    type: "float",
    default: 1,
    description: "The strength of the image to use for the video generation."
  })
  declare image_strength: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional URL of an image to use as the first frame of the video."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio to generate the video from."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Values below 1.0 will allow the model to change the audio, while a value of exactly 1.0 will use the input audio without modification."
  })
  declare audio_strength: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const matchAudioLength = Boolean(this.match_audio_length ?? true);
    const acceleration = String(this.acceleration ?? "none");
    const prompt = String(this.prompt ?? "");
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "landscape_4_3");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const numFrames = Number(this.num_frames ?? 121);
    const preprocessAudio = Boolean(this.preprocess_audio ?? true);
    const imageStrength = Number(this.image_strength ?? 1);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = String(this.seed ?? "");
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const audioStrength = Number(this.audio_strength ?? 1);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      match_audio_length: matchAudioLength,
      acceleration: acceleration,
      prompt: prompt,
      fps: fps,
      camera_lora: cameraLora,
      video_size: videoSize,
      enable_safety_checker: enableSafetyChecker,
      num_frames: numFrames,
      preprocess_audio: preprocessAudio,
      image_strength: imageStrength,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      negative_prompt: negativePrompt,
      camera_lora_scale: cameraLoraScale,
      video_quality: videoQuality,
      sync_mode: syncMode,
      seed: seed,
      end_image_strength: endImageStrength,
      enable_prompt_expansion: enablePromptExpansion,
      audio_strength: audioStrength
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/distilled/audio-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Ltx219BAudioToVideo extends FalNode {
  static readonly nodeType = "fal.audio_to_video.Ltx219BAudioToVideo";
  static readonly title = "Ltx219 B Audio To Video";
  static readonly description = `LTX-2 19B
video, generation, audio-to-video, visualization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { prompt: "str", seed: "int", video: "video" };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use multi-scale generation. If True, the model will generate the video at a smaller scale first, then use the smaller video to guide the generation of a video at or above your requested size. This results in better coherence and details."
  })
  declare use_multiscale: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When enabled, the number of frames will be calculated based on the audio duration and FPS. When disabled, use the specified num_frames."
  })
  declare match_audio_length: any;

  @prop({
    type: "enum",
    default: "regular",
    values: ["none", "regular", "high", "full"],
    description: "The acceleration level to use."
  })
  declare acceleration: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Audio conditioning strength. Values below 1.0 will allow the model to change the audio, while a value of exactly 1.0 will use the input audio without modification."
  })
  declare audio_strength: any;

  @prop({
    type: "str",
    default: "",
    description: "The prompt to generate the video from."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 25,
    description: "The frames per second of the generated video."
  })
  declare fps: any;

  @prop({
    type: "enum",
    default: "none",
    values: [
      "dolly_in",
      "dolly_out",
      "dolly_left",
      "dolly_right",
      "jib_up",
      "jib_down",
      "static",
      "none"
    ],
    description:
      "The camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora: any;

  @prop({
    type: "str",
    default: "landscape_4_3",
    description:
      "The size of the generated video. Use 'auto' to match the input image dimensions if provided."
  })
  declare video_size: any;

  @prop({
    type: "float",
    default: 3,
    description: "The guidance scale to use."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate."
  })
  declare num_frames: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to use as the end of the video."
  })
  declare end_image: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to preprocess the audio before using it as conditioning."
  })
  declare preprocess_audio: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable the safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description: "The write mode of the generated video."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "X264 (.mp4)",
    values: ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"],
    description: "The output type of the generated video."
  })
  declare video_output_type: any;

  @prop({
    type: "str",
    default:
      "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.",
    description: "The negative prompt to generate the video from."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description: "The strength of the image to use for the video generation."
  })
  declare image_strength: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The scale of the camera LoRA to use. This allows you to control the camera movement of the generated video more accurately than just prompting the model to move the camera."
  })
  declare camera_lora_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional URL of an image to use as the first frame of the video."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description: "The quality of the generated video."
  })
  declare video_quality: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the media will be returned as a data URI and the output data won't be available in the request history."
  })
  declare sync_mode: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio to generate the video from."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "The strength of the end image to use for the video generation."
  })
  declare end_image_strength: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable prompt expansion."
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "int",
    default: 40,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const useMultiscale = Boolean(this.use_multiscale ?? true);
    const matchAudioLength = Boolean(this.match_audio_length ?? true);
    const acceleration = String(this.acceleration ?? "regular");
    const audioStrength = Number(this.audio_strength ?? 1);
    const prompt = String(this.prompt ?? "");
    const fps = Number(this.fps ?? 25);
    const cameraLora = String(this.camera_lora ?? "none");
    const videoSize = String(this.video_size ?? "landscape_4_3");
    const guidanceScale = Number(this.guidance_scale ?? 3);
    const numFrames = Number(this.num_frames ?? 121);
    const preprocessAudio = Boolean(this.preprocess_audio ?? true);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const videoOutputType = String(this.video_output_type ?? "X264 (.mp4)");
    const negativePrompt = String(
      this.negative_prompt ??
        "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, wrong gaze direction, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio,incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts."
    );
    const imageStrength = Number(this.image_strength ?? 1);
    const cameraLoraScale = Number(this.camera_lora_scale ?? 1);
    const videoQuality = String(this.video_quality ?? "high");
    const syncMode = Boolean(this.sync_mode ?? false);
    const seed = String(this.seed ?? "");
    const endImageStrength = Number(this.end_image_strength ?? 1);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 40);

    const args: Record<string, unknown> = {
      use_multiscale: useMultiscale,
      match_audio_length: matchAudioLength,
      acceleration: acceleration,
      audio_strength: audioStrength,
      prompt: prompt,
      fps: fps,
      camera_lora: cameraLora,
      video_size: videoSize,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      preprocess_audio: preprocessAudio,
      enable_safety_checker: enableSafetyChecker,
      video_write_mode: videoWriteMode,
      video_output_type: videoOutputType,
      negative_prompt: negativePrompt,
      image_strength: imageStrength,
      camera_lora_scale: cameraLoraScale,
      video_quality: videoQuality,
      sync_mode: syncMode,
      seed: seed,
      end_image_strength: endImageStrength,
      enable_prompt_expansion: enablePromptExpansion,
      num_inference_steps: numInferenceSteps
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl =
        (await imageToDataUrl(endImageRef!)) ??
        (await assetToFalUrl(apiKey, endImageRef!));
      if (endImageUrl) args["end_image_url"] = endImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/ltx-2-19b/audio-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ElevenlabsDubbing extends FalNode {
  static readonly nodeType = "fal.audio_to_video.ElevenlabsDubbing";
  static readonly title = "Elevenlabs Dubbing";
  static readonly description = `ElevenLabs Dubbing
video, generation, audio-to-video, visualization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { target_lang: "str", video: "video" };

  @prop({
    type: "video",
    default: "",
    description:
      "URL of the video file to dub. Either audio_url or video_url must be provided. If both are provided, video_url takes priority."
  })
  declare video: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "URL of the audio file to dub. Either audio_url or video_url must be provided."
  })
  declare audio: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use the highest resolution for dubbing."
  })
  declare highest_resolution: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Number of speakers in the audio. If not provided, will be auto-detected."
  })
  declare num_speakers: any;

  @prop({
    type: "str",
    default: "",
    description: "Target language code for dubbing (ISO 639-1)"
  })
  declare target_lang: any;

  @prop({
    type: "str",
    default: "",
    description: "Source language code. If not provided, will be auto-detected."
  })
  declare source_lang: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const highestResolution = Boolean(this.highest_resolution ?? true);
    const numSpeakers = String(this.num_speakers ?? "");
    const targetLang = String(this.target_lang ?? "");
    const sourceLang = String(this.source_lang ?? "");

    const args: Record<string, unknown> = {
      highest_resolution: highestResolution,
      num_speakers: numSpeakers,
      target_lang: targetLang,
      source_lang: sourceLang
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToFalUrl(apiKey, videoRef!);
      if (videoUrl) args["video_url"] = videoUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/elevenlabs/dubbing", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LongcatMultiAvatarImageAudioToVideo extends FalNode {
  static readonly nodeType =
    "fal.audio_to_video.LongcatMultiAvatarImageAudioToVideo";
  static readonly title = "Longcat Multi Avatar Image Audio To Video";
  static readonly description = `Longcat Multi Avatar
video, generation, audio-to-video, visualization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default:
      "Two people are having a conversation with natural expressions and movements.",
    description: "The prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 30,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default:
      "https://raw.githubusercontent.com/meituan-longcat/LongCat-Video/refs/heads/main/assets/avatar/multi/sing_woman.WAV",
    description: "The URL of the audio file for person 2 (right side)."
  })
  declare audio_url_person2: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Bounding box for person 1. If not provided, defaults to left half of image."
  })
  declare bbox_person1: any;

  @prop({
    type: "str",
    default:
      "Close-up, Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards",
    description: "The negative prompt to avoid in the video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 4,
    description: "The text guidance scale for classifier-free guidance."
  })
  declare text_guidance_scale: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "720p"],
    description:
      "Resolution of the generated video (480p or 720p). Billing is per video-second (16 frames): 480p is 1 unit per second and 720p is 4 units per second."
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: "para",
    values: ["para", "add"],
    description:
      "How to combine the two audio tracks. 'para' (parallel) plays both simultaneously, 'add' (sequential) plays person 1 first then person 2."
  })
  declare audio_type: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image containing two speakers."
  })
  declare image: any;

  @prop({
    type: "str",
    default:
      "https://raw.githubusercontent.com/meituan-longcat/LongCat-Video/refs/heads/main/assets/avatar/multi/sing_man.WAV",
    description: "The URL of the audio file for person 1 (left side)."
  })
  declare audio_url_person1: any;

  @prop({
    type: "float",
    default: 4,
    description:
      "The audio guidance scale. Higher values may lead to exaggerated mouth movements."
  })
  declare audio_guidance_scale: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Bounding box for person 2. If not provided, defaults to right half of image."
  })
  declare bbox_person2: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Number of video segments to generate. Each segment adds ~5 seconds of video. First segment is ~5.8s, additional segments are 5s each."
  })
  declare num_segments: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(
      this.prompt ??
        "Two people are having a conversation with natural expressions and movements."
    );
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const audioUrlPerson2 = String(
      this.audio_url_person2 ??
        "https://raw.githubusercontent.com/meituan-longcat/LongCat-Video/refs/heads/main/assets/avatar/multi/sing_woman.WAV"
    );
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const bboxPerson1 = String(this.bbox_person1 ?? "");
    const negativePrompt = String(
      this.negative_prompt ??
        "Close-up, Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards"
    );
    const textGuidanceScale = Number(this.text_guidance_scale ?? 4);
    const resolution = String(this.resolution ?? "480p");
    const audioType = String(this.audio_type ?? "para");
    const audioUrlPerson1 = String(
      this.audio_url_person1 ??
        "https://raw.githubusercontent.com/meituan-longcat/LongCat-Video/refs/heads/main/assets/avatar/multi/sing_man.WAV"
    );
    const audioGuidanceScale = Number(this.audio_guidance_scale ?? 4);
    const seed = String(this.seed ?? "");
    const bboxPerson2 = String(this.bbox_person2 ?? "");
    const numSegments = Number(this.num_segments ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      num_inference_steps: numInferenceSteps,
      audio_url_person2: audioUrlPerson2,
      enable_safety_checker: enableSafetyChecker,
      bbox_person1: bboxPerson1,
      negative_prompt: negativePrompt,
      text_guidance_scale: textGuidanceScale,
      resolution: resolution,
      audio_type: audioType,
      audio_url_person1: audioUrlPerson1,
      audio_guidance_scale: audioGuidanceScale,
      seed: seed,
      bbox_person2: bboxPerson2,
      num_segments: numSegments
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
      "fal-ai/longcat-multi-avatar/image-audio-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LongcatSingleAvatarImageAudioToVideo extends FalNode {
  static readonly nodeType =
    "fal.audio_to_video.LongcatSingleAvatarImageAudioToVideo";
  static readonly title = "Longcat Single Avatar Image Audio To Video";
  static readonly description = `LongCat-Video-Avatar is an audio-driven video generation model that can generates super-realistic, lip-synchronized long video generation with natural dynamics and consistent identity.
video, generation, audio-to-video, visualization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "720p"],
    description:
      "Resolution of the generated video (480p or 720p). Billing is per video-second (16 frames): 480p is 1 unit per second and 720p is 4 units per second."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "float",
    default: 4,
    description:
      "The audio guidance scale. Higher values may lead to exaggerated mouth movements."
  })
  declare audio_guidance_scale: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Number of video segments to generate. Each segment adds ~5 seconds of video. First segment is ~5.8s, additional segments are 5s each."
  })
  declare num_segments: any;

  @prop({
    type: "image",
    default: "",
    description: "The URL of the image to animate."
  })
  declare image: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio file to drive the avatar."
  })
  declare audio: any;

  @prop({
    type: "int",
    default: 30,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: -1,
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "str",
    default:
      "Close-up, Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards",
    description: "The negative prompt to avoid in the video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 4,
    description: "The text guidance scale for classifier-free guidance."
  })
  declare text_guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "480p");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const audioGuidanceScale = Number(this.audio_guidance_scale ?? 4);
    const numSegments = Number(this.num_segments ?? 1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const seed = Number(this.seed ?? -1);
    const negativePrompt = String(
      this.negative_prompt ??
        "Close-up, Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards"
    );
    const textGuidanceScale = Number(this.text_guidance_scale ?? 4);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      enable_safety_checker: enableSafetyChecker,
      audio_guidance_scale: audioGuidanceScale,
      num_segments: numSegments,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      negative_prompt: negativePrompt,
      text_guidance_scale: textGuidanceScale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/longcat-single-avatar/image-audio-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class LongcatSingleAvatarAudioToVideo extends FalNode {
  static readonly nodeType =
    "fal.audio_to_video.LongcatSingleAvatarAudioToVideo";
  static readonly title = "Longcat Single Avatar Audio To Video";
  static readonly description = `LongCat-Video-Avatar is an audio-driven video generation model that can generates super-realistic, lip-synchronized long video generation with natural dynamics and consistent identity.
video, generation, audio-to-video, visualization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { seed: "int", video: "video" };

  @prop({
    type: "str",
    default:
      "A person is talking naturally with natural expressions and movements.",
    description: "The prompt to guide the video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "720p"],
    description:
      "Resolution of the generated video (480p or 720p). Billing is per video-second (16 frames): 480p is 1 unit per second and 720p is 4 units per second."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to enable safety checker."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "float",
    default: 4,
    description:
      "The audio guidance scale. Higher values may lead to exaggerated mouth movements."
  })
  declare audio_guidance_scale: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Number of video segments to generate. Each segment adds ~5 seconds of video. First segment is ~5.8s, additional segments are 5s each."
  })
  declare num_segments: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio file to drive the avatar."
  })
  declare audio: any;

  @prop({
    type: "int",
    default: 30,
    description: "The number of inference steps to use."
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: -1,
    description: "The seed for the random number generator."
  })
  declare seed: any;

  @prop({
    type: "str",
    default:
      "Close-up, Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards",
    description: "The negative prompt to avoid in the video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 4,
    description: "The text guidance scale for classifier-free guidance."
  })
  declare text_guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(
      this.prompt ??
        "A person is talking naturally with natural expressions and movements."
    );
    const resolution = String(this.resolution ?? "480p");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const audioGuidanceScale = Number(this.audio_guidance_scale ?? 4);
    const numSegments = Number(this.num_segments ?? 1);
    const numInferenceSteps = Number(this.num_inference_steps ?? 30);
    const seed = Number(this.seed ?? -1);
    const negativePrompt = String(
      this.negative_prompt ??
        "Close-up, Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards"
    );
    const textGuidanceScale = Number(this.text_guidance_scale ?? 4);

    const args: Record<string, unknown> = {
      prompt: prompt,
      resolution: resolution,
      enable_safety_checker: enableSafetyChecker,
      audio_guidance_scale: audioGuidanceScale,
      num_segments: numSegments,
      num_inference_steps: numInferenceSteps,
      seed: seed,
      negative_prompt: negativePrompt,
      text_guidance_scale: textGuidanceScale
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/longcat-single-avatar/audio-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class ArgilAvatarsAudioToVideo extends FalNode {
  static readonly nodeType = "fal.audio_to_video.ArgilAvatarsAudioToVideo";
  static readonly title = "Argil Avatars Audio To Video";
  static readonly description = `High-quality avatar videos that feel real, generated from your audio
video, generation, audio-to-video, visualization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    moderation_transcription: "str",
    moderation_error: "str",
    moderation_flagged: "bool",
    video: "video"
  };

  @prop({
    type: "enum",
    default: "",
    values: [
      "Mia outdoor (UGC)",
      "Lara (Masterclass)",
      "Ines (UGC)",
      "Maria (Masterclass)",
      "Emma (UGC)",
      "Sienna (Masterclass)",
      "Elena (UGC)",
      "Jasmine (Masterclass)",
      "Amara (Masterclass)",
      "Ryan podcast (UGC)",
      "Tyler (Masterclass)",
      "Jayse (Masterclass)",
      "Paul (Masterclass)",
      "Matteo (UGC)",
      "Daniel car (UGC)",
      "Dario (Masterclass)",
      "Viva (Masterclass)",
      "Chen (Masterclass)",
      "Alex (Masterclass)",
      "Vanessa (UGC)",
      "Laurent (UGC)",
      "Noemie car (UGC)",
      "Brandon (UGC)",
      "Byron (Masterclass)",
      "Calista (Masterclass)",
      "Milo (Masterclass)",
      "Fabien (Masterclass)",
      "Rose (UGC)"
    ]
  })
  declare avatar: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Enabling the remove background feature will result in a 50% increase in the price."
  })
  declare remove_background: any;

  @prop({ type: "audio", default: "" })
  declare audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const avatar = String(this.avatar ?? "");
    const removeBackground = Boolean(this.remove_background ?? false);

    const args: Record<string, unknown> = {
      avatar: avatar,
      remove_background: removeBackground
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "argil/avatars/audio-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class WanV2214bSpeechToVideo extends FalNode {
  static readonly nodeType = "fal.audio_to_video.WanV2214bSpeechToVideo";
  static readonly title = "Wan V2214b Speech To Video";
  static readonly description = `Wan-S2V is a video model that generates high-quality videos from static images and audio, with realistic facial expressions, body movements, and professional camera work for film and television applications
video, generation, audio-to-video, visualization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The text prompt used for video generation."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 5,
    description: "Shift value for the video. Must be between 1.0 and 10.0."
  })
  declare shift: any;

  @prop({
    type: "str",
    default: 16,
    description:
      "Frames per second of the generated video. Must be between 4 to 60. When using interpolation and 'adjust_fps_for_interpolation' is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If 'adjust_fps_for_interpolation' is set to false, this value will be used as-is."
  })
  declare frames_per_second: any;

  @prop({
    type: "float",
    default: 3.5,
    description:
      "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality."
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 80,
    description:
      "Number of frames to generate. Must be between 40 to 120, (must be multiple of 4)."
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, input data will be checked for safety before processing."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt for video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["fast", "balanced", "small"],
    description:
      "The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size."
  })
  declare video_write_mode: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "580p", "720p"],
    description: "Resolution of the generated video (480p, 580p, or 720p)."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If set to true, output video will be checked for safety after generation."
  })
  declare enable_output_safety_checker: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high", "maximum"],
    description:
      "The quality of the output video. Higher quality means better visual quality but larger file size."
  })
  declare video_quality: any;

  @prop({
    type: "audio",
    default: "",
    description: "The URL of the audio file."
  })
  declare audio: any;

  @prop({
    type: "int",
    default: 27,
    description:
      "Number of inference steps for sampling. Higher values give better quality but take longer."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Random seed for reproducibility. If None, a random seed is chosen."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const shift = Number(this.shift ?? 5);
    const framesPerSecond = String(this.frames_per_second ?? 16);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const numFrames = Number(this.num_frames ?? 80);
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");
    const videoWriteMode = String(this.video_write_mode ?? "balanced");
    const resolution = String(this.resolution ?? "480p");
    const enableOutputSafetyChecker = Boolean(
      this.enable_output_safety_checker ?? false
    );
    const videoQuality = String(this.video_quality ?? "high");
    const numInferenceSteps = Number(this.num_inference_steps ?? 27);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      shift: shift,
      frames_per_second: framesPerSecond,
      guidance_scale: guidanceScale,
      num_frames: numFrames,
      enable_safety_checker: enableSafetyChecker,
      negative_prompt: negativePrompt,
      video_write_mode: videoWriteMode,
      resolution: resolution,
      enable_output_safety_checker: enableOutputSafetyChecker,
      video_quality: videoQuality,
      num_inference_steps: numInferenceSteps,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/wan/v2.2-14b/speech-to-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class StableAvatar extends FalNode {
  static readonly nodeType = "fal.audio_to_video.StableAvatar";
  static readonly title = "Stable Avatar";
  static readonly description = `Stable Avatar generates audio-driven video avatars up to five minutes long
video, generation, audio-to-video, visualization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to use for the video generation."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["16:9", "1:1", "9:16", "auto"],
    description:
      "The aspect ratio of the video to generate. If 'auto', the aspect ratio will be determined by the reference image."
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 0.1,
    description:
      "The amount of perturbation to use for the video generation. 0.0 means no perturbation, 1.0 means full perturbation."
  })
  declare perturbation: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The URL of the image to use as a reference for the video generation."
  })
  declare image: any;

  @prop({
    type: "float",
    default: 5,
    description: "The guidance scale to use for the video generation."
  })
  declare guidance_scale: any;

  @prop({
    type: "float",
    default: 4,
    description: "The audio guidance scale to use for the video generation."
  })
  declare audio_guidance_scale: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "The URL of the audio to use as a reference for the video generation."
  })
  declare audio: any;

  @prop({
    type: "int",
    default: 50,
    description:
      "The number of inference steps to use for the video generation."
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed to use for the video generation."
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "auto");
    const perturbation = Number(this.perturbation ?? 0.1);
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const audioGuidanceScale = Number(this.audio_guidance_scale ?? 4);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      perturbation: perturbation,
      guidance_scale: guidanceScale,
      audio_guidance_scale: audioGuidanceScale,
      num_inference_steps: numInferenceSteps,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/stable-avatar", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class EchomimicV3 extends FalNode {
  static readonly nodeType = "fal.audio_to_video.EchomimicV3";
  static readonly title = "Echomimic V3";
  static readonly description = `EchoMimic V3 generates a talking avatar model from a picture, audio and text prompt.
video, generation, audio-to-video, visualization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "str",
    default: "",
    description: "The prompt to use for the video generation."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 2.5,
    description: "The audio guidance scale to use for the video generation."
  })
  declare audio_guidance_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "The URL of the image to use as a reference for the video generation."
  })
  declare image: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "The URL of the audio to use as a reference for the video generation."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description: "The seed to use for the video generation."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 121,
    description: "The number of frames to generate at once."
  })
  declare num_frames_per_generation: any;

  @prop({
    type: "str",
    default: "",
    description: "The negative prompt to use for the video generation."
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 4.5,
    description: "The guidance scale to use for the video generation."
  })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const audioGuidanceScale = Number(this.audio_guidance_scale ?? 2.5);
    const seed = String(this.seed ?? "");
    const numFramesPerGeneration = Number(
      this.num_frames_per_generation ?? 121
    );
    const negativePrompt = String(this.negative_prompt ?? "");
    const guidanceScale = Number(this.guidance_scale ?? 4.5);

    const args: Record<string, unknown> = {
      prompt: prompt,
      audio_guidance_scale: audioGuidanceScale,
      seed: seed,
      num_frames_per_generation: numFramesPerGeneration,
      negative_prompt: negativePrompt,
      guidance_scale: guidanceScale
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/echomimic-v3", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class VeedAvatarsAudioToVideo extends FalNode {
  static readonly nodeType = "fal.audio_to_video.VeedAvatarsAudioToVideo";
  static readonly title = "Veed Avatars Audio To Video";
  static readonly description = `Generate high-quality videos with UGC-like avatars from audio
video, generation, audio-to-video, visualization`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({ type: "audio", default: "" })
  declare audio: any;

  @prop({
    type: "enum",
    default: "",
    values: [
      "emily_vertical_primary",
      "emily_vertical_secondary",
      "marcus_vertical_primary",
      "marcus_vertical_secondary",
      "mira_vertical_primary",
      "mira_vertical_secondary",
      "jasmine_vertical_primary",
      "jasmine_vertical_secondary",
      "jasmine_vertical_walking",
      "aisha_vertical_walking",
      "elena_vertical_primary",
      "elena_vertical_secondary",
      "any_male_vertical_primary",
      "any_female_vertical_primary",
      "any_male_vertical_secondary",
      "any_female_vertical_secondary",
      "any_female_vertical_walking",
      "emily_primary",
      "emily_side",
      "marcus_primary",
      "marcus_side",
      "aisha_walking",
      "elena_primary",
      "elena_side",
      "any_male_primary",
      "any_female_primary",
      "any_male_side",
      "any_female_side"
    ],
    description: "The avatar to use for the video"
  })
  declare avatar_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const avatarId = String(this.avatar_id ?? "");

    const args: Record<string, unknown> = {
      avatar_id: avatarId
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "veed/avatars/audio-to-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export const FAL_AUDIO_TO_VIDEO_NODES: readonly NodeClass[] = [
  Ltx219BDistilledAudioToVideoLora,
  Ltx219BAudioToVideoLora,
  Ltx219BDistilledAudioToVideo,
  Ltx219BAudioToVideo,
  ElevenlabsDubbing,
  LongcatMultiAvatarImageAudioToVideo,
  LongcatSingleAvatarImageAudioToVideo,
  LongcatSingleAvatarAudioToVideo,
  ArgilAvatarsAudioToVideo,
  WanV2214bSpeechToVideo,
  StableAvatar,
  EchomimicV3,
  VeedAvatarsAudioToVideo
] as const;
