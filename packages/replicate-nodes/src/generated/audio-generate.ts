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

export class RealisticVoiceCloning extends ReplicateNode {
  static readonly nodeType = "replicate.audio.generate.RealisticVoiceCloning";
  static readonly title = "Realistic Voice Cloning";
  static readonly description = `Create song covers with any RVC v2 trained AI voice from audio files.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 0,
    description: "Control volume of backup AI vocals."
  })
  declare backup_vocals_volume_change: any;

  @prop({
    type: "int",
    default: 128,
    description:
      "When 'pitch_detection_algo' is set to 'mangio-crepe', this controls how often it checks for pitch changes in milliseconds. Lower values lead to longer conversions and higher risk of voice cracks, but better pitch accuracy."
  })
  declare crepe_hop_length: any;

  @prop({
    type: "str",
    default: "",
    description:
      "URL to download a custom RVC model. If provided, the model will be downloaded (if it doesn't already exist) and used for prediction, regardless of the 'rvc_model' value."
  })
  declare custom_rvc_model_download_url: any;

  @prop({
    type: "int",
    default: 3,
    description:
      "If >=3: apply median filtering median filtering to the harvested pitch results."
  })
  declare filter_radius: any;

  @prop({
    type: "float",
    default: 0.5,
    description: "Control how much of the AI's accent to leave in the vocals."
  })
  declare index_rate: any;

  @prop({
    type: "float",
    default: 0,
    description: "Control volume of the background music/instrumentals."
  })
  declare instrumental_volume_change: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Control volume of main AI vocals. Use -3 to decrease the volume by 3 decibels, or 3 to increase the volume by 3 decibels."
  })
  declare main_vocals_volume_change: any;

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "wav"],
    description:
      "wav for best quality and large file size, mp3 for decent quality and small file size."
  })
  declare output_format: any;

  @prop({
    type: "enum",
    default: "no-change",
    values: ["no-change", "male-to-female", "female-to-male"],
    description:
      "Adjust pitch of AI vocals. Options: 'no-change', 'male-to-female', 'female-to-male'."
  })
  declare pitch_change: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Change pitch/key of background music, backup vocals and AI vocals in semitones. Reduces sound quality slightly."
  })
  declare pitch_change_all: any;

  @prop({
    type: "enum",
    default: "rmvpe",
    values: ["rmvpe", "mangio-crepe"],
    description:
      "Best option is rmvpe (clarity in vocals), then mangio-crepe (smoother vocals)."
  })
  declare pitch_detection_algorithm: any;

  @prop({
    type: "float",
    default: 0.33,
    description:
      "Control how much of the original vocals' breath and voiceless consonants to leave in the AI vocals. Set 0.5 to disable."
  })
  declare protect: any;

  @prop({
    type: "float",
    default: 0.7,
    description: "Absorption of high frequencies in the reverb."
  })
  declare reverb_damping: any;

  @prop({
    type: "float",
    default: 0.8,
    description: "Level of AI vocals without reverb."
  })
  declare reverb_dryness: any;

  @prop({
    type: "float",
    default: 0.15,
    description: "The larger the room, the longer the reverb time."
  })
  declare reverb_size: any;

  @prop({
    type: "float",
    default: 0.2,
    description: "Level of AI vocals with reverb."
  })
  declare reverb_wetness: any;

  @prop({
    type: "float",
    default: 0.25,
    description:
      "Control how much to use the original vocal's loudness (0) or a fixed loudness (1)."
  })
  declare rms_mix_rate: any;

  @prop({
    type: "enum",
    default: "Squidward",
    values: [
      "Squidward",
      "MrKrabs",
      "Plankton",
      "Drake",
      "Vader",
      "Trump",
      "Biden",
      "Obama",
      "Guitar",
      "Voilin",
      "CUSTOM"
    ],
    description:
      "RVC model for a specific voice. If using a custom model, this should match the name of the downloaded model. If a 'custom_rvc_model_download_url' is provided, this will be automatically set to the name of the downloaded model."
  })
  declare rvc_model: any;

  @prop({
    type: "audio",
    default: "",
    description: "Upload your audio file here."
  })
  declare song_input: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const backupVocalsVolumeChange = Number(
      this.backup_vocals_volume_change ?? 0
    );
    const crepeHopLength = Number(this.crepe_hop_length ?? 128);
    const customRvcModelDownloadUrl = String(
      this.custom_rvc_model_download_url ?? ""
    );
    const filterRadius = Number(this.filter_radius ?? 3);
    const indexRate = Number(this.index_rate ?? 0.5);
    const instrumentalVolumeChange = Number(
      this.instrumental_volume_change ?? 0
    );
    const mainVocalsVolumeChange = Number(this.main_vocals_volume_change ?? 0);
    const outputFormat = String(this.output_format ?? "mp3");
    const pitchChange = String(this.pitch_change ?? "no-change");
    const pitchChangeAll = Number(this.pitch_change_all ?? 0);
    const pitchDetectionAlgorithm = String(
      this.pitch_detection_algorithm ?? "rmvpe"
    );
    const protect = Number(this.protect ?? 0.33);
    const reverbDamping = Number(this.reverb_damping ?? 0.7);
    const reverbDryness = Number(this.reverb_dryness ?? 0.8);
    const reverbSize = Number(this.reverb_size ?? 0.15);
    const reverbWetness = Number(this.reverb_wetness ?? 0.2);
    const rmsMixRate = Number(this.rms_mix_rate ?? 0.25);
    const rvcModel = String(this.rvc_model ?? "Squidward");

    const args: Record<string, unknown> = {
      backup_vocals_volume_change: backupVocalsVolumeChange,
      crepe_hop_length: crepeHopLength,
      custom_rvc_model_download_url: customRvcModelDownloadUrl,
      filter_radius: filterRadius,
      index_rate: indexRate,
      instrumental_volume_change: instrumentalVolumeChange,
      main_vocals_volume_change: mainVocalsVolumeChange,
      output_format: outputFormat,
      pitch_change: pitchChange,
      pitch_change_all: pitchChangeAll,
      pitch_detection_algorithm: pitchDetectionAlgorithm,
      protect: protect,
      reverb_damping: reverbDamping,
      reverb_dryness: reverbDryness,
      reverb_size: reverbSize,
      reverb_wetness: reverbWetness,
      rms_mix_rate: rmsMixRate,
      rvc_model: rvcModel
    };

    const songInputRef = this.song_input as Record<string, unknown> | undefined;
    if (isRefSet(songInputRef)) {
      const songInputUrl = await assetToUrl(songInputRef!, apiKey);
      if (songInputUrl) args["song_input"] = songInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/realistic-voice-cloning:0a9c7c558af4c0f20667c1bd1260ce32a2879944a0b9e44e1398660c077b1550",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class TortoiseTTS extends ReplicateNode {
  static readonly nodeType = "replicate.audio.generate.TortoiseTTS";
  static readonly title = "Tortoise T T S";
  static readonly description = `Generate speech from text, clone voices from mp3 files. From James Betker AKA "neonbjb".
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "(Optional) Create a custom voice based on an mp3 file of a speaker. Audio should be at least 15 seconds, only contain one speaker, and be in mp3 format. Overrides the 'voice_a' input."
  })
  declare custom_voice: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "How much the CVVP model should influence the output. Increasing this can in some cases reduce the likelyhood of multiple speakers. Defaults to 0 (disabled)"
  })
  declare cvvp_amount: any;

  @prop({
    type: "enum",
    default: "fast",
    values: ["ultra_fast", "fast", "standard", "high_quality"],
    description:
      "Which voice preset to use. See the documentation for more information."
  })
  declare preset: any;

  @prop({
    type: "int",
    default: 0,
    description: "Random seed which can be used to reproduce results."
  })
  declare seed: any;

  @prop({
    type: "str",
    default:
      "The expressiveness of autoregressive transformers is literally nuts! I absolutely adore them.",
    description: "Text to speak."
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "random",
    values: [
      "angie",
      "cond_latent_example",
      "deniro",
      "freeman",
      "halle",
      "lj",
      "myself",
      "pat2",
      "snakes",
      "tom",
      "train_daws",
      "train_dreams",
      "train_grace",
      "train_lescault",
      "weaver",
      "applejack",
      "daniel",
      "emma",
      "geralt",
      "jlaw",
      "mol",
      "pat",
      "rainbow",
      "tim_reynolds",
      "train_atkins",
      "train_dotrice",
      "train_empire",
      "train_kennard",
      "train_mouse",
      "william",
      "random",
      "custom_voice",
      "disabled"
    ],
    description:
      "Selects the voice to use for generation. Use 'random' to select a random voice. Use 'custom_voice' to use a custom voice."
  })
  declare voice_a: any;

  @prop({
    type: "enum",
    default: "disabled",
    values: [
      "angie",
      "cond_latent_example",
      "deniro",
      "freeman",
      "halle",
      "lj",
      "myself",
      "pat2",
      "snakes",
      "tom",
      "train_daws",
      "train_dreams",
      "train_grace",
      "train_lescault",
      "weaver",
      "applejack",
      "daniel",
      "emma",
      "geralt",
      "jlaw",
      "mol",
      "pat",
      "rainbow",
      "tim_reynolds",
      "train_atkins",
      "train_dotrice",
      "train_empire",
      "train_kennard",
      "train_mouse",
      "william",
      "random",
      "custom_voice",
      "disabled"
    ],
    description:
      "(Optional) Create new voice from averaging the latents for 'voice_a', 'voice_b' and 'voice_c'. Use 'disabled' to disable voice mixing."
  })
  declare voice_b: any;

  @prop({
    type: "enum",
    default: "disabled",
    values: [
      "angie",
      "cond_latent_example",
      "deniro",
      "freeman",
      "halle",
      "lj",
      "myself",
      "pat2",
      "snakes",
      "tom",
      "train_daws",
      "train_dreams",
      "train_grace",
      "train_lescault",
      "weaver",
      "applejack",
      "daniel",
      "emma",
      "geralt",
      "jlaw",
      "mol",
      "pat",
      "rainbow",
      "tim_reynolds",
      "train_atkins",
      "train_dotrice",
      "train_empire",
      "train_kennard",
      "train_mouse",
      "william",
      "random",
      "custom_voice",
      "disabled"
    ],
    description:
      "(Optional) Create new voice from averaging the latents for 'voice_a', 'voice_b' and 'voice_c'. Use 'disabled' to disable voice mixing."
  })
  declare voice_c: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cvvpAmount = Number(this.cvvp_amount ?? 0);
    const preset = String(this.preset ?? "fast");
    const seed = Number(this.seed ?? 0);
    const text = String(
      this.text ??
        "The expressiveness of autoregressive transformers is literally nuts! I absolutely adore them."
    );
    const voiceA = String(this.voice_a ?? "random");
    const voiceB = String(this.voice_b ?? "disabled");
    const voiceC = String(this.voice_c ?? "disabled");

    const args: Record<string, unknown> = {
      cvvp_amount: cvvpAmount,
      preset: preset,
      seed: seed,
      text: text,
      voice_a: voiceA,
      voice_b: voiceB,
      voice_c: voiceC
    };

    const customVoiceRef = this.custom_voice as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(customVoiceRef)) {
      const customVoiceUrl = await assetToUrl(customVoiceRef!, apiKey);
      if (customVoiceUrl) args["custom_voice"] = customVoiceUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "afiaka87/tortoise-tts:e9658de4b325863c4fcdc12d94bb7c9b54cbfe351b7ca1b36860008172b91c71",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class StyleTTS2 extends ReplicateNode {
  static readonly nodeType = "replicate.audio.generate.StyleTTS2";
  static readonly title = "Style T T S2";
  static readonly description = `Generates speech from text
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 0.3,
    description:
      "Only used for long text inputs or in case of reference speaker,             determines the timbre of the speaker. Use lower values to sample style based             on previous or reference speech instead of text."
  })
  declare alpha: any;

  @prop({
    type: "float",
    default: 0.7,
    description:
      "Only used for long text inputs or in case of reference speaker,             determines the prosody of the speaker. Use lower values to sample style based             on previous or reference speech instead of text."
  })
  declare beta: any;

  @prop({ type: "int", default: 10, description: "Number of diffusion steps" })
  declare diffusion_steps: any;

  @prop({
    type: "float",
    default: 1,
    description: "Embedding scale, use higher values for pronounced emotion"
  })
  declare embedding_scale: any;

  @prop({
    type: "audio",
    default: "",
    description: "Reference speech to copy style from"
  })
  declare reference: any;

  @prop({ type: "int", default: 0, description: "Seed for reproducibility" })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Text to convert to speech" })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Replicate weights url for inference with model that is fine-tuned on new speakers.            If provided, a reference speech must also be provided.             If not provided, the default model will be used."
  })
  declare weights: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const alpha = Number(this.alpha ?? 0.3);
    const beta = Number(this.beta ?? 0.7);
    const diffusionSteps = Number(this.diffusion_steps ?? 10);
    const embeddingScale = Number(this.embedding_scale ?? 1);
    const seed = Number(this.seed ?? 0);
    const text = String(this.text ?? "");
    const weights = String(this.weights ?? "");

    const args: Record<string, unknown> = {
      alpha: alpha,
      beta: beta,
      diffusion_steps: diffusionSteps,
      embedding_scale: embeddingScale,
      seed: seed,
      text: text,
      weights: weights
    };

    const referenceRef = this.reference as Record<string, unknown> | undefined;
    if (isRefSet(referenceRef)) {
      const referenceUrl = await assetToUrl(referenceRef!, apiKey);
      if (referenceUrl) args["reference"] = referenceUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "adirik/styletts2:989cb5ea6d2401314eb30685740cb9f6fd1c9001b8940659b406f952837ab5ac",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Riffusion extends ReplicateNode {
  static readonly nodeType = "replicate.audio.generate.Riffusion";
  static readonly title = "Riffusion";
  static readonly description = `Stable diffusion for real-time music generation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Interpolation alpha if using two prompts. A value of 0 uses prompt_a fully, a value of 1 uses prompt_b fully"
  })
  declare alpha: any;

  @prop({
    type: "float",
    default: 0.75,
    description: "How much to transform input spectrogram"
  })
  declare denoising: any;

  @prop({
    type: "int",
    default: 50,
    description: "Number of steps to run the diffusion model"
  })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "funky synth solo",
    description: "The prompt for your audio"
  })
  declare prompt_a: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The second prompt to interpolate with the first, leave blank if no interpolation"
  })
  declare prompt_b: any;

  @prop({
    type: "enum",
    default: "vibes",
    values: [
      "agile",
      "marim",
      "mask_beat_lines_80",
      "mask_gradient_dark",
      "mask_gradient_top_70",
      "mask_graident_top_fifth_75",
      "mask_top_third_75",
      "mask_top_third_95",
      "motorway",
      "og_beat",
      "vibes"
    ],
    description: "Seed spectrogram to use"
  })
  declare seed_image_id: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const alpha = Number(this.alpha ?? 0.5);
    const denoising = Number(this.denoising ?? 0.75);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const promptA = String(this.prompt_a ?? "funky synth solo");
    const promptB = String(this.prompt_b ?? "");
    const seedImageId = String(this.seed_image_id ?? "vibes");

    const args: Record<string, unknown> = {
      alpha: alpha,
      denoising: denoising,
      num_inference_steps: numInferenceSteps,
      prompt_a: promptA,
      prompt_b: promptB,
      seed_image_id: seedImageId
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "riffusion/riffusion:8cf61ea6c56afd61d8f5b9ffd14d7c216c0a93844ce2d82ac1c9ecc9c7f24e05",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class MusicGen extends ReplicateNode {
  static readonly nodeType = "replicate.audio.generate.MusicGen";
  static readonly title = "Music Gen";
  static readonly description = `Generate music from a prompt or melody
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "int",
    default: 3,
    description:
      "Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs."
  })
  declare classifier_free_guidance: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', generated music will continue from 'input_audio'. Otherwise, generated music will mimic 'input_audio''s melody."
  })
  declare continuation: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "End time of the audio file to use for continuation. If -1 or None, will default to the end of the audio clip."
  })
  declare continuation_end: any;

  @prop({
    type: "int",
    default: 0,
    description: "Start time of the audio file to use for continuation."
  })
  declare continuation_start: any;

  @prop({
    type: "int",
    default: 8,
    description: "Duration of the generated audio in seconds."
  })
  declare duration: any;

  @prop({
    type: "audio",
    default: "",
    description:
      "An audio file that will influence the generated music. If 'continuation' is 'True', the generated music will be a continuation of the audio file. Otherwise, the generated music will mimic the audio file's melody."
  })
  declare input_audio: any;

  @prop({
    type: "enum",
    default: "stereo-melody-large",
    values: ["stereo-melody-large", "stereo-large", "melody-large", "large"],
    description: "Model to use for generation"
  })
  declare model_version: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "If 'True', the EnCodec tokens will be decoded with MultiBand Diffusion. Only works with non-stereo models."
  })
  declare multi_band_diffusion: any;

  @prop({
    type: "enum",
    default: "loudness",
    values: ["loudness", "clip", "peak", "rms"],
    description: "Strategy for normalizing audio."
  })
  declare normalization_strategy: any;

  @prop({
    type: "enum",
    default: "wav",
    values: ["wav", "mp3"],
    description: "Output format for generated audio."
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description: "A description of the music you want to generate."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description:
      "Seed for random number generator. If None or -1, a random seed will be used."
  })
  declare seed: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity."
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 250,
    description: "Reduces sampling to the k most likely tokens."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Reduces sampling to tokens with cumulative probability of p. When set to  '0' (default), top_k sampling is used."
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const classifierFreeGuidance = Number(this.classifier_free_guidance ?? 3);
    const continuation = Boolean(this.continuation ?? false);
    const continuationEnd = Number(this.continuation_end ?? 0);
    const continuationStart = Number(this.continuation_start ?? 0);
    const duration = Number(this.duration ?? 8);
    const modelVersion = String(this.model_version ?? "stereo-melody-large");
    const multiBandDiffusion = Boolean(this.multi_band_diffusion ?? false);
    const normalizationStrategy = String(
      this.normalization_strategy ?? "loudness"
    );
    const outputFormat = String(this.output_format ?? "wav");
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const temperature = Number(this.temperature ?? 1);
    const topK = Number(this.top_k ?? 250);
    const topP = Number(this.top_p ?? 0);

    const args: Record<string, unknown> = {
      classifier_free_guidance: classifierFreeGuidance,
      continuation: continuation,
      continuation_end: continuationEnd,
      continuation_start: continuationStart,
      duration: duration,
      model_version: modelVersion,
      multi_band_diffusion: multiBandDiffusion,
      normalization_strategy: normalizationStrategy,
      output_format: outputFormat,
      prompt: prompt,
      seed: seed,
      temperature: temperature,
      top_k: topK,
      top_p: topP
    };

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
      "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class MMAudio extends ReplicateNode {
  static readonly nodeType = "replicate.audio.generate.MMAudio";
  static readonly title = "M M Audio";
  static readonly description = `Add sound to video using the MMAudio V2 model. An advanced AI model that synthesizes high-quality audio from video content, enabling seamless video-to-audio transformation.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({ type: "float", default: 4.5, description: "Guidance strength (CFG)" })
  declare cfg_strength: any;

  @prop({
    type: "float",
    default: 8,
    description: "Duration of output in seconds"
  })
  declare duration: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional image file for image-to-audio generation (experimental)"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "music",
    description: "Negative prompt to avoid certain sounds"
  })
  declare negative_prompt: any;

  @prop({ type: "int", default: 25, description: "Number of inference steps" })
  declare num_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for generated audio"
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Use -1 or leave blank to randomize the seed"
  })
  declare seed: any;

  @prop({
    type: "video",
    default: "",
    description: "Optional video file for video-to-audio generation"
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const cfgStrength = Number(this.cfg_strength ?? 4.5);
    const duration = Number(this.duration ?? 8);
    const negativePrompt = String(this.negative_prompt ?? "music");
    const numSteps = Number(this.num_steps ?? 25);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      cfg_strength: cfgStrength,
      duration: duration,
      negative_prompt: negativePrompt,
      num_steps: numSteps,
      prompt: prompt,
      seed: seed
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
      "zsxkib/mmaudio:62871fb59889b2d7c13777f08deb3b36bdff88f7e1d53a50ad7694548a41b484",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Lyria_2 extends ReplicateNode {
  static readonly nodeType = "replicate.audio.generate.Lyria_2";
  static readonly title = "Lyria_2";
  static readonly description = `Lyria 2 is a music generation model that produces 48kHz stereo audio through text-based prompts
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "str",
    default: "",
    description: "Description of what to exclude from the generated audio"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "Text prompt for audio generation"
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
    const negativePrompt = String(this.negative_prompt ?? "");
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      negative_prompt: negativePrompt,
      prompt: prompt,
      seed: seed
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/lyria-2:bb621623ee2772c96d300b2a303c9e444b482f6b0fafcc7424923e1429971120",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export class Speech_2_8_HD extends ReplicateNode {
  static readonly nodeType = "replicate.audio.generate.Speech_2_8_HD";
  static readonly title = "Speech_2_8_ H D";
  static readonly description = `Minimax Speech 2.8 HD focuses on high-fidelity audio generation with features like studio-grade quality, flexible emotion control, multilingual support, and voice cloning capabilities
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "wav", "flac", "pcm"],
    description:
      "File format for the generated audio. Choose mp3 for general use, wav/flac for lossless, or pcm for raw bytes."
  })
  declare audio_format: any;

  @prop({
    type: "enum",
    default: 128000,
    values: ["32000", "64000", "128000", "256000"],
    description:
      "MP3 bitrate in bits per second. Only used when audio_format is mp3."
  })
  declare bitrate: any;

  @prop({
    type: "enum",
    default: "mono",
    values: ["mono", "stereo"],
    description: "mono for 1 channel (default), stereo for 2 channels."
  })
  declare channel: any;

  @prop({
    type: "enum",
    default: "auto",
    values: [
      "auto",
      "happy",
      "sad",
      "angry",
      "fearful",
      "disgusted",
      "surprised",
      "calm",
      "fluent",
      "neutral"
    ],
    description:
      "Desired delivery style. Use auto to let MiniMax choose, or pick a specific emotion."
  })
  declare emotion: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Improve number/date reading for English text (adds a small amount of latency)."
  })
  declare english_normalization: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Automatic",
      "Chinese",
      "Chinese,Yue",
      "Cantonese",
      "English",
      "Arabic",
      "Russian",
      "Spanish",
      "French",
      "Portuguese",
      "German",
      "Turkish",
      "Dutch",
      "Ukrainian",
      "Vietnamese",
      "Indonesian",
      "Japanese",
      "Italian",
      "Korean",
      "Thai",
      "Polish",
      "Romanian",
      "Greek",
      "Czech",
      "Finnish",
      "Hindi",
      "Bulgarian",
      "Danish",
      "Hebrew",
      "Malay",
      "Persian",
      "Slovak",
      "Swedish",
      "Croatian",
      "Filipino",
      "Hungarian",
      "Norwegian",
      "Slovenian",
      "Catalan",
      "Nynorsk",
      "Tamil",
      "Afrikaans"
    ],
    description:
      "Optional language hint. Choose Automatic to let MiniMax detect the language, or pick a specific locale."
  })
  declare language_boost: any;

  @prop({
    type: "int",
    default: 0,
    description: "Semitone offset applied to the voice (−12 to +12)."
  })
  declare pitch: any;

  @prop({
    type: "enum",
    default: 32000,
    values: ["8000", "16000", "22050", "24000", "32000", "44100"],
    description: "Audio sample rate in Hz."
  })
  declare sample_rate: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Speech speed multiplier (0.5–2.0). Lower is slower, higher is faster."
  })
  declare speed: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Return MiniMax subtitle metadata with sentence timestamps (non-streaming only)."
  })
  declare subtitle_enable: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text to narrate (max 10,000 characters). Use markers like <#0.5#> to insert pauses in seconds."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "Wise_Woman",
    description:
      "Voice to synthesize. Pick any MiniMax system voice or a voice_id returned by https://replicate.com/minimax/voice-cloning."
  })
  declare voice_id: any;

  @prop({
    type: "float",
    default: 1,
    description: "Relative loudness. 1.0 is default MiniMax gain. Range 0–10."
  })
  declare volume: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const audioFormat = String(this.audio_format ?? "mp3");
    const bitrate = String(this.bitrate ?? 128000);
    const channel = String(this.channel ?? "mono");
    const emotion = String(this.emotion ?? "auto");
    const englishNormalization = Boolean(this.english_normalization ?? false);
    const languageBoost = String(this.language_boost ?? "None");
    const pitch = Number(this.pitch ?? 0);
    const sampleRate = String(this.sample_rate ?? 32000);
    const speed = Number(this.speed ?? 1);
    const subtitleEnable = Boolean(this.subtitle_enable ?? false);
    const text = String(this.text ?? "");
    const voiceId = String(this.voice_id ?? "Wise_Woman");
    const volume = Number(this.volume ?? 1);

    const args: Record<string, unknown> = {
      audio_format: audioFormat,
      bitrate: bitrate,
      channel: channel,
      emotion: emotion,
      english_normalization: englishNormalization,
      language_boost: languageBoost,
      pitch: pitch,
      sample_rate: sampleRate,
      speed: speed,
      subtitle_enable: subtitleEnable,
      text: text,
      voice_id: voiceId,
      volume: volume
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "minimax/speech-2.8-hd:bb4b16034cd66abe0d3147d50a63890e0144328136ca082f3f141f42ed0d4be9",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export const REPLICATE_AUDIO_GENERATE_NODES: readonly NodeClass[] = [
  RealisticVoiceCloning,
  TortoiseTTS,
  StyleTTS2,
  Riffusion,
  MusicGen,
  MMAudio,
  Lyria_2,
  Speech_2_8_HD
] as const;
