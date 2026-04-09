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

export class SDXLClipInterrogator extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.SDXLClipInterrogator";
  static readonly title = "S D X L Clip Interrogator";
  static readonly description = `CLIP Interrogator for SDXL optimizes text prompts to match a given image
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "enum",
    default: "best",
    values: ["best", "fast"],
    description:
      "Prompt Mode: fast takes 1-2 seconds, best takes 15-25 seconds."
  })
  declare mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const mode = String(this.mode ?? "best");

    const args: Record<string, unknown> = {
      mode: mode
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/sdxl-clip-interrogator:b8dd624ad312d215250b362af0ecff05d7ad4f8270f9beb034c483d70682e7b3",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Img2Prompt extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.Img2Prompt";
  static readonly title = "Img2 Prompt";
  static readonly description = `Get an approximate text prompt, with style, matching an image.  (Optimized for stable-diffusion (clip ViT-L/14))
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "methexis-inc/img2prompt:50adaf2d3ad20a6f911a8a9e3ccf777b263b8596fbd2c8fc26e8888f8a0edbb5",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Moondream2 extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.Moondream2";
  static readonly title = "Moondream2";
  static readonly description = `moondream2 is a small vision language model designed to run efficiently on edge devices
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "str",
    default: "Describe this image",
    description: "Input prompt"
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const prompt = String(this.prompt ?? "Describe this image");

    const args: Record<string, unknown> = {
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
      "lucataco/moondream2:72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class NSFWImageDetection extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.NSFWImageDetection";
  static readonly title = "N S F W Image Detection";
  static readonly description = `Fine-Tuned Vision Transformer (ViT) for NSFW Image Classification
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "falcons-ai/nsfw_image_detection:97116600cabd3037e5f22ca08ffcc33b92cfacebf7ccd3609e9c1d29e43d3a8d",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Blip extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.Blip";
  static readonly title = "Blip";
  static readonly description = `Generate image captions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "Type caption for the input image for image text matching task."
  })
  declare caption: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Type question for the input image for visual question answering task."
  })
  declare question: any;

  @prop({
    type: "enum",
    default: "image_captioning",
    values: [
      "image_captioning",
      "visual_question_answering",
      "image_text_matching"
    ],
    description: "Choose a task."
  })
  declare task: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const caption = String(this.caption ?? "");
    const question = String(this.question ?? "");
    const task = String(this.task ?? "image_captioning");

    const args: Record<string, unknown> = {
      caption: caption,
      question: question,
      task: task
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "salesforce/blip:2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Blip2 extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.Blip2";
  static readonly title = "Blip2";
  static readonly description = `Answers questions about images
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Select if you want to generate image captions instead of asking questions"
  })
  declare caption: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional - previous questions and answers to be used as context for answering current question"
  })
  declare context: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image to query or caption"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "What is this a picture of?",
    description: "Question to ask about this image. Leave blank for captioning"
  })
  declare question: any;

  @prop({
    type: "float",
    default: 1,
    description: "Temperature for use with nucleus sampling"
  })
  declare temperature: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Toggles the model using nucleus sampling to generate responses"
  })
  declare use_nucleus_sampling: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const caption = Boolean(this.caption ?? false);
    const context = String(this.context ?? "");
    const question = String(this.question ?? "What is this a picture of?");
    const temperature = Number(this.temperature ?? 1);
    const useNucleusSampling = Boolean(this.use_nucleus_sampling ?? false);

    const args: Record<string, unknown> = {
      caption: caption,
      context: context,
      question: question,
      temperature: temperature,
      use_nucleus_sampling: useNucleusSampling
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "andreasjansson/blip-2:f677695e5e89f8b236e52ecd1d3f01beb44c34606419bcc19345e046d8f786f9",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class ClipInterrogator extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.ClipInterrogator";
  static readonly title = "Clip Interrogator";
  static readonly description = `The CLIP Interrogator is a prompt engineering tool that combines OpenAI's CLIP and Salesforce's BLIP to optimize text prompts to match a given image. Use the resulting prompts with text-to-image models like Stable Diffusion to create cool art!
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "enum",
    default: "ViT-L-14/openai",
    values: [
      "ViT-L-14/openai",
      "ViT-H-14/laion2b_s32b_b79k",
      "ViT-bigG-14/laion2b_s39b_b160k"
    ],
    description:
      "Choose ViT-L for Stable Diffusion 1, ViT-H for Stable Diffusion 2, or ViT-bigG for Stable Diffusion XL."
  })
  declare clip_model_name: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "enum",
    default: "best",
    values: ["best", "classic", "fast", "negative"],
    description:
      "Prompt mode (best takes 10-20 seconds, fast takes 1-2 seconds)."
  })
  declare mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const clipModelName = String(this.clip_model_name ?? "ViT-L-14/openai");
    const mode = String(this.mode ?? "best");

    const args: Record<string, unknown> = {
      clip_model_name: clipModelName,
      mode: mode
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "pharmapsychotic/clip-interrogator:8151e1c9f47e696fa316146a2e35812ccf79cfc9eba05b11c7f450155102af70",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Llava13b extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.Llava13b";
  static readonly title = "Llava13b";
  static readonly description = `Visual instruction tuning towards large language and vision models with GPT-4 level capabilities
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "int",
    default: 1024,
    description:
      "Maximum number of tokens to generate. A word is generally 2-3 tokens"
  })
  declare max_tokens: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt to use for text generation"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.2,
    description:
      "Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic"
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens"
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxTokens = Number(this.max_tokens ?? 1024);
    const prompt = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0.2);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      max_tokens: maxTokens,
      prompt: prompt,
      temperature: temperature,
      top_p: topP
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "yorickvp/llava-13b:80537f9eead1a5bfa72d5ac6ea6414379be41d4d4f6679fd776e9535d1eb58bb",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class ClipFeatures extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.ClipFeatures";
  static readonly title = "Clip Features";
  static readonly description = `Return CLIP features for the clip-vit-large-patch14 model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "a\nb",
    description:
      "Newline-separated inputs. Can either be strings of text or image URIs starting with http[s]://"
  })
  declare inputs: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const field_inputs = String(this.inputs ?? "a\nb");

    const args: Record<string, unknown> = {
      inputs: field_inputs
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Apollo_3B extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.Apollo_3B";
  static readonly title = "Apollo_3 B";
  static readonly description = `Apollo 3B - An Exploration of Video Understanding in Large Multimodal Models
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "int",
    default: 256,
    description: "Maximum number of tokens to generate"
  })
  declare max_new_tokens: any;

  @prop({
    type: "str",
    default: "Describe this video in detail",
    description: "Question or prompt about the video"
  })
  declare prompt: any;

  @prop({ type: "float", default: 0.4, description: "Sampling temperature" })
  declare temperature: any;

  @prop({
    type: "float",
    default: 0.7,
    description: "Top-p sampling probability"
  })
  declare top_p: any;

  @prop({ type: "video", default: "", description: "Input video file" })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxNewTokens = Number(this.max_new_tokens ?? 256);
    const prompt = String(this.prompt ?? "Describe this video in detail");
    const temperature = Number(this.temperature ?? 0.4);
    const topP = Number(this.top_p ?? 0.7);

    const args: Record<string, unknown> = {
      max_new_tokens: maxNewTokens,
      prompt: prompt,
      temperature: temperature,
      top_p: topP
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/apollo-3b:ed5ec3233f7a4331a2b0d33b8a02e62057a335e1a03107d56db9fac10cf3ce55",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Apollo_7B extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.Apollo_7B";
  static readonly title = "Apollo_7 B";
  static readonly description = `Apollo 7B - An Exploration of Video Understanding in Large Multimodal Models
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "int",
    default: 256,
    description: "Maximum number of tokens to generate"
  })
  declare max_new_tokens: any;

  @prop({
    type: "str",
    default: "Describe this video in detail",
    description: "Question or prompt about the video"
  })
  declare prompt: any;

  @prop({ type: "float", default: 0.4, description: "Sampling temperature" })
  declare temperature: any;

  @prop({
    type: "float",
    default: 0.7,
    description: "Top-p sampling probability"
  })
  declare top_p: any;

  @prop({ type: "video", default: "", description: "Input video file" })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxNewTokens = Number(this.max_new_tokens ?? 256);
    const prompt = String(this.prompt ?? "Describe this video in detail");
    const temperature = Number(this.temperature ?? 0.4);
    const topP = Number(this.top_p ?? 0.7);

    const args: Record<string, unknown> = {
      max_new_tokens: maxNewTokens,
      prompt: prompt,
      temperature: temperature,
      top_p: topP
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/apollo-7b:e282f76d0451b759128be3e8bccfe5ded8f521f4a7d705883e92f837e563f575",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class MiniCPM_V4 extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.MiniCPM_V4";
  static readonly title = "Mini C P M_ V4";
  static readonly description = `MiniCPM-V 4.0 has strong image and video understanding performance
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Input image file (RGB)." })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description: "User question/prompt for the image or video."
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "Optional input video file. If provided, frames will be sampled and used as multiple images."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 8,
    description: "Maximum number of frames to sample from the video."
  })
  declare video_max_frames: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const videoMaxFrames = Number(this.video_max_frames ?? 8);

    const args: Record<string, unknown> = {
      prompt: prompt,
      video_max_frames: videoMaxFrames
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
      "lucataco/minicpm-v-4:8b647b895c75cc7885d0a22d4fb1a0a2cb4fcf8ebbc13b78e09ec671f9183b27",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class VideoLlama3_7B extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.VideoLlama3_7B";
  static readonly title = "Video Llama3_7 B";
  static readonly description = `VideoLLaMA 3: Frontier Multimodal Foundation Models for Video Understanding
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 1,
    description: "Frames per second to sample from video"
  })
  declare fps: any;

  @prop({
    type: "int",
    default: 180,
    description: "Maximum number of frames to process"
  })
  declare max_frames: any;

  @prop({
    type: "int",
    default: 2048,
    description: "Maximum number of tokens to generate"
  })
  declare max_new_tokens: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt to guide the model's response"
  })
  declare prompt: any;

  @prop({ type: "float", default: 0.2, description: "Sampling temperature" })
  declare temperature: any;

  @prop({ type: "float", default: 0.9, description: "Top-p sampling" })
  declare top_p: any;

  @prop({ type: "video", default: "", description: "Input video file" })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const fps = Number(this.fps ?? 1);
    const maxFrames = Number(this.max_frames ?? 180);
    const maxNewTokens = Number(this.max_new_tokens ?? 2048);
    const prompt = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0.2);
    const topP = Number(this.top_p ?? 0.9);

    const args: Record<string, unknown> = {
      fps: fps,
      max_frames: maxFrames,
      max_new_tokens: maxNewTokens,
      prompt: prompt,
      temperature: temperature,
      top_p: topP
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/videollama3-7b:34a1f45f7068f7121a5b47c91f2d7e06c298850767f76f96660450a0a3bd5bbe",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Llava_V1_6_Mistral extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.Llava_V1_6_Mistral";
  static readonly title = "Llava_ V1_6_ Mistral";
  static readonly description = `LLaVA v1.6: Large Language and Vision Assistant (Mistral-7B)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[str]",
    default: [],
    description:
      "List of earlier chat messages, alternating roles, starting with user input. Include <image> to specify which message to attach the image to."
  })
  declare history: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "int",
    default: 1024,
    description:
      "Maximum number of tokens to generate. A word is generally 2-3 tokens"
  })
  declare max_tokens: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt to use for text generation"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.2,
    description:
      "Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic"
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens"
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const history = String(this.history ?? []);
    const maxTokens = Number(this.max_tokens ?? 1024);
    const prompt = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0.2);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      history: history,
      max_tokens: maxTokens,
      prompt: prompt,
      temperature: temperature,
      top_p: topP
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "yorickvp/llava-v1.6-mistral-7b:19be067b589d0c46689ffa7cc3ff321447a441986a7694c01225973c2eafc874",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Llava_V1_6_Vicuna extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.Llava_V1_6_Vicuna";
  static readonly title = "Llava_ V1_6_ Vicuna";
  static readonly description = `LLaVA v1.6: Large Language and Vision Assistant (Vicuna-13B)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[str]",
    default: [],
    description:
      "List of earlier chat messages, alternating roles, starting with user input. Include <image> to specify which message to attach the image to."
  })
  declare history: any;

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({
    type: "int",
    default: 1024,
    description:
      "Maximum number of tokens to generate. A word is generally 2-3 tokens"
  })
  declare max_tokens: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt to use for text generation"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.2,
    description:
      "Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic"
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens"
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const history = String(this.history ?? []);
    const maxTokens = Number(this.max_tokens ?? 1024);
    const prompt = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0.2);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      history: history,
      max_tokens: maxTokens,
      prompt: prompt,
      temperature: temperature,
      top_p: topP
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "yorickvp/llava-v1.6-vicuna-13b:0603dec596080fa084e26f0ae6d605fc5788ed2b1a0358cd25010619487eae63",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Gemini_3_Flash extends ReplicateNode {
  static readonly nodeType = "replicate.image.analyze.Gemini_3_Flash";
  static readonly title = "Gemini_3_ Flash";
  static readonly description = `Google's most intelligent model built for speed with frontier intelligence, superior search, and grounding
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "Input audio to send with the prompt (max 1 audio file, up to 8.4 hours)"
  })
  declare audio: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Input images to send with the prompt (max 10 images, each up to 7MB)"
  })
  declare images: any;

  @prop({
    type: "int",
    default: 65535,
    description: "Maximum number of tokens to generate"
  })
  declare max_output_tokens: any;

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to send to the model"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "System instruction to guide the model's behavior"
  })
  declare system_instruction: any;

  @prop({
    type: "float",
    default: 1,
    description: "Sampling temperature between 0 and 2"
  })
  declare temperature: any;

  @prop({
    type: "enum",
    default: "",
    values: ["low", "high"],
    description:
      "Thinking level for reasoning (low or high). Replaces thinking_budget for Gemini 3 models."
  })
  declare thinking_level: any;

  @prop({
    type: "float",
    default: 0.95,
    description:
      "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass"
  })
  declare top_p: any;

  @prop({
    type: "list[video]",
    default: [],
    description:
      "Input videos to send with the prompt (max 10 videos, each up to 45 minutes)"
  })
  declare videos: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxOutputTokens = Number(this.max_output_tokens ?? 65535);
    const prompt = String(this.prompt ?? "");
    const systemInstruction = String(this.system_instruction ?? "");
    const temperature = Number(this.temperature ?? 1);
    const thinkingLevel = String(this.thinking_level ?? "");
    const topP = Number(this.top_p ?? 0.95);

    const args: Record<string, unknown> = {
      max_output_tokens: maxOutputTokens,
      prompt: prompt,
      system_instruction: systemInstruction,
      temperature: temperature,
      thinking_level: thinkingLevel,
      top_p: topP
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const imagesRef = this.images as Record<string, unknown> | undefined;
    if (isRefSet(imagesRef)) {
      const imagesUrl = await assetToUrl(imagesRef!, apiKey);
      if (imagesUrl) args["images"] = imagesUrl;
    }

    const videosRef = this.videos as Record<string, unknown> | undefined;
    if (isRefSet(videosRef)) {
      const videosUrl = await assetToUrl(videosRef!, apiKey);
      if (videosUrl) args["videos"] = videosUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/gemini-3-flash:12917939800a325e127c528db67c32fe8a23a51c0400690e68c8731c2508c553",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export const REPLICATE_IMAGE_ANALYZE_NODES: readonly NodeClass[] = [
  SDXLClipInterrogator,
  Img2Prompt,
  Moondream2,
  NSFWImageDetection,
  Blip,
  Blip2,
  ClipInterrogator,
  Llava13b,
  ClipFeatures,
  Apollo_3B,
  Apollo_7B,
  MiniCPM_V4,
  VideoLlama3_7B,
  Llava_V1_6_Mistral,
  Llava_V1_6_Vicuna,
  Gemini_3_Flash
] as const;
