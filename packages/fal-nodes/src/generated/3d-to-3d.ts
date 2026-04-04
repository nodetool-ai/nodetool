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

export class Ultrashape extends FalNode {
  static readonly nodeType = "fal.3d_to_3d.Ultrashape";
  static readonly title = "Ultrashape";
  static readonly description = `Ultrashape
3d_to_3d`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };

  @prop({
    type: "int",
    default: 1024,
    description: "Marching cubes resolution."
  })
  declare octree_resolution: any;

  @prop({
    type: "bool",
    default: true,
    description: "Remove image background."
  })
  declare remove_background: any;

  @prop({ type: "int", default: 50, description: "Diffusion steps." })
  declare num_inference_steps: any;

  @prop({
    type: "str",
    default: "",
    description: "URL of the coarse mesh (.glb or .obj) to refine."
  })
  declare model_url: any;

  @prop({ type: "int", default: 42, description: "Random seed." })
  declare seed: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the reference image for mesh refinement."
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const octreeResolution = Number(this.octree_resolution ?? 1024);
    const removeBackground = Boolean(this.remove_background ?? true);
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const modelUrl = String(this.model_url ?? "");
    const seed = Number(this.seed ?? 42);

    const args: Record<string, unknown> = {
      octree_resolution: octreeResolution,
      remove_background: removeBackground,
      num_inference_steps: numInferenceSteps,
      model_url: modelUrl,
      seed: seed
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ultrashape", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Sam33DAlign extends FalNode {
  static readonly nodeType = "fal.3d_to_3d.Sam33DAlign";
  static readonly title = "Sam33 D Align";
  static readonly description = `Sam 3
3d_to_3d`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };

  @prop({
    type: "image",
    default: "",
    description:
      "URL of the human mask image. If not provided, uses full image."
  })
  declare body_mask_url: any;

  @prop({
    type: "str",
    default: "",
    description: "URL of the SAM-3D Body mesh file (.ply or .glb) to align"
  })
  declare body_mesh_url: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional URL of SAM-3D Object mesh (.glb) to create combined scene"
  })
  declare object_mesh_url: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Focal length from SAM-3D Body metadata. If not provided, estimated from MoGe."
  })
  declare focal_length: any;

  @prop({
    type: "image",
    default: "",
    description: "URL of the original image used for MoGe depth estimation"
  })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const bodyMeshUrl = String(this.body_mesh_url ?? "");
    const objectMeshUrl = String(this.object_mesh_url ?? "");
    const focalLength = String(this.focal_length ?? "");

    const args: Record<string, unknown> = {
      body_mesh_url: bodyMeshUrl,
      object_mesh_url: objectMeshUrl,
      focal_length: focalLength
    };

    const bodyMaskUrlRef = this.body_mask_url as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(bodyMaskUrlRef)) {
      const bodyMaskUrlUrl =
        (await imageToDataUrl(bodyMaskUrlRef!)) ??
        (await assetToFalUrl(apiKey, bodyMaskUrlRef!));
      if (bodyMaskUrlUrl) args["body_mask_url"] = bodyMaskUrlUrl;
    }

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-3/3d-align", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class MeshyV5Retexture extends FalNode {
  static readonly nodeType = "fal.3d_to_3d.MeshyV5Retexture";
  static readonly title = "Meshy V5 Retexture";
  static readonly description = `Meshy-5 retexture applies new, high-quality textures to existing 3D models using either text prompts or reference images. It supports PBR material generation for realistic, production-ready results.
3d, editing, transformation, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };

  @prop({
    type: "bool",
    default: false,
    description:
      "Generate PBR Maps (metallic, roughness, normal) in addition to base color."
  })
  declare enable_pbr: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Describe your desired texture style using text. Maximum 600 characters. Required if image_style_url is not provided."
  })
  declare text_style_prompt: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "If set to true, input data will be checked for safety before processing."
  })
  declare enable_safety_checker: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "Use the original UV mapping of the model instead of generating new UVs. If the model has no original UV, output quality may be reduced."
  })
  declare enable_original_uv: any;

  @prop({
    type: "str",
    default: "",
    description:
      "URL or base64 data URI of a 3D model to texture. Supports .glb, .gltf, .obj, .fbx, .stl formats. Can be a publicly accessible URL or data URI with MIME type application/octet-stream."
  })
  declare model_url: any;

  @prop({
    type: "image",
    default: "",
    description:
      "2D image to guide the texturing process. Supports .jpg, .jpeg, and .png formats. Required if text_style_prompt is not provided. If both are provided, image_style_url takes precedence."
  })
  declare image_style: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const enablePbr = Boolean(this.enable_pbr ?? false);
    const textStylePrompt = String(this.text_style_prompt ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const enableOriginalUv = Boolean(this.enable_original_uv ?? true);
    const modelUrl = String(this.model_url ?? "");

    const args: Record<string, unknown> = {
      enable_pbr: enablePbr,
      text_style_prompt: textStylePrompt,
      enable_safety_checker: enableSafetyChecker,
      enable_original_uv: enableOriginalUv,
      model_url: modelUrl
    };

    const imageStyleRef = this.image_style as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageStyleRef)) {
      const imageStyleUrl =
        (await imageToDataUrl(imageStyleRef!)) ??
        (await assetToFalUrl(apiKey, imageStyleRef!));
      if (imageStyleUrl) args["image_style_url"] = imageStyleUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/meshy/v5/retexture", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class MeshyV5Remesh extends FalNode {
  static readonly nodeType = "fal.3d_to_3d.MeshyV5Remesh";
  static readonly title = "Meshy V5 Remesh";
  static readonly description = `Meshy-5 remesh allows you to remesh and export existing 3D models into various formats
3d, editing, transformation, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };

  @prop({
    type: "float",
    default: 0,
    description:
      "Resize the model to a certain height measured in meters. Set to 0 for no resizing."
  })
  declare resize_height: any;

  @prop({
    type: "str",
    default: "",
    description: "Position of the origin. None means no effect."
  })
  declare origin_at: any;

  @prop({
    type: "int",
    default: 30000,
    description:
      "Target number of polygons in the generated model. Actual count may vary based on geometry complexity."
  })
  declare target_polycount: any;

  @prop({
    type: "str",
    default: "",
    description:
      "URL or base64 data URI of a 3D model to remesh. Supports .glb, .gltf, .obj, .fbx, .stl formats. Can be a publicly accessible URL or data URI with MIME type application/octet-stream."
  })
  declare model_url: any;

  @prop({
    type: "enum",
    default: "triangle",
    values: ["quad", "triangle"],
    description:
      "Specify the topology of the generated model. Quad for smooth surfaces, Triangle for detailed geometry."
  })
  declare topology: any;

  @prop({
    type: "list[str]",
    default: [],
    description: "List of target formats for the remeshed model."
  })
  declare target_formats: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const resizeHeight = Number(this.resize_height ?? 0);
    const originAt = String(this.origin_at ?? "");
    const targetPolycount = Number(this.target_polycount ?? 30000);
    const modelUrl = String(this.model_url ?? "");
    const topology = String(this.topology ?? "triangle");
    const targetFormats = String(this.target_formats ?? []);

    const args: Record<string, unknown> = {
      resize_height: resizeHeight,
      origin_at: originAt,
      target_polycount: targetPolycount,
      model_url: modelUrl,
      topology: topology,
      target_formats: targetFormats
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/meshy/v5/remesh", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class HunyuanPart extends FalNode {
  static readonly nodeType = "fal.3d_to_3d.HunyuanPart";
  static readonly title = "Hunyuan Part";
  static readonly description = `Use the capabilities of hunyuan part to generate point clouds from your 3D files.
3d, editing, transformation, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    iou_scores: "list[float]",
    best_mask_index: "int",
    mask_2_mesh: "str",
    mask_1_mesh: "str",
    segmented_mesh: "str",
    seed: "int",
    mask_3_mesh: "str"
  };

  @prop({
    type: "float",
    default: 0,
    description:
      "X coordinate of the point prompt for segmentation (normalized space -1 to 1)."
  })
  declare point_prompt_x: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Z coordinate of the point prompt for segmentation (normalized space -1 to 1)."
  })
  declare point_prompt_z: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to use normal information for segmentation."
  })
  declare use_normal: any;

  @prop({
    type: "float",
    default: 0,
    description: "Standard deviation of noise to add to sampled points."
  })
  declare noise_std: any;

  @prop({
    type: "int",
    default: 100000,
    description: "Number of points to sample from the mesh."
  })
  declare point_num: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Y coordinate of the point prompt for segmentation (normalized space -1 to 1)."
  })
  declare point_prompt_y: any;

  @prop({
    type: "str",
    default: "",
    description:
      "URL of the 3D model file (.glb or .obj) to process for segmentation."
  })
  declare model_file_url: any;

  @prop({
    type: "str",
    default: "",
    description:
      "\n            The same seed and input will produce the same segmentation results.\n        "
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const pointPromptX = Number(this.point_prompt_x ?? 0);
    const pointPromptZ = Number(this.point_prompt_z ?? 0);
    const useNormal = Boolean(this.use_normal ?? true);
    const noiseStd = Number(this.noise_std ?? 0);
    const pointNum = Number(this.point_num ?? 100000);
    const pointPromptY = Number(this.point_prompt_y ?? 0);
    const modelFileUrl = String(this.model_file_url ?? "");
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      point_prompt_x: pointPromptX,
      point_prompt_z: pointPromptZ,
      use_normal: useNormal,
      noise_std: noiseStd,
      point_num: pointNum,
      point_prompt_y: pointPromptY,
      model_file_url: modelFileUrl,
      seed: seed
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-part", args);
    return res as Record<string, unknown>;
  }
}

export const FAL_3D_TO_3D_NODES: readonly NodeClass[] = [
  Ultrashape,
  Sam33DAlign,
  MeshyV5Retexture,
  MeshyV5Remesh,
  HunyuanPart
] as const;
