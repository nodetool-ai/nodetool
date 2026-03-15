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

export class AudioToWaveform extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.AudioToWaveform";
  static readonly title = "Audio To Waveform";
  static readonly description = `Create a waveform video from audio
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "audio", default: "", description: "Audio file to create waveform from" })
  declare audio: any;

  @prop({ type: "str", default: "#000000", description: "Background color of waveform" })
  declare bg_color: any;

  @prop({ type: "float", default: 0.75, description: "Opacity of foreground waveform" })
  declare fg_alpha: any;

  @prop({ type: "int", default: 100, description: "Number of bars in waveform" })
  declare bar_count: any;

  @prop({ type: "float", default: 0.4, description: "Width of bars in waveform. 1 represents full width, 0.5 represents half width, etc." })
  declare bar_width: any;

  @prop({ type: "str", default: "#ffffff", description: "Color of waveform bars" })
  declare bars_color: any;

  @prop({ type: "str", default: "", description: "Caption text for the video" })
  declare caption_text: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const bgColor = String(inputs.bg_color ?? this.bg_color ?? "#000000");
    const fgAlpha = Number(inputs.fg_alpha ?? this.fg_alpha ?? 0.75);
    const barCount = Number(inputs.bar_count ?? this.bar_count ?? 100);
    const barWidth = Number(inputs.bar_width ?? this.bar_width ?? 0.4);
    const barsColor = String(inputs.bars_color ?? this.bars_color ?? "#ffffff");
    const captionText = String(inputs.caption_text ?? this.caption_text ?? "");

    const args: Record<string, unknown> = {
      "bg_color": bgColor,
      "fg_alpha": fgAlpha,
      "bar_count": barCount,
      "bar_width": barWidth,
      "bars_color": barsColor,
      "caption_text": captionText,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = assetToUrl(audioRef!);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "fofr/audio-to-waveform", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Gen4_Aleph extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Gen4_Aleph";
  static readonly title = "Gen4_ Aleph";
  static readonly description = `A new way to edit, transform and generate video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Input video to generate from. Videos must be less than 16MB. Only 5s of the input video will be used." })
  declare video: any;

  @prop({ type: "str", default: "", description: "Text prompt for video generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"], description: "Video aspect ratio" })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Reference image to influence the style or content of the output." })
  declare reference_image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const video = String(inputs.video ?? this.video ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "16:9");
    const referenceImage = String(inputs.reference_image ?? this.reference_image ?? "");

    const args: Record<string, unknown> = {
      "seed": seed,
      "video": video,
      "prompt": prompt,
      "aspect_ratio": aspectRatio,
      "reference_image": referenceImage,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "runwayml/gen4-aleph", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Gen4_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Gen4_Turbo";
  static readonly title = "Gen4_ Turbo";
  static readonly description = `Generate 5s and 10s 720p videos fast
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Initial image for video generation (first frame)" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text prompt for video generation" })
  declare prompt: any;

  @prop({ type: "enum", default: 5, values: ["5", "10"], description: "Duration of the output video in seconds" })
  declare duration: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"], description: "Video aspect ratio" })
  declare aspect_ratio: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const image = String(inputs.image ?? this.image ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const duration = String(inputs.duration ?? this.duration ?? 5);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "16:9");

    const args: Record<string, unknown> = {
      "seed": seed,
      "image": image,
      "prompt": prompt,
      "duration": duration,
      "aspect_ratio": aspectRatio,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "runwayml/gen4-turbo", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Hailuo_02 extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Hailuo_02";
  static readonly title = "Hailuo_02";
  static readonly description = `Hailuo 2 is a text-to-video and image-to-video model that can make 6s or 10s videos at 768p (standard) or 1080p (pro). It excels at real world physics.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Text prompt for generation" })
  declare prompt: any;

  @prop({ type: "enum", default: 6, values: ["6", "10"], description: "Duration of the video in seconds. 10 seconds is only available for 768p resolution." })
  declare duration: any;

  @prop({ type: "enum", default: "1080p", values: ["512p", "768p", "1080p"], description: "Pick between standard 512p, 768p, or pro 1080p resolution. The pro model is not just high resolution, it is also higher quality." })
  declare resolution: any;

  @prop({ type: "str", default: "", description: "Last frame image for video generation. The final frame of the output video will match this image." })
  declare last_frame_image: any;

  @prop({ type: "bool", default: true, description: "Use prompt optimizer" })
  declare prompt_optimizer: any;

  @prop({ type: "str", default: "", description: "First frame image for video generation. The output video will have the same aspect ratio as this image." })
  declare first_frame_image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const duration = String(inputs.duration ?? this.duration ?? 6);
    const resolution = String(inputs.resolution ?? this.resolution ?? "1080p");
    const lastFrameImage = String(inputs.last_frame_image ?? this.last_frame_image ?? "");
    const promptOptimizer = Boolean(inputs.prompt_optimizer ?? this.prompt_optimizer ?? true);
    const firstFrameImage = String(inputs.first_frame_image ?? this.first_frame_image ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "duration": duration,
      "resolution": resolution,
      "last_frame_image": lastFrameImage,
      "prompt_optimizer": promptOptimizer,
      "first_frame_image": firstFrameImage,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "minimax/hailuo-02", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class HotshotXL extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.HotshotXL";
  static readonly title = "Hotshot X L";
  static readonly description = `😊 Hotshot-XL is an AI text-to-GIF model trained to work alongside Stable Diffusion XL
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "bool", default: false, description: "Save as mp4, False for GIF" })
  declare mp4: any;

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare steps: any;

  @prop({ type: "enum", default: 672, values: ["256", "320", "384", "448", "512", "576", "640", "672", "704", "768", "832", "896", "960", "1024"], description: "Width of the output" })
  declare width: any;

  @prop({ type: "enum", default: 384, values: ["256", "320", "384", "448", "512", "576", "640", "672", "704", "768", "832", "896", "960", "1024"], description: "Height of the output" })
  declare height: any;

  @prop({ type: "str", default: "a camel smoking a cigarette, hd, high quality", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "EulerAncestralDiscreteScheduler", values: ["DDIMScheduler", "DPMSolverMultistepScheduler", "HeunDiscreteScheduler", "KarrasDPM", "EulerAncestralDiscreteScheduler", "EulerDiscreteScheduler", "PNDMScheduler"], description: "Select a Scheduler" })
  declare scheduler: any;

  @prop({ type: "str", default: "blurry", description: "Negative prompt" })
  declare negative_prompt: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const mp4 = Boolean(inputs.mp4 ?? this.mp4 ?? false);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const steps = Number(inputs.steps ?? this.steps ?? 30);
    const width = String(inputs.width ?? this.width ?? 672);
    const height = String(inputs.height ?? this.height ?? 384);
    const prompt = String(inputs.prompt ?? this.prompt ?? "a camel smoking a cigarette, hd, high quality");
    const scheduler = String(inputs.scheduler ?? this.scheduler ?? "EulerAncestralDiscreteScheduler");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "blurry");

    const args: Record<string, unknown> = {
      "mp4": mp4,
      "seed": seed,
      "steps": steps,
      "width": width,
      "height": height,
      "prompt": prompt,
      "scheduler": scheduler,
      "negative_prompt": negativePrompt,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "lucataco/hotshot-xl", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Hunyuan_Video extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Hunyuan_Video";
  static readonly title = "Hunyuan_ Video";
  static readonly description = `A state-of-the-art text-to-video generation model capable of creating high-quality videos with realistic motion from text descriptions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: 24, description: "Frames per second of the output video" })
  declare fps: any;

  @prop({ type: "int", default: "", description: "Random seed (leave empty for random)" })
  declare seed: any;

  @prop({ type: "int", default: 864, description: "Width of the video in pixels (must be divisible by 16)" })
  declare width: any;

  @prop({ type: "int", default: 480, description: "Height of the video in pixels (must be divisible by 16)" })
  declare height: any;

  @prop({ type: "str", default: "A cat walks on the grass, realistic style", description: "The prompt to guide the video generation" })
  declare prompt: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare infer_steps: any;

  @prop({ type: "int", default: 129, description: "Number of frames to generate (must be 4k+1, ex: 49 or 129)" })
  declare video_length: any;

  @prop({ type: "float", default: 6, description: "Guidance scale" })
  declare embedded_guidance_scale: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const fps = Number(inputs.fps ?? this.fps ?? 24);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const width = Number(inputs.width ?? this.width ?? 864);
    const height = Number(inputs.height ?? this.height ?? 480);
    const prompt = String(inputs.prompt ?? this.prompt ?? "A cat walks on the grass, realistic style");
    const inferSteps = Number(inputs.infer_steps ?? this.infer_steps ?? 50);
    const videoLength = Number(inputs.video_length ?? this.video_length ?? 129);
    const embeddedGuidanceScale = Number(inputs.embedded_guidance_scale ?? this.embedded_guidance_scale ?? 6);

    const args: Record<string, unknown> = {
      "fps": fps,
      "seed": seed,
      "width": width,
      "height": height,
      "prompt": prompt,
      "infer_steps": inferSteps,
      "video_length": videoLength,
      "embedded_guidance_scale": embeddedGuidanceScale,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "tencent/hunyuan-video", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Kling_Lip_Sync extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Kling_Lip_Sync";
  static readonly title = "Kling_ Lip_ Sync";
  static readonly description = `Add lip-sync to any video with an audio file or text
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Text content for lip sync (if not using audio)" })
  declare text: any;

  @prop({ type: "str", default: "", description: "ID of a video generated by Kling. Cannot be used with video_url." })
  declare video_id: any;

  @prop({ type: "enum", default: "en_AOT", values: ["en_AOT", "en_oversea_male1", "en_girlfriend_4_speech02", "en_chat_0407_5-1", "en_uk_boy1", "en_PeppaPig_platform", "en_ai_huangzhong_712", "en_calm_story1", "en_uk_man2", "en_reader_en_m-v1", "en_commercial_lady_en_f-v1", "zh_genshin_vindi2", "zh_zhinen_xuesheng", "zh_tiyuxi_xuedi", "zh_ai_shatang", "zh_genshin_klee2", "zh_genshin_kirara", "zh_ai_kaiya", "zh_tiexin_nanyou", "zh_ai_chenjiahao_712", "zh_girlfriend_1_speech02", "zh_chat1_female_new-3", "zh_girlfriend_2_speech02", "zh_cartoon-boy-07", "zh_cartoon-girl-01", "zh_ai_huangyaoshi_712", "zh_you_pingjing", "zh_ai_laoguowang_712", "zh_chengshu_jiejie", "zh_zhuxi_speech02", "zh_uk_oldman3", "zh_laopopo_speech02", "zh_heainainai_speech02", "zh_dongbeilaotie_speech02", "zh_chongqingxiaohuo_speech02", "zh_chuanmeizi_speech02", "zh_chaoshandashu_speech02", "zh_ai_taiwan_man2_speech02", "zh_xianzhanggui_speech02", "zh_tianjinjiejie_speech02", "zh_diyinnansang_DB_CN_M_04-v2", "zh_yizhipiannan-v1", "zh_guanxiaofang-v2", "zh_tianmeixuemei-v1", "zh_daopianyansang-v1", "zh_mengwa-v1"], description: "Voice ID for speech synthesis (if using text and not audio)" })
  declare voice_id: any;

  @prop({ type: "str", default: "", description: "URL of a video for lip syncing. It can be an .mp4 or .mov file, should be less than 100MB, with a duration of 2-10 seconds, and a resolution of 720p-1080p (720-1920px dimensions). Cannot be used with video_id." })
  declare video_url: any;

  @prop({ type: "str", default: "", description: "Audio file for lip sync. Must be .mp3, .wav, .m4a, or .aac and less than 5MB." })
  declare audio_file: any;

  @prop({ type: "float", default: 1, description: "Speech rate (only used if using text and not audio)" })
  declare voice_speed: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const text = String(inputs.text ?? this.text ?? "");
    const videoId = String(inputs.video_id ?? this.video_id ?? "");
    const voiceId = String(inputs.voice_id ?? this.voice_id ?? "en_AOT");
    const videoUrl = String(inputs.video_url ?? this.video_url ?? "");
    const audioFile = String(inputs.audio_file ?? this.audio_file ?? "");
    const voiceSpeed = Number(inputs.voice_speed ?? this.voice_speed ?? 1);

    const args: Record<string, unknown> = {
      "text": text,
      "video_id": videoId,
      "voice_id": voiceId,
      "video_url": videoUrl,
      "audio_file": audioFile,
      "voice_speed": voiceSpeed,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "kwaivgi/kling-lip-sync", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Kling_V2_1 extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Kling_V2_1";
  static readonly title = "Kling_ V2_1";
  static readonly description = `Use Kling v2.1 to generate 5s and 10s videos in 720p and 1080p resolution from a starting image (image-to-video)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "standard", values: ["standard", "pro"], description: "Standard has a resolution of 720p, pro is 1080p. Both are 24fps." })
  declare mode: any;

  @prop({ type: "str", default: "", description: "Text prompt for video generation" })
  declare prompt: any;

  @prop({ type: "enum", default: 5, values: ["5", "10"], description: "Duration of the video in seconds" })
  declare duration: any;

  @prop({ type: "str", default: "", description: "Last frame of the video (pro mode is required when this parameter is set)" })
  declare end_image: any;

  @prop({ type: "str", default: "", description: "First frame of the video. You must use a start image with kling-v2.1." })
  declare start_image: any;

  @prop({ type: "str", default: "", description: "Things you do not want to see in the video" })
  declare negative_prompt: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const mode = String(inputs.mode ?? this.mode ?? "standard");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const duration = String(inputs.duration ?? this.duration ?? 5);
    const endImage = String(inputs.end_image ?? this.end_image ?? "");
    const startImage = String(inputs.start_image ?? this.start_image ?? "");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");

    const args: Record<string, unknown> = {
      "mode": mode,
      "prompt": prompt,
      "duration": duration,
      "end_image": endImage,
      "start_image": startImage,
      "negative_prompt": negativePrompt,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "kwaivgi/kling-v2.1", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class LTX_Video extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.LTX_Video";
  static readonly title = "L T X_ Video";
  static readonly description = `LTX-Video is the first DiT-based video generation model capable of generating high-quality videos in real-time. It produces 24 FPS videos at a 768x512 resolution faster than they can be watched.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 3, description: "How strongly the video follows the prompt" })
  declare cfg: any;

  @prop({ type: "int", default: "", description: "Set a seed for reproducibility. Random by default." })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Optional input image to use as the starting frame" })
  declare image: any;

  @prop({ type: "enum", default: "0.9.1", values: ["0.9.1", "0.9"], description: "Model version to use" })
  declare model: any;

  @prop({ type: "int", default: 30, description: "Number of steps" })
  declare steps: any;

  @prop({ type: "enum", default: 97, values: ["97", "129", "161", "193", "225", "257"], description: "Length of the output video in frames" })
  declare length: any;

  @prop({ type: "str", default: "best quality, 4k, HDR, a tracking shot of a beautiful scene", description: "Text prompt for the video. This model needs long descriptive prompts, if the prompt is too short the quality won't be good." })
  declare prompt: any;

  @prop({ type: "enum", default: 640, values: ["512", "576", "640", "704", "768", "832", "896", "960", "1024"], description: "Target size for the output video" })
  declare target_size: any;

  @prop({ type: "enum", default: "3:2", values: ["1:1", "1:2", "2:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9"], description: "Aspect ratio of the output video. Ignored if an image is provided." })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "low quality, worst quality, deformed, distorted", description: "Things you do not want to see in your video" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 0.15, description: "Lower numbers stick more closely to the input image" })
  declare image_noise_scale: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const cfg = Number(inputs.cfg ?? this.cfg ?? 3);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const model = String(inputs.model ?? this.model ?? "0.9.1");
    const steps = Number(inputs.steps ?? this.steps ?? 30);
    const length = String(inputs.length ?? this.length ?? 97);
    const prompt = String(inputs.prompt ?? this.prompt ?? "best quality, 4k, HDR, a tracking shot of a beautiful scene");
    const targetSize = String(inputs.target_size ?? this.target_size ?? 640);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "3:2");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "low quality, worst quality, deformed, distorted");
    const imageNoiseScale = Number(inputs.image_noise_scale ?? this.image_noise_scale ?? 0.15);

    const args: Record<string, unknown> = {
      "cfg": cfg,
      "seed": seed,
      "model": model,
      "steps": steps,
      "length": length,
      "prompt": prompt,
      "target_size": targetSize,
      "aspect_ratio": aspectRatio,
      "negative_prompt": negativePrompt,
      "image_noise_scale": imageNoiseScale,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "lightricks/ltx-video", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Lipsync_2 extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Lipsync_2";
  static readonly title = "Lipsync_2";
  static readonly description = `Generate realistic lipsyncs with Sync Labs' 2.0 model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "audio", default: "", description: "Input audio file (.wav)" })
  declare audio: any;

  @prop({ type: "video", default: "", description: "Input video file (.mp4)" })
  declare video: any;

  @prop({ type: "enum", default: "loop", values: ["loop", "bounce", "cut_off", "silence", "remap"], description: "Lipsync mode when audio and video durations are out of sync" })
  declare sync_mode: any;

  @prop({ type: "float", default: 0.5, description: "How expressive lipsync can be (0-1)" })
  declare temperature: any;

  @prop({ type: "bool", default: false, description: "Whether to detect active speaker (i.e. whoever is speaking in the clip will be used for lipsync)" })
  declare active_speaker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const syncMode = String(inputs.sync_mode ?? this.sync_mode ?? "loop");
    const temperature = Number(inputs.temperature ?? this.temperature ?? 0.5);
    const activeSpeaker = Boolean(inputs.active_speaker ?? this.active_speaker ?? false);

    const args: Record<string, unknown> = {
      "sync_mode": syncMode,
      "temperature": temperature,
      "active_speaker": activeSpeaker,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = assetToUrl(audioRef!);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const videoRef = inputs.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = assetToUrl(videoRef!);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "sync/lipsync-2", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Lipsync_2_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Lipsync_2_Pro";
  static readonly title = "Lipsync_2_ Pro";
  static readonly description = `Studio-grade lipsync in minutes, not weeks
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "audio", default: "", description: "Input audio file (.wav)" })
  declare audio: any;

  @prop({ type: "video", default: "", description: "Input video file (.mp4)" })
  declare video: any;

  @prop({ type: "enum", default: "loop", values: ["loop", "bounce", "cut_off", "silence", "remap"], description: "Lipsync mode when audio and video durations are out of sync" })
  declare sync_mode: any;

  @prop({ type: "float", default: 0.5, description: "How expressive lipsync can be (0-1)" })
  declare temperature: any;

  @prop({ type: "bool", default: false, description: "Whether to detect active speaker (i.e. whoever is speaking in the clip will be used for lipsync)" })
  declare active_speaker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const syncMode = String(inputs.sync_mode ?? this.sync_mode ?? "loop");
    const temperature = Number(inputs.temperature ?? this.temperature ?? 0.5);
    const activeSpeaker = Boolean(inputs.active_speaker ?? this.active_speaker ?? false);

    const args: Record<string, unknown> = {
      "sync_mode": syncMode,
      "temperature": temperature,
      "active_speaker": activeSpeaker,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = assetToUrl(audioRef!);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const videoRef = inputs.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = assetToUrl(videoRef!);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "sync/lipsync-2-pro", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Music_01 extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Music_01";
  static readonly title = "Music_01";
  static readonly description = `Quickly generate up to 1 minute of music with lyrics and vocals in the style of a reference track
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Lyrics with optional formatting. You can use a newline to separate each line of lyrics. You can use two newlines to add a pause between lines. You can use double hash marks (##) at the beginning and end of the lyrics to add accompaniment. Maximum 350 to 400 characters." })
  declare lyrics: any;

  @prop({ type: "enum", default: 256000, values: ["32000", "64000", "128000", "256000"], description: "Bitrate for the generated music" })
  declare bitrate: any;

  @prop({ type: "str", default: "", description: "Reuse a previously uploaded voice ID" })
  declare voice_id: any;

  @prop({ type: "audio", default: "", description: "Reference song, should contain music and vocals. Must be a .wav or .mp3 file longer than 15 seconds." })
  declare song_file: any;

  @prop({ type: "audio", default: "", description: "Voice reference. Must be a .wav or .mp3 file longer than 15 seconds. If only a voice reference is given, an a cappella vocal hum will be generated." })
  declare voice_file: any;

  @prop({ type: "enum", default: 44100, values: ["16000", "24000", "32000", "44100"], description: "Sample rate for the generated music" })
  declare sample_rate: any;

  @prop({ type: "str", default: "", description: "Reuse a previously uploaded instrumental ID" })
  declare instrumental_id: any;

  @prop({ type: "str", default: "", description: "Instrumental reference. Must be a .wav or .mp3 file longer than 15 seconds. If only an instrumental reference is given, a track without vocals will be generated." })
  declare instrumental_file: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const lyrics = String(inputs.lyrics ?? this.lyrics ?? "");
    const bitrate = String(inputs.bitrate ?? this.bitrate ?? 256000);
    const voiceId = String(inputs.voice_id ?? this.voice_id ?? "");
    const sampleRate = String(inputs.sample_rate ?? this.sample_rate ?? 44100);
    const instrumentalId = String(inputs.instrumental_id ?? this.instrumental_id ?? "");
    const instrumentalFile = String(inputs.instrumental_file ?? this.instrumental_file ?? "");

    const args: Record<string, unknown> = {
      "lyrics": lyrics,
      "bitrate": bitrate,
      "voice_id": voiceId,
      "sample_rate": sampleRate,
      "instrumental_id": instrumentalId,
      "instrumental_file": instrumentalFile,
    };

    const songFileRef = inputs.song_file as Record<string, unknown> | undefined;
    if (isRefSet(songFileRef)) {
      const songFileUrl = assetToUrl(songFileRef!);
      if (songFileUrl) args["song_file"] = songFileUrl;
    }

    const voiceFileRef = inputs.voice_file as Record<string, unknown> | undefined;
    if (isRefSet(voiceFileRef)) {
      const voiceFileUrl = assetToUrl(voiceFileRef!);
      if (voiceFileUrl) args["voice_file"] = voiceFileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "minimax/music-01", args);
    return { output: outputToAudioRef(res.output) };
  }
}

export class Pixverse_V5 extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Pixverse_V5";
  static readonly title = "Pixverse_ V5";
  static readonly description = `Create 5s-8s videos with enhanced character movement, visual effects, and exclusive 1080p-8s support. Optimized for anime characters and complex actions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Image to use for the first frame of the video" })
  declare image: any;

  @prop({ type: "enum", default: "None", values: ["None", "Let's YMCA!", "Subject 3 Fever", "Ghibli Live!", "Suit Swagger", "Muscle Surge", "360° Microwave", "Warmth of Jesus", "Emergency Beat", "Anything, Robot", "Kungfu Club", "Mint in Box", "Retro Anime Pop", "Vogue Walk", "Mega Dive", "Evil Trigger"], description: "Special effect to apply to the video. V5 supports effects. Does not work with last_frame_image." })
  declare effect: any;

  @prop({ type: "str", default: "", description: "Text prompt for video generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "540p", values: ["360p", "540p", "720p", "1080p"], description: "Resolution of the video. 360p and 540p cost the same, but 720p and 1080p cost more. V5 supports 1080p with 8 second duration." })
  declare quality: any;

  @prop({ type: "enum", default: 5, values: ["5", "8"], description: "Duration of the video in seconds. 8 second videos cost twice as much as 5 second videos. V5 supports 1080p with 8 second duration." })
  declare duration: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9", "9:16", "1:1"], description: "Aspect ratio of the video" })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Negative prompt to avoid certain elements in the video" })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", description: "Use to generate a video that transitions from the first image to the last image. Must be used with image." })
  declare last_frame_image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const image = String(inputs.image ?? this.image ?? "");
    const effect = String(inputs.effect ?? this.effect ?? "None");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const quality = String(inputs.quality ?? this.quality ?? "540p");
    const duration = String(inputs.duration ?? this.duration ?? 5);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "16:9");
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const lastFrameImage = String(inputs.last_frame_image ?? this.last_frame_image ?? "");

    const args: Record<string, unknown> = {
      "seed": seed,
      "image": image,
      "effect": effect,
      "prompt": prompt,
      "quality": quality,
      "duration": duration,
      "aspect_ratio": aspectRatio,
      "negative_prompt": negativePrompt,
      "last_frame_image": lastFrameImage,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "pixverse/pixverse-v5", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Ray extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Ray";
  static readonly title = "Ray";
  static readonly description = `Fast, high quality text-to-video and image-to-video (Also known as Dream Machine)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "bool", default: false, description: "Whether the video should loop, with the last frame matching the first frame for smooth, continuous playback. This input is ignored if end_image or end_video_id are set." })
  declare loop: any;

  @prop({ type: "str", default: "", description: "Text prompt for video generation" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "An optional last frame of the video to use as the ending frame." })
  declare end_image: any;

  @prop({ type: "str", default: "", description: "An optional first frame of the video to use as the starting frame." })
  declare start_image: any;

  @prop({ type: "enum", default: "16:9", values: ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"], description: "Aspect ratio of the video. Ignored if a start frame, end frame or video ID is given." })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Prepend a new video generation to the beginning of an existing one (Also called 'reverse extend'). You can combine this with start_image, or start_video_id." })
  declare end_video_id: any;

  @prop({ type: "image", default: "", description: "Deprecated: Use end_image instead" })
  declare end_image_url: any;

  @prop({ type: "str", default: "", description: "Continue or extend a video generation with a new generation. You can combine this with end_image, or end_video_id." })
  declare start_video_id: any;

  @prop({ type: "image", default: "", description: "Deprecated: Use start_image instead" })
  declare start_image_url: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const loop = Boolean(inputs.loop ?? this.loop ?? false);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const endImage = String(inputs.end_image ?? this.end_image ?? "");
    const startImage = String(inputs.start_image ?? this.start_image ?? "");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "16:9");
    const endVideoId = String(inputs.end_video_id ?? this.end_video_id ?? "");
    const startVideoId = String(inputs.start_video_id ?? this.start_video_id ?? "");

    const args: Record<string, unknown> = {
      "loop": loop,
      "prompt": prompt,
      "end_image": endImage,
      "start_image": startImage,
      "aspect_ratio": aspectRatio,
      "end_video_id": endVideoId,
      "start_video_id": startVideoId,
    };

    const endImageUrlRef = inputs.end_image_url as Record<string, unknown> | undefined;
    if (isRefSet(endImageUrlRef)) {
      const endImageUrlUrl = assetToUrl(endImageUrlRef!);
      if (endImageUrlUrl) args["end_image_url"] = endImageUrlUrl;
    }

    const startImageUrlRef = inputs.start_image_url as Record<string, unknown> | undefined;
    if (isRefSet(startImageUrlRef)) {
      const startImageUrlUrl = assetToUrl(startImageUrlRef!);
      if (startImageUrlUrl) args["start_image_url"] = startImageUrlUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "luma/ray", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class RobustVideoMatting extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.RobustVideoMatting";
  static readonly title = "Robust Video Matting";
  static readonly description = `extract foreground of a video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "video", default: "", description: "Video to segment." })
  declare input_video: any;

  @prop({ type: "enum", default: "green-screen", values: ["green-screen", "alpha-mask", "foreground-mask"] })
  declare output_type: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const outputType = String(inputs.output_type ?? this.output_type ?? "green-screen");

    const args: Record<string, unknown> = {
      "output_type": outputType,
    };

    const inputVideoRef = inputs.input_video as Record<string, unknown> | undefined;
    if (isRefSet(inputVideoRef)) {
      const inputVideoUrl = assetToUrl(inputVideoRef!);
      if (inputVideoUrl) args["input_video"] = inputVideoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "arielreplicate/robust_video_matting", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Veo_3_1 extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Veo_3_1";
  static readonly title = "Veo_3_1";
  static readonly description = `New and improved version of Veo 3, with higher-fidelity video, context-aware audio, reference image and last frame support
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Omit for random generations" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Input image to start generating from. Ideal images are 16:9 or 9:16 and 1280x720 or 720x1280, depending on the aspect ratio you choose." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text prompt for video generation" })
  declare prompt: any;

  @prop({ type: "enum", default: 8, values: ["4", "6", "8"], description: "Video duration in seconds" })
  declare duration: any;

  @prop({ type: "str", default: "", description: "Ending image for interpolation. When provided with an input image, creates a transition between the two images." })
  declare last_frame: any;

  @prop({ type: "enum", default: "1080p", values: ["720p", "1080p"], description: "Resolution of the generated video" })
  declare resolution: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9", "9:16"], description: "Video aspect ratio" })
  declare aspect_ratio: any;

  @prop({ type: "bool", default: true, description: "Generate audio with the video" })
  declare generate_audio: any;

  @prop({ type: "str", default: "", description: "Description of what to exclude from the generated video" })
  declare negative_prompt: any;

  @prop({ type: "any", default: [], description: "1 to 3 reference images for subject-consistent generation (reference-to-video, or R2V). Reference images only work with 16:9 aspect ratio and 8-second duration. Last frame is ignored if reference images are provided." })
  declare reference_images: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const image = String(inputs.image ?? this.image ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const duration = String(inputs.duration ?? this.duration ?? 8);
    const lastFrame = String(inputs.last_frame ?? this.last_frame ?? "");
    const resolution = String(inputs.resolution ?? this.resolution ?? "1080p");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "16:9");
    const generateAudio = Boolean(inputs.generate_audio ?? this.generate_audio ?? true);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const referenceImages = String(inputs.reference_images ?? this.reference_images ?? []);

    const args: Record<string, unknown> = {
      "seed": seed,
      "image": image,
      "prompt": prompt,
      "duration": duration,
      "last_frame": lastFrame,
      "resolution": resolution,
      "aspect_ratio": aspectRatio,
      "generate_audio": generateAudio,
      "negative_prompt": negativePrompt,
      "reference_images": referenceImages,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "google/veo-3.1", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Video_01 extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Video_01";
  static readonly title = "Video_01";
  static readonly description = `Generate 6s videos with prompts or images. (Also known as Hailuo). Use a subject reference to make a video with a character and the S2V-01 model.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Text prompt for generation" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Use prompt optimizer" })
  declare prompt_optimizer: any;

  @prop({ type: "str", default: "", description: "First frame image for video generation. The output video will have the same aspect ratio as this image." })
  declare first_frame_image: any;

  @prop({ type: "str", default: "", description: "An optional character reference image to use as the subject in the generated video (this will use the S2V-01 model)" })
  declare subject_reference: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const promptOptimizer = Boolean(inputs.prompt_optimizer ?? this.prompt_optimizer ?? true);
    const firstFrameImage = String(inputs.first_frame_image ?? this.first_frame_image ?? "");
    const subjectReference = String(inputs.subject_reference ?? this.subject_reference ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "prompt_optimizer": promptOptimizer,
      "first_frame_image": firstFrameImage,
      "subject_reference": subjectReference,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "minimax/video-01", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Video_01_Live extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Video_01_Live";
  static readonly title = "Video_01_ Live";
  static readonly description = `An image-to-video (I2V) model specifically trained for Live2D and general animation use cases
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Text prompt for generation" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Use prompt optimizer" })
  declare prompt_optimizer: any;

  @prop({ type: "str", default: "", description: "First frame image for video generation. The output video will have the same aspect ratio as this image." })
  declare first_frame_image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const promptOptimizer = Boolean(inputs.prompt_optimizer ?? this.prompt_optimizer ?? true);
    const firstFrameImage = String(inputs.first_frame_image ?? this.first_frame_image ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "prompt_optimizer": promptOptimizer,
      "first_frame_image": firstFrameImage,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "minimax/video-01-live", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_1_1_3B extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Wan_2_1_1_3B";
  static readonly title = "Wan_2_1_1_3 B";
  static readonly description = `Generate 5s 480p videos. Wan is an advanced and powerful visual generation model developed by Tongyi Lab of Alibaba Group
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed for reproducible results (leave blank for random)" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Text prompt describing what you want to generate" })
  declare prompt: any;

  @prop({ type: "enum", default: 81, values: ["17", "33", "49", "65", "81"], description: "Video duration in frames (based on standard 16fps playback)" })
  declare frame_num: any;

  @prop({ type: "enum", default: "480p", values: ["480p"], description: "Video resolution" })
  declare resolution: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9", "9:16"], description: "Video aspect ratio" })
  declare aspect_ratio: any;

  @prop({ type: "float", default: 8, description: "Sampling shift factor for flow matching (recommended range: 8-12)" })
  declare sample_shift: any;

  @prop({ type: "int", default: 30, description: "Number of sampling steps (higher = better quality but slower)" })
  declare sample_steps: any;

  @prop({ type: "float", default: 6, description: "Classifier free guidance scale (higher values strengthen prompt adherence)" })
  declare sample_guide_scale: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const frameNum = String(inputs.frame_num ?? this.frame_num ?? 81);
    const resolution = String(inputs.resolution ?? this.resolution ?? "480p");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "16:9");
    const sampleShift = Number(inputs.sample_shift ?? this.sample_shift ?? 8);
    const sampleSteps = Number(inputs.sample_steps ?? this.sample_steps ?? 30);
    const sampleGuideScale = Number(inputs.sample_guide_scale ?? this.sample_guide_scale ?? 6);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "frame_num": frameNum,
      "resolution": resolution,
      "aspect_ratio": aspectRatio,
      "sample_shift": sampleShift,
      "sample_steps": sampleSteps,
      "sample_guide_scale": sampleGuideScale,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "wan-video/wan-2.1-1.3b", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_1_I2V_480p extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Wan_2_1_I2V_480p";
  static readonly title = "Wan_2_1_ I2 V_480p";
  static readonly description = `Accelerated inference for Wan 2.1 14B image to video, a comprehensive and open suite of video foundation models that pushes the boundaries of video generation.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Set for reproducible generation" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Image for use as the initial frame of the video." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text prompt for image generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "Balanced", values: ["Off", "Balanced", "Fast"], description: "Speed up generation with different levels of acceleration. Faster modes may degrade quality somewhat. The speedup is dependent on the content, so different videos may see different speedups." })
  declare fast_mode: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. You may still need to experiment to find the best value for your particular lora." })
  declare lora_scale: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9", "9:16"], description: "Aspect ratio of the output video." })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights. Supports HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet." })
  declare lora_weights: any;

  @prop({ type: "int", default: 3, description: "Flow shift parameter for video generation" })
  declare sample_shift: any;

  @prop({ type: "int", default: 30, description: "Number of inference steps" })
  declare sample_steps: any;

  @prop({ type: "str", default: "", description: "Negative prompt to avoid certain elements" })
  declare negative_prompt: any;

  @prop({ type: "float", default: 5, description: "Guidance scale for generation" })
  declare sample_guide_scale: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated videos" })
  declare disable_safety_checker: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const fastMode = String(inputs.fast_mode ?? this.fast_mode ?? "Balanced");
    const loraScale = Number(inputs.lora_scale ?? this.lora_scale ?? 1);
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "16:9");
    const loraWeights = String(inputs.lora_weights ?? this.lora_weights ?? "");
    const sampleShift = Number(inputs.sample_shift ?? this.sample_shift ?? 3);
    const sampleSteps = Number(inputs.sample_steps ?? this.sample_steps ?? 30);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const sampleGuideScale = Number(inputs.sample_guide_scale ?? this.sample_guide_scale ?? 5);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "fast_mode": fastMode,
      "lora_scale": loraScale,
      "aspect_ratio": aspectRatio,
      "lora_weights": loraWeights,
      "sample_shift": sampleShift,
      "sample_steps": sampleSteps,
      "negative_prompt": negativePrompt,
      "sample_guide_scale": sampleGuideScale,
      "disable_safety_checker": disableSafetyChecker,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "wavespeedai/wan-2.1-i2v-480p", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_2_I2V_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Wan_2_2_I2V_Fast";
  static readonly title = "Wan_2_2_ I2 V_ Fast";
  static readonly description = `A very fast and cheap PrunaAI optimized version of Wan 2.2 A14B image-to-video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Leave blank for random" })
  declare seed: any;

  @prop({ type: "image", default: "", description: "Input image to generate video from." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Prompt for video generation" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Go fast" })
  declare go_fast: any;

  @prop({ type: "str", default: "", description: "Optional last image to condition the video generation. If provided, creates smoother transitions between frames." })
  declare last_image: any;

  @prop({ type: "int", default: 81, description: "Number of video frames. 81 frames give the best results" })
  declare num_frames: any;

  @prop({ type: "enum", default: "480p", values: ["480p", "720p"], description: "Resolution of video. 16:9 corresponds to 832x480px, and 9:16 is 480x832px" })
  declare resolution: any;

  @prop({ type: "float", default: 12, description: "Sample shift factor" })
  declare sample_shift: any;

  @prop({ type: "int", default: 16, description: "Frames per second. Note that the pricing of this model is based on the video duration at 16 fps" })
  declare frames_per_second: any;

  @prop({ type: "bool", default: false, description: "Interpolate the generated video to 30 FPS using ffmpeg" })
  declare interpolate_output: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated video." })
  declare disable_safety_checker: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the transformer LoRA should be applied." })
  declare lora_scale_transformer: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the transformer_2 LoRA should be applied." })
  declare lora_scale_transformer_2: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights for the HIGH transformer. Supports arbitrary .safetensors URLs from the Internet (for example, 'https://huggingface.co/TheRaf7/instagirl-v2/resolve/main/Instagirlv2.0_hinoise.safetensors')" })
  declare lora_weights_transformer: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights for the LOW transformer_2. Supports arbitrary .safetensors URLs from the Internet. Can be different from transformer LoRA. (for example, 'https://huggingface.co/TheRaf7/instagirl-v2/resolve/main/Instagirlv2.0_lownoise.safetensors')" })
  declare lora_weights_transformer_2: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? true);
    const lastImage = String(inputs.last_image ?? this.last_image ?? "");
    const numFrames = Number(inputs.num_frames ?? this.num_frames ?? 81);
    const resolution = String(inputs.resolution ?? this.resolution ?? "480p");
    const sampleShift = Number(inputs.sample_shift ?? this.sample_shift ?? 12);
    const framesPerSecond = Number(inputs.frames_per_second ?? this.frames_per_second ?? 16);
    const interpolateOutput = Boolean(inputs.interpolate_output ?? this.interpolate_output ?? false);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);
    const loraScaleTransformer = Number(inputs.lora_scale_transformer ?? this.lora_scale_transformer ?? 1);
    const loraScaleTransformer_2 = Number(inputs.lora_scale_transformer_2 ?? this.lora_scale_transformer_2 ?? 1);
    const loraWeightsTransformer = String(inputs.lora_weights_transformer ?? this.lora_weights_transformer ?? "");
    const loraWeightsTransformer_2 = String(inputs.lora_weights_transformer_2 ?? this.lora_weights_transformer_2 ?? "");

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "go_fast": goFast,
      "last_image": lastImage,
      "num_frames": numFrames,
      "resolution": resolution,
      "sample_shift": sampleShift,
      "frames_per_second": framesPerSecond,
      "interpolate_output": interpolateOutput,
      "disable_safety_checker": disableSafetyChecker,
      "lora_scale_transformer": loraScaleTransformer,
      "lora_scale_transformer_2": loraScaleTransformer_2,
      "lora_weights_transformer": loraWeightsTransformer,
      "lora_weights_transformer_2": loraWeightsTransformer_2,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "wan-video/wan-2.2-i2v-fast", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_2_T2V_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Wan_2_2_T2V_Fast";
  static readonly title = "Wan_2_2_ T2 V_ Fast";
  static readonly description = `A very fast and cheap PrunaAI optimized version of Wan 2.2 A14B text-to-video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Leave blank for random" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Prompt for video generation" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Go fast" })
  declare go_fast: any;

  @prop({ type: "int", default: 81, description: "Number of video frames. 81 frames give the best results" })
  declare num_frames: any;

  @prop({ type: "enum", default: "480p", values: ["480p", "720p"], description: "Resolution of video. 16:9 corresponds to 832x480px, and 9:16 is 480x832px" })
  declare resolution: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9", "9:16"], description: "Aspect ratio of video. 16:9 corresponds to 832x480px, and 9:16 is 480x832px" })
  declare aspect_ratio: any;

  @prop({ type: "float", default: 12, description: "Sample shift factor" })
  declare sample_shift: any;

  @prop({ type: "bool", default: false, description: "Translate prompt to Chinese before generation" })
  declare optimize_prompt: any;

  @prop({ type: "int", default: 16, description: "Frames per second. Note that the pricing of this model is based on the video duration at 16 fps" })
  declare frames_per_second: any;

  @prop({ type: "bool", default: true, description: "Interpolate the generated video to 30 FPS using ffmpeg" })
  declare interpolate_output: any;

  @prop({ type: "bool", default: false, description: "Disable safety checker for generated video." })
  declare disable_safety_checker: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the transformer LoRA should be applied." })
  declare lora_scale_transformer: any;

  @prop({ type: "float", default: 1, description: "Determines how strongly the transformer_2 LoRA should be applied." })
  declare lora_scale_transformer_2: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights for transformer. Supports arbitrary .safetensors URLs from the Internet (for example, 'https://huggingface.co/Viktor1717/scandinavian-interior-style1/resolve/main/my_first_flux_lora_v1.safetensors')" })
  declare lora_weights_transformer: any;

  @prop({ type: "str", default: "", description: "Load LoRA weights for transformer_2. Supports arbitrary .safetensors URLs from the Internet. Can be different from transformer LoRA." })
  declare lora_weights_transformer_2: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const goFast = Boolean(inputs.go_fast ?? this.go_fast ?? true);
    const numFrames = Number(inputs.num_frames ?? this.num_frames ?? 81);
    const resolution = String(inputs.resolution ?? this.resolution ?? "480p");
    const aspectRatio = String(inputs.aspect_ratio ?? this.aspect_ratio ?? "16:9");
    const sampleShift = Number(inputs.sample_shift ?? this.sample_shift ?? 12);
    const optimizePrompt = Boolean(inputs.optimize_prompt ?? this.optimize_prompt ?? false);
    const framesPerSecond = Number(inputs.frames_per_second ?? this.frames_per_second ?? 16);
    const interpolateOutput = Boolean(inputs.interpolate_output ?? this.interpolate_output ?? true);
    const disableSafetyChecker = Boolean(inputs.disable_safety_checker ?? this.disable_safety_checker ?? false);
    const loraScaleTransformer = Number(inputs.lora_scale_transformer ?? this.lora_scale_transformer ?? 1);
    const loraScaleTransformer_2 = Number(inputs.lora_scale_transformer_2 ?? this.lora_scale_transformer_2 ?? 1);
    const loraWeightsTransformer = String(inputs.lora_weights_transformer ?? this.lora_weights_transformer ?? "");
    const loraWeightsTransformer_2 = String(inputs.lora_weights_transformer_2 ?? this.lora_weights_transformer_2 ?? "");

    const args: Record<string, unknown> = {
      "seed": seed,
      "prompt": prompt,
      "go_fast": goFast,
      "num_frames": numFrames,
      "resolution": resolution,
      "aspect_ratio": aspectRatio,
      "sample_shift": sampleShift,
      "optimize_prompt": optimizePrompt,
      "frames_per_second": framesPerSecond,
      "interpolate_output": interpolateOutput,
      "disable_safety_checker": disableSafetyChecker,
      "lora_scale_transformer": loraScaleTransformer,
      "lora_scale_transformer_2": loraScaleTransformer_2,
      "lora_weights_transformer": loraWeightsTransformer,
      "lora_weights_transformer_2": loraWeightsTransformer_2,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "wan-video/wan-2.2-t2v-fast", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Zeroscope_V2_XL extends ReplicateNode {
  static readonly nodeType = "replicate.video_generate.Zeroscope_V2_XL";
  static readonly title = "Zeroscope_ V2_ X L";
  static readonly description = `Zeroscope V2 XL & 576w
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: 8, description: "fps for the output video" })
  declare fps: any;

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "enum", default: "xl", values: ["xl", "576w", "potat1", "animov-512x"], description: "Model to use" })
  declare model: any;

  @prop({ type: "int", default: 576, description: "Width of the output video" })
  declare width: any;

  @prop({ type: "int", default: 320, description: "Height of the output video" })
  declare height: any;

  @prop({ type: "str", default: "An astronaut riding a horse", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "int", default: 1, description: "Batch size" })
  declare batch_size: any;

  @prop({ type: "str", default: "", description: "URL of the initial video (optional)" })
  declare init_video: any;

  @prop({ type: "int", default: 24, description: "Number of frames for the output video" })
  declare num_frames: any;

  @prop({ type: "float", default: 0.5, description: "Strength of init_video" })
  declare init_weight: any;

  @prop({ type: "float", default: 7.5, description: "Guidance scale" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Negative prompt" })
  declare negative_prompt: any;

  @prop({ type: "bool", default: false, description: "Remove watermark" })
  declare remove_watermark: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const fps = Number(inputs.fps ?? this.fps ?? 8);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const model = String(inputs.model ?? this.model ?? "xl");
    const width = Number(inputs.width ?? this.width ?? 576);
    const height = Number(inputs.height ?? this.height ?? 320);
    const prompt = String(inputs.prompt ?? this.prompt ?? "An astronaut riding a horse");
    const batchSize = Number(inputs.batch_size ?? this.batch_size ?? 1);
    const initVideo = String(inputs.init_video ?? this.init_video ?? "");
    const numFrames = Number(inputs.num_frames ?? this.num_frames ?? 24);
    const initWeight = Number(inputs.init_weight ?? this.init_weight ?? 0.5);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 7.5);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "");
    const removeWatermark = Boolean(inputs.remove_watermark ?? this.remove_watermark ?? false);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 50);

    const args: Record<string, unknown> = {
      "fps": fps,
      "seed": seed,
      "model": model,
      "width": width,
      "height": height,
      "prompt": prompt,
      "batch_size": batchSize,
      "init_video": initVideo,
      "num_frames": numFrames,
      "init_weight": initWeight,
      "guidance_scale": guidanceScale,
      "negative_prompt": negativePrompt,
      "remove_watermark": removeWatermark,
      "num_inference_steps": numInferenceSteps,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "anotherjesse/zeroscope-v2-xl", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export const REPLICATE_VIDEO_GENERATE_NODES: readonly NodeClass[] = [
  AudioToWaveform,
  Gen4_Aleph,
  Gen4_Turbo,
  Hailuo_02,
  HotshotXL,
  Hunyuan_Video,
  Kling_Lip_Sync,
  Kling_V2_1,
  LTX_Video,
  Lipsync_2,
  Lipsync_2_Pro,
  Music_01,
  Pixverse_V5,
  Ray,
  RobustVideoMatting,
  Veo_3_1,
  Video_01,
  Video_01_Live,
  Wan_2_1_1_3B,
  Wan_2_1_I2V_480p,
  Wan_2_2_I2V_Fast,
  Wan_2_2_T2V_Fast,
  Zeroscope_V2_XL,
] as const;