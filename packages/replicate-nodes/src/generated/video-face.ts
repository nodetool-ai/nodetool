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

export class LatentSync extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.LatentSync";
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

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 1);
    const seed = Number(inputs.seed ?? this.seed ?? 0);

    const args: Record<string, unknown> = {
      "guidance_scale": guidanceScale,
      "seed": seed,
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

    const res = await replicateSubmit(apiKey, "bytedance/latentsync:637ce1919f807ca20da3a448ddc2743535d2853649574cd52a933120e9b9e293", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class OmniHuman extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.OmniHuman";
  static readonly title = "Omni Human";
  static readonly description = `Turns your audio/video/images into professional-quality animated videos
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "audio", default: "", description: "Input audio file (MP3, WAV, etc.). For the best quality outputs audio should be no longer than 15 seconds. After 15 seconds the video quality will begin to degrade. If you have a lot of audio you want to process, we recommend splitting it into 15 second chunks." })
  declare audio: any;

  @prop({ type: "image", default: "", description: "Input image containing a human subject, face or character." })
  declare image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const args: Record<string, unknown> = {
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = assetToUrl(audioRef!);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "bytedance/omni-human:566f1b03016969ac39e242c1ae4a39034686ca8850fc3dba83dceaceb96f74b2", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class DreamActor_M2 extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.DreamActor_M2";
  static readonly title = "Dream Actor_ M2";
  static readonly description = `Animate any character, humans, cartoons, animals, even non-humans, from a single image + driving video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "bool", default: true, description: "Whether to crop the first second of the output video (removes the 1-second transition at the beginning)." })
  declare cut_first_second: any;

  @prop({ type: "image", default: "", description: "Input image containing a human subject. Supported formats: JPEG, JPG, PNG. Max size: 4.7 MB. Resolution: 480x480 to 1920x1080." })
  declare image: any;

  @prop({ type: "str", default: "", description: "Template video whose motion, facial expressions, and lip movements will be applied to the image subject. Supported formats: MP4, MOV, WebM. Max duration: 30 seconds. Resolution: 200x200 to 2048x1440." })
  declare video: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const cutFirstSecond = Boolean(inputs.cut_first_second ?? this.cut_first_second ?? true);
    const video = String(inputs.video ?? this.video ?? "");

    const args: Record<string, unknown> = {
      "cut_first_second": cutFirstSecond,
      "video": video,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "bytedance/dreamactor-m2.0:b23bf8e6d5f31dd67ad219fac057fd43d3ac38fc58343025ab557be74a9450ca", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class SadTalker extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.SadTalker";
  static readonly title = "Sad Talker";
  static readonly description = `Stylized Audio-Driven Single Image Talking Face Animation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "audio", default: "", description: "Upload the driven audio, accepts .wav and .mp4 file" })
  declare driven_audio: any;

  @prop({ type: "float", default: 1, description: " a larger value will make the expression motion stronger" })
  declare expression_scale: any;

  @prop({ type: "enum", default: "facevid2vid", values: ["facevid2vid", "pirender"], description: "Choose face render" })
  declare facerender: any;

  @prop({ type: "int", default: 0, description: "Pose style" })
  declare pose_style: any;

  @prop({ type: "enum", default: "crop", values: ["crop", "resize", "full", "extcrop", "extfull"], description: "Choose how to preprocess the images" })
  declare preprocess: any;

  @prop({ type: "enum", default: 256, values: ["256", "512"], description: "Face model resolution" })
  declare size_of_image: any;

  @prop({ type: "image", default: "", description: "Upload the source image, it can be video.mp4 or picture.png" })
  declare source_image: any;

  @prop({ type: "bool", default: true, description: "Still Mode (fewer head motion, works with preprocess 'full')" })
  declare still_mode: any;

  @prop({ type: "bool", default: false, description: "Use GFPGAN as Face enhancer" })
  declare use_enhancer: any;

  @prop({ type: "bool", default: true, description: "Use eye blink" })
  declare use_eyeblink: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const expressionScale = Number(inputs.expression_scale ?? this.expression_scale ?? 1);
    const facerender = String(inputs.facerender ?? this.facerender ?? "facevid2vid");
    const poseStyle = Number(inputs.pose_style ?? this.pose_style ?? 0);
    const preprocess = String(inputs.preprocess ?? this.preprocess ?? "crop");
    const sizeOfImage = String(inputs.size_of_image ?? this.size_of_image ?? 256);
    const stillMode = Boolean(inputs.still_mode ?? this.still_mode ?? true);
    const useEnhancer = Boolean(inputs.use_enhancer ?? this.use_enhancer ?? false);
    const useEyeblink = Boolean(inputs.use_eyeblink ?? this.use_eyeblink ?? true);

    const args: Record<string, unknown> = {
      "expression_scale": expressionScale,
      "facerender": facerender,
      "pose_style": poseStyle,
      "preprocess": preprocess,
      "size_of_image": sizeOfImage,
      "still_mode": stillMode,
      "use_enhancer": useEnhancer,
      "use_eyeblink": useEyeblink,
    };

    const drivenAudioRef = inputs.driven_audio as Record<string, unknown> | undefined;
    if (isRefSet(drivenAudioRef)) {
      const drivenAudioUrl = assetToUrl(drivenAudioRef!);
      if (drivenAudioUrl) args["driven_audio"] = drivenAudioUrl;
    }

    const sourceImageRef = inputs.source_image as Record<string, unknown> | undefined;
    if (isRefSet(sourceImageRef)) {
      const sourceImageUrl = assetToUrl(sourceImageRef!);
      if (sourceImageUrl) args["source_image"] = sourceImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "cjwbw/sadtalker:a519cc0cfebaaeade068b23899165a11ec76aaa1d2b313d40d214f204ec957a3", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class AniPortrait extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.AniPortrait";
  static readonly title = "Ani Portrait";
  static readonly description = `Audio-Driven Synthesis of Photorealistic Portrait Animations
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "audio", default: "", description: "Input audio" })
  declare audio: any;

  @prop({ type: "int", default: 30, description: "Frame per second in the output video" })
  declare fps: any;

  @prop({ type: "float", default: 3.5, description: "Scale for classifier-free guidance" })
  declare guidance_scale: any;

  @prop({ type: "int", default: 512, description: "Height of output video" })
  declare height: any;

  @prop({ type: "str", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "int", default: -1, description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "int", default: 25, description: "Inference steps" })
  declare steps: any;

  @prop({ type: "int", default: 512, description: "Width of output video" })
  declare width: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const fps = Number(inputs.fps ?? this.fps ?? 30);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 3.5);
    const height = Number(inputs.height ?? this.height ?? 512);
    const image = String(inputs.image ?? this.image ?? "");
    const seed = Number(inputs.seed ?? this.seed ?? -1);
    const steps = Number(inputs.steps ?? this.steps ?? 25);
    const width = Number(inputs.width ?? this.width ?? 512);

    const args: Record<string, unknown> = {
      "fps": fps,
      "guidance_scale": guidanceScale,
      "height": height,
      "image": image,
      "seed": seed,
      "steps": steps,
      "width": width,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = assetToUrl(audioRef!);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "cjwbw/aniportrait-audio2vid:3f976d8f2308f5c676a484e873f7d1ac09763f789fa211894df1ed96d3d17cb2", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class VideoRetalking extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.VideoRetalking";
  static readonly title = "Video Retalking";
  static readonly description = `Audio-based Lip Synchronization for Talking Head Video
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "str", default: "", description: "Input video file of a talking-head." })
  declare face: any;

  @prop({ type: "str", default: "", description: "Input audio file. Avoid special symbol in the filename as it may cause ffmpeg erros." })
  declare input_audio: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const face = String(inputs.face ?? this.face ?? "");
    const inputAudio = String(inputs.input_audio ?? this.input_audio ?? "");

    const args: Record<string, unknown> = {
      "face": face,
      "input_audio": inputAudio,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "chenxwh/video-retalking:db5a650c807b007dc5f9e5abe27c53e1b62880d1f94d218d27ce7fa802711d67", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Pixverse_Lipsync_V2 extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.Pixverse_Lipsync_V2";
  static readonly title = "Pixverse_ Lipsync_ V2";
  static readonly description = `Generate realistic lipsync animations from audio for high-quality synchronization
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "audio", default: "", description: "Audio file to upload to PixVerse as media" })
  declare audio: any;

  @prop({ type: "video", default: "", description: "Video file to upload to PixVerse as media" })
  declare video: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const args: Record<string, unknown> = {
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

    const res = await replicateSubmit(apiKey, "pixverse/lipsync:3ca6d73f4fb9e1d77a4b6e14f8998ee18926e4dc462838e31fa2bb5e662c1e2c", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class MultiTalk extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.MultiTalk";
  static readonly title = "Multi Talk";
  static readonly description = `Audio-driven multi-person conversational video generation - Upload audio files and a reference image to create realistic conversations between multiple people
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "str", default: "", description: "First audio file for driving the conversation" })
  declare first_audio: any;

  @prop({ type: "image", default: "", description: "Reference image containing the person(s) for video generation" })
  declare image: any;

  @prop({ type: "int", default: 81, description: "Number of frames to generate (automatically adjusted to nearest valid value of form 4n+1, e.g., 81, 181)" })
  declare num_frames: any;

  @prop({ type: "str", default: "A smiling man and woman wearing headphones sit in front of microphones, appearing to host a podcast.", description: "Text prompt describing the desired interaction or conversation scenario" })
  declare prompt: any;

  @prop({ type: "int", default: 40, description: "Number of sampling steps (higher = better quality, lower = faster)" })
  declare sampling_steps: any;

  @prop({ type: "str", default: "", description: "Second audio file for multi-person conversation (optional)" })
  declare second_audio: any;

  @prop({ type: "int", default: -1, description: "Random seed for reproducible results" })
  declare seed: any;

  @prop({ type: "bool", default: true, description: "Enable turbo mode optimizations (adjusts thresholds and guidance scales for speed)" })
  declare turbo: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const firstAudio = String(inputs.first_audio ?? this.first_audio ?? "");
    const numFrames = Number(inputs.num_frames ?? this.num_frames ?? 81);
    const prompt = String(inputs.prompt ?? this.prompt ?? "A smiling man and woman wearing headphones sit in front of microphones, appearing to host a podcast.");
    const samplingSteps = Number(inputs.sampling_steps ?? this.sampling_steps ?? 40);
    const secondAudio = String(inputs.second_audio ?? this.second_audio ?? "");
    const seed = Number(inputs.seed ?? this.seed ?? -1);
    const turbo = Boolean(inputs.turbo ?? this.turbo ?? true);

    const args: Record<string, unknown> = {
      "first_audio": firstAudio,
      "num_frames": numFrames,
      "prompt": prompt,
      "sampling_steps": samplingSteps,
      "second_audio": secondAudio,
      "seed": seed,
      "turbo": turbo,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "zsxkib/multitalk:0bd2390c40618c910ffc345b36c8fd218fd8fa59c9124aa641fea443fa203b44", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Kling_Avatar_V2 extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.Kling_Avatar_V2";
  static readonly title = "Kling_ Avatar_ V2";
  static readonly description = `Create avatar videos with realistic humans, animals, cartoons, or stylized characters
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "audio", default: "", description: "Audio file for avatar. Supports .mp3/.wav/.m4a/.aac, max 5MB." })
  declare audio: any;

  @prop({ type: "image", default: "", description: "Avatar reference image. Supports .jpg/.jpeg/.png, max 10MB, dimensions >= 300px, aspect ratio 1:2.5 to 2.5:1." })
  declare image: any;

  @prop({ type: "enum", default: "std", values: ["std", "pro"], description: "Video generation mode." })
  declare mode: any;

  @prop({ type: "str", default: "", description: "Positive text prompt to define avatar actions, emotions, and camera movements." })
  declare prompt: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const mode = String(inputs.mode ?? this.mode ?? "std");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");

    const args: Record<string, unknown> = {
      "mode": mode,
      "prompt": prompt,
    };

    const audioRef = inputs.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = assetToUrl(audioRef!);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "kwaivgi/kling-avatar-v2:af77ed5d1753d98aaabbbfd7d0147bf073c1b7c25a0bb739b82da94ac2716a12", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class FaceFusion extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.FaceFusion";
  static readonly title = "Face Fusion";
  static readonly description = `Auto fuse a user's face onto the template image, with a similar appearance to the user
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({ type: "str", default: "", description: "Input body image" })
  declare template_image: any;

  @prop({ type: "str", default: "", description: "Input face image" })
  declare user_image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const templateImage = String(inputs.template_image ?? this.template_image ?? "");
    const userImage = String(inputs.user_image ?? this.user_image ?? "");

    const args: Record<string, unknown> = {
      "template_image": templateImage,
      "user_image": userImage,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "lucataco/modelscope-facefusion:52edbb2b42beb4e19242f0c9ad5717211a96c63ff1f0b0320caa518b2745f4f7", args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class FaceSwap extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.FaceSwap";
  static readonly title = "Face Swap";
  static readonly description = `Advance Face Swap powered by pixalto.app
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "str", default: "", description: "Target image" })
  declare input_image: any;

  @prop({ type: "str", default: "", description: "Swap image" })
  declare swap_image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const inputImage = String(inputs.input_image ?? this.input_image ?? "");
    const swapImage = String(inputs.swap_image ?? this.swap_image ?? "");

    const args: Record<string, unknown> = {
      "input_image": inputImage,
      "swap_image": swapImage,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "codeplugtech/face-swap:278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class AdvancedFaceSwap extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.AdvancedFaceSwap";
  static readonly title = "Advanced Face Swap";
  static readonly description = `Face swap one or two people into a target image
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "bool", default: false, description: "(Beta) Apply detailer to the image. Detailer will improve certain image details, but slightly increase generation time." })
  declare detailer: any;

  @prop({ type: "enum", default: "user", values: ["user", "target"], description: "Choose whose hairstyle to preserve: 'user' preserves hairstyle from face image, 'target' preserves from target image" })
  declare hair_source: any;

  @prop({ type: "str", default: "", description: "The face image to swap from" })
  declare swap_image: any;

  @prop({ type: "str", default: "", description: "Optional second face image to swap from" })
  declare swap_image_b: any;

  @prop({ type: "image", default: "", description: "The image to swap onto" })
  declare target_image: any;

  @prop({ type: "bool", default: true, description: "Apply 2x upscale and boost quality. Upscaling will refine the image and make the subjects brighter. Default value: true" })
  declare upscale: any;

  @prop({ type: "enum", default: "a woman", values: ["a man", "a woman"], description: "Optional description of second user's gender for multi-user swaps" })
  declare user_b_gender: any;

  @prop({ type: "enum", default: "a woman", values: ["a man", "a woman"], description: "Optional description of user gender ('a man', 'a woman'), used for multi-user swaps" })
  declare user_gender: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const detailer = Boolean(inputs.detailer ?? this.detailer ?? false);
    const hairSource = String(inputs.hair_source ?? this.hair_source ?? "user");
    const swapImage = String(inputs.swap_image ?? this.swap_image ?? "");
    const swapImageB = String(inputs.swap_image_b ?? this.swap_image_b ?? "");
    const upscale = Boolean(inputs.upscale ?? this.upscale ?? true);
    const userBGender = String(inputs.user_b_gender ?? this.user_b_gender ?? "a woman");
    const userGender = String(inputs.user_gender ?? this.user_gender ?? "a woman");

    const args: Record<string, unknown> = {
      "detailer": detailer,
      "hair_source": hairSource,
      "swap_image": swapImage,
      "swap_image_b": swapImageB,
      "upscale": upscale,
      "user_b_gender": userBGender,
      "user_gender": userGender,
    };

    const targetImageRef = inputs.target_image as Record<string, unknown> | undefined;
    if (isRefSet(targetImageRef)) {
      const targetImageUrl = assetToUrl(targetImageRef!);
      if (targetImageUrl) args["target_image"] = targetImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "easel/advanced-face-swap:602d8c526aca9e5081f0515649ff8998e058cf7e6b9ff32717d25327f18c5145", args);
    return { output: outputToImageRef(res.output) };
  }
}

export class FlashFace extends ReplicateNode {
  static readonly nodeType = "replicate.video_face.FlashFace";
  static readonly title = "Flash Face";
  static readonly description = `FlashFace: Human Image Personalization with High-fidelity Identity Preservation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({ type: "str", default: "blurry, ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, extra limbs, disfigured, deformed, body out of frame, bad anatomy, watermark, signature, cut off, low contrast, underexposed, overexposed, bad art, beginner, amateur, distorted face", description: "Default negative prompt postfix" })
  declare default_negative_prompt: any;

  @prop({ type: "str", default: "best quality, masterpiece,ultra-detailed, UHD 4K, photographic", description: "Default positive prompt postfix" })
  declare default_position_prompt: any;

  @prop({ type: "str", default: "[0., 0., 0., 0.]", description: "Face position" })
  declare face_bounding_box: any;

  @prop({ type: "float", default: 2.2, description: "Reference guidance strength" })
  declare face_guidance: any;

  @prop({ type: "float", default: 0.9, description: "Reference feature strength" })
  declare lamda_feature: any;

  @prop({ type: "str", default: "nsfw", description: "Negative prompt" })
  declare negative_prompt: any;

  @prop({ type: "int", default: 1, description: "Number of generated images" })
  declare num_sample: any;

  @prop({ type: "enum", default: "webp", values: ["webp", "jpg", "png"], description: "Format of the output images" })
  declare output_format: any;

  @prop({ type: "int", default: 80, description: "Quality of the output images, from 0 to 100. 100 is best quality, 1 is lowest quality." })
  declare output_quality: any;

  @prop({ type: "str", default: "", description: "Positive prompt" })
  declare positive_prompt: any;

  @prop({ type: "str", default: "", description: "Reference face image 1" })
  declare reference_face_1: any;

  @prop({ type: "str", default: "", description: "Reference face image 2" })
  declare reference_face_2: any;

  @prop({ type: "str", default: "", description: "Reference face image 3" })
  declare reference_face_3: any;

  @prop({ type: "str", default: "", description: "Reference face image 4" })
  declare reference_face_4: any;

  @prop({ type: "int", default: -1, description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "int", default: 600, description: "Step index to launch reference guidance" })
  declare step_to_launch_face_guidance: any;

  @prop({ type: "int", default: 35, description: "Number of steps" })
  declare steps: any;

  @prop({ type: "float", default: 7.5, description: "Text guidance strength" })
  declare text_control_scale: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const defaultNegativePrompt = String(inputs.default_negative_prompt ?? this.default_negative_prompt ?? "blurry, ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, extra limbs, disfigured, deformed, body out of frame, bad anatomy, watermark, signature, cut off, low contrast, underexposed, overexposed, bad art, beginner, amateur, distorted face");
    const defaultPositionPrompt = String(inputs.default_position_prompt ?? this.default_position_prompt ?? "best quality, masterpiece,ultra-detailed, UHD 4K, photographic");
    const faceBoundingBox = String(inputs.face_bounding_box ?? this.face_bounding_box ?? "[0., 0., 0., 0.]");
    const faceGuidance = Number(inputs.face_guidance ?? this.face_guidance ?? 2.2);
    const lamdaFeature = Number(inputs.lamda_feature ?? this.lamda_feature ?? 0.9);
    const negativePrompt = String(inputs.negative_prompt ?? this.negative_prompt ?? "nsfw");
    const numSample = Number(inputs.num_sample ?? this.num_sample ?? 1);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 80);
    const positivePrompt = String(inputs.positive_prompt ?? this.positive_prompt ?? "");
    const referenceFace_1 = String(inputs.reference_face_1 ?? this.reference_face_1 ?? "");
    const referenceFace_2 = String(inputs.reference_face_2 ?? this.reference_face_2 ?? "");
    const referenceFace_3 = String(inputs.reference_face_3 ?? this.reference_face_3 ?? "");
    const referenceFace_4 = String(inputs.reference_face_4 ?? this.reference_face_4 ?? "");
    const seed = Number(inputs.seed ?? this.seed ?? -1);
    const stepToLaunchFaceGuidance = Number(inputs.step_to_launch_face_guidance ?? this.step_to_launch_face_guidance ?? 600);
    const steps = Number(inputs.steps ?? this.steps ?? 35);
    const textControlScale = Number(inputs.text_control_scale ?? this.text_control_scale ?? 7.5);

    const args: Record<string, unknown> = {
      "default_negative_prompt": defaultNegativePrompt,
      "default_position_prompt": defaultPositionPrompt,
      "face_bounding_box": faceBoundingBox,
      "face_guidance": faceGuidance,
      "lamda_feature": lamdaFeature,
      "negative_prompt": negativePrompt,
      "num_sample": numSample,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "positive_prompt": positivePrompt,
      "reference_face_1": referenceFace_1,
      "reference_face_2": referenceFace_2,
      "reference_face_3": referenceFace_3,
      "reference_face_4": referenceFace_4,
      "seed": seed,
      "step_to_launch_face_guidance": stepToLaunchFaceGuidance,
      "steps": steps,
      "text_control_scale": textControlScale,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "zsxkib/flash-face:edb17f54faec253ee86e58e0b5f18f24a89c4e31fe7fcefa970e13d8ad934117", args);
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
  FlashFace,
] as const;