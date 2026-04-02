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

export class Trellis extends ReplicateNode {
  static readonly nodeType = "replicate.image.3d.Trellis";
  static readonly title = "Trellis";
  static readonly description = `A powerful 3D asset generation model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "bool",
    default: true,
    description: "Generate color video render"
  })
  declare generate_color: any;

  @prop({
    type: "bool",
    default: false,
    description: "Generate 3D model file (GLB)"
  })
  declare generate_model: any;

  @prop({
    type: "bool",
    default: false,
    description: "Generate normal video render"
  })
  declare generate_normal: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "List of input images to generate 3D asset from"
  })
  declare images: any;

  @prop({
    type: "float",
    default: 0.95,
    description:
      "GLB Extraction - Mesh Simplification (only used if generate_model=True)"
  })
  declare mesh_simplify: any;

  @prop({ type: "bool", default: true, description: "Randomize seed" })
  declare randomize_seed: any;

  @prop({
    type: "bool",
    default: false,
    description: "Return the preprocessed images without background"
  })
  declare return_no_background: any;

  @prop({
    type: "bool",
    default: false,
    description: "Save Gaussian point cloud as PLY file"
  })
  declare save_gaussian_ply: any;

  @prop({ type: "int", default: 0, description: "Random seed for generation" })
  declare seed: any;

  @prop({
    type: "float",
    default: 3,
    description: "Stage 2: Structured Latent Generation - Guidance Strength"
  })
  declare slat_guidance_strength: any;

  @prop({
    type: "int",
    default: 12,
    description: "Stage 2: Structured Latent Generation - Sampling Steps"
  })
  declare slat_sampling_steps: any;

  @prop({
    type: "float",
    default: 7.5,
    description: "Stage 1: Sparse Structure Generation - Guidance Strength"
  })
  declare ss_guidance_strength: any;

  @prop({
    type: "int",
    default: 12,
    description: "Stage 1: Sparse Structure Generation - Sampling Steps"
  })
  declare ss_sampling_steps: any;

  @prop({
    type: "int",
    default: 1024,
    description:
      "GLB Extraction - Texture Size (only used if generate_model=True)"
  })
  declare texture_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const generateColor = Boolean(this.generate_color ?? true);
    const generateModel = Boolean(this.generate_model ?? false);
    const generateNormal = Boolean(this.generate_normal ?? false);
    const meshSimplify = Number(this.mesh_simplify ?? 0.95);
    const randomizeSeed = Boolean(this.randomize_seed ?? true);
    const returnNoBackground = Boolean(this.return_no_background ?? false);
    const saveGaussianPly = Boolean(this.save_gaussian_ply ?? false);
    const seed = Number(this.seed ?? 0);
    const slatGuidanceStrength = Number(this.slat_guidance_strength ?? 3);
    const slatSamplingSteps = Number(this.slat_sampling_steps ?? 12);
    const ssGuidanceStrength = Number(this.ss_guidance_strength ?? 7.5);
    const ssSamplingSteps = Number(this.ss_sampling_steps ?? 12);
    const textureSize = Number(this.texture_size ?? 1024);

    const args: Record<string, unknown> = {
      generate_color: generateColor,
      generate_model: generateModel,
      generate_normal: generateNormal,
      mesh_simplify: meshSimplify,
      randomize_seed: randomizeSeed,
      return_no_background: returnNoBackground,
      save_gaussian_ply: saveGaussianPly,
      seed: seed,
      slat_guidance_strength: slatGuidanceStrength,
      slat_sampling_steps: slatSamplingSteps,
      ss_guidance_strength: ssGuidanceStrength,
      ss_sampling_steps: ssSamplingSteps,
      texture_size: textureSize
    };

    const imagesRef = this.images as Record<string, unknown> | undefined;
    if (isRefSet(imagesRef)) {
      const imagesUrl = await assetToUrl(imagesRef!, apiKey);
      if (imagesUrl) args["images"] = imagesUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "firtoz/trellis:e8f6c45206993f297372f5436b90350817bd9b4a0d52d2a76df50c1c8afa2b3c",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class ShapE extends ReplicateNode {
  static readonly nodeType = "replicate.image.3d.ShapE";
  static readonly title = "Shap E";
  static readonly description = `Generating Conditional 3D Implicit Functions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "int", default: 1, description: "Number of output" })
  declare batch_size: any;

  @prop({
    type: "float",
    default: 15,
    description: "Set the scale for guidanece"
  })
  declare guidance_scale: any;

  @prop({
    type: "image",
    default: "",
    description:
      "A synthetic view image for generating the 3D modeld. To get the best result, remove background from the input image"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text prompt for generating the 3D model, ignored if an image is provide below"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "nerf",
    values: ["nerf", "stf"],
    description: "Choose a render mode"
  })
  declare render_mode: any;

  @prop({
    type: "int",
    default: 128,
    description:
      "Set the size of the a renderer, higher values take longer to render"
  })
  declare render_size: any;

  @prop({
    type: "bool",
    default: false,
    description: "Save the latents as meshes."
  })
  declare save_mesh: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const batchSize = Number(this.batch_size ?? 1);
    const guidanceScale = Number(this.guidance_scale ?? 15);
    const prompt = String(this.prompt ?? "");
    const renderMode = String(this.render_mode ?? "nerf");
    const renderSize = Number(this.render_size ?? 128);
    const saveMesh = Boolean(this.save_mesh ?? false);

    const args: Record<string, unknown> = {
      batch_size: batchSize,
      guidance_scale: guidanceScale,
      prompt: prompt,
      render_mode: renderMode,
      render_size: renderSize,
      save_mesh: saveMesh
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "cjwbw/shap-e:5957069d5c509126a73c7cb68abcddbb985aeefa4d318e7c63ec1352ce6da68c",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Deep3D extends ReplicateNode {
  static readonly nodeType = "replicate.image.3d.Deep3D";
  static readonly title = "Deep3 D";
  static readonly description = `Deep3D: Real-Time end-to-end 2D-to-3D Video Conversion, based on deep learning
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "enum",
    default: "deep3d_v1.0_640x360",
    values: ["deep3d_v1.0_640x360", "deep3d_v1.0_1280x720"],
    description: "Model size"
  })
  declare model: any;

  @prop({ type: "video", default: "", description: "Input video" })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const model = String(this.model ?? "deep3d_v1.0_640x360");

    const args: Record<string, unknown> = {
      model: model
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/deep3d:108b6cc8629f25abea20f56446a34e9d676dd1d7218f1ecefdd52239166903e3",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Hunyuan3D_2 extends ReplicateNode {
  static readonly nodeType = "replicate.image.3d.Hunyuan3D_2";
  static readonly title = "Hunyuan3 D_2";
  static readonly description = `hunyuan3d-2 optimised with the pruna toolkit: https://github.com/PrunaAI/pruna
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "int",
    default: 40000,
    description: "Target number of faces for simplification"
  })
  declare face_count: any;

  @prop({
    type: "enum",
    default: "glb",
    values: ["glb", "obj"],
    description: "File type"
  })
  declare file_type: any;

  @prop({
    type: "int",
    default: 12345,
    description: "Seed for random generator"
  })
  declare generator_seed: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for hunyuan3d control"
  })
  declare image_path: any;

  @prop({ type: "int", default: 20000, description: "Number of chunks" })
  declare num_chunks: any;

  @prop({ type: "int", default: 50, description: "Number of inference steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 200, description: "Octree resolution" })
  declare octree_resolution: any;

  @prop({
    type: "enum",
    default: "Juiced 🔥 (fast)",
    values: ["Unsqueezed 🍋 (highest quality)", "Juiced 🔥 (fast)"],
    description: "Speed optimization level"
  })
  declare speed_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const faceCount = Number(this.face_count ?? 40000);
    const fileType = String(this.file_type ?? "glb");
    const generatorSeed = Number(this.generator_seed ?? 12345);
    const numChunks = Number(this.num_chunks ?? 20000);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const octreeResolution = Number(this.octree_resolution ?? 200);
    const speedMode = String(this.speed_mode ?? "Juiced 🔥 (fast)");

    const args: Record<string, unknown> = {
      face_count: faceCount,
      file_type: fileType,
      generator_seed: generatorSeed,
      num_chunks: numChunks,
      num_inference_steps: numInferenceSteps,
      octree_resolution: octreeResolution,
      speed_mode: speedMode
    };

    const imagePathRef = this.image_path as Record<string, unknown> | undefined;
    if (isRefSet(imagePathRef)) {
      const imagePathUrl = await assetToUrl(imagePathRef!, apiKey);
      if (imagePathUrl) args["image_path"] = imagePathUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "prunaai/hunyuan3d-2:6dd3e3e1f8a29a38807e8f23aaf8953a0051996ccc8c1861f709a5b1ee6826b5",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Tencent_Hunyuan3D_2 extends ReplicateNode {
  static readonly nodeType = "replicate.image.3d.Tencent_Hunyuan3D_2";
  static readonly title = "Tencent_ Hunyuan3 D_2";
  static readonly description = `Scaling Diffusion Models for High Resolution Textured 3D Assets Generation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 5.5,
    description: "Guidance scale for generation"
  })
  declare guidance_scale: any;

  @prop({
    type: "image",
    default: "",
    description: "Input image for generating 3D shape"
  })
  declare image: any;

  @prop({
    type: "enum",
    default: 256,
    values: ["256", "384", "512"],
    description: "Octree resolution for mesh generation"
  })
  declare octree_resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to remove background from input image"
  })
  declare remove_background: any;

  @prop({
    type: "int",
    default: 1234,
    description: "Random seed for generation"
  })
  declare seed: any;

  @prop({ type: "int", default: 50, description: "Number of inference steps" })
  declare steps: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const guidanceScale = Number(this.guidance_scale ?? 5.5);
    const octreeResolution = String(this.octree_resolution ?? 256);
    const removeBackground = Boolean(this.remove_background ?? true);
    const seed = Number(this.seed ?? 1234);
    const steps = Number(this.steps ?? 50);

    const args: Record<string, unknown> = {
      guidance_scale: guidanceScale,
      octree_resolution: octreeResolution,
      remove_background: removeBackground,
      seed: seed,
      steps: steps
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "tencent/hunyuan3d-2:b1b9449a1277e10402781c5d41eb30c0a0683504fb23fab591ca9dfc2aabe1cb",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Hunyuan3D_2MV extends ReplicateNode {
  static readonly nodeType = "replicate.image.3d.Hunyuan3D_2MV";
  static readonly title = "Hunyuan3 D_2 M V";
  static readonly description = `Hunyuan3D-2mv is finetuned from Hunyuan3D-2 to support multiview controlled shape generation.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Back view image" })
  declare back_image: any;

  @prop({
    type: "enum",
    default: "glb",
    values: ["glb", "obj", "ply", "stl"],
    description: "Output file type"
  })
  declare file_type: any;

  @prop({ type: "image", default: "", description: "Front view image" })
  declare front_image: any;

  @prop({ type: "float", default: 5, description: "Guidance scale" })
  declare guidance_scale: any;

  @prop({ type: "image", default: "", description: "Left view image" })
  declare left_image: any;

  @prop({ type: "int", default: 200000, description: "Number of chunks" })
  declare num_chunks: any;

  @prop({ type: "int", default: 256, description: "Octree resolution" })
  declare octree_resolution: any;

  @prop({ type: "bool", default: true, description: "Randomize seed" })
  declare randomize_seed: any;

  @prop({ type: "bool", default: true, description: "Remove image background" })
  declare remove_background: any;

  @prop({ type: "image", default: "", description: "Right view image" })
  declare right_image: any;

  @prop({ type: "int", default: 1234, description: "Random seed" })
  declare seed: any;

  @prop({ type: "int", default: 30, description: "Number of inference steps" })
  declare steps: any;

  @prop({
    type: "int",
    default: 10000,
    description: "Target number of faces for mesh simplification"
  })
  declare target_face_num: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const fileType = String(this.file_type ?? "glb");
    const guidanceScale = Number(this.guidance_scale ?? 5);
    const numChunks = Number(this.num_chunks ?? 200000);
    const octreeResolution = Number(this.octree_resolution ?? 256);
    const randomizeSeed = Boolean(this.randomize_seed ?? true);
    const removeBackground = Boolean(this.remove_background ?? true);
    const seed = Number(this.seed ?? 1234);
    const steps = Number(this.steps ?? 30);
    const targetFaceNum = Number(this.target_face_num ?? 10000);

    const args: Record<string, unknown> = {
      file_type: fileType,
      guidance_scale: guidanceScale,
      num_chunks: numChunks,
      octree_resolution: octreeResolution,
      randomize_seed: randomizeSeed,
      remove_background: removeBackground,
      seed: seed,
      steps: steps,
      target_face_num: targetFaceNum
    };

    const backImageRef = this.back_image as Record<string, unknown> | undefined;
    if (isRefSet(backImageRef)) {
      const backImageUrl = await assetToUrl(backImageRef!, apiKey);
      if (backImageUrl) args["back_image"] = backImageUrl;
    }

    const frontImageRef = this.front_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(frontImageRef)) {
      const frontImageUrl = await assetToUrl(frontImageRef!, apiKey);
      if (frontImageUrl) args["front_image"] = frontImageUrl;
    }

    const leftImageRef = this.left_image as Record<string, unknown> | undefined;
    if (isRefSet(leftImageRef)) {
      const leftImageUrl = await assetToUrl(leftImageRef!, apiKey);
      if (leftImageUrl) args["left_image"] = leftImageUrl;
    }

    const rightImageRef = this.right_image as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(rightImageRef)) {
      const rightImageUrl = await assetToUrl(rightImageRef!, apiKey);
      if (rightImageUrl) args["right_image"] = rightImageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "tencent/hunyuan3d-2mv:71798fbc3c9f7b7097e3bb85496e5a797d8b8f616b550692e7c3e176a8e9e5db",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class SeedVR2 extends ReplicateNode {
  static readonly nodeType = "replicate.image.3d.SeedVR2";
  static readonly title = "Seed V R2";
  static readonly description = `🔥 SeedVR2: one-step video & image restoration with 3B/7B hot‑swap and optional color fix 🎬✨
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Apply optional wavelet color correction (matches official demo)."
  })
  declare apply_color_fix: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Classifier-free guidance scale (higher = stronger restoration)."
  })
  declare cfg_scale: any;

  @prop({
    type: "int",
    default: 24,
    description: "Frames-per-second for video outputs."
  })
  declare fps: any;

  @prop({
    type: "image",
    default: "",
    description: "Video (mp4/mov) or image (png/jpg/webp) to restore."
  })
  declare media: any;

  @prop({
    type: "enum",
    default: "3b",
    values: ["3b", "7b"],
    description: "Model size to run."
  })
  declare model_variant: any;

  @prop({
    type: "enum",
    default: "webp",
    values: ["png", "webp", "jpg"],
    description: "Image output format (only used for image inputs)."
  })
  declare output_format: any;

  @prop({
    type: "int",
    default: 90,
    description: "Image quality for lossy formats (jpg/webp)."
  })
  declare output_quality: any;

  @prop({
    type: "int",
    default: 1,
    description: "Sampling steps (1 = fast one-step mode)."
  })
  declare sample_steps: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank for a random seed each call."
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Sequence-parallel shard heuristic (single-GPU build only accepts 1)."
  })
  declare sp_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const applyColorFix = Boolean(this.apply_color_fix ?? false);
    const cfgScale = Number(this.cfg_scale ?? 1);
    const fps = Number(this.fps ?? 24);
    const modelVariant = String(this.model_variant ?? "3b");
    const outputFormat = String(this.output_format ?? "webp");
    const outputQuality = Number(this.output_quality ?? 90);
    const sampleSteps = Number(this.sample_steps ?? 1);
    const seed = Number(this.seed ?? -1);
    const spSize = Number(this.sp_size ?? 1);

    const args: Record<string, unknown> = {
      apply_color_fix: applyColorFix,
      cfg_scale: cfgScale,
      fps: fps,
      model_variant: modelVariant,
      output_format: outputFormat,
      output_quality: outputQuality,
      sample_steps: sampleSteps,
      seed: seed,
      sp_size: spSize
    };

    const mediaRef = this.media as Record<string, unknown> | undefined;
    if (isRefSet(mediaRef)) {
      const mediaUrl = await assetToUrl(mediaRef!, apiKey);
      if (mediaUrl) args["media"] = mediaUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/seedvr2:ca98249be9cb623f02a80a7851a2b1a33d5104c251a8f5a1588f251f79bf7c78",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export const REPLICATE_IMAGE_3D_NODES: readonly NodeClass[] = [
  Trellis,
  ShapE,
  Deep3D,
  Hunyuan3D_2,
  Tencent_Hunyuan3D_2,
  Hunyuan3D_2MV,
  SeedVR2
] as const;
