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

export class Trellis extends ReplicateNode {
  static readonly nodeType = "replicate.image_3d.Trellis";
  static readonly title = "Trellis";
  static readonly description = `A powerful 3D asset generation model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "bool", default: true, description: "Generate color video render" })
  declare generate_color: any;

  @prop({ type: "bool", default: false, description: "Generate 3D model file (GLB)" })
  declare generate_model: any;

  @prop({ type: "bool", default: false, description: "Generate normal video render" })
  declare generate_normal: any;

  @prop({ type: "list[str]", default: [], description: "List of input images to generate 3D asset from" })
  declare images: any;

  @prop({ type: "float", default: 0.95, description: "GLB Extraction - Mesh Simplification (only used if generate_model=True)" })
  declare mesh_simplify: any;

  @prop({ type: "bool", default: true, description: "Randomize seed" })
  declare randomize_seed: any;

  @prop({ type: "bool", default: false, description: "Return the preprocessed images without background" })
  declare return_no_background: any;

  @prop({ type: "bool", default: false, description: "Save Gaussian point cloud as PLY file" })
  declare save_gaussian_ply: any;

  @prop({ type: "int", default: 0, description: "Random seed for generation" })
  declare seed: any;

  @prop({ type: "float", default: 3, description: "Stage 2: Structured Latent Generation - Guidance Strength" })
  declare slat_guidance_strength: any;

  @prop({ type: "int", default: 12, description: "Stage 2: Structured Latent Generation - Sampling Steps" })
  declare slat_sampling_steps: any;

  @prop({ type: "float", default: 7.5, description: "Stage 1: Sparse Structure Generation - Guidance Strength" })
  declare ss_guidance_strength: any;

  @prop({ type: "int", default: 12, description: "Stage 1: Sparse Structure Generation - Sampling Steps" })
  declare ss_sampling_steps: any;

  @prop({ type: "int", default: 1024, description: "GLB Extraction - Texture Size (only used if generate_model=True)" })
  declare texture_size: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const generateColor = Boolean(inputs.generate_color ?? this.generate_color ?? true);
    const generateModel = Boolean(inputs.generate_model ?? this.generate_model ?? false);
    const generateNormal = Boolean(inputs.generate_normal ?? this.generate_normal ?? false);
    const images = String(inputs.images ?? this.images ?? []);
    const meshSimplify = Number(inputs.mesh_simplify ?? this.mesh_simplify ?? 0.95);
    const randomizeSeed = Boolean(inputs.randomize_seed ?? this.randomize_seed ?? true);
    const returnNoBackground = Boolean(inputs.return_no_background ?? this.return_no_background ?? false);
    const saveGaussianPly = Boolean(inputs.save_gaussian_ply ?? this.save_gaussian_ply ?? false);
    const seed = Number(inputs.seed ?? this.seed ?? 0);
    const slatGuidanceStrength = Number(inputs.slat_guidance_strength ?? this.slat_guidance_strength ?? 3);
    const slatSamplingSteps = Number(inputs.slat_sampling_steps ?? this.slat_sampling_steps ?? 12);
    const ssGuidanceStrength = Number(inputs.ss_guidance_strength ?? this.ss_guidance_strength ?? 7.5);
    const ssSamplingSteps = Number(inputs.ss_sampling_steps ?? this.ss_sampling_steps ?? 12);
    const textureSize = Number(inputs.texture_size ?? this.texture_size ?? 1024);

    const args: Record<string, unknown> = {
      "generate_color": generateColor,
      "generate_model": generateModel,
      "generate_normal": generateNormal,
      "images": images,
      "mesh_simplify": meshSimplify,
      "randomize_seed": randomizeSeed,
      "return_no_background": returnNoBackground,
      "save_gaussian_ply": saveGaussianPly,
      "seed": seed,
      "slat_guidance_strength": slatGuidanceStrength,
      "slat_sampling_steps": slatSamplingSteps,
      "ss_guidance_strength": ssGuidanceStrength,
      "ss_sampling_steps": ssSamplingSteps,
      "texture_size": textureSize,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "firtoz/trellis:e8f6c45206993f297372f5436b90350817bd9b4a0d52d2a76df50c1c8afa2b3c", args);
    return { output: outputToString(res.output) };
  }
}

export class ShapE extends ReplicateNode {
  static readonly nodeType = "replicate.image_3d.ShapE";
  static readonly title = "Shap E";
  static readonly description = `Generating Conditional 3D Implicit Functions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "int", default: 1, description: "Number of output" })
  declare batch_size: any;

  @prop({ type: "float", default: 15, description: "Set the scale for guidanece" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "A synthetic view image for generating the 3D modeld. To get the best result, remove background from the input image" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Text prompt for generating the 3D model, ignored if an image is provide below" })
  declare prompt: any;

  @prop({ type: "enum", default: "nerf", values: ["nerf", "stf"], description: "Choose a render mode" })
  declare render_mode: any;

  @prop({ type: "int", default: 128, description: "Set the size of the a renderer, higher values take longer to render" })
  declare render_size: any;

  @prop({ type: "bool", default: false, description: "Save the latents as meshes." })
  declare save_mesh: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const batchSize = Number(inputs.batch_size ?? this.batch_size ?? 1);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 15);
    const image = String(inputs.image ?? this.image ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const renderMode = String(inputs.render_mode ?? this.render_mode ?? "nerf");
    const renderSize = Number(inputs.render_size ?? this.render_size ?? 128);
    const saveMesh = Boolean(inputs.save_mesh ?? this.save_mesh ?? false);

    const args: Record<string, unknown> = {
      "batch_size": batchSize,
      "guidance_scale": guidanceScale,
      "image": image,
      "prompt": prompt,
      "render_mode": renderMode,
      "render_size": renderSize,
      "save_mesh": saveMesh,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "cjwbw/shap-e:5957069d5c509126a73c7cb68abcddbb985aeefa4d318e7c63ec1352ce6da68c", args);
    return { output: outputToString(res.output) };
  }
}

export class Deep3D extends ReplicateNode {
  static readonly nodeType = "replicate.image_3d.Deep3D";
  static readonly title = "Deep3 D";
  static readonly description = `Deep3D: Real-Time end-to-end 2D-to-3D Video Conversion, based on deep learning
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "enum", default: "deep3d_v1.0_640x360", values: ["deep3d_v1.0_640x360", "deep3d_v1.0_1280x720"], description: "Model size" })
  declare model: any;

  @prop({ type: "str", default: "", description: "Input video" })
  declare video: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const model = String(inputs.model ?? this.model ?? "deep3d_v1.0_640x360");
    const video = String(inputs.video ?? this.video ?? "");

    const args: Record<string, unknown> = {
      "model": model,
      "video": video,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "lucataco/deep3d:108b6cc8629f25abea20f56446a34e9d676dd1d7218f1ecefdd52239166903e3", args);
    return { output: outputToString(res.output) };
  }
}

export class Hunyuan3D_2 extends ReplicateNode {
  static readonly nodeType = "replicate.image_3d.Hunyuan3D_2";
  static readonly title = "Hunyuan3 D_2";
  static readonly description = `hunyuan3d-2 optimised with the pruna toolkit: https://github.com/PrunaAI/pruna
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "int", default: 40000, description: "Target number of faces for simplification" })
  declare face_count: any;

  @prop({ type: "enum", default: "glb", values: ["glb", "obj"], description: "File type" })
  declare file_type: any;

  @prop({ type: "int", default: 12345, description: "Seed for random generator" })
  declare generator_seed: any;

  @prop({ type: "str", default: "", description: "Input image for hunyuan3d control" })
  declare image_path: any;

  @prop({ type: "int", default: 20000, description: "Number of chunks" })
  declare num_chunks: any;

  @prop({ type: "int", default: 50, description: "Number of inference steps" })
  declare num_inference_steps: any;

  @prop({ type: "int", default: 200, description: "Octree resolution" })
  declare octree_resolution: any;

  @prop({ type: "enum", default: "Juiced 🔥 (fast)", values: ["Unsqueezed 🍋 (highest quality)", "Juiced 🔥 (fast)"], description: "Speed optimization level" })
  declare speed_mode: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const faceCount = Number(inputs.face_count ?? this.face_count ?? 40000);
    const fileType = String(inputs.file_type ?? this.file_type ?? "glb");
    const generatorSeed = Number(inputs.generator_seed ?? this.generator_seed ?? 12345);
    const imagePath = String(inputs.image_path ?? this.image_path ?? "");
    const numChunks = Number(inputs.num_chunks ?? this.num_chunks ?? 20000);
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 50);
    const octreeResolution = Number(inputs.octree_resolution ?? this.octree_resolution ?? 200);
    const speedMode = String(inputs.speed_mode ?? this.speed_mode ?? "Juiced 🔥 (fast)");

    const args: Record<string, unknown> = {
      "face_count": faceCount,
      "file_type": fileType,
      "generator_seed": generatorSeed,
      "image_path": imagePath,
      "num_chunks": numChunks,
      "num_inference_steps": numInferenceSteps,
      "octree_resolution": octreeResolution,
      "speed_mode": speedMode,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "prunaai/hunyuan3d-2:6dd3e3e1f8a29a38807e8f23aaf8953a0051996ccc8c1861f709a5b1ee6826b5", args);
    return { output: outputToString(res.output) };
  }
}

export class Tencent_Hunyuan3D_2 extends ReplicateNode {
  static readonly nodeType = "replicate.image_3d.Tencent_Hunyuan3D_2";
  static readonly title = "Tencent_ Hunyuan3 D_2";
  static readonly description = `Scaling Diffusion Models for High Resolution Textured 3D Assets Generation
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "float", default: 5.5, description: "Guidance scale for generation" })
  declare guidance_scale: any;

  @prop({ type: "image", default: "", description: "Input image for generating 3D shape" })
  declare image: any;

  @prop({ type: "enum", default: 256, values: ["256", "384", "512"], description: "Octree resolution for mesh generation" })
  declare octree_resolution: any;

  @prop({ type: "bool", default: true, description: "Whether to remove background from input image" })
  declare remove_background: any;

  @prop({ type: "int", default: 1234, description: "Random seed for generation" })
  declare seed: any;

  @prop({ type: "int", default: 50, description: "Number of inference steps" })
  declare steps: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 5.5);
    const octreeResolution = String(inputs.octree_resolution ?? this.octree_resolution ?? 256);
    const removeBackground = Boolean(inputs.remove_background ?? this.remove_background ?? true);
    const seed = Number(inputs.seed ?? this.seed ?? 1234);
    const steps = Number(inputs.steps ?? this.steps ?? 50);

    const args: Record<string, unknown> = {
      "guidance_scale": guidanceScale,
      "octree_resolution": octreeResolution,
      "remove_background": removeBackground,
      "seed": seed,
      "steps": steps,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = assetToUrl(imageRef!);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "tencent/hunyuan3d-2:b1b9449a1277e10402781c5d41eb30c0a0683504fb23fab591ca9dfc2aabe1cb", args);
    return { output: outputToString(res.output) };
  }
}

export class Hunyuan3D_2MV extends ReplicateNode {
  static readonly nodeType = "replicate.image_3d.Hunyuan3D_2MV";
  static readonly title = "Hunyuan3 D_2 M V";
  static readonly description = `Hunyuan3D-2mv is finetuned from Hunyuan3D-2 to support multiview controlled shape generation.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", description: "Back view image" })
  declare back_image: any;

  @prop({ type: "enum", default: "glb", values: ["glb", "obj", "ply", "stl"], description: "Output file type" })
  declare file_type: any;

  @prop({ type: "str", default: "", description: "Front view image" })
  declare front_image: any;

  @prop({ type: "float", default: 5, description: "Guidance scale" })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Left view image" })
  declare left_image: any;

  @prop({ type: "int", default: 200000, description: "Number of chunks" })
  declare num_chunks: any;

  @prop({ type: "int", default: 256, description: "Octree resolution" })
  declare octree_resolution: any;

  @prop({ type: "bool", default: true, description: "Randomize seed" })
  declare randomize_seed: any;

  @prop({ type: "bool", default: true, description: "Remove image background" })
  declare remove_background: any;

  @prop({ type: "str", default: "", description: "Right view image" })
  declare right_image: any;

  @prop({ type: "int", default: 1234, description: "Random seed" })
  declare seed: any;

  @prop({ type: "int", default: 30, description: "Number of inference steps" })
  declare steps: any;

  @prop({ type: "int", default: 10000, description: "Target number of faces for mesh simplification" })
  declare target_face_num: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const backImage = String(inputs.back_image ?? this.back_image ?? "");
    const fileType = String(inputs.file_type ?? this.file_type ?? "glb");
    const frontImage = String(inputs.front_image ?? this.front_image ?? "");
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 5);
    const leftImage = String(inputs.left_image ?? this.left_image ?? "");
    const numChunks = Number(inputs.num_chunks ?? this.num_chunks ?? 200000);
    const octreeResolution = Number(inputs.octree_resolution ?? this.octree_resolution ?? 256);
    const randomizeSeed = Boolean(inputs.randomize_seed ?? this.randomize_seed ?? true);
    const removeBackground = Boolean(inputs.remove_background ?? this.remove_background ?? true);
    const rightImage = String(inputs.right_image ?? this.right_image ?? "");
    const seed = Number(inputs.seed ?? this.seed ?? 1234);
    const steps = Number(inputs.steps ?? this.steps ?? 30);
    const targetFaceNum = Number(inputs.target_face_num ?? this.target_face_num ?? 10000);

    const args: Record<string, unknown> = {
      "back_image": backImage,
      "file_type": fileType,
      "front_image": frontImage,
      "guidance_scale": guidanceScale,
      "left_image": leftImage,
      "num_chunks": numChunks,
      "octree_resolution": octreeResolution,
      "randomize_seed": randomizeSeed,
      "remove_background": removeBackground,
      "right_image": rightImage,
      "seed": seed,
      "steps": steps,
      "target_face_num": targetFaceNum,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "tencent/hunyuan3d-2mv:71798fbc3c9f7b7097e3bb85496e5a797d8b8f616b550692e7c3e176a8e9e5db", args);
    return { output: outputToString(res.output) };
  }
}

export class SeedVR2 extends ReplicateNode {
  static readonly nodeType = "replicate.image_3d.SeedVR2";
  static readonly title = "Seed V R2";
  static readonly description = `🔥 SeedVR2: one-step video & image restoration with 3B/7B hot‑swap and optional color fix 🎬✨
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "bool", default: false, description: "Apply optional wavelet color correction (matches official demo)." })
  declare apply_color_fix: any;

  @prop({ type: "float", default: 1, description: "Classifier-free guidance scale (higher = stronger restoration)." })
  declare cfg_scale: any;

  @prop({ type: "int", default: 24, description: "Frames-per-second for video outputs." })
  declare fps: any;

  @prop({ type: "str", default: "", description: "Video (mp4/mov) or image (png/jpg/webp) to restore." })
  declare media: any;

  @prop({ type: "enum", default: "3b", values: ["3b", "7b"], description: "Model size to run." })
  declare model_variant: any;

  @prop({ type: "enum", default: "webp", values: ["png", "webp", "jpg"], description: "Image output format (only used for image inputs)." })
  declare output_format: any;

  @prop({ type: "int", default: 90, description: "Image quality for lossy formats (jpg/webp)." })
  declare output_quality: any;

  @prop({ type: "int", default: 1, description: "Sampling steps (1 = fast one-step mode)." })
  declare sample_steps: any;

  @prop({ type: "int", default: -1, description: "Random seed. Leave blank for a random seed each call." })
  declare seed: any;

  @prop({ type: "int", default: 1, description: "Sequence-parallel shard heuristic (single-GPU build only accepts 1)." })
  declare sp_size: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const applyColorFix = Boolean(inputs.apply_color_fix ?? this.apply_color_fix ?? false);
    const cfgScale = Number(inputs.cfg_scale ?? this.cfg_scale ?? 1);
    const fps = Number(inputs.fps ?? this.fps ?? 24);
    const media = String(inputs.media ?? this.media ?? "");
    const modelVariant = String(inputs.model_variant ?? this.model_variant ?? "3b");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "webp");
    const outputQuality = Number(inputs.output_quality ?? this.output_quality ?? 90);
    const sampleSteps = Number(inputs.sample_steps ?? this.sample_steps ?? 1);
    const seed = Number(inputs.seed ?? this.seed ?? -1);
    const spSize = Number(inputs.sp_size ?? this.sp_size ?? 1);

    const args: Record<string, unknown> = {
      "apply_color_fix": applyColorFix,
      "cfg_scale": cfgScale,
      "fps": fps,
      "media": media,
      "model_variant": modelVariant,
      "output_format": outputFormat,
      "output_quality": outputQuality,
      "sample_steps": sampleSteps,
      "seed": seed,
      "sp_size": spSize,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "zsxkib/seedvr2:ca98249be9cb623f02a80a7851a2b1a33d5104c251a8f5a1588f251f79bf7c78", args);
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
  SeedVR2,
] as const;