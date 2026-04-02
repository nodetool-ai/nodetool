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

export class LatentSync extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.LatentSync";
  static readonly title = "Latent Sync";
  static readonly description = `LatentSync: generate high-quality lip sync animations
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "audio", default: "", description: "Input audio to " })
  declare audio: any;

  @prop({ type: "float", default: 1, description: "Guidance scale" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 0, description: "Set to 0 for Random seed" })
  declare seed: any;

  @prop({ type: "video", default: "", description: "Input video" })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const guidanceScale = Number(this.guidance_scale ?? 1);
    const seed = Number(this.seed ?? 0);

    const args: Record<string, unknown> = {
      guidance_scale: guidanceScale,
      seed: seed
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
      "bytedance/latentsync:637ce1919f807ca20da3a448ddc2743535d2853649574cd52a933120e9b9e293",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class OmniHuman extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.OmniHuman";
  static readonly title = "Omni Human";
  static readonly description = `Turns your audio/video/images into professional-quality animated videos
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "Input audio file (MP3, WAV, etc.). For the best quality outputs audio should be no longer than 15 seconds. After 15 seconds the video quality will begin to degrade. If you have a lot of audio you want to process, we recommend splitting it into 15 second chunks."
  })
  declare audio: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image containing a human subject, face or character."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

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
      "bytedance/omni-human:566f1b03016969ac39e242c1ae4a39034686ca8850fc3dba83dceaceb96f74b2",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class DreamActor_M2 extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.DreamActor_M2";
  static readonly title = "Dream Actor_ M2";
  static readonly description = `Animate any character, humans, cartoons, animals, even non-humans, from a single image + driving video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to crop the first second of the output video (removes the 1-second transition at the beginning)."
  })
  declare cut_first_second: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input image containing a human subject. Supported formats: JPEG, JPG, PNG. Max size: 4.7 MB. Resolution: 480x480 to 1920x1080."
  })
  declare image: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Template video whose motion, facial expressions, and lip movements will be applied to the image subject. Supported formats: MP4, MOV, WebM. Max duration: 30 seconds. Resolution: 200x200 to 2048x1440."
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cutFirstSecond = Boolean(this.cut_first_second ?? true);

    const args: Record<string, unknown> = {
      cut_first_second: cutFirstSecond
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "bytedance/dreamactor-m2.0:b23bf8e6d5f31dd67ad219fac057fd43d3ac38fc58343025ab557be74a9450ca",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class SadTalker extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.SadTalker";
  static readonly title = "Sad Talker";
  static readonly description = `Stylized Audio-Driven Single Image Talking Face Animation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description: "Upload the driven audio, accepts .wav and .mp4 file"
  })
  declare driven_audio: any;

  @prop({
    type: "float",
    default: 1,
    description: " a larger value will make the expression motion stronger"
  })
  declare expression_scale: any;

  @prop({
    type: "enum",
    default: "facevid2vid",
    values: ["facevid2vid", "pirender"],
    description: "Choose face render"
  })
  declare facerender: any;

  @prop({ type: "int", default: 0, description: "Pose style" })
  declare pose_style: any;

  @prop({
    type: "enum",
    default: "crop",
    values: ["crop", "resize", "full", "extcrop", "extfull"],
    description: "Choose how to preprocess the images"
  })
  declare preprocess: any;

  @prop({
    type: "enum",
    default: 256,
    values: ["256", "512"],
    description: "Face model resolution"
  })
  declare size_of_image: any;

  @prop({
    type: "image",
    default: "",
    description: "Upload the source image, it can be video.mp4 or picture.png"
  })
  declare source_image: any;

  @prop({
    type: "bool",
    default: true,
    description: "Still Mode (fewer head motion, works with preprocess 'full')"
  })
  declare still_mode: any;

  @prop({
    type: "bool",
    default: false,
    description: "Use GFPGAN as Face enhancer"
  })
  declare use_enhancer: any;

  @prop({ type: "bool", default: true, description: "Use eye blink" })
  declare use_eyeblink: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const expressionScale = Number(this.expression_scale ?? 1);
    const facerender = String(this.facerender ?? "facevid2vid");
    const poseStyle = Number(this.pose_style ?? 0);
    const preprocess = String(this.preprocess ?? "crop");
    const sizeOfImage = String(this.size_of_image ?? 256);
    const stillMode = Boolean(this.still_mode ?? true);
    const useEnhancer = Boolean(this.use_enhancer ?? false);
    const useEyeblink = Boolean(this.use_eyeblink ?? true);

    const args: Record<string, unknown> = {
      expression_scale: expressionScale,
      facerender: facerender,
      pose_style: poseStyle,
      preprocess: preprocess,
      size_of_image: sizeOfImage,
      still_mode: stillMode,
      use_enhancer: useEnhancer,
      use_eyeblink: useEyeblink
    };

    const drivenAudioRef = this.driven_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(drivenAudioRef)) {
      const drivenAudioUrl = await assetToUrl(drivenAudioRef!, apiKey);
      if (drivenAudioUrl) args["driven_audio"] = drivenAudioUrl;
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
      "cjwbw/sadtalker:a519cc0cfebaaeade068b23899165a11ec76aaa1d2b313d40d214f204ec957a3",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class AniPortrait extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.AniPortrait";
  static readonly title = "Ani Portrait";
  static readonly description = `Audio-Driven Synthesis of Photorealistic Portrait Animations
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "audio", default: "", description: "Input audio" })
  declare audio: any;

  @prop({
    type: "int",
    default: 30,
    description: "Frame per second in the output video"
  })
  declare fps: any;

  @prop({
    type: "float",
    default: 3.5,
    description: "Scale for classifier-free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "int", default: 512, description: "Height of output video" })
  declare height: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({ type: "int", default: 25, description: "Inference steps" })
  declare steps: any;

  @prop({ type: "int", default: 512, description: "Width of output video" })
  declare width: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const fps = Number(this.fps ?? 30);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const height = Number(this.height ?? 512);
    const seed = Number(this.seed ?? -1);
    const steps = Number(this.steps ?? 25);
    const width = Number(this.width ?? 512);

    const args: Record<string, unknown> = {
      fps: fps,
      guidance_scale: guidanceScale,
      height: height,
      seed: seed,
      steps: steps,
      width: width
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
      "cjwbw/aniportrait-audio2vid:3f976d8f2308f5c676a484e873f7d1ac09763f789fa211894df1ed96d3d17cb2",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class VideoRetalking extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.VideoRetalking";
  static readonly title = "Video Retalking";
  static readonly description = `Audio-based Lip Synchronization for Talking Head Video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "image",
    default: "",
    description: "Input video file of a talking-head."
  })
  declare face: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "Input audio file. Avoid special symbol in the filename as it may cause ffmpeg erros."
  })
  declare input_audio: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const faceRef = this.face as Record<string, unknown> | undefined;
    if (isRefSet(faceRef)) {
      const faceUrl = await assetToUrl(faceRef!, apiKey);
      if (faceUrl) args["face"] = faceUrl;
    }

    const inputAudioRef = this.input_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputAudioRef)) {
      const inputAudioUrl = await assetToUrl(inputAudioRef!, apiKey);
      if (inputAudioUrl) args["input_audio"] = inputAudioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "chenxwh/video-retalking:db5a650c807b007dc5f9e5abe27c53e1b62880d1f94d218d27ce7fa802711d67",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Pixverse_Lipsync_V2 extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.Pixverse_Lipsync_V2";
  static readonly title = "Pixverse_ Lipsync_ V2";
  static readonly description = `Generate realistic lipsync animations from audio for high-quality synchronization
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description: "Audio file to upload to PixVerse as media"
  })
  declare audio: any;

  @prop({
    type: "video",
    default: "",
    description: "Video file to upload to PixVerse as media"
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

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
      "pixverse/lipsync:3ca6d73f4fb9e1d77a4b6e14f8998ee18926e4dc462838e31fa2bb5e662c1e2c",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class MultiTalk extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.MultiTalk";
  static readonly title = "Multi Talk";
  static readonly description = `Audio-driven multi-person conversational video generation - Upload audio files and a reference image to create realistic conversations between multiple people
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description: "First audio file for driving the conversation"
  })
  declare first_audio: any;

  @prop({
    type: "image",
    default: "",
    description: "Reference image containing the person(s) for video generation"
  })
  declare image: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "Number of frames to generate (automatically adjusted to nearest valid value of form 4n+1, e.g., 81, 181)"
  })
  declare num_frames: any;

  @prop({
    type: "str",
    default:
      "A smiling man and woman wearing headphones sit in front of microphones, appearing to host a podcast.",
    description:
      "Text prompt describing the desired interaction or conversation scenario"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 40,
    description:
      "Number of sampling steps (higher = better quality, lower = faster)"
  })
  declare sampling_steps: any;

  @prop({
    type: "audio",
    default: "",
    description: "Second audio file for multi-person conversation (optional)"
  })
  declare second_audio: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed for reproducible results"
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Enable turbo mode optimizations (adjusts thresholds and guidance scales for speed)"
  })
  declare turbo: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const numFrames = Number(this.num_frames ?? 81);
    const prompt = String(
      this.prompt ??
        "A smiling man and woman wearing headphones sit in front of microphones, appearing to host a podcast."
    );
    const samplingSteps = Number(this.sampling_steps ?? 40);
    const seed = Number(this.seed ?? -1);
    const turbo = Boolean(this.turbo ?? true);

    const args: Record<string, unknown> = {
      num_frames: numFrames,
      prompt: prompt,
      sampling_steps: samplingSteps,
      seed: seed,
      turbo: turbo
    };

    const firstAudioRef = this.first_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(firstAudioRef)) {
      const firstAudioUrl = await assetToUrl(firstAudioRef!, apiKey);
      if (firstAudioUrl) args["first_audio"] = firstAudioUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }

    const secondAudioRef = this.second_audio as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(secondAudioRef)) {
      const secondAudioUrl = await assetToUrl(secondAudioRef!, apiKey);
      if (secondAudioUrl) args["second_audio"] = secondAudioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/multitalk:0bd2390c40618c910ffc345b36c8fd218fd8fa59c9124aa641fea443fa203b44",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class Kling_Avatar_V2 extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.Kling_Avatar_V2";
  static readonly title = "Kling_ Avatar_ V2";
  static readonly description = `Create avatar videos with realistic humans, animals, cartoons, or stylized characters
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "audio",
    default: "",
    description: "Audio file for avatar. Supports .mp3/.wav/.m4a/.aac, max 5MB."
  })
  declare audio: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Avatar reference image. Supports .jpg/.jpeg/.png, max 10MB, dimensions >= 300px, aspect ratio 1:2.5 to 2.5:1."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "std",
    values: ["std", "pro"],
    description: "Video generation mode."
  })
  declare mode: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Positive text prompt to define avatar actions, emotions, and camera movements."
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const mode = String(this.mode ?? "std");
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      mode: mode,
      prompt: prompt
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
      "kwaivgi/kling-avatar-v2:af77ed5d1753d98aaabbbfd7d0147bf073c1b7c25a0bb739b82da94ac2716a12",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class FaceFusion extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.FaceFusion";
  static readonly title = "Face Fusion";
  static readonly description = `Auto fuse a user's face onto the template image, with a similar appearance to the user
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "image", default: "", description: "Input body image" })
  declare template_image: any;

  @prop({ type: "image", default: "", description: "Input face image" })
  declare user_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const templateImageRef = this.template_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(templateImageRef)) {
      const templateImageUrl = await assetToUrl(templateImageRef!, apiKey);
      if (templateImageUrl) args["template_image"] = templateImageUrl;
    }

    const userImageRef = this.user_image as Record<string, unknown> | undefined;
    if (isRefSet(userImageRef)) {
      const userImageUrl = await assetToUrl(userImageRef!, apiKey);
      if (userImageUrl) args["user_image"] = userImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/modelscope-facefusion:52edbb2b42beb4e19242f0c9ad5717211a96c63ff1f0b0320caa518b2745f4f7",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export class FaceSwap extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.FaceSwap";
  static readonly title = "Face Swap";
  static readonly description = `Advance Face Swap powered by pixalto.app
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "image", default: "", description: "Target image" })
  declare input_image: any;

  @prop({ type: "image", default: "", description: "Swap image" })
  declare swap_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const inputImageRef = this.input_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await assetToUrl(inputImageRef!, apiKey);
      if (inputImageUrl) args["input_image"] = inputImageUrl;
    }

    const swapImageRef = this.swap_image as Record<string, unknown> | undefined;
    if (isRefSet(swapImageRef)) {
      const swapImageUrl = await assetToUrl(swapImageRef!, apiKey);
      if (swapImageUrl) args["swap_image"] = swapImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "codeplugtech/face-swap:278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class AdvancedFaceSwap extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.AdvancedFaceSwap";
  static readonly title = "Advanced Face Swap";
  static readonly description = `Face swap one or two people into a target image
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "(Beta) Apply detailer to the image. Detailer will improve certain image details, but slightly increase generation time."
  })
  declare detailer: any;

  @prop({
    type: "enum",
    default: "user",
    values: ["user", "target"],
    description:
      "Choose whose hairstyle to preserve: 'user' preserves hairstyle from face image, 'target' preserves from target image"
  })
  declare hair_source: any;

  @prop({
    type: "image",
    default: "",
    description: "The face image to swap from"
  })
  declare swap_image: any;

  @prop({
    type: "image",
    default: "",
    description: "Optional second face image to swap from"
  })
  declare swap_image_b: any;

  @prop({ type: "image", default: "", description: "The image to swap onto" })
  declare target_image: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Apply 2x upscale and boost quality. Upscaling will refine the image and make the subjects brighter. Default value: true"
  })
  declare upscale: any;

  @prop({
    type: "enum",
    default: "a woman",
    values: ["a man", "a woman"],
    description:
      "Optional description of second user's gender for multi-user swaps"
  })
  declare user_b_gender: any;

  @prop({
    type: "enum",
    default: "a woman",
    values: ["a man", "a woman"],
    description:
      "Optional description of user gender ('a man', 'a woman'), used for multi-user swaps"
  })
  declare user_gender: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const detailer = Boolean(this.detailer ?? false);
    const hairSource = String(this.hair_source ?? "user");
    const upscale = Boolean(this.upscale ?? true);
    const userBGender = String(this.user_b_gender ?? "a woman");
    const userGender = String(this.user_gender ?? "a woman");

    const args: Record<string, unknown> = {
      detailer: detailer,
      hair_source: hairSource,
      upscale: upscale,
      user_b_gender: userBGender,
      user_gender: userGender
    };

    const swapImageRef = this.swap_image as Record<string, unknown> | undefined;
    if (isRefSet(swapImageRef)) {
      const swapImageUrl = await assetToUrl(swapImageRef!, apiKey);
      if (swapImageUrl) args["swap_image"] = swapImageUrl;
    }

    const swapImageBRef = this.swap_image_b as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(swapImageBRef)) {
      const swapImageBUrl = await assetToUrl(swapImageBRef!, apiKey);
      if (swapImageBUrl) args["swap_image_b"] = swapImageBUrl;
    }

    const targetImageRef = this.target_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(targetImageRef)) {
      const targetImageUrl = await assetToUrl(targetImageRef!, apiKey);
      if (targetImageUrl) args["target_image"] = targetImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "easel/advanced-face-swap:602d8c526aca9e5081f0515649ff8998e058cf7e6b9ff32717d25327f18c5145",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export class FlashFace extends ReplicateNode {
  static readonly nodeType = "replicate.video.face.FlashFace";
  static readonly title = "Flash Face";
  static readonly description = `FlashFace: Human Image Personalization with High-fidelity Identity Preservation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "str",
    default:
      "blurry, ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, extra limbs, disfigured, deformed, body out of frame, bad anatomy, watermark, signature, cut off, low contrast, underexposed, overexposed, bad art, beginner, amateur, distorted face",
    description: "Default negative prompt postfix"
  })
  declare default_negative_prompt: any;

  @prop({
    type: "str",
    default: "best quality, masterpiece,ultra-detailed, UHD 4K, photographic",
    description: "Default positive prompt postfix"
  })
  declare default_position_prompt: any;

  @prop({
    type: "str",
    default: "[0., 0., 0., 0.]",
    description: "Face position"
  })
  declare face_bounding_box: any;

  @prop({
    type: "float",
    default: 2.2,
    description: "Reference guidance strength"
  })
  declare face_guidance: any;

  @prop({
    type: "float",
    default: 0.9,
    description: "Reference feature strength"
  })
  declare lamda_feature: any;

  @prop({ type: "str", default: "nsfw", description: "Negative prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 1, description: "Number of generated images" })
  declare num_sample: any;

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
      "Quality of the output images, from 0 to 100. 100 is best quality, 1 is lowest quality."
  })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Positive prompt" })
  declare positive_prompt: any;

  @prop({ type: "image", default: "", description: "Reference face image 1" })
  declare reference_face_1: any;

  @prop({ type: "image", default: "", description: "Reference face image 2" })
  declare reference_face_2: any;

  @prop({ type: "image", default: "", description: "Reference face image 3" })
  declare reference_face_3: any;

  @prop({ type: "image", default: "", description: "Reference face image 4" })
  declare reference_face_4: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 600,
    description: "Step index to launch reference guidance"
  })
  declare step_to_launch_face_guidance: any;

  @prop({ type: "int", default: 35, description: "Number of steps" })
  declare steps: any;

  @prop({ type: "float", default: 7.5, description: "Text guidance strength" })
  declare text_control_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const defaultNegativePrompt = String(
      this.default_negative_prompt ??
        "blurry, ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, extra limbs, disfigured, deformed, body out of frame, bad anatomy, watermark, signature, cut off, low contrast, underexposed, overexposed, bad art, beginner, amateur, distorted face"
    );
    const defaultPositionPrompt = String(
      this.default_position_prompt ??
        "best quality, masterpiece,ultra-detailed, UHD 4K, photographic"
    );
    const faceBoundingBox = String(
      this.face_bounding_box ?? "[0., 0., 0., 0.]"
    );
    const faceGuidance = Number(this.face_guidance ?? 2.2);
    const lamdaFeature = Number(this.lamda_feature ?? 0.9);
    const negativePrompt = String(this.negative_prompt ?? "nsfw");
    const numSample = Number(this.num_sample ?? 1);
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 80);
    const positivePrompt = String(this.positive_prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const stepToLaunchFaceGuidance = Number(
      this.step_to_launch_face_guidance ?? 600
    );
    const steps = Number(this.steps ?? 35);
    const textControlScale = Number(this.text_control_scale ?? 7.5);

    const args: Record<string, unknown> = {
      default_negative_prompt: defaultNegativePrompt,
      default_position_prompt: defaultPositionPrompt,
      face_bounding_box: faceBoundingBox,
      face_guidance: faceGuidance,
      lamda_feature: lamdaFeature,
      negative_prompt: negativePrompt,
      num_sample: numSample,
      output_format: outputFormat,
      output_quality: outputQuality,
      positive_prompt: positivePrompt,
      seed: seed,
      step_to_launch_face_guidance: stepToLaunchFaceGuidance,
      steps: steps,
      text_control_scale: textControlScale
    };

    const referenceFace_1Ref = this.reference_face_1 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceFace_1Ref)) {
      const referenceFace_1Url = await assetToUrl(referenceFace_1Ref!, apiKey);
      if (referenceFace_1Url) args["reference_face_1"] = referenceFace_1Url;
    }

    const referenceFace_2Ref = this.reference_face_2 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceFace_2Ref)) {
      const referenceFace_2Url = await assetToUrl(referenceFace_2Ref!, apiKey);
      if (referenceFace_2Url) args["reference_face_2"] = referenceFace_2Url;
    }

    const referenceFace_3Ref = this.reference_face_3 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceFace_3Ref)) {
      const referenceFace_3Url = await assetToUrl(referenceFace_3Ref!, apiKey);
      if (referenceFace_3Url) args["reference_face_3"] = referenceFace_3Url;
    }

    const referenceFace_4Ref = this.reference_face_4 as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(referenceFace_4Ref)) {
      const referenceFace_4Url = await assetToUrl(referenceFace_4Ref!, apiKey);
      if (referenceFace_4Url) args["reference_face_4"] = referenceFace_4Url;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/flash-face:edb17f54faec253ee86e58e0b5f18f24a89c4e31fe7fcefa970e13d8ad934117",
      args
    );
    return { output: outputToImageRef(res.output) };
  }
}

export const REPLICATE_VIDEO_FACE_NODES: readonly NodeClass[] = [
  LatentSync,
  OmniHuman,
  DreamActor_M2,
  SadTalker,
  AniPortrait,
  VideoRetalking,
  Pixverse_Lipsync_V2,
  MultiTalk,
  Kling_Avatar_V2,
  FaceFusion,
  FaceSwap,
  AdvancedFaceSwap,
  FlashFace
] as const;
