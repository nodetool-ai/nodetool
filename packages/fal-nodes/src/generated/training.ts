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

export class ZImageBaseTrainer extends FalNode {
  static readonly nodeType = "fal.training.ZImageBaseTrainer";
  static readonly title = "Z Image Base Trainer";
  static readonly description = `Z-Image Trainer
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 2000,
    description: "Number of steps to train for"
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n        URL to the input data zip archive.\n\n        The zip should contain pairs of images and corresponding captions.\n\n        The images should be named: ROOT.EXT. For example: 001.jpg\n\n        The corresponding captions should be named: ROOT.txt. For example: 001.txt\n\n        If no text file is provided for an image, the default_caption will be used.\n        "
  })
  declare image_data: any;

  @prop({ type: "float", default: 0.0005, description: "Learning rate." })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 2000);
    const learningRate = Number(this.learning_rate ?? 0.0005);
    const defaultCaption = String(this.default_caption ?? "");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/z-image-base-trainer", args);
    return res as Record<string, unknown>;
  }
}

export class ZImageTurboTrainerV2 extends FalNode {
  static readonly nodeType = "fal.training.ZImageTurboTrainerV2";
  static readonly title = "Z Image Turbo Trainer V2";
  static readonly description = `Z Image Turbo Trainer V2
training, fine-tuning, lora, model-training, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 2000,
    description: "Number of steps to train for"
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n        URL to the input data zip archive.\n\n        The zip should contain pairs of images and corresponding captions.\n\n        The images should be named: ROOT.EXT. For example: 001.jpg\n\n        The corresponding captions should be named: ROOT.txt. For example: 001.txt\n\n        If no text file is provided for an image, the default_caption will be used.\n        "
  })
  declare image_data: any;

  @prop({ type: "float", default: 0.0005, description: "Learning rate." })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 2000);
    const learningRate = Number(this.learning_rate ?? 0.0005);
    const defaultCaption = String(this.default_caption ?? "");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/z-image-turbo-trainer-v2",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class Flux2Klein9BBaseTrainerEdit extends FalNode {
  static readonly nodeType = "fal.training.Flux2Klein9BBaseTrainerEdit";
  static readonly title = "Flux2 Klein9 B Base Trainer Edit";
  static readonly description = `Flux 2 Klein 9B Base Trainer
flux, training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Total number of training steps."
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to the input data zip archive.\n\n    The zip should contain pairs of images. The images should be named:\n\n    ROOT_start.EXT and ROOT_end.EXT\n    For example:\n    photo_start.jpg and photo_end.jpg\n\n    The zip can also contain up to four reference image for each image pair. The reference images should be named:\n    ROOT_start.EXT, ROOT_start2.EXT, ROOT_start3.EXT, ROOT_start4.EXT, ROOT_end.EXT\n    For example:\n    photo_start.jpg, photo_start2.jpg, photo_end.jpg\n\n    The zip can also contain a text file for each image pair. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.00005,
    description: "Learning rate applied to trainable parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  @prop({
    type: "enum",
    default: "fal",
    values: ["fal", "comfy"],
    description: "Dictates the naming scheme for the output weights"
  })
  declare output_lora_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.00005);
    const defaultCaption = String(this.default_caption ?? "");
    const outputLoraFormat = String(this.output_lora_format ?? "fal");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption,
      output_lora_format: outputLoraFormat
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/flux-2-klein-9b-base-trainer/edit",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class Flux2Klein9BBaseTrainer extends FalNode {
  static readonly nodeType = "fal.training.Flux2Klein9BBaseTrainer";
  static readonly title = "Flux2 Klein9 B Base Trainer";
  static readonly description = `Flux 2 Klein 9B Base Trainer
flux, training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Total number of training steps."
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to zip archive with images of a consistent style. Try to use at least 10 images, although more is better.\n\n    The zip can also contain a text file for each image. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.00005,
    description: "Learning rate applied to trainable parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  @prop({
    type: "enum",
    default: "fal",
    values: ["fal", "comfy"],
    description: "Dictates the naming scheme for the output weights"
  })
  declare output_lora_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.00005);
    const defaultCaption = String(this.default_caption ?? "");
    const outputLoraFormat = String(this.output_lora_format ?? "fal");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption,
      output_lora_format: outputLoraFormat
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/flux-2-klein-9b-base-trainer",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class Flux2Klein4BBaseTrainer extends FalNode {
  static readonly nodeType = "fal.training.Flux2Klein4BBaseTrainer";
  static readonly title = "Flux2 Klein4 B Base Trainer";
  static readonly description = `Flux 2 Klein 4B Base Trainer
flux, training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Total number of training steps."
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to zip archive with images of a consistent style. Try to use at least 10 images, although more is better.\n\n    The zip can also contain a text file for each image. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.00005,
    description: "Learning rate applied to trainable parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  @prop({
    type: "enum",
    default: "fal",
    values: ["fal", "comfy"],
    description: "Dictates the naming scheme for the output weights"
  })
  declare output_lora_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.00005);
    const defaultCaption = String(this.default_caption ?? "");
    const outputLoraFormat = String(this.output_lora_format ?? "fal");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption,
      output_lora_format: outputLoraFormat
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/flux-2-klein-4b-base-trainer",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class Flux2Klein4BBaseTrainerEdit extends FalNode {
  static readonly nodeType = "fal.training.Flux2Klein4BBaseTrainerEdit";
  static readonly title = "Flux2 Klein4 B Base Trainer Edit";
  static readonly description = `Flux 2 Klein 4B Base Trainer
flux, training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Total number of training steps."
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to the input data zip archive.\n\n    The zip should contain pairs of images. The images should be named:\n\n    ROOT_start.EXT and ROOT_end.EXT\n    For example:\n    photo_start.jpg and photo_end.jpg\n\n    The zip can also contain up to four reference image for each image pair. The reference images should be named:\n    ROOT_start.EXT, ROOT_start2.EXT, ROOT_start3.EXT, ROOT_start4.EXT, ROOT_end.EXT\n    For example:\n    photo_start.jpg, photo_start2.jpg, photo_end.jpg\n\n    The zip can also contain a text file for each image pair. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.00005,
    description: "Learning rate applied to trainable parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  @prop({
    type: "enum",
    default: "fal",
    values: ["fal", "comfy"],
    description: "Dictates the naming scheme for the output weights"
  })
  declare output_lora_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.00005);
    const defaultCaption = String(this.default_caption ?? "");
    const outputLoraFormat = String(this.output_lora_format ?? "fal");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption,
      output_lora_format: outputLoraFormat
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/flux-2-klein-4b-base-trainer/edit",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class QwenImage2512TrainerV2 extends FalNode {
  static readonly nodeType = "fal.training.QwenImage2512TrainerV2";
  static readonly title = "Qwen Image2512 Trainer V2";
  static readonly description = `Qwen Image 2512 Trainer V2
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 2000,
    description: "Number of steps to train for"
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n        URL to the input data zip archive.\n\n        The zip should contain pairs of images and corresponding captions.\n\n        The images should be named: ROOT.EXT. For example: 001.jpg\n\n        The corresponding captions should be named: ROOT.txt. For example: 001.txt\n\n        If no text file is provided for an image, the default_caption will be used.\n        "
  })
  declare image_data: any;

  @prop({ type: "float", default: 0.0005, description: "Learning rate." })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 2000);
    const learningRate = Number(this.learning_rate ?? 0.0005);
    const defaultCaption = String(this.default_caption ?? "");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/qwen-image-2512-trainer-v2",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class Flux2TrainerV2Edit extends FalNode {
  static readonly nodeType = "fal.training.Flux2TrainerV2Edit";
  static readonly title = "Flux2 Trainer V2 Edit";
  static readonly description = `Flux 2 Trainer V2
flux, training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Total number of training steps."
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to the input data zip archive.\n\n    The zip should contain pairs of images. The images should be named:\n\n    ROOT_start.EXT and ROOT_end.EXT\n    For example:\n    photo_start.jpg and photo_end.jpg\n\n    The zip can also contain up to four reference image for each image pair. The reference images should be named:\n    ROOT_start.EXT, ROOT_start2.EXT, ROOT_start3.EXT, ROOT_start4.EXT, ROOT_end.EXT\n    For example:\n    photo_start.jpg, photo_start2.jpg, photo_end.jpg\n\n    The zip can also contain a text file for each image pair. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.00005,
    description: "Learning rate applied to trainable parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  @prop({
    type: "enum",
    default: "fal",
    values: ["fal", "comfy"],
    description: "Dictates the naming scheme for the output weights"
  })
  declare output_lora_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.00005);
    const defaultCaption = String(this.default_caption ?? "");
    const outputLoraFormat = String(this.output_lora_format ?? "fal");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption,
      output_lora_format: outputLoraFormat
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-trainer-v2/edit", args);
    return res as Record<string, unknown>;
  }
}

export class Flux2TrainerV2 extends FalNode {
  static readonly nodeType = "fal.training.Flux2TrainerV2";
  static readonly title = "Flux2 Trainer V2";
  static readonly description = `Flux 2 Trainer V2
flux, training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Total number of training steps."
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to zip archive with images of a consistent style. Try to use at least 10 images, although more is better.\n\n    The zip can also contain a text file for each image. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.00005,
    description: "Learning rate applied to trainable parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  @prop({
    type: "enum",
    default: "fal",
    values: ["fal", "comfy"],
    description: "Dictates the naming scheme for the output weights"
  })
  declare output_lora_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.00005);
    const defaultCaption = String(this.default_caption ?? "");
    const outputLoraFormat = String(this.output_lora_format ?? "fal");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption,
      output_lora_format: outputLoraFormat
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-trainer-v2", args);
    return res as Record<string, unknown>;
  }
}

export class Ltx2VideoTrainer extends FalNode {
  static readonly nodeType = "fal.training.Ltx2VideoTrainer";
  static readonly title = "Ltx2 Video Trainer";
  static readonly description = `LTX-2 Video Trainer
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    lora_file: "str",
    config_file: "str",
    debug_dataset: "str",
    video: "video"
  };

  @prop({
    type: "int",
    default: 2000,
    description: "The number of training steps."
  })
  declare number_of_steps: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "When audio duration doesn't match video duration, stretch/compress audio without changing pitch. If disabled, audio is trimmed or padded with silence."
  })
  declare audio_preserve_pitch: any;

  @prop({
    type: "int",
    default: 25,
    description: "Target frames per second for the video."
  })
  declare frame_rate: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Normalize audio peak amplitude to a consistent level. Recommended for consistent audio levels across the dataset."
  })
  declare audio_normalize: any;

  @prop({
    type: "float",
    default: 0.0002,
    description:
      "Learning rate for optimization. Higher values can lead to faster training but may cause overfitting."
  })
  declare learning_rate: any;

  @prop({
    type: "list[Validation]",
    default: [],
    description:
      "A list of validation prompts to use during training. When providing an image, _all_ validation inputs must have an image."
  })
  declare validation: any;

  @prop({
    type: "int",
    default: 89,
    description:
      "Number of frames per training sample. Must satisfy frames % 8 == 1 (e.g., 1, 9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97)."
  })
  declare number_of_frames: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to zip archive with videos or images. Try to use at least 10 files, although more is better.\n\n        **Supported video formats:** .mp4, .mov, .avi, .mkv\n        **Supported image formats:** .png, .jpg, .jpeg\n\n        Note: The dataset must contain ONLY videos OR ONLY images - mixed datasets are not supported.\n\n        The archive can also contain text files with captions. Each text file should have the same name as the media file it corresponds to."
  })
  declare training_data_url: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "When enabled, the trainer returns a downloadable archive of your preprocessed training data for manual inspection. Use this to verify that your videos, images, and captions were processed correctly before committing to a full training run."
  })
  declare debug_dataset: any;

  @prop({
    type: "float",
    default: 30,
    description:
      "The duration threshold in seconds. If a video is longer than this, it will be split into scenes."
  })
  declare split_input_duration_threshold: any;

  @prop({
    type: "enum",
    default: 32,
    values: [8, 16, 32, 64, 128],
    description:
      "The rank of the LoRA adaptation. Higher values increase capacity but use more memory."
  })
  declare rank: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "STG (Spatio-Temporal Guidance) scale. 0.0 disables STG. Recommended value is 1.0."
  })
  declare stg_scale: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Probability of conditioning on the first frame during training. Higher values improve image-to-video performance."
  })
  declare first_frame_conditioning_p: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["low", "medium", "high"],
    description:
      "Resolution to use for training. Higher resolutions require more memory."
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Enable joint audio-video training. If None (default), automatically detects whether input videos have audio. Set to True to force audio training, or False to disable."
  })
  declare with_audio: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If true, videos above a certain duration threshold will be split into scenes."
  })
  declare split_input_into_scenes: any;

  @prop({
    type: "int",
    default: 25,
    description: "Target frames per second for validation videos."
  })
  declare validation_frame_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A phrase that will trigger the LoRA style. Will be prepended to captions during training."
  })
  declare trigger_phrase: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["16:9", "1:1", "9:16"],
    description: "Aspect ratio to use for training."
  })
  declare aspect_ratio: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate audio in validation samples."
  })
  declare generate_audio_in_validation: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high"],
    description: "The resolution to use for validation."
  })
  declare validation_resolution: any;

  @prop({
    type: "int",
    default: 89,
    description: "The number of frames in validation videos."
  })
  declare validation_number_of_frames: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["16:9", "1:1", "9:16"],
    description: "The aspect ratio to use for validation."
  })
  declare validation_aspect_ratio: any;

  @prop({
    type: "str",
    default: "worst quality, inconsistent motion, blurry, jittery, distorted",
    description: "A negative prompt to use for validation."
  })
  declare validation_negative_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, videos will be automatically scaled to the target frame count and fps. This option has no effect on image datasets."
  })
  declare auto_scale_input: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 2000);
    const audioPreservePitch = Boolean(this.audio_preserve_pitch ?? true);
    const frameRate = Number(this.frame_rate ?? 25);
    const audioNormalize = Boolean(this.audio_normalize ?? true);
    const learningRate = Number(this.learning_rate ?? 0.0002);
    const validation = String(this.validation ?? []);
    const numberOfFrames = Number(this.number_of_frames ?? 89);
    const debugDataset = Boolean(this.debug_dataset ?? false);
    const splitInputDurationThreshold = Number(
      this.split_input_duration_threshold ?? 30
    );
    const rank = String(this.rank ?? 32);
    const stgScale = Number(this.stg_scale ?? 1);
    const firstFrameConditioningP = Number(
      this.first_frame_conditioning_p ?? 0.5
    );
    const resolution = String(this.resolution ?? "medium");
    const withAudio = String(this.with_audio ?? "");
    const splitInputIntoScenes = Boolean(this.split_input_into_scenes ?? true);
    const validationFrameRate = Number(this.validation_frame_rate ?? 25);
    const triggerPhrase = String(this.trigger_phrase ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const generateAudioInValidation = Boolean(
      this.generate_audio_in_validation ?? true
    );
    const validationResolution = String(this.validation_resolution ?? "high");
    const validationNumberOfFrames = Number(
      this.validation_number_of_frames ?? 89
    );
    const validationAspectRatio = String(this.validation_aspect_ratio ?? "1:1");
    const validationNegativePrompt = String(
      this.validation_negative_prompt ??
        "worst quality, inconsistent motion, blurry, jittery, distorted"
    );
    const autoScaleInput = Boolean(this.auto_scale_input ?? false);

    const args: Record<string, unknown> = {
      number_of_steps: numberOfSteps,
      audio_preserve_pitch: audioPreservePitch,
      frame_rate: frameRate,
      audio_normalize: audioNormalize,
      learning_rate: learningRate,
      validation: validation,
      number_of_frames: numberOfFrames,
      debug_dataset: debugDataset,
      split_input_duration_threshold: splitInputDurationThreshold,
      rank: rank,
      stg_scale: stgScale,
      first_frame_conditioning_p: firstFrameConditioningP,
      resolution: resolution,
      with_audio: withAudio,
      split_input_into_scenes: splitInputIntoScenes,
      validation_frame_rate: validationFrameRate,
      trigger_phrase: triggerPhrase,
      aspect_ratio: aspectRatio,
      generate_audio_in_validation: generateAudioInValidation,
      validation_resolution: validationResolution,
      validation_number_of_frames: validationNumberOfFrames,
      validation_aspect_ratio: validationAspectRatio,
      validation_negative_prompt: validationNegativePrompt,
      auto_scale_input: autoScaleInput
    };

    const trainingDataUrlRef = this.training_data_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(trainingDataUrlRef)) {
      const trainingDataUrlUrl =
        (await imageToDataUrl(trainingDataUrlRef!)) ??
        (await assetToFalUrl(apiKey, trainingDataUrlRef!));
      if (trainingDataUrlUrl) args["training_data_url"] = trainingDataUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx2-video-trainer", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class QwenImage2512Trainer extends FalNode {
  static readonly nodeType = "fal.training.QwenImage2512Trainer";
  static readonly title = "Qwen Image2512 Trainer";
  static readonly description = `Qwen Image 2512 Trainer
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Number of steps to train for"
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to the input data zip archive for text-to-image training.\n\n    The zip should contain images with their corresponding text captions:\n\n    image.EXT and image.txt\n    For example:\n    photo.jpg and photo.txt\n\n    The text file contains the caption/prompt describing the target image.\n\n    If no text file is provided for an image, the default_caption will be used.\n\n    If no default_caption is provided and a text file is missing, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.0005,
    description: "Learning rate for LoRA parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.0005);
    const defaultCaption = String(this.default_caption ?? "");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-image-2512-trainer", args);
    return res as Record<string, unknown>;
  }
}

export class QwenImageEdit2511Trainer extends FalNode {
  static readonly nodeType = "fal.training.QwenImageEdit2511Trainer";
  static readonly title = "Qwen Image Edit2511 Trainer";
  static readonly description = `Qwen Image Edit 2511 Trainer
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Number of steps to train for"
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to the input data zip archive.\n\n    The zip should contain pairs of images. The images should be named:\n\n    ROOT_start.EXT and ROOT_end.EXT\n    For example:\n    photo_start.jpg and photo_end.jpg\n\n    The zip can also contain more than one reference image for each image pair. The reference images should be named:\n    ROOT_start.EXT, ROOT_start2.EXT, ROOT_start3.EXT, ..., ROOT_end.EXT\n    For example:\n    photo_start.jpg, photo_start2.jpg, photo_end.jpg\n\n    The Reference Image Count field should be set to the number of reference images.\n\n    The zip can also contain a text file for each image pair. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.0001,
    description: "Learning rate for LoRA parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.0001);
    const defaultCaption = String(this.default_caption ?? "");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/qwen-image-edit-2511-trainer",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class QwenImageLayeredTrainer extends FalNode {
  static readonly nodeType = "fal.training.QwenImageLayeredTrainer";
  static readonly title = "Qwen Image Layered Trainer";
  static readonly description = `Qwen Image Layered Trainer
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Number of steps to train for"
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to the input data zip archive.\n\n    The zip should contain groups of images. The images should be named:\n\n    ROOT_start.EXT, ROOT_end.EXT, ROOT_end2.EXT, ..., ROOT_endN.EXT\n    For example:\n    photo_start.png, photo_end.png, photo_end2.png, ..., photo_endN.png\n\n    The start image is the base image that will be decomposed into layers.\n    The end images are the layers that will be added to the base image.  ROOT_end.EXT is the first layer, ROOT_end2.EXT is the second layer, and so on.\n    You can have up to 8 layers.\n    All image groups must have the same number of output layers.\n\n    The end images can contain transparent regions. Only PNG and WebP images are supported since these are the only formats that support transparency.\n\n    The zip can also contain a text file for each image group. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify a description of the base image.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.0001,
    description: "Learning rate for LoRA parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.0001);
    const defaultCaption = String(this.default_caption ?? "");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/qwen-image-layered-trainer",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class QwenImageEdit2509Trainer extends FalNode {
  static readonly nodeType = "fal.training.QwenImageEdit2509Trainer";
  static readonly title = "Qwen Image Edit2509 Trainer";
  static readonly description = `Qwen Image Edit 2509 Trainer
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Number of steps to train for"
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to the input data zip archive.\n\n    The zip should contain pairs of images. The images should be named:\n\n    ROOT_start.EXT and ROOT_end.EXT\n    For example:\n    photo_start.jpg and photo_end.jpg\n\n    The zip can also contain more than one reference image for each image pair. The reference images should be named:\n    ROOT_start.EXT, ROOT_start2.EXT, ROOT_start3.EXT, ..., ROOT_end.EXT\n    For example:\n    photo_start.jpg, photo_start2.jpg, photo_end.jpg\n\n    The Reference Image Count field should be set to the number of reference images.\n\n    The zip can also contain a text file for each image pair. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.0001,
    description: "Learning rate for LoRA parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.0001);
    const defaultCaption = String(this.default_caption ?? "");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/qwen-image-edit-2509-trainer",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class ZImageTrainer extends FalNode {
  static readonly nodeType = "fal.training.ZImageTrainer";
  static readonly title = "Z Image Trainer";
  static readonly description = `Train LoRAs on Z-Image Turbo, a super fast text-to-image model of 6B parameters developed by Tongyi-MAI.
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Total number of training steps."
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to zip archive with images of a consistent style. Try to use at least 10 images, although more is better.\n\n    The zip can also contain a text file for each image. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "enum",
    default: "balanced",
    values: ["content", "style", "balanced"],
    description:
      "Type of training to perform. Use 'content' to focus on the content of the images, 'style' to focus on the style of the images, and 'balanced' to focus on a combination of both."
  })
  declare training_type: any;

  @prop({
    type: "float",
    default: 0.0001,
    description: "Learning rate applied to trainable parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const trainingType = String(this.training_type ?? "balanced");
    const learningRate = Number(this.learning_rate ?? 0.0001);
    const defaultCaption = String(this.default_caption ?? "");

    const args: Record<string, unknown> = {
      steps: steps,
      training_type: trainingType,
      learning_rate: learningRate,
      default_caption: defaultCaption
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/z-image-trainer", args);
    return res as Record<string, unknown>;
  }
}

export class Flux2TrainerEdit extends FalNode {
  static readonly nodeType = "fal.training.Flux2TrainerEdit";
  static readonly title = "Flux2 Trainer Edit";
  static readonly description = `Fine-tune FLUX.2 [dev] from Black Forest Labs with custom datasets. Create specialized LoRA adaptations for specific editing tasks.
flux, training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Total number of training steps."
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to the input data zip archive.\n\n    The zip should contain pairs of images. The images should be named:\n\n    ROOT_start.EXT and ROOT_end.EXT\n    For example:\n    photo_start.jpg and photo_end.jpg\n\n    The zip can also contain up to four reference image for each image pair. The reference images should be named:\n    ROOT_start.EXT, ROOT_start2.EXT, ROOT_start3.EXT, ROOT_start4.EXT, ROOT_end.EXT\n    For example:\n    photo_start.jpg, photo_start2.jpg, photo_end.jpg\n\n    The zip can also contain a text file for each image pair. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.00005,
    description: "Learning rate applied to trainable parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  @prop({
    type: "enum",
    default: "fal",
    values: ["fal", "comfy"],
    description: "Dictates the naming scheme for the output weights"
  })
  declare output_lora_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.00005);
    const defaultCaption = String(this.default_caption ?? "");
    const outputLoraFormat = String(this.output_lora_format ?? "fal");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption,
      output_lora_format: outputLoraFormat
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-trainer/edit", args);
    return res as Record<string, unknown>;
  }
}

export class Flux2Trainer extends FalNode {
  static readonly nodeType = "fal.training.Flux2Trainer";
  static readonly title = "Flux2 Trainer";
  static readonly description = `Fine-tune FLUX.2 [dev] from Black Forest Labs with custom datasets. Create specialized LoRA adaptations for specific styles and domains.
flux, training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Total number of training steps."
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to zip archive with images of a consistent style. Try to use at least 10 images, although more is better.\n\n    The zip can also contain a text file for each image. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.00005,
    description: "Learning rate applied to trainable parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  @prop({
    type: "enum",
    default: "fal",
    values: ["fal", "comfy"],
    description: "Dictates the naming scheme for the output weights"
  })
  declare output_lora_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.00005);
    const defaultCaption = String(this.default_caption ?? "");
    const outputLoraFormat = String(this.output_lora_format ?? "fal");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption,
      output_lora_format: outputLoraFormat
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/flux-2-trainer", args);
    return res as Record<string, unknown>;
  }
}

export class QwenImageEditPlusTrainer extends FalNode {
  static readonly nodeType = "fal.training.QwenImageEditPlusTrainer";
  static readonly title = "Qwen Image Edit Plus Trainer";
  static readonly description = `LoRA trainer for Qwen Image Edit Plus
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Number of steps to train for"
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to the input data zip archive.\n\n    The zip should contain pairs of images. The images should be named:\n\n    ROOT_start.EXT and ROOT_end.EXT\n    For example:\n    photo_start.jpg and photo_end.jpg\n\n    The zip can also contain more than one reference image for each image pair. The reference images should be named:\n    ROOT_start.EXT, ROOT_start2.EXT, ROOT_start3.EXT, ..., ROOT_end.EXT\n    For example:\n    photo_start.jpg, photo_start2.jpg, photo_end.jpg\n\n    The Reference Image Count field should be set to the number of reference images.\n\n    The zip can also contain a text file for each image pair. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.0001,
    description: "Learning rate for LoRA parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.0001);
    const defaultCaption = String(this.default_caption ?? "");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/qwen-image-edit-plus-trainer",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class QwenImageEditTrainer extends FalNode {
  static readonly nodeType = "fal.training.QwenImageEditTrainer";
  static readonly title = "Qwen Image Edit Trainer";
  static readonly description = `LoRA trainer for Qwen Image Edit
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "Number of steps to train for"
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n    URL to the input data zip archive.\n\n    The zip should contain pairs of images. The images should be named:\n\n    ROOT_start.EXT and ROOT_end.EXT\n    For example:\n    photo_start.jpg and photo_end.jpg\n\n    The zip can also contain a text file for each image pair. The text file should be named:\n    ROOT.txt\n    For example:\n    photo.txt\n\n    This text file can be used to specify the edit instructions for the image pair.\n\n    If no text file is provided, the default_caption will be used.\n\n    If no default_caption is provided, the training will fail.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.0001,
    description: "Learning rate for LoRA parameters."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use when caption files are missing. If None, missing captions will cause an error."
  })
  declare default_caption: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.0001);
    const defaultCaption = String(this.default_caption ?? "");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      default_caption: defaultCaption
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-image-edit-trainer", args);
    return res as Record<string, unknown>;
  }
}

export class QwenImageTrainer extends FalNode {
  static readonly nodeType = "fal.training.QwenImageTrainer";
  static readonly title = "Qwen Image Trainer";
  static readonly description = `Qwen Image LoRA training
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { lora_file: "str", config_file: "str" };

  @prop({
    type: "int",
    default: 1000,
    description: "Total number of training steps to perform. Default is 4000."
  })
  declare steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n        URL to zip archive with images for training. The archive should contain images and corresponding text files with captions.\n        Each text file should have the same name as the image file it corresponds to (e.g., image1.jpg and image1.txt).\n        If text files are missing for some images, you can provide a trigger_phrase to automatically create them.\n        Supported image formats: PNG, JPG, JPEG, WEBP.\n        Try to use at least 10 images, although more is better.\n    "
  })
  declare image_data: any;

  @prop({
    type: "float",
    default: 0.0005,
    description: "Learning rate for training. Default is 5e-4"
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Default caption to use for images that don't have corresponding text files. If provided, missing .txt files will be created automatically."
  })
  declare trigger_phrase: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const learningRate = Number(this.learning_rate ?? 0.0005);
    const triggerPhrase = String(this.trigger_phrase ?? "");

    const args: Record<string, unknown> = {
      steps: steps,
      learning_rate: learningRate,
      trigger_phrase: triggerPhrase
    };

    const imageDataRef = this.image_data as Record<string, unknown> | undefined;
    if (isRefSet(imageDataRef)) {
      const imageDataUrl =
        (await imageToDataUrl(imageDataRef!)) ??
        (await assetToFalUrl(apiKey, imageDataRef!));
      if (imageDataUrl) args["image_data_url"] = imageDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-image-trainer", args);
    return res as Record<string, unknown>;
  }
}

export class Wan22ImageTrainer extends FalNode {
  static readonly nodeType = "fal.training.Wan22ImageTrainer";
  static readonly title = "Wan22 Image Trainer";
  static readonly description = `Wan 2.2 text to image LoRA trainer. Fine-tune Wan 2.2 for subjects and styles with unprecedented detail.
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    high_noise_lora: "str",
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "str",
    default: "",
    description: "Trigger phrase for the model."
  })
  declare trigger_phrase: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use masks for the training data."
  })
  declare use_masks: any;

  @prop({
    type: "float",
    default: 0.0007,
    description: "Learning rate for training."
  })
  declare learning_rate: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to use face cropping for the training data. When enabled, images will be cropped to the face before resizing."
  })
  declare use_face_cropping: any;

  @prop({ type: "str", default: "", description: "URL to the training data." })
  declare training_data_url: any;

  @prop({
    type: "int",
    default: 1000,
    description: "Number of training steps."
  })
  declare steps: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to include synthetic captions."
  })
  declare include_synthetic_captions: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether the training data is style data. If true, face specific options like masking and face detection will be disabled."
  })
  declare is_style: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to use face detection for the training data. When enabled, images will use the center of the face as the center of the image when resizing."
  })
  declare use_face_detection: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const triggerPhrase = String(this.trigger_phrase ?? "");
    const useMasks = Boolean(this.use_masks ?? true);
    const learningRate = Number(this.learning_rate ?? 0.0007);
    const useFaceCropping = Boolean(this.use_face_cropping ?? false);
    const trainingDataUrl = String(this.training_data_url ?? "");
    const steps = Number(this.steps ?? 1000);
    const includeSyntheticCaptions = Boolean(
      this.include_synthetic_captions ?? false
    );
    const isStyle = Boolean(this.is_style ?? false);
    const useFaceDetection = Boolean(this.use_face_detection ?? true);

    const args: Record<string, unknown> = {
      trigger_phrase: triggerPhrase,
      use_masks: useMasks,
      learning_rate: learningRate,
      use_face_cropping: useFaceCropping,
      training_data_url: trainingDataUrl,
      steps: steps,
      include_synthetic_captions: includeSyntheticCaptions,
      is_style: isStyle,
      use_face_detection: useFaceDetection
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-22-image-trainer", args);
    return res as Record<string, unknown>;
  }
}

export class WanTrainerT2v extends FalNode {
  static readonly nodeType = "fal.training.WanTrainerT2v";
  static readonly title = "Wan Trainer T2v";
  static readonly description = `Train custom LoRAs for Wan-2.1 T2V 1.3B
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { lora_file: "str", config_file: "str" };

  @prop({
    type: "int",
    default: 400,
    description: "The number of steps to train for."
  })
  declare number_of_steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to zip archive with images of a consistent style. Try to use at least 10 images and/or videos, although more is better.\n\n        In addition to images the archive can contain text files with captions. Each text file should have the same name as the image/video file it corresponds to."
  })
  declare training_data_url: any;

  @prop({
    type: "str",
    default: "",
    description: "The phrase that will trigger the model to generate an image."
  })
  declare trigger_phrase: any;

  @prop({
    type: "float",
    default: 0.0002,
    description:
      "The rate at which the model learns. Higher values can lead to faster training, but over-fitting."
  })
  declare learning_rate: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the input will be automatically scale the video to 81 frames at 16fps."
  })
  declare auto_scale_input: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 400);
    const triggerPhrase = String(this.trigger_phrase ?? "");
    const learningRate = Number(this.learning_rate ?? 0.0002);
    const autoScaleInput = Boolean(this.auto_scale_input ?? false);

    const args: Record<string, unknown> = {
      number_of_steps: numberOfSteps,
      trigger_phrase: triggerPhrase,
      learning_rate: learningRate,
      auto_scale_input: autoScaleInput
    };

    const trainingDataUrlRef = this.training_data_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(trainingDataUrlRef)) {
      const trainingDataUrlUrl =
        (await imageToDataUrl(trainingDataUrlRef!)) ??
        (await assetToFalUrl(apiKey, trainingDataUrlRef!));
      if (trainingDataUrlUrl) args["training_data_url"] = trainingDataUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-trainer/t2v", args);
    return res as Record<string, unknown>;
  }
}

export class WanTrainerT2v14b extends FalNode {
  static readonly nodeType = "fal.training.WanTrainerT2v14b";
  static readonly title = "Wan Trainer T2v14b";
  static readonly description = `Train custom LoRAs for Wan-2.1 T2V 14B
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { lora_file: "str", config_file: "str" };

  @prop({
    type: "int",
    default: 400,
    description: "The number of steps to train for."
  })
  declare number_of_steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to zip archive with images of a consistent style. Try to use at least 10 images and/or videos, although more is better.\n\n        In addition to images the archive can contain text files with captions. Each text file should have the same name as the image/video file it corresponds to."
  })
  declare training_data_url: any;

  @prop({
    type: "str",
    default: "",
    description: "The phrase that will trigger the model to generate an image."
  })
  declare trigger_phrase: any;

  @prop({
    type: "float",
    default: 0.0002,
    description:
      "The rate at which the model learns. Higher values can lead to faster training, but over-fitting."
  })
  declare learning_rate: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the input will be automatically scale the video to 81 frames at 16fps."
  })
  declare auto_scale_input: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 400);
    const triggerPhrase = String(this.trigger_phrase ?? "");
    const learningRate = Number(this.learning_rate ?? 0.0002);
    const autoScaleInput = Boolean(this.auto_scale_input ?? false);

    const args: Record<string, unknown> = {
      number_of_steps: numberOfSteps,
      trigger_phrase: triggerPhrase,
      learning_rate: learningRate,
      auto_scale_input: autoScaleInput
    };

    const trainingDataUrlRef = this.training_data_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(trainingDataUrlRef)) {
      const trainingDataUrlUrl =
        (await imageToDataUrl(trainingDataUrlRef!)) ??
        (await assetToFalUrl(apiKey, trainingDataUrlRef!));
      if (trainingDataUrlUrl) args["training_data_url"] = trainingDataUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-trainer/t2v-14b", args);
    return res as Record<string, unknown>;
  }
}

export class WanTrainerI2v720p extends FalNode {
  static readonly nodeType = "fal.training.WanTrainerI2v720p";
  static readonly title = "Wan Trainer I2v720p";
  static readonly description = `Train custom LoRAs for Wan-2.1 I2V 720P
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { lora_file: "str", config_file: "str" };

  @prop({
    type: "int",
    default: 400,
    description: "The number of steps to train for."
  })
  declare number_of_steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to zip archive with images of a consistent style. Try to use at least 10 images and/or videos, although more is better.\n\n        In addition to images the archive can contain text files with captions. Each text file should have the same name as the image/video file it corresponds to."
  })
  declare training_data_url: any;

  @prop({
    type: "str",
    default: "",
    description: "The phrase that will trigger the model to generate an image."
  })
  declare trigger_phrase: any;

  @prop({
    type: "float",
    default: 0.0002,
    description:
      "The rate at which the model learns. Higher values can lead to faster training, but over-fitting."
  })
  declare learning_rate: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the input will be automatically scale the video to 81 frames at 16fps."
  })
  declare auto_scale_input: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 400);
    const triggerPhrase = String(this.trigger_phrase ?? "");
    const learningRate = Number(this.learning_rate ?? 0.0002);
    const autoScaleInput = Boolean(this.auto_scale_input ?? false);

    const args: Record<string, unknown> = {
      number_of_steps: numberOfSteps,
      trigger_phrase: triggerPhrase,
      learning_rate: learningRate,
      auto_scale_input: autoScaleInput
    };

    const trainingDataUrlRef = this.training_data_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(trainingDataUrlRef)) {
      const trainingDataUrlUrl =
        (await imageToDataUrl(trainingDataUrlRef!)) ??
        (await assetToFalUrl(apiKey, trainingDataUrlRef!));
      if (trainingDataUrlUrl) args["training_data_url"] = trainingDataUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-trainer/i2v-720p", args);
    return res as Record<string, unknown>;
  }
}

export class WanTrainerFlf2v720p extends FalNode {
  static readonly nodeType = "fal.training.WanTrainerFlf2v720p";
  static readonly title = "Wan Trainer Flf2v720p";
  static readonly description = `Train custom LoRAs for Wan-2.1 FLF2V 720P
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { lora_file: "str", config_file: "str" };

  @prop({
    type: "int",
    default: 400,
    description: "The number of steps to train for."
  })
  declare number_of_steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to zip archive with images of a consistent style. Try to use at least 10 images and/or videos, although more is better.\n\n        In addition to images the archive can contain text files with captions. Each text file should have the same name as the image/video file it corresponds to."
  })
  declare training_data_url: any;

  @prop({
    type: "str",
    default: "",
    description: "The phrase that will trigger the model to generate an image."
  })
  declare trigger_phrase: any;

  @prop({
    type: "float",
    default: 0.0002,
    description:
      "The rate at which the model learns. Higher values can lead to faster training, but over-fitting."
  })
  declare learning_rate: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the input will be automatically scale the video to 81 frames at 16fps."
  })
  declare auto_scale_input: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 400);
    const triggerPhrase = String(this.trigger_phrase ?? "");
    const learningRate = Number(this.learning_rate ?? 0.0002);
    const autoScaleInput = Boolean(this.auto_scale_input ?? false);

    const args: Record<string, unknown> = {
      number_of_steps: numberOfSteps,
      trigger_phrase: triggerPhrase,
      learning_rate: learningRate,
      auto_scale_input: autoScaleInput
    };

    const trainingDataUrlRef = this.training_data_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(trainingDataUrlRef)) {
      const trainingDataUrlUrl =
        (await imageToDataUrl(trainingDataUrlRef!)) ??
        (await assetToFalUrl(apiKey, trainingDataUrlRef!));
      if (trainingDataUrlUrl) args["training_data_url"] = trainingDataUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-trainer/flf2v-720p", args);
    return res as Record<string, unknown>;
  }
}

export class LtxVideoTrainer extends FalNode {
  static readonly nodeType = "fal.training.LtxVideoTrainer";
  static readonly title = "Ltx Video Trainer";
  static readonly description = `Train LTX Video 0.9.7 for custom styles and effects.
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    lora_file: "str",
    config_file: "str",
    video: "video"
  };

  @prop({
    type: "int",
    default: 1000,
    description: "The number of steps to train for."
  })
  declare number_of_steps: any;

  @prop({
    type: "int",
    default: 25,
    description: "The target frames per second for the video."
  })
  declare frame_rate: any;

  @prop({
    type: "list[Validation]",
    default: [],
    description:
      "A list of validation prompts to use during training. When providing an image, _all_ validation inputs must have an image."
  })
  declare validation: any;

  @prop({
    type: "float",
    default: 0.0002,
    description:
      "The rate at which the model learns. Higher values can lead to faster training, but over-fitting."
  })
  declare learning_rate: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the validation videos will be reversed. This is useful for effects that are learned in reverse and then applied in reverse."
  })
  declare validation_reverse: any;

  @prop({
    type: "int",
    default: 81,
    description:
      "The number of frames to use for training. This is the number of frames per second multiplied by the number of seconds."
  })
  declare number_of_frames: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to zip archive with videos or images. Try to use at least 10 files, although more is better.\n\n        **Supported video formats:** .mp4, .mov, .avi, .mkv\n        **Supported image formats:** .png, .jpg, .jpeg\n\n        Note: The dataset must contain ONLY videos OR ONLY images - mixed datasets are not supported.\n\n        The archive can also contain text files with captions. Each text file should have the same name as the media file it corresponds to."
  })
  declare training_data_url: any;

  @prop({
    type: "float",
    default: 30,
    description:
      "The duration threshold in seconds. If a video is longer than this, it will be split into scenes. If you provide captions for a split video, the caption will be applied to each scene. If you do not provide captions, scenes will be auto-captioned."
  })
  declare split_input_duration_threshold: any;

  @prop({
    type: "enum",
    default: 128,
    values: [8, 16, 32, 64, 128],
    description: "The rank of the LoRA."
  })
  declare rank: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["low", "medium", "high"],
    description:
      "The resolution to use for training. This is the resolution of the video."
  })
  declare resolution: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If true, videos above a certain duration threshold will be split into scenes. If you provide captions for a split video, the caption will be applied to each scene. If you do not provide captions, scenes will be auto-captioned. This option has no effect on image datasets."
  })
  declare split_input_into_scenes: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["16:9", "1:1", "9:16"],
    description:
      "The aspect ratio to use for training. This is the aspect ratio of the video."
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    description: "The phrase that will trigger the model to generate an image."
  })
  declare trigger_phrase: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high"],
    description: "The resolution to use for validation."
  })
  declare validation_resolution: any;

  @prop({
    type: "int",
    default: 81,
    description: "The number of frames to use for validation."
  })
  declare validation_number_of_frames: any;

  @prop({
    type: "enum",
    default: "1:1",
    values: ["16:9", "1:1", "9:16"],
    description: "The aspect ratio to use for validation."
  })
  declare validation_aspect_ratio: any;

  @prop({
    type: "str",
    default: "blurry, low quality, bad quality, out of focus",
    description: "A negative prompt to use for validation."
  })
  declare validation_negative_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, videos will be automatically scaled to the target frame count and fps. This option has no effect on image datasets."
  })
  declare auto_scale_input: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 1000);
    const frameRate = Number(this.frame_rate ?? 25);
    const validation = String(this.validation ?? []);
    const learningRate = Number(this.learning_rate ?? 0.0002);
    const validationReverse = Boolean(this.validation_reverse ?? false);
    const numberOfFrames = Number(this.number_of_frames ?? 81);
    const splitInputDurationThreshold = Number(
      this.split_input_duration_threshold ?? 30
    );
    const rank = String(this.rank ?? 128);
    const resolution = String(this.resolution ?? "medium");
    const splitInputIntoScenes = Boolean(this.split_input_into_scenes ?? true);
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const triggerPhrase = String(this.trigger_phrase ?? "");
    const validationResolution = String(this.validation_resolution ?? "high");
    const validationNumberOfFrames = Number(
      this.validation_number_of_frames ?? 81
    );
    const validationAspectRatio = String(this.validation_aspect_ratio ?? "1:1");
    const validationNegativePrompt = String(
      this.validation_negative_prompt ??
        "blurry, low quality, bad quality, out of focus"
    );
    const autoScaleInput = Boolean(this.auto_scale_input ?? false);

    const args: Record<string, unknown> = {
      number_of_steps: numberOfSteps,
      frame_rate: frameRate,
      validation: validation,
      learning_rate: learningRate,
      validation_reverse: validationReverse,
      number_of_frames: numberOfFrames,
      split_input_duration_threshold: splitInputDurationThreshold,
      rank: rank,
      resolution: resolution,
      split_input_into_scenes: splitInputIntoScenes,
      aspect_ratio: aspectRatio,
      trigger_phrase: triggerPhrase,
      validation_resolution: validationResolution,
      validation_number_of_frames: validationNumberOfFrames,
      validation_aspect_ratio: validationAspectRatio,
      validation_negative_prompt: validationNegativePrompt,
      auto_scale_input: autoScaleInput
    };

    const trainingDataUrlRef = this.training_data_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(trainingDataUrlRef)) {
      const trainingDataUrlUrl =
        (await imageToDataUrl(trainingDataUrlRef!)) ??
        (await assetToFalUrl(apiKey, trainingDataUrlRef!));
      if (trainingDataUrlUrl) args["training_data_url"] = trainingDataUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ltx-video-trainer", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class RecraftV3CreateStyle extends FalNode {
  static readonly nodeType = "fal.training.RecraftV3CreateStyle";
  static readonly title = "Recraft V3 Create Style";
  static readonly description = `Recraft V3 Create Style is capable of creating unique styles for Recraft V3 based on your images.
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({
    type: "image",
    default: "",
    description:
      "URL to zip archive with images, use PNG format. Maximum 5 images are allowed."
  })
  declare images_data: any;

  @prop({
    type: "enum",
    default: "digital_illustration",
    values: [
      "any",
      "realistic_image",
      "digital_illustration",
      "vector_illustration",
      "realistic_image/b_and_w",
      "realistic_image/hard_flash",
      "realistic_image/hdr",
      "realistic_image/natural_light",
      "realistic_image/studio_portrait",
      "realistic_image/enterprise",
      "realistic_image/motion_blur",
      "realistic_image/evening_light",
      "realistic_image/faded_nostalgia",
      "realistic_image/forest_life",
      "realistic_image/mystic_naturalism",
      "realistic_image/natural_tones",
      "realistic_image/organic_calm",
      "realistic_image/real_life_glow",
      "realistic_image/retro_realism",
      "realistic_image/retro_snapshot",
      "realistic_image/urban_drama",
      "realistic_image/village_realism",
      "realistic_image/warm_folk",
      "digital_illustration/pixel_art",
      "digital_illustration/hand_drawn",
      "digital_illustration/grain",
      "digital_illustration/infantile_sketch",
      "digital_illustration/2d_art_poster",
      "digital_illustration/handmade_3d",
      "digital_illustration/hand_drawn_outline",
      "digital_illustration/engraving_color",
      "digital_illustration/2d_art_poster_2",
      "digital_illustration/antiquarian",
      "digital_illustration/bold_fantasy",
      "digital_illustration/child_book",
      "digital_illustration/child_books",
      "digital_illustration/cover",
      "digital_illustration/crosshatch",
      "digital_illustration/digital_engraving",
      "digital_illustration/expressionism",
      "digital_illustration/freehand_details",
      "digital_illustration/grain_20",
      "digital_illustration/graphic_intensity",
      "digital_illustration/hard_comics",
      "digital_illustration/long_shadow",
      "digital_illustration/modern_folk",
      "digital_illustration/multicolor",
      "digital_illustration/neon_calm",
      "digital_illustration/noir",
      "digital_illustration/nostalgic_pastel",
      "digital_illustration/outline_details",
      "digital_illustration/pastel_gradient",
      "digital_illustration/pastel_sketch",
      "digital_illustration/pop_art",
      "digital_illustration/pop_renaissance",
      "digital_illustration/street_art",
      "digital_illustration/tablet_sketch",
      "digital_illustration/urban_glow",
      "digital_illustration/urban_sketching",
      "digital_illustration/vanilla_dreams",
      "digital_illustration/young_adult_book",
      "digital_illustration/young_adult_book_2",
      "vector_illustration/bold_stroke",
      "vector_illustration/chemistry",
      "vector_illustration/colored_stencil",
      "vector_illustration/contour_pop_art",
      "vector_illustration/cosmics",
      "vector_illustration/cutout",
      "vector_illustration/depressive",
      "vector_illustration/editorial",
      "vector_illustration/emotional_flat",
      "vector_illustration/infographical",
      "vector_illustration/marker_outline",
      "vector_illustration/mosaic",
      "vector_illustration/naivector",
      "vector_illustration/roundish_flat",
      "vector_illustration/segmented_colors",
      "vector_illustration/sharp_contrast",
      "vector_illustration/thin",
      "vector_illustration/vector_photo",
      "vector_illustration/vivid_shapes",
      "vector_illustration/engraving",
      "vector_illustration/line_art",
      "vector_illustration/line_circuit",
      "vector_illustration/linocut"
    ],
    description:
      "The base style of the generated images, this topic is covered above."
  })
  declare base_style: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const baseStyle = String(this.base_style ?? "digital_illustration");

    const args: Record<string, unknown> = {
      base_style: baseStyle
    };

    const imagesDataRef = this.images_data as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imagesDataRef)) {
      const imagesDataUrl =
        (await imageToDataUrl(imagesDataRef!)) ??
        (await assetToFalUrl(apiKey, imagesDataRef!));
      if (imagesDataUrl) args["images_data_url"] = imagesDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/recraft/v3/create-style", args);
    return { output: (res as any).output ?? "" };
  }
}

export class TurboFluxTrainer extends FalNode {
  static readonly nodeType = "fal.training.TurboFluxTrainer";
  static readonly title = "Turbo Flux Trainer";
  static readonly description = `A blazing fast FLUX dev LoRA trainer for subjects and styles.
flux, training, fine-tuning, lora, model-training, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "\n        URL to zip archive with images of a consistent style. Try to use at least 10 images, although more is better.\n        "
  })
  declare images_data: any;

  @prop({
    type: "int",
    default: 1000,
    description: "Number of steps to train the LoRA on."
  })
  declare steps: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Whether to try to detect the face and crop the images to the face."
  })
  declare face_crop: any;

  @prop({
    type: "float",
    default: 0.00115,
    description: "Learning rate for the training."
  })
  declare learning_rate: any;

  @prop({
    type: "str",
    default: "ohwx",
    description:
      "Trigger phrase to be used in the captions. If None, a trigger word will not be used.\n        If no captions are provide the trigger_work will be used instead of captions. If captions are provided, the trigger word will replace the '[trigger]' string in the captions.\n        "
  })
  declare trigger_phrase: any;

  @prop({
    type: "str",
    default: "subject",
    description: "Training style to use."
  })
  declare training_style: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const steps = Number(this.steps ?? 1000);
    const faceCrop = Boolean(this.face_crop ?? true);
    const learningRate = Number(this.learning_rate ?? 0.00115);
    const triggerPhrase = String(this.trigger_phrase ?? "ohwx");
    const trainingStyle = String(this.training_style ?? "subject");

    const args: Record<string, unknown> = {
      steps: steps,
      face_crop: faceCrop,
      learning_rate: learningRate,
      trigger_phrase: triggerPhrase,
      training_style: trainingStyle
    };

    const imagesDataRef = this.images_data as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imagesDataRef)) {
      const imagesDataUrl =
        (await imageToDataUrl(imagesDataRef!)) ??
        (await assetToFalUrl(apiKey, imagesDataRef!));
      if (imagesDataUrl) args["images_data_url"] = imagesDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/turbo-flux-trainer", args);
    return res as Record<string, unknown>;
  }
}

export class WanTrainer extends FalNode {
  static readonly nodeType = "fal.training.WanTrainer";
  static readonly title = "Wan Trainer";
  static readonly description = `Train custom LoRAs for Wan-2.1 I2V 480P
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { lora_file: "str", config_file: "str" };

  @prop({
    type: "int",
    default: 400,
    description: "The number of steps to train for."
  })
  declare number_of_steps: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL to zip archive with images of a consistent style. Try to use at least 10 images and/or videos, although more is better.\n\n        In addition to images the archive can contain text files with captions. Each text file should have the same name as the image/video file it corresponds to."
  })
  declare training_data_url: any;

  @prop({
    type: "str",
    default: "",
    description: "The phrase that will trigger the model to generate an image."
  })
  declare trigger_phrase: any;

  @prop({
    type: "float",
    default: 0.0002,
    description:
      "The rate at which the model learns. Higher values can lead to faster training, but over-fitting."
  })
  declare learning_rate: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If true, the input will be automatically scale the video to 81 frames at 16fps."
  })
  declare auto_scale_input: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numberOfSteps = Number(this.number_of_steps ?? 400);
    const triggerPhrase = String(this.trigger_phrase ?? "");
    const learningRate = Number(this.learning_rate ?? 0.0002);
    const autoScaleInput = Boolean(this.auto_scale_input ?? false);

    const args: Record<string, unknown> = {
      number_of_steps: numberOfSteps,
      trigger_phrase: triggerPhrase,
      learning_rate: learningRate,
      auto_scale_input: autoScaleInput
    };

    const trainingDataUrlRef = this.training_data_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(trainingDataUrlRef)) {
      const trainingDataUrlUrl =
        (await imageToDataUrl(trainingDataUrlRef!)) ??
        (await assetToFalUrl(apiKey, trainingDataUrlRef!));
      if (trainingDataUrlUrl) args["training_data_url"] = trainingDataUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/wan-trainer", args);
    return res as Record<string, unknown>;
  }
}

export class HunyuanVideoLoraTraining extends FalNode {
  static readonly nodeType = "fal.training.HunyuanVideoLoraTraining";
  static readonly title = "Hunyuan Video Lora Training";
  static readonly description = `Train Hunyuan Video lora on people, objects, characters and more!
training, fine-tuning, lora, model-training`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    config_file: "str",
    diffusers_lora_file: "str"
  };

  @prop({ type: "str", default: "", description: "The trigger word to use." })
  declare trigger_word: any;

  @prop({
    type: "image",
    default: "",
    description:
      "\n        URL to zip archive with images. Try to use at least 4 images in general the more the better.\n\n        In addition to images the archive can contain text files with captions. Each text file should have the same name as the image file it corresponds to.\n    "
  })
  declare images_data: any;

  @prop({
    type: "int",
    default: 0,
    description: "Number of steps to train the LoRA on."
  })
  declare steps: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The format of the archive. If not specified, the format will be inferred from the URL."
  })
  declare data_archive_format: any;

  @prop({
    type: "float",
    default: 0.0001,
    description: "Learning rate to use for training."
  })
  declare learning_rate: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to generate captions for the images."
  })
  declare do_caption: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const triggerWord = String(this.trigger_word ?? "");
    const steps = Number(this.steps ?? 0);
    const dataArchiveFormat = String(this.data_archive_format ?? "");
    const learningRate = Number(this.learning_rate ?? 0.0001);
    const doCaption = Boolean(this.do_caption ?? true);

    const args: Record<string, unknown> = {
      trigger_word: triggerWord,
      steps: steps,
      data_archive_format: dataArchiveFormat,
      learning_rate: learningRate,
      do_caption: doCaption
    };

    const imagesDataRef = this.images_data as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imagesDataRef)) {
      const imagesDataUrl =
        (await imageToDataUrl(imagesDataRef!)) ??
        (await assetToFalUrl(apiKey, imagesDataRef!));
      if (imagesDataUrl) args["images_data_url"] = imagesDataUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/hunyuan-video-lora-training",
      args
    );
    return res as Record<string, unknown>;
  }
}

export const FAL_TRAINING_NODES: readonly NodeClass[] = [
  ZImageBaseTrainer,
  ZImageTurboTrainerV2,
  Flux2Klein9BBaseTrainerEdit,
  Flux2Klein9BBaseTrainer,
  Flux2Klein4BBaseTrainer,
  Flux2Klein4BBaseTrainerEdit,
  QwenImage2512TrainerV2,
  Flux2TrainerV2Edit,
  Flux2TrainerV2,
  Ltx2VideoTrainer,
  QwenImage2512Trainer,
  QwenImageEdit2511Trainer,
  QwenImageLayeredTrainer,
  QwenImageEdit2509Trainer,
  ZImageTrainer,
  Flux2TrainerEdit,
  Flux2Trainer,
  QwenImageEditPlusTrainer,
  QwenImageEditTrainer,
  QwenImageTrainer,
  Wan22ImageTrainer,
  WanTrainerT2v,
  WanTrainerT2v14b,
  WanTrainerI2v720p,
  WanTrainerFlf2v720p,
  LtxVideoTrainer,
  RecraftV3CreateStyle,
  TurboFluxTrainer,
  WanTrainer,
  HunyuanVideoLoraTraining
] as const;
