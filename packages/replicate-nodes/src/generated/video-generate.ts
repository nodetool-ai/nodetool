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

export class HotshotXL extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.HotshotXL";
  static readonly title = "Hotshot X L";
  static readonly description = `😊 Hotshot-XL is an AI text-to-GIF model trained to work alongside Stable Diffusion XL
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: 384,
    values: [
      "256",
      "320",
      "384",
      "448",
      "512",
      "576",
      "640",
      "672",
      "704",
      "768",
      "832",
      "896",
      "960",
      "1024"
    ],
    description: "Height of the output"
  })
  declare height: any;

  @prop({
    type: "bool",
    default: false,
    description: "Save as mp4, False for GIF"
  })
  declare mp4: any;

  @prop({ type: "str", default: "blurry", description: "Negative prompt" })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "a camel smoking a cigarette, hd, high quality",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "EulerAncestralDiscreteScheduler",
    values: [
      "DDIMScheduler",
      "DPMSolverMultistepScheduler",
      "HeunDiscreteScheduler",
      "KarrasDPM",
      "EulerAncestralDiscreteScheduler",
      "EulerDiscreteScheduler",
      "PNDMScheduler"
    ],
    description: "Select a Scheduler"
  })
  declare scheduler: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({ type: "int", default: 30, description: "Number of denoising steps" })
  declare steps: any;

  @prop({
    type: "enum",
    default: 672,
    values: [
      "256",
      "320",
      "384",
      "448",
      "512",
      "576",
      "640",
      "672",
      "704",
      "768",
      "832",
      "896",
      "960",
      "1024"
    ],
    description: "Width of the output"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const height = String(this.height ?? 384);
    const mp4 = Boolean(this.mp4 ?? false);
    const negativePrompt = String(this.negative_prompt ?? "blurry");
    const prompt = String(
      this.prompt ?? "a camel smoking a cigarette, hd, high quality"
    );
    const scheduler = String(
      this.scheduler ?? "EulerAncestralDiscreteScheduler"
    );
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 30);
    const width = String(this.width ?? 672);

    const args: Record<string, unknown> = {
      height: height,
      mp4: mp4,
      negative_prompt: negativePrompt,
      prompt: prompt,
      scheduler: scheduler,
      seed: seed,
      steps: steps,
      width: width
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/hotshot-xl:78b3a6257e16e4b241245d65c8b2b81ea2e1ff7ed4c55306b511509ddbfd327a",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Zeroscope_V2_XL extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Zeroscope_V2_XL";
  static readonly title = "Zeroscope_ V2_ X L";
  static readonly description = `Zeroscope V2 XL & 576w
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "int", default: 1, description: "Batch size" })
  declare batch_size: any;

  @prop({ type: "int", default: 8, description: "fps for the output video" })
  declare fps: any;

  @prop({ type: "float", default: 7.5, description: "Guidance scale" })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 320,
    description: "Height of the output video"
  })
  declare height: any;

  @prop({
    type: "video",
    default: "",
    description: "URL of the initial video (optional)"
  })
  declare init_video: any;

  @prop({ type: "float", default: 0.5, description: "Strength of init_video" })
  declare init_weight: any;

  @prop({
    type: "enum",
    default: "xl",
    values: ["xl", "576w", "potat1", "animov-512x"],
    description: "Model to use"
  })
  declare model: any;

  @prop({ type: "str", default: "", description: "Negative prompt" })
  declare negative_prompt: any;

  @prop({
    type: "int",
    default: 24,
    description: "Number of frames for the output video"
  })
  declare num_frames: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "An astronaut riding a horse",
    description: "Input prompt"
  })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "Remove watermark" })
  declare remove_watermark: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({ type: "int", default: 576, description: "Width of the output video" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const batchSize = Number(this.batch_size ?? 1);
    const fps = Number(this.fps ?? 8);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const height = Number(this.height ?? 320);
    const initWeight = Number(this.init_weight ?? 0.5);
    const model = String(this.model ?? "xl");
    const negativePrompt = String(this.negative_prompt ?? "");
    const numFrames = Number(this.num_frames ?? 24);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const prompt = String(this.prompt ?? "An astronaut riding a horse");
    const removeWatermark = Boolean(this.remove_watermark ?? false);
    const seed = Number(this.seed ?? -1);
    const width = Number(this.width ?? 576);

    const args: Record<string, unknown> = {
      batch_size: batchSize,
      fps: fps,
      guidance_scale: guidanceScale,
      height: height,
      init_weight: initWeight,
      model: model,
      negative_prompt: negativePrompt,
      num_frames: numFrames,
      num_inference_steps: numInferenceSteps,
      prompt: prompt,
      remove_watermark: removeWatermark,
      seed: seed,
      width: width
    };

    const initVideoRef = this.init_video as Record<string, unknown> | undefined;
    if (isRefSet(initVideoRef)) {
      const initVideoUrl = await assetToUrl(initVideoRef!, apiKey);
      if (initVideoUrl) args["init_video"] = initVideoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "anotherjesse/zeroscope-v2-xl:9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class RobustVideoMatting extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.RobustVideoMatting";
  static readonly title = "Robust Video Matting";
  static readonly description = `extract foreground of a video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "video", default: "", description: "Video to segment." })
  declare input_video: any;

  @prop({
    type: "enum",
    default: "green-screen",
    values: ["green-screen", "alpha-mask", "foreground-mask"],
    description: "An enumeration."
  })
  declare output_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const outputType = String(this.output_type ?? "green-screen");

    const args: Record<string, unknown> = {
      output_type: outputType
    };

    const inputVideoRef = this.input_video as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputVideoRef)) {
      const inputVideoUrl = await assetToUrl(inputVideoRef!, apiKey);
      if (inputVideoUrl) args["input_video"] = inputVideoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "arielreplicate/robust_video_matting:73d2128a371922d5d1abf0712a1d974be0e4e2358cc1218e4e34714767232bac",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class AudioToWaveform extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.AudioToWaveform";
  static readonly title = "Audio To Waveform";
  static readonly description = `Create a waveform video from audio
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description: "Audio file to create waveform from"
  })
  declare audio: any;

  @prop({
    type: "int",
    default: 100,
    description: "Number of bars in waveform"
  })
  declare bar_count: any;

  @prop({
    type: "float",
    default: 0.4,
    description:
      "Width of bars in waveform. 1 represents full width, 0.5 represents half width, etc."
  })
  declare bar_width: any;

  @prop({
    type: "str",
    default: "#ffffff",
    description: "Color of waveform bars"
  })
  declare bars_color: any;

  @prop({
    type: "str",
    default: "#000000",
    description: "Background color of waveform"
  })
  declare bg_color: any;

  @prop({ type: "str", default: "", description: "Caption text for the video" })
  declare caption_text: any;

  @prop({
    type: "float",
    default: 0.75,
    description: "Opacity of foreground waveform"
  })
  declare fg_alpha: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const barCount = Number(this.bar_count ?? 100);
    const barWidth = Number(this.bar_width ?? 0.4);
    const barsColor = String(this.bars_color ?? "#ffffff");
    const bgColor = String(this.bg_color ?? "#000000");
    const captionText = String(this.caption_text ?? "");
    const fgAlpha = Number(this.fg_alpha ?? 0.75);

    const args: Record<string, unknown> = {
      bar_count: barCount,
      bar_width: barWidth,
      bars_color: barsColor,
      bg_color: bgColor,
      caption_text: captionText,
      fg_alpha: fgAlpha
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "fofr/audio-to-waveform:116cf9b97d0a117cfe64310637bf99ae8542cc35d813744c6ab178a3e134ff5a",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Hunyuan_Video extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Hunyuan_Video";
  static readonly title = "Hunyuan_ Video";
  static readonly description = `A state-of-the-art text-to-video generation model capable of creating high-quality videos with realistic motion from text descriptions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "float", default: 6, description: "Guidance scale" })
  declare embedded_guidance_scale: any;

  @prop({
    type: "int",
    default: 24,
    description: "Frames per second of the output video"
  })
  declare fps: any;

  @prop({
    type: "int",
    default: 480,
    description: "Height of the video in pixels (must be divisible by 16)"
  })
  declare height: any;

  @prop({ type: "int", default: 50, description: "Number of denoising steps" })
  declare infer_steps: any;

  @prop({
    type: "str",
    default: "A cat walks on the grass, realistic style",
    description: "The prompt to guide the video generation"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed (leave empty for random)"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 129,
    description: "Number of frames to generate (must be 4k+1, ex: 49 or 129)"
  })
  declare video_length: any;

  @prop({
    type: "int",
    default: 864,
    description: "Width of the video in pixels (must be divisible by 16)"
  })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const embeddedGuidanceScale = Number(this.embedded_guidance_scale ?? 6);
    const fps = Number(this.fps ?? 24);
    const height = Number(this.height ?? 480);
    const inferSteps = Number(this.infer_steps ?? 50);
    const prompt = String(
      this.prompt ?? "A cat walks on the grass, realistic style"
    );
    const seed = Number(this.seed ?? -1);
    const videoLength = Number(this.video_length ?? 129);
    const width = Number(this.width ?? 864);

    const args: Record<string, unknown> = {
      embedded_guidance_scale: embeddedGuidanceScale,
      fps: fps,
      height: height,
      infer_steps: inferSteps,
      prompt: prompt,
      seed: seed,
      video_length: videoLength,
      width: width
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "tencent/hunyuan-video:6c9132aee14409cd6568d030453f1ba50f5f3412b844fe67f78a9eb62d55664f",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Video_01_Live extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Video_01_Live";
  static readonly title = "Video_01_ Live";
  static readonly description = `An image-to-video (I2V) model specifically trained for Live2D and general animation use cases
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "First frame image for video generation. The output video will have the same aspect ratio as this image."
  })
  declare first_frame_image: any;

  @prop({ type: "str", default: "", description: "Text prompt for generation" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Use prompt optimizer" })
  declare prompt_optimizer: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };

    const firstFrameImageRef = this.first_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameImageRef)) {
      const firstFrameImageUrl = await assetToUrl(firstFrameImageRef!, apiKey);
      if (firstFrameImageUrl) args["first_frame_image"] = firstFrameImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/video-01-live:7574e16b8f1ad52c6332ecb264c0f132e555f46c222255a738131ec1bb614092",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Video_01 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Video_01";
  static readonly title = "Video_01";
  static readonly description = `Generate 6s videos with prompts or images. (Also known as Hailuo). Use a subject reference to make a video with a character and the S2V-01 model.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "First frame image for video generation. The output video will have the same aspect ratio as this image."
  })
  declare first_frame_image: any;

  @prop({ type: "str", default: "", description: "Text prompt for generation" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Use prompt optimizer" })
  declare prompt_optimizer: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional character reference image to use as the subject in the generated video (this will use the S2V-01 model)"
  })
  declare subject_reference: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };

    const firstFrameImageRef = this.first_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameImageRef)) {
      const firstFrameImageUrl = await assetToUrl(firstFrameImageRef!, apiKey);
      if (firstFrameImageUrl) args["first_frame_image"] = firstFrameImageUrl;
    }

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
      "minimax/video-01:5aa835260ff7f40f4069c41185f72036accf99e29957bb4a3b3a911f3b6c1912",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Music_01 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Music_01";
  static readonly title = "Music_01";
  static readonly description = `Quickly generate up to 1 minute of music with lyrics and vocals in the style of a reference track
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: 256000,
    values: ["32000", "64000", "128000", "256000"],
    description: "Bitrate for the generated music"
  })
  declare bitrate: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Instrumental reference. Must be a .wav or .mp3 file longer than 15 seconds. If only an instrumental reference is given, a track without vocals will be generated."
  })
  declare instrumental_file: any;

  @prop({
    type: "str",
    default: "",
    description: "Reuse a previously uploaded instrumental ID"
  })
  declare instrumental_id: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Lyrics with optional formatting. You can use a newline to separate each line of lyrics. You can use two newlines to add a pause between lines. You can use double hash marks (##) at the beginning and end of the lyrics to add accompaniment. Maximum 350 to 400 characters."
  })
  declare lyrics: any;

  @prop({
    type: "enum",
    default: 44100,
    values: ["16000", "24000", "32000", "44100"],
    description: "Sample rate for the generated music"
  })
  declare sample_rate: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "Reference song, should contain music and vocals. Must be a .wav or .mp3 file longer than 15 seconds."
  })
  declare song_file: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "Voice reference. Must be a .wav or .mp3 file longer than 15 seconds. If only a voice reference is given, an a cappella vocal hum will be generated."
  })
  declare voice_file: any;

  @prop({
    type: "str",
    default: "",
    description: "Reuse a previously uploaded voice ID"
  })
  declare voice_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const bitrate = String(this.bitrate ?? 256000);
    const instrumentalId = String(this.instrumental_id ?? "");
    const lyrics = String(this.lyrics ?? "");
    const sampleRate = String(this.sample_rate ?? 44100);
    const voiceId = String(this.voice_id ?? "");

    const args: Record<string, unknown> = {
      bitrate: bitrate,
      instrumental_id: instrumentalId,
      lyrics: lyrics,
      sample_rate: sampleRate,
      voice_id: voiceId
    };

    const instrumentalFileRef = this.instrumental_file as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(instrumentalFileRef)) {
      const instrumentalFileUrl = await assetToUrl(
        instrumentalFileRef!,
        apiKey
      );
      if (instrumentalFileUrl) args["instrumental_file"] = instrumentalFileUrl;
    }

    const songFileRef = this.song_file as Record<string, unknown> | undefined;
    if (isRefSet(songFileRef)) {
      const songFileUrl = await assetToUrl(songFileRef!, apiKey);
      if (songFileUrl) args["song_file"] = songFileUrl;
    }

    const voiceFileRef = this.voice_file as Record<string, unknown> | undefined;
    if (isRefSet(voiceFileRef)) {
      const voiceFileUrl = await assetToUrl(voiceFileRef!, apiKey);
      if (voiceFileUrl) args["voice_file"] = voiceFileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/music-01:0254c7e2f54315b667dbae03da7c155822ba29ffe0457be5bc246d564be486bd",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class LTX_Video extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.LTX_Video";
  static readonly title = "L T X_ Video";
  static readonly description = `LTX-Video is the first DiT-based video generation model capable of generating high-quality videos in real-time. It produces 24 FPS videos at a 768x512 resolution faster than they can be watched.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "3:2",
    values: [
      "1:1",
      "1:2",
      "2:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "9:16",
      "16:9",
      "9:21",
      "21:9"
    ],
    description:
      "Aspect ratio of the output video. Ignored if an image is provided."
  })
  declare aspect_ratio: any;

  @prop({
    type: "float",
    default: 3,
    description: "How strongly the video follows the prompt"
  })
  declare cfg: any;

  @prop({
    type: "image",
    default: "",
    description: "Optional input image to use as the starting frame"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0.15,
    description: "Lower numbers stick more closely to the input image"
  })
  declare image_noise_scale: any;

  @prop({
    type: "enum",
    default: 97,
    values: ["97", "129", "161", "193", "225", "257"],
    description: "Length of the output video in frames"
  })
  declare length: any;

  @prop({
    type: "enum",
    default: "0.9.1",
    values: ["0.9.1", "0.9"],
    description: "Model version to use"
  })
  declare model: any;

  @prop({
    type: "str",
    default: "low quality, worst quality, deformed, distorted",
    description: "Things you do not want to see in your video"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "best quality, 4k, HDR, a tracking shot of a beautiful scene",
    description:
      "Text prompt for the video. This model needs long descriptive prompts, if the prompt is too short the quality won't be good."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Set a seed for reproducibility. Random by default."
  })
  declare seed: any;

  @prop({ type: "int", default: 30, description: "Number of steps" })
  declare steps: any;

  @prop({
    type: "enum",
    default: 640,
    values: ["512", "576", "640", "704", "768", "832", "896", "960", "1024"],
    description: "Target size for the output video"
  })
  declare target_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "3:2");
    const cfg = Number(this.cfg ?? 3);
    const imageNoiseScale = Number(this.image_noise_scale ?? 0.15);
    const length = String(this.length ?? 97);
    const model = String(this.model ?? "0.9.1");
    const negativePrompt = String(
      this.negative_prompt ?? "low quality, worst quality, deformed, distorted"
    );
    const prompt = String(
      this.prompt ??
        "best quality, 4k, HDR, a tracking shot of a beautiful scene"
    );
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 30);
    const targetSize = String(this.target_size ?? 640);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      cfg: cfg,
      image_noise_scale: imageNoiseScale,
      length: length,
      model: model,
      negative_prompt: negativePrompt,
      prompt: prompt,
      seed: seed,
      steps: steps,
      target_size: targetSize
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lightricks/ltx-video:8c47da666861d081eeb4d1261853087de23923a268a69b63febdf5dc1dee08e4",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_1_I2V_480p extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Wan_2_1_I2V_480p";
  static readonly title = "Wan_2_1_ I2 V_480p";
  static readonly description = `Accelerated inference for Wan 2.1 14B image to video, a comprehensive and open suite of video foundation models that pushes the boundaries of video generation.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "Aspect ratio of the output video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated videos"
  })
  declare disable_safety_checker: any;

  @prop({
    type: "enum",
    default: "Balanced",
    values: ["Off", "Balanced", "Fast"],
    description:
      "Speed up generation with different levels of acceleration. Faster modes may degrade quality somewhat. The speedup is dependent on the content, so different videos may see different speedups."
  })
  declare fast_mode: any;

  @prop({
    type: "image",
    default: "",
    description: "Image for use as the initial frame of the video."
  })
  declare image: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. You may still need to experiment to find the best value for your particular lora."
  })
  declare lora_scale: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights. Supports HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet."
  })
  declare lora_weights: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to avoid certain elements"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for image generation"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 5,
    description: "Guidance scale for generation"
  })
  declare sample_guide_scale: any;

  @prop({
    type: "int",
    default: 3,
    description: "Flow shift parameter for video generation"
  })
  declare sample_shift: any;

  @prop({ type: "int", default: 30, description: "Number of inference steps" })
  declare sample_steps: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const fastMode = String(this.fast_mode ?? "Balanced");
    const loraScale = Number(this.lora_scale ?? 1);
    const loraWeights = String(this.lora_weights ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const sampleGuideScale = Number(this.sample_guide_scale ?? 5);
    const sampleShift = Number(this.sample_shift ?? 3);
    const sampleSteps = Number(this.sample_steps ?? 30);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      fast_mode: fastMode,
      lora_scale: loraScale,
      lora_weights: loraWeights,
      negative_prompt: negativePrompt,
      prompt: prompt,
      sample_guide_scale: sampleGuideScale,
      sample_shift: sampleShift,
      sample_steps: sampleSteps,
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
      "wavespeedai/wan-2.1-i2v-480p:e2870aa4965fd9ddfd87c16a3c8ab952c18e745e63f3f3b123c2dc8b538ad2b5",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_1_1_3B extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Wan_2_1_1_3B";
  static readonly title = "Wan_2_1_1_3 B";
  static readonly description = `Generate 5s 480p videos. Wan is an advanced and powerful visual generation model developed by Tongyi Lab of Alibaba Group
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "Video aspect ratio"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 81,
    values: ["17", "33", "49", "65", "81"],
    description: "Video duration in frames (based on standard 16fps playback)"
  })
  declare frame_num: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt describing what you want to generate"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p"],
    description: "Video resolution"
  })
  declare resolution: any;

  @prop({
    type: "float",
    default: 6,
    description:
      "Classifier free guidance scale (higher values strengthen prompt adherence)"
  })
  declare sample_guide_scale: any;

  @prop({
    type: "float",
    default: 8,
    description:
      "Sampling shift factor for flow matching (recommended range: 8-12)"
  })
  declare sample_shift: any;

  @prop({
    type: "int",
    default: 30,
    description: "Number of sampling steps (higher = better quality but slower)"
  })
  declare sample_steps: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed for reproducible results (leave blank for random)"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const frameNum = String(this.frame_num ?? 81);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "480p");
    const sampleGuideScale = Number(this.sample_guide_scale ?? 6);
    const sampleShift = Number(this.sample_shift ?? 8);
    const sampleSteps = Number(this.sample_steps ?? 30);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      frame_num: frameNum,
      prompt: prompt,
      resolution: resolution,
      sample_guide_scale: sampleGuideScale,
      sample_shift: sampleShift,
      sample_steps: sampleSteps,
      seed: seed
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "wan-video/wan-2.1-1.3b:121bbb762bf449889f090d36e3598c72c50c7a8cc2ce250433bc521a562aae61",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Pixverse_V5 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Pixverse_V5";
  static readonly title = "Pixverse_ V5";
  static readonly description = `Create 5s-8s videos with enhanced character movement, visual effects, and exclusive 1080p-8s support. Optimized for anime characters and complex actions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "8"],
    description:
      "Duration of the video in seconds. 8 second videos cost twice as much as 5 second videos. V5 supports 1080p with 8 second duration."
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Let's YMCA!",
      "Subject 3 Fever",
      "Ghibli Live!",
      "Suit Swagger",
      "Muscle Surge",
      "360° Microwave",
      "Warmth of Jesus",
      "Emergency Beat",
      "Anything, Robot",
      "Kungfu Club",
      "Mint in Box",
      "Retro Anime Pop",
      "Vogue Walk",
      "Mega Dive",
      "Evil Trigger"
    ],
    description:
      "Special effect to apply to the video. V5 supports effects. Does not work with last_frame_image."
  })
  declare effect: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use for the first frame of the video"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Use to generate a video that transitions from the first image to the last image. Must be used with image."
  })
  declare last_frame_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to avoid certain elements in the video"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "540p",
    values: ["360p", "540p", "720p", "1080p"],
    description:
      "Resolution of the video. 360p and 540p cost the same, but 720p and 1080p cost more. V5 supports 1080p with 8 second duration."
  })
  declare quality: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 5);
    const effect = String(this.effect ?? "None");
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const quality = String(this.quality ?? "540p");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
      effect: effect,
      negative_prompt: negativePrompt,
      prompt: prompt,
      quality: quality,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const lastFrameImageRef = this.last_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameImageRef)) {
      const lastFrameImageUrl = await assetToUrl(lastFrameImageRef!, apiKey);
      if (lastFrameImageUrl) args["last_frame_image"] = lastFrameImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "pixverse/pixverse-v5:450181c56fcbf920d8d5ba9d7c5653537a009b626652c1a0a909924a785e3389",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Gen4_Turbo extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Gen4_Turbo";
  static readonly title = "Gen4_ Turbo";
  static readonly description = `Generate 5s and 10s 720p videos fast
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    description: "Video aspect ratio"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "10"],
    description: "Duration of the output video in seconds"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description: "Initial image for video generation (first frame)"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 5);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
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
      "runwayml/gen4-turbo:6257a44f7b6390e47eb18a1c11f55d221fc90ec056d9acfe490ec9924739533c",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Gen4_Aleph extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Gen4_Aleph";
  static readonly title = "Gen4_ Aleph";
  static readonly description = `A new way to edit, transform and generate video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    description: "Video aspect ratio"
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Reference image to influence the style or content of the output."
  })
  declare reference_image: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Input video to generate from. Videos must be less than 16MB. Only 5s of the input video will be used."
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      prompt: prompt,
      seed: seed
    };

    const referenceImageRef = this.reference_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceImageRef)) {
      const referenceImageUrl = await assetToUrl(referenceImageRef!, apiKey);
      if (referenceImageUrl) args["reference_image"] = referenceImageUrl;
    }

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "runwayml/gen4-aleph:68cabc3b111f47bd881cffaca63ad0b1e7834c77737e042cec6eca18962ce1d2",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Kling_V2_1 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Kling_V2_1";
  static readonly title = "Kling_ V2_1";
  static readonly description = `Use Kling v2.1 to generate 5s and 10s videos in 720p and 1080p resolution from a starting image (image-to-video)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "10"],
    description: "Duration of the video in seconds"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Last frame of the video (pro mode is required when this parameter is set)"
  })
  declare end_image: any;

  @prop({
    type: "enum",
    default: "standard",
    values: ["standard", "pro"],
    description:
      "Standard has a resolution of 720p, pro is 1080p. Both are 24fps."
  })
  declare mode: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want to see in the video"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description:
      "First frame of the video. You must use a start image with kling-v2.1."
  })
  declare start_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const duration = String(this.duration ?? 5);
    const mode = String(this.mode ?? "standard");
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      duration: duration,
      mode: mode,
      negative_prompt: negativePrompt,
      prompt: prompt
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl = await assetToUrl(endImageRef!, apiKey);
      if (endImageUrl) args["end_image"] = endImageUrl;
    }

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl = await assetToUrl(startImageRef!, apiKey);
      if (startImageUrl) args["start_image"] = startImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "kwaivgi/kling-v2.1:daad218feb714b03e2a1ac445986aebb9d05243cd00da2af17be2e4049f48f69",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Kling_Lip_Sync extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Kling_Lip_Sync";
  static readonly title = "Kling_ Lip_ Sync";
  static readonly description = `Add lip-sync to any video with an audio file or text
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "Audio file for lip sync. Must be .mp3, .wav, .m4a, or .aac and less than 5MB."
  })
  declare audio_file: any;

  @prop({
    type: "str",
    default: "",
    description: "Text content for lip sync (if not using audio)"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    description:
      "ID of a video generated by Kling. Cannot be used with video_url."
  })
  declare video_id: any;

  @prop({
    type: "str",
    default: "",
    description:
      "URL of a video for lip syncing. It can be an .mp4 or .mov file, should be less than 100MB, with a duration of 2-10 seconds, and a resolution of 720p-1080p (720-1920px dimensions). Cannot be used with video_id."
  })
  declare video_url: any;

  @prop({
    type: "enum",
    default: "en_AOT",
    values: [
      "en_AOT",
      "en_oversea_male1",
      "en_girlfriend_4_speech02",
      "en_chat_0407_5-1",
      "en_uk_boy1",
      "en_PeppaPig_platform",
      "en_ai_huangzhong_712",
      "en_calm_story1",
      "en_uk_man2",
      "en_reader_en_m-v1",
      "en_commercial_lady_en_f-v1",
      "zh_genshin_vindi2",
      "zh_zhinen_xuesheng",
      "zh_tiyuxi_xuedi",
      "zh_ai_shatang",
      "zh_genshin_klee2",
      "zh_genshin_kirara",
      "zh_ai_kaiya",
      "zh_tiexin_nanyou",
      "zh_ai_chenjiahao_712",
      "zh_girlfriend_1_speech02",
      "zh_chat1_female_new-3",
      "zh_girlfriend_2_speech02",
      "zh_cartoon-boy-07",
      "zh_cartoon-girl-01",
      "zh_ai_huangyaoshi_712",
      "zh_you_pingjing",
      "zh_ai_laoguowang_712",
      "zh_chengshu_jiejie",
      "zh_zhuxi_speech02",
      "zh_uk_oldman3",
      "zh_laopopo_speech02",
      "zh_heainainai_speech02",
      "zh_dongbeilaotie_speech02",
      "zh_chongqingxiaohuo_speech02",
      "zh_chuanmeizi_speech02",
      "zh_chaoshandashu_speech02",
      "zh_ai_taiwan_man2_speech02",
      "zh_xianzhanggui_speech02",
      "zh_tianjinjiejie_speech02",
      "zh_diyinnansang_DB_CN_M_04-v2",
      "zh_yizhipiannan-v1",
      "zh_guanxiaofang-v2",
      "zh_tianmeixuemei-v1",
      "zh_daopianyansang-v1",
      "zh_mengwa-v1"
    ],
    description: "Voice ID for speech synthesis (if using text and not audio)"
  })
  declare voice_id: any;

  @prop({
    type: "float",
    default: 1,
    description: "Speech rate (only used if using text and not audio)"
  })
  declare voice_speed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const text = String(this.text ?? "");
    const videoId = String(this.video_id ?? "");
    const videoUrl = String(this.video_url ?? "");
    const voiceId = String(this.voice_id ?? "en_AOT");
    const voiceSpeed = Number(this.voice_speed ?? 1);

    const args: Record<string, unknown> = {
      text: text,
      video_id: videoId,
      video_url: videoUrl,
      voice_id: voiceId,
      voice_speed: voiceSpeed
    };

    const audioFileRef = this.audio_file as Record<string, unknown> | undefined;
    if (isRefSet(audioFileRef)) {
      const audioFileUrl = await assetToUrl(audioFileRef!, apiKey);
      if (audioFileUrl) args["audio_file"] = audioFileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "kwaivgi/kling-lip-sync:8311467f07043d4b3feb44584d2586bfa2fc70203eca612ed26f84d0b55df3ce",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Hailuo_02 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Hailuo_02";
  static readonly title = "Hailuo_02";
  static readonly description = `Hailuo 2 is a text-to-video and image-to-video model that can make 6s or 10s videos at 768p (standard) or 1080p (pro). It excels at real world physics.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: 6,
    values: ["6", "10"],
    description:
      "Duration of the video in seconds. 10 seconds is only available for 768p resolution."
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "First frame image for video generation. The output video will have the same aspect ratio as this image."
  })
  declare first_frame_image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Last frame image for video generation. The final frame of the output video will match this image."
  })
  declare last_frame_image: any;

  @prop({ type: "str", default: "", description: "Text prompt for generation" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Use prompt optimizer" })
  declare prompt_optimizer: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["512p", "768p", "1080p"],
    description:
      "Pick between standard 512p, 768p, or pro 1080p resolution. The pro model is not just high resolution, it is also higher quality."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const duration = String(this.duration ?? 6);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);
    const resolution = String(this.resolution ?? "1080p");

    const args: Record<string, unknown> = {
      duration: duration,
      prompt: prompt,
      prompt_optimizer: promptOptimizer,
      resolution: resolution
    };

    const firstFrameImageRef = this.first_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameImageRef)) {
      const firstFrameImageUrl = await assetToUrl(firstFrameImageRef!, apiKey);
      if (firstFrameImageUrl) args["first_frame_image"] = firstFrameImageUrl;
    }

    const lastFrameImageRef = this.last_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameImageRef)) {
      const lastFrameImageUrl = await assetToUrl(lastFrameImageRef!, apiKey);
      if (lastFrameImageUrl) args["last_frame_image"] = lastFrameImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/hailuo-02:baaadb886e09b1e711387e270d841930e8253f08775bc6cb176580658f0f2fd9",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Lipsync_2 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Lipsync_2";
  static readonly title = "Lipsync_2";
  static readonly description = `Generate realistic lipsyncs with Sync Labs' 2.0 model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to detect active speaker (i.e. whoever is speaking in the clip will be used for lipsync)"
  })
  declare active_speaker: any;

  @prop({ type: "audio", default: "", description: "Input audio file (.wav)" })
  declare audio: any;

  @prop({
    type: "enum",
    default: "loop",
    values: ["loop", "bounce", "cut_off", "silence", "remap"],
    description: "Lipsync mode when audio and video durations are out of sync"
  })
  declare sync_mode: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "How expressive lipsync can be (0-1)"
  })
  declare temperature: any;

  @prop({ type: "video", default: "", description: "Input video file (.mp4)" })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const activeSpeaker = Boolean(this.active_speaker ?? false);
    const syncMode = String(this.sync_mode ?? "loop");
    const temperature = Number(this.temperature ?? 0.5);

    const args: Record<string, unknown> = {
      active_speaker: activeSpeaker,
      sync_mode: syncMode,
      temperature: temperature
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "sync/lipsync-2:3190ef7dc0cbca29458d0032c032ef140a840087141cf10333e8d19a213f9194",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Lipsync_2_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Lipsync_2_Pro";
  static readonly title = "Lipsync_2_ Pro";
  static readonly description = `Studio-grade lipsync in minutes, not weeks
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to detect active speaker (i.e. whoever is speaking in the clip will be used for lipsync)"
  })
  declare active_speaker: any;

  @prop({ type: "audio", default: "", description: "Input audio file (.wav)" })
  declare audio: any;

  @prop({
    type: "enum",
    default: "loop",
    values: ["loop", "bounce", "cut_off", "silence", "remap"],
    description: "Lipsync mode when audio and video durations are out of sync"
  })
  declare sync_mode: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "How expressive lipsync can be (0-1)"
  })
  declare temperature: any;

  @prop({ type: "video", default: "", description: "Input video file (.mp4)" })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const activeSpeaker = Boolean(this.active_speaker ?? false);
    const syncMode = String(this.sync_mode ?? "loop");
    const temperature = Number(this.temperature ?? 0.5);

    const args: Record<string, unknown> = {
      active_speaker: activeSpeaker,
      sync_mode: syncMode,
      temperature: temperature
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "sync/lipsync-2-pro:eaad6bceea4938d05f5d984b22897e5a7d389d4fff9a70888af5718502b57d39",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_2_T2V_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Wan_2_2_T2V_Fast";
  static readonly title = "Wan_2_2_ T2 V_ Fast";
  static readonly description = `A very fast and cheap PrunaAI optimized version of Wan 2.2 A14B text-to-video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    description:
      "Aspect ratio of video. 16:9 corresponds to 832x480px, and 9:16 is 480x832px"
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated video."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "int",
    default: 16,
    description:
      "Frames per second. Note that the pricing of this model is based on the video duration at 16 fps"
  })
  declare frames_per_second: any;

  @prop({ type: "bool", default: true, description: "Go fast" })
  declare go_fast: any;

  @prop({
    type: "bool",
    default: true,
    description: "Interpolate the generated video to 30 FPS using ffmpeg"
  })
  declare interpolate_output: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the transformer LoRA should be applied."
  })
  declare lora_scale_transformer: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the transformer_2 LoRA should be applied."
  })
  declare lora_scale_transformer_2: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights for transformer. Supports arbitrary .safetensors URLs from the Internet (for example, 'https://huggingface.co/Viktor1717/scandinavian-interior-style1/resolve/main/my_first_flux_lora_v1.safetensors')"
  })
  declare lora_weights_transformer: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights for transformer_2. Supports arbitrary .safetensors URLs from the Internet. Can be different from transformer LoRA."
  })
  declare lora_weights_transformer_2: any;

  @prop({
    type: "int",
    default: 81,
    description: "Number of video frames. 81 frames give the best results"
  })
  declare num_frames: any;

  @prop({
    type: "bool",
    default: false,
    description: "Translate prompt to Chinese before generation"
  })
  declare optimize_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "720p"],
    description:
      "Resolution of video. 16:9 corresponds to 832x480px, and 9:16 is 480x832px"
  })
  declare resolution: any;

  @prop({ type: "float", default: 12, description: "Sample shift factor" })
  declare sample_shift: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank for random"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const framesPerSecond = Number(this.frames_per_second ?? 16);
    const goFast = Boolean(this.go_fast ?? true);
    const interpolateOutput = Boolean(this.interpolate_output ?? true);
    const loraScaleTransformer = Number(this.lora_scale_transformer ?? 1);
    const loraScaleTransformer_2 = Number(this.lora_scale_transformer_2 ?? 1);
    const loraWeightsTransformer = String(this.lora_weights_transformer ?? "");
    const loraWeightsTransformer_2 = String(
      this.lora_weights_transformer_2 ?? ""
    );
    const numFrames = Number(this.num_frames ?? 81);
    const optimizePrompt = Boolean(this.optimize_prompt ?? false);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "480p");
    const sampleShift = Number(this.sample_shift ?? 12);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: disableSafetyChecker,
      frames_per_second: framesPerSecond,
      go_fast: goFast,
      interpolate_output: interpolateOutput,
      lora_scale_transformer: loraScaleTransformer,
      lora_scale_transformer_2: loraScaleTransformer_2,
      lora_weights_transformer: loraWeightsTransformer,
      lora_weights_transformer_2: loraWeightsTransformer_2,
      num_frames: numFrames,
      optimize_prompt: optimizePrompt,
      prompt: prompt,
      resolution: resolution,
      sample_shift: sampleShift,
      seed: seed
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "wan-video/wan-2.2-t2v-fast:c483b1f7b892065bc58ebadb6381abf557f6b1f517d2ff0febb3fb635cf49b4d",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_2_I2V_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Wan_2_2_I2V_Fast";
  static readonly title = "Wan_2_2_ I2 V_ Fast";
  static readonly description = `A very fast and cheap PrunaAI optimized version of Wan 2.2 A14B image-to-video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "bool",
    default: false,
    description: "Disable safety checker for generated video."
  })
  declare disable_safety_checker: any;

  @prop({
    type: "int",
    default: 16,
    description:
      "Frames per second. Note that the pricing of this model is based on the video duration at 16 fps"
  })
  declare frames_per_second: any;

  @prop({ type: "bool", default: true, description: "Go fast" })
  declare go_fast: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image to generate video from."
  })
  declare image: any;

  @prop({
    type: "bool",
    default: false,
    description: "Interpolate the generated video to 30 FPS using ffmpeg"
  })
  declare interpolate_output: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional last image to condition the video generation. If provided, creates smoother transitions between frames."
  })
  declare last_image: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the transformer LoRA should be applied."
  })
  declare lora_scale_transformer: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Determines how strongly the transformer_2 LoRA should be applied."
  })
  declare lora_scale_transformer_2: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights for the HIGH transformer. Supports arbitrary .safetensors URLs from the Internet (for example, 'https://huggingface.co/TheRaf7/instagirl-v2/resolve/main/Instagirlv2.0_hinoise.safetensors')"
  })
  declare lora_weights_transformer: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Load LoRA weights for the LOW transformer_2. Supports arbitrary .safetensors URLs from the Internet. Can be different from transformer LoRA. (for example, 'https://huggingface.co/TheRaf7/instagirl-v2/resolve/main/Instagirlv2.0_lownoise.safetensors')"
  })
  declare lora_weights_transformer_2: any;

  @prop({
    type: "int",
    default: 81,
    description: "Number of video frames. 81 frames give the best results"
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "480p",
    values: ["480p", "720p"],
    description:
      "Resolution of video. 16:9 corresponds to 832x480px, and 9:16 is 480x832px"
  })
  declare resolution: any;

  @prop({ type: "float", default: 12, description: "Sample shift factor" })
  declare sample_shift: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank for random"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const disableSafetyChecker = Boolean(this.disable_safety_checker ?? false);
    const framesPerSecond = Number(this.frames_per_second ?? 16);
    const goFast = Boolean(this.go_fast ?? true);
    const interpolateOutput = Boolean(this.interpolate_output ?? false);
    const loraScaleTransformer = Number(this.lora_scale_transformer ?? 1);
    const loraScaleTransformer_2 = Number(this.lora_scale_transformer_2 ?? 1);
    const loraWeightsTransformer = String(this.lora_weights_transformer ?? "");
    const loraWeightsTransformer_2 = String(
      this.lora_weights_transformer_2 ?? ""
    );
    const numFrames = Number(this.num_frames ?? 81);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "480p");
    const sampleShift = Number(this.sample_shift ?? 12);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      disable_safety_checker: disableSafetyChecker,
      frames_per_second: framesPerSecond,
      go_fast: goFast,
      interpolate_output: interpolateOutput,
      lora_scale_transformer: loraScaleTransformer,
      lora_scale_transformer_2: loraScaleTransformer_2,
      lora_weights_transformer: loraWeightsTransformer,
      lora_weights_transformer_2: loraWeightsTransformer_2,
      num_frames: numFrames,
      prompt: prompt,
      resolution: resolution,
      sample_shift: sampleShift,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const lastImageRef = this.last_image as Record<string, unknown> | undefined;
    if (isRefSet(lastImageRef)) {
      const lastImageUrl = await assetToUrl(lastImageRef!, apiKey);
      if (lastImageUrl) args["last_image"] = lastImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "wan-video/wan-2.2-i2v-fast:4eaf2b01d3bf70d8a2e00b219efeb7cb415855ad18b7dacdc4cae664a73a6eea",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Veo_3_1 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Veo_3_1";
  static readonly title = "Veo_3_1";
  static readonly description = `New and improved version of Veo 3, with higher-fidelity video, context-aware audio, reference image and last frame support
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "Video aspect ratio"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 8,
    values: ["4", "6", "8"],
    description: "Video duration in seconds"
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Generate audio with the video"
  })
  declare generate_audio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image to start generating from. Ideal images are 16:9 or 9:16 and 1280x720 or 720x1280, depending on the aspect ratio you choose."
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Ending image for interpolation. When provided with an input image, creates a transition between the two images."
  })
  declare last_frame: any;

  @prop({
    type: "str",
    default: "",
    description: "Description of what to exclude from the generated video"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "1 to 3 reference images for subject-consistent generation (reference-to-video, or R2V). Reference images only work with 16:9 aspect ratio and 8-second duration. Last frame is ignored if reference images are provided."
  })
  declare reference_images: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    description: "Resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Omit for random generations"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 8);
    const generateAudio = Boolean(this.generate_audio ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1080p");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
      generate_audio: generateAudio,
      negative_prompt: negativePrompt,
      prompt: prompt,
      resolution: resolution,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const lastFrameRef = this.last_frame as Record<string, unknown> | undefined;
    if (isRefSet(lastFrameRef)) {
      const lastFrameUrl = await assetToUrl(lastFrameRef!, apiKey);
      if (lastFrameUrl) args["last_frame"] = lastFrameUrl;
    }

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
      "google/veo-3.1:ed5b1767b711dd15d954b162af1e890d27882680f463a85e94f02d604012b972",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Gen4_5 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Gen4_5";
  static readonly title = "Gen4_5";
  static readonly description = `State-of-the-art video motion quality, prompt adherence and visual fidelity
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    description: "Video aspect ratio"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "10"],
    description: "Duration of the output video in seconds"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional initial image for video generation (first frame). If not provided, video will be generated from text only."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
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
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 5);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
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
      "runwayml/gen-4.5:2e10d5ae08888b39ed31c828003f4a5ddc89a7cdec3bc7a9926661e0d22cb034",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Kling_V3_Video extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Kling_V3_Video";
  static readonly title = "Kling_ V3_ Video";
  static readonly description = `Kling Video 3.0: Generate cinematic videos up to 15 seconds with multi-shot control, native audio, and improved consistency
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio. Ignored when start_image is provided."
  })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 5, description: "Video duration in seconds." })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Last frame image. Requires start_image. Supports .jpg/.jpeg/.png, max 10MB, min 300px."
  })
  declare end_image: any;

  @prop({
    type: "bool",
    default: false,
    description: "Generate native audio for the video."
  })
  declare generate_audio: any;

  @prop({
    type: "enum",
    default: "pro",
    values: ["standard", "pro"],
    description: "'standard' generates 720p, 'pro' generates 1080p."
  })
  declare mode: any;

  @prop({
    type: "str",
    default: "",
    description:
      'JSON array of shot definitions for multi-shot mode. Each shot: {"prompt": "...", "duration": N}. Max 6 shots, min 1s per shot, total must equal duration.'
  })
  declare multi_prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Things you do not want to see in the video. Max 2500 characters."
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation. Max 2500 characters."
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description:
      "First frame image. Supports .jpg/.jpeg/.png, max 10MB, min 300px, aspect ratio 1:2.5 to 2.5:1."
  })
  declare start_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = Number(this.duration ?? 5);
    const generateAudio = Boolean(this.generate_audio ?? false);
    const mode = String(this.mode ?? "pro");
    const multiPrompt = String(this.multi_prompt ?? "");
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
      generate_audio: generateAudio,
      mode: mode,
      multi_prompt: multiPrompt,
      negative_prompt: negativePrompt,
      prompt: prompt
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl = await assetToUrl(endImageRef!, apiKey);
      if (endImageUrl) args["end_image"] = endImageUrl;
    }

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl = await assetToUrl(startImageRef!, apiKey);
      if (startImageUrl) args["start_image"] = startImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "kwaivgi/kling-v3-video:4a8ba2743bd9dc2b487e0c4319988aacd658d33c2d064b8a420f4ee1732c30bd",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Kling_V3_Omni_Video extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Kling_V3_Omni_Video";
  static readonly title = "Kling_ V3_ Omni_ Video";
  static readonly description = `Kling Video 3.0 Omni: Unified multimodal video generation with reference images, video editing, native audio, and multi-shot control
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description:
      "Aspect ratio. Required when not using start frame or video editing."
  })
  declare aspect_ratio: any;

  @prop({
    type: "int",
    default: 5,
    description:
      "Video duration in seconds (3-15). Ignored for video editing (base)."
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Last frame image. Requires start_image. Supports .jpg/.jpeg/.png, max 10MB, min 300px."
  })
  declare end_image: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Generate native audio. Mutually exclusive with reference video."
  })
  declare generate_audio: any;

  @prop({
    type: "bool",
    default: true,
    description: "Keep original sound from reference video."
  })
  declare keep_original_sound: any;

  @prop({
    type: "enum",
    default: "pro",
    values: ["standard", "pro"],
    description: "'standard' generates 720p, 'pro' generates 1080p."
  })
  declare mode: any;

  @prop({
    type: "str",
    default: "",
    description:
      'JSON array of shot definitions for multi-shot mode. Each shot: {"prompt": "...", "duration": N}. Max 6 shots, min duration 1s per shot, total must equal duration. Example: [{"prompt":"A cat jumps","duration":3},{"prompt":"It lands","duration":2}]'
  })
  declare multi_prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for video generation. Supports <<<image_1>>>, <<<video_1>>> template references. Max 2500 characters."
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Reference images for elements, scenes, or styles. Supports .jpg/.jpeg/.png. Max 7 without video, 4 with video."
  })
  declare reference_images: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Reference video (.mp4/.mov). Duration 3-10s, resolution 720-2160px per side, max 200MB."
  })
  declare reference_video: any;

  @prop({
    type: "image",
    default: "",
    description:
      "First frame image. Supports .jpg/.jpeg/.png, max 10MB, min 300px, aspect ratio 1:2.5 to 2.5:1."
  })
  declare start_image: any;

  @prop({
    type: "enum",
    default: "feature",
    values: ["feature", "base"],
    description:
      "How to use reference video: 'feature' for style/camera reference, 'base' for video editing."
  })
  declare video_reference_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = Number(this.duration ?? 5);
    const generateAudio = Boolean(this.generate_audio ?? false);
    const keepOriginalSound = Boolean(this.keep_original_sound ?? true);
    const mode = String(this.mode ?? "pro");
    const multiPrompt = String(this.multi_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const videoReferenceType = String(this.video_reference_type ?? "feature");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
      generate_audio: generateAudio,
      keep_original_sound: keepOriginalSound,
      mode: mode,
      multi_prompt: multiPrompt,
      prompt: prompt,
      video_reference_type: videoReferenceType
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl = await assetToUrl(endImageRef!, apiKey);
      if (endImageUrl) args["end_image"] = endImageUrl;
    }

    const referenceImagesRef = this.reference_images as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceImagesRef)) {
      const referenceImagesUrl = await assetToUrl(referenceImagesRef!, apiKey);
      if (referenceImagesUrl) args["reference_images"] = referenceImagesUrl;
    }

    const referenceVideoRef = this.reference_video as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceVideoRef)) {
      const referenceVideoUrl = await assetToUrl(referenceVideoRef!, apiKey);
      if (referenceVideoUrl) args["reference_video"] = referenceVideoUrl;
    }

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl = await assetToUrl(startImageRef!, apiKey);
      if (startImageUrl) args["start_image"] = startImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "kwaivgi/kling-v3-omni-video:1d449e255319a7c07feca688cf0596cb82cc8a96ceddff6c44fd0d090b4e830c",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Kling_V2_5_Turbo_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Kling_V2_5_Turbo_Pro";
  static readonly title = "Kling_ V2_5_ Turbo_ Pro";
  static readonly description = `Kling 2.5 Turbo Pro: Unlock pro-level text-to-video and image-to-video creation with smooth motion, cinematic depth, and remarkable prompt adherence.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description:
      "Aspect ratio of the video. Ignored if start_image is provided."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "10"],
    description: "Duration of the video in seconds"
  })
  declare duration: any;

  @prop({ type: "image", default: "", description: "Last frame of the video" })
  declare end_image: any;

  @prop({
    type: "image",
    default: "",
    description: "Deprecated: Use start_image instead."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want to see in the video"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "First frame of the video" })
  declare start_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 5);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
      negative_prompt: negativePrompt,
      prompt: prompt
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl = await assetToUrl(endImageRef!, apiKey);
      if (endImageUrl) args["end_image"] = endImageUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl = await assetToUrl(startImageRef!, apiKey);
      if (startImageUrl) args["start_image"] = startImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "kwaivgi/kling-v2.5-turbo-pro:18f41bfca7f1997ce37b04b407152c385c9159095681a6f5a4ff47718bc25a57",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Kling_V2_6 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Kling_V2_6";
  static readonly title = "Kling_ V2_6";
  static readonly description = `Kling 2.6 Pro: Top-tier image-to-video with cinematic visuals, fluid motion, and native audio generation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description:
      "Aspect ratio of the video. Ignored if start_image is provided."
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "10"],
    description: "Duration of the video in seconds"
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Generate audio for the video. When enabled, the model will create synchronized audio based on the video content."
  })
  declare generate_audio: any;

  @prop({
    type: "str",
    default: "",
    description: "Things you do not want to see in the video"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({ type: "image", default: "", description: "First frame of the video" })
  declare start_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 5);
    const generateAudio = Boolean(this.generate_audio ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
      generate_audio: generateAudio,
      negative_prompt: negativePrompt,
      prompt: prompt
    };

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl = await assetToUrl(startImageRef!, apiKey);
      if (startImageUrl) args["start_image"] = startImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "kwaivgi/kling-v2.6:b13f36d030496dd78d2986ba8b2b22a44222b3f58c15fb63ef7d6b4aa3a53319",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Veo_3 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Veo_3";
  static readonly title = "Veo_3";
  static readonly description = `Sound on: Google’s flagship Veo 3 text to video model, with audio
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "Video aspect ratio"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 8,
    values: ["4", "6", "8"],
    description: "Video duration in seconds"
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Generate audio with the video"
  })
  declare generate_audio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image to start generating from. Ideal images are 16:9 or 9:16 and 1280x720 or 720x1280, depending on the aspect ratio you choose."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Description of what to exclude from the generated video"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    description: "Resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Omit for random generations"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 8);
    const generateAudio = Boolean(this.generate_audio ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1080p");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
      generate_audio: generateAudio,
      negative_prompt: negativePrompt,
      prompt: prompt,
      resolution: resolution,
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
      "google/veo-3:5e80c73750ffc5dfbe5cee2d694c6ed3da7706660d9132613e6736443b365464",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Veo_3_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Veo_3_Fast";
  static readonly title = "Veo_3_ Fast";
  static readonly description = `A faster and cheaper version of Google’s Veo 3 video model, with audio
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "Video aspect ratio"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 8,
    values: ["4", "6", "8"],
    description: "Video duration in seconds"
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "Generate audio with the video"
  })
  declare generate_audio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image to start generating from. Ideal images are 16:9 or 9:16 and 1280x720 or 720x1280, depending on the aspect ratio you choose."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Description of what to exclude from the generated video"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p"],
    description: "Resolution of the generated video"
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Omit for random generations"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 8);
    const generateAudio = Boolean(this.generate_audio ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1080p");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
      generate_audio: generateAudio,
      negative_prompt: negativePrompt,
      prompt: prompt,
      resolution: resolution,
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
      "google/veo-3-fast:368d4063e21ecf73746b8e6d27989837d97ba07b5eca43a4e5488c852e10c2ec",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Veo_2 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Veo_2";
  static readonly title = "Veo_2";
  static readonly description = `State of the art video generation model. Veo 2 can faithfully follow simple and complex instructions, and convincingly simulates real-world physics as well as a wide range of visual styles.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16"],
    description: "Video aspect ratio"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "6", "7", "8"],
    description: "Video duration in seconds"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image to start generating from. Ideal images are 16:9 or 9:16 and 1280x720 or 720x1280, depending on the aspect ratio you choose."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Omit for random generations"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 5);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
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
      "google/veo-2:af8ebddc406d877a89d631dbbcba24b31692e0f9819639299b1d5def12dd7c95",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Hailuo_2_3 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Hailuo_2_3";
  static readonly title = "Hailuo_2_3";
  static readonly description = `A high-fidelity video generation model optimized for realistic human motion, cinematic VFX, expressive characters, and strong prompt and style adherence across both text-to-video and image-to-video workflows
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: 6,
    values: ["6", "10"],
    description:
      "Duration of the video in seconds. 10 seconds is only available for 768p resolution."
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "First frame image for video generation. The output video will have the same aspect ratio as this image."
  })
  declare first_frame_image: any;

  @prop({ type: "str", default: "", description: "Text prompt for generation" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Use prompt optimizer" })
  declare prompt_optimizer: any;

  @prop({
    type: "enum",
    default: "768p",
    values: ["768p", "1080p"],
    description:
      "Pick between 768p or 1080p resolution. 1080p supports only 6-second duration."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const duration = String(this.duration ?? 6);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);
    const resolution = String(this.resolution ?? "768p");

    const args: Record<string, unknown> = {
      duration: duration,
      prompt: prompt,
      prompt_optimizer: promptOptimizer,
      resolution: resolution
    };

    const firstFrameImageRef = this.first_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameImageRef)) {
      const firstFrameImageUrl = await assetToUrl(firstFrameImageRef!, apiKey);
      if (firstFrameImageUrl) args["first_frame_image"] = firstFrameImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/hailuo-2.3:23a02633b5a44780345a59d4d43f8bd510efa239c56f08f29639ff24fa6615e1",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Hailuo_2_3_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Hailuo_2_3_Fast";
  static readonly title = "Hailuo_2_3_ Fast";
  static readonly description = `A lower-latency image-to-video version of Hailuo 2.3 that preserves core motion quality, visual consistency, and stylization performance while enabling faster iteration cycles.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: 6,
    values: ["6", "10"],
    description:
      "Duration of the video in seconds. 10 seconds is only available for 768p resolution."
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "First frame image for video generation. The output video will have the same aspect ratio as this image."
  })
  declare first_frame_image: any;

  @prop({ type: "str", default: "", description: "Text prompt for generation" })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Use prompt optimizer" })
  declare prompt_optimizer: any;

  @prop({
    type: "enum",
    default: "768p",
    values: ["768p", "1080p"],
    description:
      "Pick between 768p or 1080p resolution. 1080p supports only 6-second duration."
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const duration = String(this.duration ?? 6);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);
    const resolution = String(this.resolution ?? "768p");

    const args: Record<string, unknown> = {
      duration: duration,
      prompt: prompt,
      prompt_optimizer: promptOptimizer,
      resolution: resolution
    };

    const firstFrameImageRef = this.first_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameImageRef)) {
      const firstFrameImageUrl = await assetToUrl(firstFrameImageRef!, apiKey);
      if (firstFrameImageUrl) args["first_frame_image"] = firstFrameImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/hailuo-2.3-fast:c92f075dfd04541f1c1913a9689f778ecf76bfec3dd9fdfe19903a86e07f2cdc",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Pixverse_V5_6 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Pixverse_V5_6";
  static readonly title = "Pixverse_ V5_6";
  static readonly description = `Latest video model from Pixverse with astonishing physics
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "8", "10"],
    description:
      "Duration of the video in seconds. 10 second videos are only available for 360p, 540p, and 720p."
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Enable AI-generated audio including BGM, SFX, and character dialogues"
  })
  declare generate_audio_switch: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use for the first frame of the video"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Use to generate a video that transitions from the first image to the last image. Must be used with image."
  })
  declare last_frame_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to avoid certain elements in the video"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "540p",
    values: ["360p", "540p", "720p", "1080p"],
    description:
      "Resolution of the video. Higher resolutions cost more. See pricing for details."
  })
  declare quality: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Set for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "auto",
    values: ["disabled", "enabled", "auto"],
    description:
      "Prompt reasoning enhancement. Controls whether the system enhances your prompt with internal reasoning and optimization."
  })
  declare thinking_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 5);
    const generateAudioSwitch = Boolean(this.generate_audio_switch ?? false);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const quality = String(this.quality ?? "540p");
    const seed = Number(this.seed ?? -1);
    const thinkingType = String(this.thinking_type ?? "auto");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
      generate_audio_switch: generateAudioSwitch,
      negative_prompt: negativePrompt,
      prompt: prompt,
      quality: quality,
      seed: seed,
      thinking_type: thinkingType
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const lastFrameImageRef = this.last_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameImageRef)) {
      const lastFrameImageUrl = await assetToUrl(lastFrameImageRef!, apiKey);
      if (lastFrameImageUrl) args["last_frame_image"] = lastFrameImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "pixverse/pixverse-v5.6:716a21c01b88914165473824a15be03188a54c5830fac57d64de93919fcae0e9",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Pixverse_V4 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Pixverse_V4";
  static readonly title = "Pixverse_ V4";
  static readonly description = `Quickly generate smooth 5s or 8s videos at 540p, 720p or 1080p
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "8"],
    description:
      "Duration of the video in seconds. 8 second videos cost twice as much as 5 second videos. (1080p does not support 8 second duration)"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Let's YMCA!",
      "Subject 3 Fever",
      "Ghibli Live!",
      "Suit Swagger",
      "Muscle Surge",
      "360° Microwave",
      "Warmth of Jesus",
      "Emergency Beat",
      "Anything, Robot",
      "Kungfu Club",
      "Mint in Box",
      "Retro Anime Pop",
      "Vogue Walk",
      "Mega Dive",
      "Evil Trigger"
    ],
    description:
      "Special effect to apply to the video. Does not work with last_frame_image."
  })
  declare effect: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use for the first frame of the video"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Use to generate a video that transitions from the first image to the last image. Must be used with image."
  })
  declare last_frame_image: any;

  @prop({
    type: "enum",
    default: "normal",
    values: ["normal", "smooth"],
    description:
      "Motion mode for the video. Smooth videos generate more frames, so they cost twice as much. (smooth is only available when using a 5 second duration, 1080p does not support smooth motion)"
  })
  declare motion_mode: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to avoid certain elements in the video"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "540p",
    values: ["360p", "540p", "720p", "1080p"],
    description:
      "Resolution of the video. 360p and 540p cost the same, but 720p and 1080p cost more. See the README for details."
  })
  declare quality: any;

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
      "Sound effect prompt. If not given, a random sound effect will be generated."
  })
  declare sound_effect_content: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable background music or sound effects"
  })
  declare sound_effect_switch: any;

  @prop({
    type: "enum",
    default: "None",
    values: ["None", "anime", "3d_animation", "clay", "cyberpunk", "comic"],
    description: "Style of the video"
  })
  declare style: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 5);
    const effect = String(this.effect ?? "None");
    const motionMode = String(this.motion_mode ?? "normal");
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const quality = String(this.quality ?? "540p");
    const seed = Number(this.seed ?? -1);
    const soundEffectContent = String(this.sound_effect_content ?? "");
    const soundEffectSwitch = Boolean(this.sound_effect_switch ?? false);
    const style = String(this.style ?? "None");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
      effect: effect,
      motion_mode: motionMode,
      negative_prompt: negativePrompt,
      prompt: prompt,
      quality: quality,
      seed: seed,
      sound_effect_content: soundEffectContent,
      sound_effect_switch: soundEffectSwitch,
      style: style
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const lastFrameImageRef = this.last_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameImageRef)) {
      const lastFrameImageUrl = await assetToUrl(lastFrameImageRef!, apiKey);
      if (lastFrameImageUrl) args["last_frame_image"] = lastFrameImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "pixverse/pixverse-v4:5d3d7389baa4d420ce9aaa270a8b251b3923e778dee4c51e35f8e09d815c6b36",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Pixverse_V4_5 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Pixverse_V4_5";
  static readonly title = "Pixverse_ V4_5";
  static readonly description = `Quickly make 5s or 8s videos at 540p, 720p or 1080p. It has enhanced motion, prompt coherence and handles complex actions well.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "9:16", "1:1"],
    description: "Aspect ratio of the video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "8"],
    description:
      "Duration of the video in seconds. 8 second videos cost twice as much as 5 second videos. (1080p does not support 8 second duration)"
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Let's YMCA!",
      "Subject 3 Fever",
      "Ghibli Live!",
      "Suit Swagger",
      "Muscle Surge",
      "360° Microwave",
      "Warmth of Jesus",
      "Emergency Beat",
      "Anything, Robot",
      "Kungfu Club",
      "Mint in Box",
      "Retro Anime Pop",
      "Vogue Walk",
      "Mega Dive",
      "Evil Trigger"
    ],
    description:
      "Special effect to apply to the video. Does not work with last_frame_image."
  })
  declare effect: any;

  @prop({
    type: "image",
    default: "",
    description: "Image to use for the first frame of the video"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Use to generate a video that transitions from the first image to the last image. Must be used with image."
  })
  declare last_frame_image: any;

  @prop({
    type: "enum",
    default: "normal",
    values: ["normal", "smooth"],
    description:
      "Motion mode for the video. Smooth videos generate more frames, so they cost twice as much. (smooth is only available when using a 5 second duration, 1080p does not support smooth motion)"
  })
  declare motion_mode: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to avoid certain elements in the video"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "540p",
    values: ["360p", "540p", "720p", "1080p"],
    description:
      "Resolution of the video. 360p and 540p cost the same, but 720p and 1080p cost more. See the README for details."
  })
  declare quality: any;

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
      "Sound effect prompt. If not given, a random sound effect will be generated."
  })
  declare sound_effect_content: any;

  @prop({
    type: "bool",
    default: false,
    description: "Enable background music or sound effects"
  })
  declare sound_effect_switch: any;

  @prop({
    type: "enum",
    default: "None",
    values: ["None", "anime", "3d_animation", "clay", "cyberpunk", "comic"],
    description: "Style of the video"
  })
  declare style: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const duration = String(this.duration ?? 5);
    const effect = String(this.effect ?? "None");
    const motionMode = String(this.motion_mode ?? "normal");
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const quality = String(this.quality ?? "540p");
    const seed = Number(this.seed ?? -1);
    const soundEffectContent = String(this.sound_effect_content ?? "");
    const soundEffectSwitch = Boolean(this.sound_effect_switch ?? false);
    const style = String(this.style ?? "None");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      duration: duration,
      effect: effect,
      motion_mode: motionMode,
      negative_prompt: negativePrompt,
      prompt: prompt,
      quality: quality,
      seed: seed,
      sound_effect_content: soundEffectContent,
      sound_effect_switch: soundEffectSwitch,
      style: style
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const lastFrameImageRef = this.last_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameImageRef)) {
      const lastFrameImageUrl = await assetToUrl(lastFrameImageRef!, apiKey);
      if (lastFrameImageUrl) args["last_frame_image"] = lastFrameImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "pixverse/pixverse-v4.5:5a31b090decb67bde4291ca5d2a69d7908720c0a1262a4b5d72022518a9b5a3c",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_5_T2V extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Wan_2_5_T2V";
  static readonly title = "Wan_2_5_ T2 V";
  static readonly description = `Alibaba Wan 2.5 text to video generation model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "Audio file (wav/mp3, 3-30s, ≤15MB) for voice/music synchronization"
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "10"],
    description: "Duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the prompt optimizer will be enabled"
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to avoid certain elements"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "1280*720",
    values: [
      "832*480",
      "480*832",
      "1280*720",
      "720*1280",
      "1920*1080",
      "1080*1920"
    ],
    description: "Video resolution and aspect ratio"
  })
  declare size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const duration = String(this.duration ?? 5);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const size = String(this.size ?? "1280*720");

    const args: Record<string, unknown> = {
      duration: duration,
      enable_prompt_expansion: enablePromptExpansion,
      negative_prompt: negativePrompt,
      prompt: prompt,
      seed: seed,
      size: size
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "wan-video/wan-2.5-t2v:4e22e64c604706aa4ac1929a7ae146ea033f39bb228e896da79d91b7a39e8d32",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_5_T2V_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Wan_2_5_T2V_Fast";
  static readonly title = "Wan_2_5_ T2 V_ Fast";
  static readonly description = `Wan 2.5 text-to-video, optimized for speed
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "Audio file (wav/mp3, 3-30s, ≤15MB) for voice/music synchronization"
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "10"],
    description: "Duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the prompt optimizer will be enabled"
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to avoid certain elements"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed for reproducible generation"
  })
  declare seed: any;

  @prop({
    type: "enum",
    default: "1280*720",
    values: ["1280*720", "720*1280", "1920*1080", "1080*1920"],
    description: "Video resolution and aspect ratio"
  })
  declare size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const duration = String(this.duration ?? 5);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const size = String(this.size ?? "1280*720");

    const args: Record<string, unknown> = {
      duration: duration,
      enable_prompt_expansion: enablePromptExpansion,
      negative_prompt: negativePrompt,
      prompt: prompt,
      seed: seed,
      size: size
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "wan-video/wan-2.5-t2v-fast:1ffaab95d8f67adf487548468b03e795ad0410089c655c560e492add1b7beaf0",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_5_I2V extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Wan_2_5_I2V";
  static readonly title = "Wan_2_5_ I2 V";
  static readonly description = `Alibaba Wan 2.5 Image to video generation with background audio
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "Audio file (wav/mp3, 3-30s, ≤15MB) for voice/music synchronization"
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "10"],
    description: "Duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the prompt optimizer will be enabled"
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for video generation"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to avoid certain elements"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p", "1080p"],
    description: "Video resolution"
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const duration = String(this.duration ?? 5);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      duration: duration,
      enable_prompt_expansion: enablePromptExpansion,
      negative_prompt: negativePrompt,
      prompt: prompt,
      resolution: resolution,
      seed: seed
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "wan-video/wan-2.5-i2v:1b29bbbbfdbc25bba2294de3acd2b58b82e5b623f183880cdb37d76133d80f00",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Wan_2_5_I2V_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Wan_2_5_I2V_Fast";
  static readonly title = "Wan_2_5_ I2 V_ Fast";
  static readonly description = `Wan 2.5 image-to-video, optimized for speed
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "Audio file (wav/mp3, 3-30s, ≤15MB) for voice/music synchronization"
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "10"],
    description: "Duration of the generated video in seconds"
  })
  declare duration: any;

  @prop({
    type: "bool",
    default: true,
    description: "If set to true, the prompt optimizer will be enabled"
  })
  declare enable_prompt_expansion: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for video generation"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Negative prompt to avoid certain elements"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["720p", "1080p"],
    description: "Video resolution"
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed for reproducible generation"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const duration = String(this.duration ?? 5);
    const enablePromptExpansion = Boolean(this.enable_prompt_expansion ?? true);
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      duration: duration,
      enable_prompt_expansion: enablePromptExpansion,
      negative_prompt: negativePrompt,
      prompt: prompt,
      resolution: resolution,
      seed: seed
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "wan-video/wan-2.5-i2v-fast:66226b38d223f8ac7a81aa33b8519759e300c2f9818a215e32900827ad6d2db5",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Seedance_1_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Seedance_1_Pro";
  static readonly title = "Seedance_1_ Pro";
  static readonly description = `A pro version of Seedance that offers text-to-video and image-to-video support for 5s or 10s videos, at 480p and 1080p resolution
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21"],
    description: "Video aspect ratio. Ignored if an image is used."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to fix camera position"
  })
  declare camera_fixed: any;

  @prop({ type: "int", default: 5, description: "Video duration in seconds" })
  declare duration: any;

  @prop({
    type: "enum",
    default: 24,
    values: ["24"],
    description: "Frame rate (frames per second)"
  })
  declare fps: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for image-to-video generation"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for last frame generation. This only works if an image start frame is given too."
  })
  declare last_frame_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["480p", "720p", "1080p"],
    description: "Video resolution"
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
    const cameraFixed = Boolean(this.camera_fixed ?? false);
    const duration = Number(this.duration ?? 5);
    const fps = String(this.fps ?? 24);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1080p");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      camera_fixed: cameraFixed,
      duration: duration,
      fps: fps,
      prompt: prompt,
      resolution: resolution,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const lastFrameImageRef = this.last_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameImageRef)) {
      const lastFrameImageUrl = await assetToUrl(lastFrameImageRef!, apiKey);
      if (lastFrameImageUrl) args["last_frame_image"] = lastFrameImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bytedance/seedance-1-pro:a5fd550893da3b6f67997812759065652454ddaca10e96b83b59cbae1814cb36",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Seedance_1_Lite extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Seedance_1_Lite";
  static readonly title = "Seedance_1_ Lite";
  static readonly description = `A video generation model that offers text-to-video and image-to-video support for 5s or 10s videos, at 480p and 720p resolution
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21"],
    description: "Video aspect ratio. Ignored if an image is used."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to fix camera position"
  })
  declare camera_fixed: any;

  @prop({ type: "int", default: 5, description: "Video duration in seconds" })
  declare duration: any;

  @prop({
    type: "enum",
    default: 24,
    values: ["24"],
    description: "Frame rate (frames per second)"
  })
  declare fps: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for image-to-video generation"
  })
  declare image: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image for last frame generation. This only works if an image start frame is given too."
  })
  declare last_frame_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Reference images (1-4 images) to guide video generation for characters, avatars, clothing, environments, or multi-character interactions. Reference images cannot be used with 1080p resolution or first frame or last frame images."
  })
  declare reference_images: any;

  @prop({
    type: "enum",
    default: "720p",
    values: ["480p", "720p", "1080p"],
    description: "Video resolution"
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
    const cameraFixed = Boolean(this.camera_fixed ?? false);
    const duration = Number(this.duration ?? 5);
    const fps = String(this.fps ?? 24);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "720p");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      camera_fixed: cameraFixed,
      duration: duration,
      fps: fps,
      prompt: prompt,
      resolution: resolution,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const lastFrameImageRef = this.last_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(lastFrameImageRef)) {
      const lastFrameImageUrl = await assetToUrl(lastFrameImageRef!, apiKey);
      if (lastFrameImageUrl) args["last_frame_image"] = lastFrameImageUrl;
    }

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
      "bytedance/seedance-1-lite:78c9c4b0a7056c911b0483f58349b9931aff30d6465e7ab665e6c852949ce6d5",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Seedance_1_Pro_Fast extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Seedance_1_Pro_Fast";
  static readonly title = "Seedance_1_ Pro_ Fast";
  static readonly description = `A faster and cheaper version of Seedance 1 Pro
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21"],
    description: "Video aspect ratio. Ignored if an image is used."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to fix camera position"
  })
  declare camera_fixed: any;

  @prop({ type: "int", default: 5, description: "Video duration in seconds" })
  declare duration: any;

  @prop({
    type: "enum",
    default: 24,
    values: ["24"],
    description: "Frame rate (frames per second)"
  })
  declare fps: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for image-to-video generation"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["480p", "720p", "1080p"],
    description: "Video resolution"
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
    const cameraFixed = Boolean(this.camera_fixed ?? false);
    const duration = Number(this.duration ?? 5);
    const fps = String(this.fps ?? 24);
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "1080p");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      camera_fixed: cameraFixed,
      duration: duration,
      fps: fps,
      prompt: prompt,
      resolution: resolution,
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
      "bytedance/seedance-1-pro-fast:155d6d446da5e7cd4a2ef72725461ba8687bdf63a2a1fb7bb574f25af24dc7b5",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Ray_2_540p extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Ray_2_540p";
  static readonly title = "Ray_2_540p";
  static readonly description = `Generate 5s and 9s 540p videos
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"],
    description: "Aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "List of camera concepts to apply to the video generation. Concepts include: truck_left, pan_right, pedestal_down, low_angle, pedestal_up, selfie, pan_left, roll_right, zoom_in, over_the_shoulder, orbit_right, orbit_left, static, tiny_planet, high_angle, bolt_cam, dolly_zoom, overhead, zoom_out, handheld, roll_left, pov, aerial_drone, push_in, crane_down, truck_right, tilt_down, elevator_doors, tilt_up, ground_level, pull_out, aerial, crane_up, eye_level"
  })
  declare concepts: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "9"],
    description: "Duration of the video in seconds"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional last frame of the video to use as the ending frame."
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Deprecated: Use end_image instead"
  })
  declare end_image_url: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether the video should loop, with the last frame matching the first frame for smooth, continuous playback."
  })
  declare loop: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional first frame of the video to use as the starting frame."
  })
  declare start_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Deprecated: Use start_image instead"
  })
  declare start_image_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const concepts = String(this.concepts ?? []);
    const duration = String(this.duration ?? 5);
    const endImageUrl = String(this.end_image_url ?? "");
    const loop = Boolean(this.loop ?? false);
    const prompt = String(this.prompt ?? "");
    const startImageUrl = String(this.start_image_url ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      concepts: concepts,
      duration: duration,
      end_image_url: endImageUrl,
      loop: loop,
      prompt: prompt,
      start_image_url: startImageUrl
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl = await assetToUrl(endImageRef!, apiKey);
      if (endImageUrl) args["end_image"] = endImageUrl;
    }

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl = await assetToUrl(startImageRef!, apiKey);
      if (startImageUrl) args["start_image"] = startImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "luma/ray-2-540p:838565ddabd524ed2b1ab8011d811956b954b8f3716c7a15853fd326e826b6c7",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Ray_2_720p extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Ray_2_720p";
  static readonly title = "Ray_2_720p";
  static readonly description = `Generate 5s and 9s 720p videos
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"],
    description: "Aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "List of camera concepts to apply to the video generation. Concepts include: truck_left, pan_right, pedestal_down, low_angle, pedestal_up, selfie, pan_left, roll_right, zoom_in, over_the_shoulder, orbit_right, orbit_left, static, tiny_planet, high_angle, bolt_cam, dolly_zoom, overhead, zoom_out, handheld, roll_left, pov, aerial_drone, push_in, crane_down, truck_right, tilt_down, elevator_doors, tilt_up, ground_level, pull_out, aerial, crane_up, eye_level"
  })
  declare concepts: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "9"],
    description: "Duration of the video in seconds"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional last frame of the video to use as the ending frame."
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Deprecated: Use end_image instead"
  })
  declare end_image_url: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether the video should loop, with the last frame matching the first frame for smooth, continuous playback."
  })
  declare loop: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional first frame of the video to use as the starting frame."
  })
  declare start_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Deprecated: Use start_image instead"
  })
  declare start_image_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const concepts = String(this.concepts ?? []);
    const duration = String(this.duration ?? 5);
    const endImageUrl = String(this.end_image_url ?? "");
    const loop = Boolean(this.loop ?? false);
    const prompt = String(this.prompt ?? "");
    const startImageUrl = String(this.start_image_url ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      concepts: concepts,
      duration: duration,
      end_image_url: endImageUrl,
      loop: loop,
      prompt: prompt,
      start_image_url: startImageUrl
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl = await assetToUrl(endImageRef!, apiKey);
      if (endImageUrl) args["end_image"] = endImageUrl;
    }

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl = await assetToUrl(startImageRef!, apiKey);
      if (startImageUrl) args["start_image"] = startImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "luma/ray-2-720p:3ca2bc3597e124149bcae1f9c239790a58ba0f1aa72e1c8747192d2b44284dc4",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Ray_Flash_2_720p extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Ray_Flash_2_720p";
  static readonly title = "Ray_ Flash_2_720p";
  static readonly description = `Generate 5s and 9s 720p videos, faster and cheaper than Ray 2
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"],
    description: "Aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "List of camera concepts to apply to the video generation. Concepts include: truck_left, pan_right, pedestal_down, low_angle, pedestal_up, selfie, pan_left, roll_right, zoom_in, over_the_shoulder, orbit_right, orbit_left, static, tiny_planet, high_angle, bolt_cam, dolly_zoom, overhead, zoom_out, handheld, roll_left, pov, aerial_drone, push_in, crane_down, truck_right, tilt_down, elevator_doors, tilt_up, ground_level, pull_out, aerial, crane_up, eye_level"
  })
  declare concepts: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "9"],
    description: "Duration of the video in seconds"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional last frame of the video to use as the ending frame."
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Deprecated: Use end_image instead"
  })
  declare end_image_url: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether the video should loop, with the last frame matching the first frame for smooth, continuous playback."
  })
  declare loop: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional first frame of the video to use as the starting frame."
  })
  declare start_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Deprecated: Use start_image instead"
  })
  declare start_image_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const concepts = String(this.concepts ?? []);
    const duration = String(this.duration ?? 5);
    const endImageUrl = String(this.end_image_url ?? "");
    const loop = Boolean(this.loop ?? false);
    const prompt = String(this.prompt ?? "");
    const startImageUrl = String(this.start_image_url ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      concepts: concepts,
      duration: duration,
      end_image_url: endImageUrl,
      loop: loop,
      prompt: prompt,
      start_image_url: startImageUrl
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl = await assetToUrl(endImageRef!, apiKey);
      if (endImageUrl) args["end_image"] = endImageUrl;
    }

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl = await assetToUrl(startImageRef!, apiKey);
      if (startImageUrl) args["start_image"] = startImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "luma/ray-flash-2-720p:4de59b4688ad158409be13c0c0c37ddfcf21824b2acf326505b03bcf679acab5",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Ray_Flash_2_540p extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Ray_Flash_2_540p";
  static readonly title = "Ray_ Flash_2_540p";
  static readonly description = `Generate 5s and 9s 540p videos, faster and cheaper than Ray 2
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "16:9",
    values: ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"],
    description: "Aspect ratio of the generated video"
  })
  declare aspect_ratio: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "List of camera concepts to apply to the video generation. Concepts include: truck_left, pan_right, pedestal_down, low_angle, pedestal_up, selfie, pan_left, roll_right, zoom_in, over_the_shoulder, orbit_right, orbit_left, static, tiny_planet, high_angle, bolt_cam, dolly_zoom, overhead, zoom_out, handheld, roll_left, pov, aerial_drone, push_in, crane_down, truck_right, tilt_down, elevator_doors, tilt_up, ground_level, pull_out, aerial, crane_up, eye_level"
  })
  declare concepts: any;

  @prop({
    type: "enum",
    default: 5,
    values: ["5", "9"],
    description: "Duration of the video in seconds"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional last frame of the video to use as the ending frame."
  })
  declare end_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Deprecated: Use end_image instead"
  })
  declare end_image_url: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether the video should loop, with the last frame matching the first frame for smooth, continuous playback."
  })
  declare loop: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for video generation"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional first frame of the video to use as the starting frame."
  })
  declare start_image: any;

  @prop({
    type: "str",
    default: "",
    description: "Deprecated: Use start_image instead"
  })
  declare start_image_url: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const concepts = String(this.concepts ?? []);
    const duration = String(this.duration ?? 5);
    const endImageUrl = String(this.end_image_url ?? "");
    const loop = Boolean(this.loop ?? false);
    const prompt = String(this.prompt ?? "");
    const startImageUrl = String(this.start_image_url ?? "");

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      concepts: concepts,
      duration: duration,
      end_image_url: endImageUrl,
      loop: loop,
      prompt: prompt,
      start_image_url: startImageUrl
    };

    const endImageRef = this.end_image as Record<string, unknown> | undefined;
    if (isRefSet(endImageRef)) {
      const endImageUrl = await assetToUrl(endImageRef!, apiKey);
      if (endImageUrl) args["end_image"] = endImageUrl;
    }

    const startImageRef = this.start_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(startImageRef)) {
      const startImageUrl = await assetToUrl(startImageRef!, apiKey);
      if (startImageUrl) args["start_image"] = startImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "luma/ray-flash-2-540p:ab7a8dbfe56fe6712c7a64f684930372677a31a3470d260f4786928395c1c5cc",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Sora_2 extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Sora_2";
  static readonly title = "Sora_2";
  static readonly description = `OpenAI's Flagship video generation with synced audio
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "portrait",
    values: ["portrait", "landscape"],
    description:
      "Aspect ratio of the video. Portrait is 720x1280, landscape is 1280x720"
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional image to use as the first frame of the video. The image must be the same aspect ratio as the video."
  })
  declare input_reference: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional: Your OpenAI API key. If you use your own OpenAI API key, you will be charged directly by OpenAI."
  })
  declare openai_api_key: any;

  @prop({
    type: "str",
    default: "",
    description: "A text description of the video to generate"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: 4,
    values: ["4", "8", "12"],
    description: "Duration of the video in seconds"
  })
  declare seconds: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "portrait");
    const openaiApiKey = String(this.openai_api_key ?? "");
    const prompt = String(this.prompt ?? "");
    const seconds = String(this.seconds ?? 4);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      openai_api_key: openaiApiKey,
      prompt: prompt,
      seconds: seconds
    };

    const inputReferenceRef = this.input_reference as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputReferenceRef)) {
      const inputReferenceUrl = await assetToUrl(inputReferenceRef!, apiKey);
      if (inputReferenceUrl) args["input_reference"] = inputReferenceUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/sora-2:763a9321f615f4867b1d7a2d53666200da21f71da358b12c9b25e0127edae014",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Sora_2_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Sora_2_Pro";
  static readonly title = "Sora_2_ Pro";
  static readonly description = `OpenAI's Most advanced synced-audio video generation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "enum",
    default: "portrait",
    values: ["portrait", "landscape"],
    description:
      "Aspect ratio of the video. Portrait is 720x1280, landscape is 1280x720"
  })
  declare aspect_ratio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "An optional image to use as the first frame of the video. The image must be the same aspect ratio as the video."
  })
  declare input_reference: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional: Your OpenAI API key. If you use your own OpenAI API key, you will be charged directly by OpenAI."
  })
  declare openai_api_key: any;

  @prop({
    type: "str",
    default: "",
    description: "A text description of the video to generate"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "standard",
    values: ["standard", "high"],
    description: "Resolution quality. Standard is 720p, high is 1024p"
  })
  declare resolution: any;

  @prop({
    type: "enum",
    default: 4,
    values: ["4", "8", "12"],
    description: "Duration of the video in seconds"
  })
  declare seconds: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const aspectRatio = String(this.aspect_ratio ?? "portrait");
    const openaiApiKey = String(this.openai_api_key ?? "");
    const prompt = String(this.prompt ?? "");
    const resolution = String(this.resolution ?? "standard");
    const seconds = String(this.seconds ?? 4);

    const args: Record<string, unknown> = {
      aspect_ratio: aspectRatio,
      openai_api_key: openaiApiKey,
      prompt: prompt,
      resolution: resolution,
      seconds: seconds
    };

    const inputReferenceRef = this.input_reference as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputReferenceRef)) {
      const inputReferenceUrl = await assetToUrl(inputReferenceRef!, apiKey);
      if (inputReferenceUrl) args["input_reference"] = inputReferenceUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/sora-2-pro:ccf1a58e3ec72e86d01ab19ef240009409f26a9a0470cc246a1728e54b0a6b8f",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Video_01_Director extends ReplicateNode {
  static readonly nodeType = "replicate.video.generate.Video_01_Director";
  static readonly title = "Video_01_ Director";
  static readonly description = `Generate videos with specific camera movements
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "First frame image for video generation. The output video will have the same aspect ratio as this image."
  })
  declare first_frame_image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for video generation. Camera movement instructions can be added using square brackets (e.g. [Pan left] or [Zoom in]). You can use up to 3 combined movements per prompt. Supported movements: Truck left/right, Pan left/right, Push in/Pull out, Pedestal up/down, Tilt up/down, Zoom in/out, Shake, Tracking shot, Static shot. For example: [Truck left, Pan right, Zoom in]"
  })
  declare prompt: any;

  @prop({ type: "bool", default: true, description: "Use prompt optimizer" })
  declare prompt_optimizer: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const promptOptimizer = Boolean(this.prompt_optimizer ?? true);

    const args: Record<string, unknown> = {
      prompt: prompt,
      prompt_optimizer: promptOptimizer
    };

    const firstFrameImageRef = this.first_frame_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstFrameImageRef)) {
      const firstFrameImageUrl = await assetToUrl(firstFrameImageRef!, apiKey);
      if (firstFrameImageUrl) args["first_frame_image"] = firstFrameImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/video-01-director:377cde553c72d2a8a034a2824a43b63b9472247d670dbb14d8c917abb2d39b64",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export const REPLICATE_VIDEO_GENERATE_NODES: readonly NodeClass[] = [
  HotshotXL,
  Zeroscope_V2_XL,
  RobustVideoMatting,
  AudioToWaveform,
  Hunyuan_Video,
  Video_01_Live,
  Video_01,
  Music_01,
  LTX_Video,
  Wan_2_1_I2V_480p,
  Wan_2_1_1_3B,
  Pixverse_V5,
  Gen4_Turbo,
  Gen4_Aleph,
  Kling_V2_1,
  Kling_Lip_Sync,
  Hailuo_02,
  Lipsync_2,
  Lipsync_2_Pro,
  Wan_2_2_T2V_Fast,
  Wan_2_2_I2V_Fast,
  Veo_3_1,
  Gen4_5,
  Kling_V3_Video,
  Kling_V3_Omni_Video,
  Kling_V2_5_Turbo_Pro,
  Kling_V2_6,
  Veo_3,
  Veo_3_Fast,
  Veo_2,
  Hailuo_2_3,
  Hailuo_2_3_Fast,
  Pixverse_V5_6,
  Pixverse_V4,
  Pixverse_V4_5,
  Wan_2_5_T2V,
  Wan_2_5_T2V_Fast,
  Wan_2_5_I2V,
  Wan_2_5_I2V_Fast,
  Seedance_1_Pro,
  Seedance_1_Lite,
  Seedance_1_Pro_Fast,
  Ray_2_540p,
  Ray_2_720p,
  Ray_Flash_2_720p,
  Ray_Flash_2_540p,
  Sora_2,
  Sora_2_Pro,
  Video_01_Director
] as const;
