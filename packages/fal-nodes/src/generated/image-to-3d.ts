import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl,
  coerceFalOutputForPropType,
} from "../fal-base.js";
import type { FalUnitPricing } from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class Hunyuan_WorldImageToWorld extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Hunyuan_WorldImageToWorld";
  static readonly title = "Hunyuan_ World Image To World";
  static readonly description = `Hunyuan World
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "world_file": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hunyuan_world/image-to-world",
    unitPrice: 0.3,
    billingUnit: "requests",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Classes to use for the world generation." })
  declare classes: any;

  @prop({ type: "bool", default: false, description: "Whether to export DRC (Dynamic Resource Configuration)." })
  declare export_drc: any;

  @prop({ type: "str", default: "", description: "Labels for the first foreground object." })
  declare labels_fg1: any;

  @prop({ type: "str", default: "", description: "Labels for the second foreground object." })
  declare labels_fg2: any;

  @prop({ type: "image", default: "", description: "The URL of the image to convert to a world." })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const classes = String(this.classes ?? "");
    const exportDrc = Boolean(this.export_drc ?? false);
    const labelsFg1 = String(this.labels_fg1 ?? "");
    const labelsFg2 = String(this.labels_fg2 ?? "");

    const args: Record<string, unknown> = {
      "classes": classes,
      "export_drc": exportDrc,
      "labels_fg1": labelsFg1,
      "labels_fg2": labelsFg2,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan_world/image-to-world", args);
    return {
      "world_file": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["world_file"]),
    };
  }
}

export class Hunyuan3dProImageTo3dV31ProImageTo3d extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Hunyuan3dProImageTo3dV31ProImageTo3d";
  static readonly title = "Hunyuan3d Pro Image To3d V31 Pro Image To3d";
  static readonly description = `Generate 3D models from images with Hunyuan 3D Pro
3d, hunyuan, image-to-3d`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
    unitPrice: 0.015,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "bool", default: false, description: "Enable PBR material generation (metallic, roughness, normal textures). Ignored when generate_type is Geometry." })
  declare enable_pbr: any;

  @prop({ type: "image", default: "", description: "Front view image URL. Resolution: 128-5000px, max 8MB, formats: JPG/PNG/WEBP. Tips: simple background, single object, object >50% of frame." })
  declare input_image: any;

  @prop({ type: "image", default: "", description: "Optional back/rear view image URL (JPG/PNG recommended)." })
  declare back_image: any;

  @prop({ type: "image", default: "", description: "Optional right side view image URL (JPG/PNG recommended)." })
  declare right_image: any;

  @prop({ type: "int", default: 500000, description: "Target polygon face count. Range: 40,000-1,500,000. Default: 500,000." })
  declare face_count: any;

  @prop({ type: "image", default: "", description: "Optional bottom view image URL (v3.1 exclusive, JPG/PNG recommended)." })
  declare bottom_image: any;

  @prop({ type: "image", default: "", description: "Optional right-front 45 degree angle view image URL (v3.1 exclusive, JPG/PNG recommended)." })
  declare right_front_image: any;

  @prop({ type: "image", default: "", description: "Optional top view image URL (v3.1 exclusive, JPG/PNG recommended)." })
  declare top_image: any;

  @prop({ type: "image", default: "", description: "Optional left-front 45 degree angle view image URL (v3.1 exclusive, JPG/PNG recommended)." })
  declare left_front_image: any;

  @prop({ type: "enum", default: "Normal", values: ["Normal", "Geometry"], description: "Generation task type. Normal: textured model. Geometry: geometry-only white model (no textures). LowPoly/Sketch are not available in v3.1." })
  declare generate_type: any;

  @prop({ type: "image", default: "", description: "Optional left side view image URL (JPG/PNG recommended)." })
  declare left_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const enablePbr = Boolean(this.enable_pbr ?? false);
    const faceCount = Number(this.face_count ?? 500000);
    const generateType = String(this.generate_type ?? "Normal");

    const args: Record<string, unknown> = {
      "enable_pbr": enablePbr,
      "face_count": faceCount,
      "generate_type": generateType,
    };

    const inputImageRef = this.input_image as Record<string, unknown> | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await imageToDataUrl(inputImageRef!) ?? await assetToFalUrl(apiKey, inputImageRef!);
      if (inputImageUrl) args["input_image_url"] = inputImageUrl;
    }

    const backImageRef = this.back_image as Record<string, unknown> | undefined;
    if (isRefSet(backImageRef)) {
      const backImageUrl = await imageToDataUrl(backImageRef!) ?? await assetToFalUrl(apiKey, backImageRef!);
      if (backImageUrl) args["back_image_url"] = backImageUrl;
    }

    const rightImageRef = this.right_image as Record<string, unknown> | undefined;
    if (isRefSet(rightImageRef)) {
      const rightImageUrl = await imageToDataUrl(rightImageRef!) ?? await assetToFalUrl(apiKey, rightImageRef!);
      if (rightImageUrl) args["right_image_url"] = rightImageUrl;
    }

    const bottomImageRef = this.bottom_image as Record<string, unknown> | undefined;
    if (isRefSet(bottomImageRef)) {
      const bottomImageUrl = await imageToDataUrl(bottomImageRef!) ?? await assetToFalUrl(apiKey, bottomImageRef!);
      if (bottomImageUrl) args["bottom_image_url"] = bottomImageUrl;
    }

    const rightFrontImageRef = this.right_front_image as Record<string, unknown> | undefined;
    if (isRefSet(rightFrontImageRef)) {
      const rightFrontImageUrl = await imageToDataUrl(rightFrontImageRef!) ?? await assetToFalUrl(apiKey, rightFrontImageRef!);
      if (rightFrontImageUrl) args["right_front_image_url"] = rightFrontImageUrl;
    }

    const topImageRef = this.top_image as Record<string, unknown> | undefined;
    if (isRefSet(topImageRef)) {
      const topImageUrl = await imageToDataUrl(topImageRef!) ?? await assetToFalUrl(apiKey, topImageRef!);
      if (topImageUrl) args["top_image_url"] = topImageUrl;
    }

    const leftFrontImageRef = this.left_front_image as Record<string, unknown> | undefined;
    if (isRefSet(leftFrontImageRef)) {
      const leftFrontImageUrl = await imageToDataUrl(leftFrontImageRef!) ?? await assetToFalUrl(apiKey, leftFrontImageRef!);
      if (leftFrontImageUrl) args["left_front_image_url"] = leftFrontImageUrl;
    }

    const leftImageRef = this.left_image as Record<string, unknown> | undefined;
    if (isRefSet(leftImageRef)) {
      const leftImageUrl = await imageToDataUrl(leftImageRef!) ?? await assetToFalUrl(apiKey, leftImageRef!);
      if (leftImageUrl) args["left_image_url"] = leftImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-3d-pro-image-to-3d/v3.1/pro/image-to-3d", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Hunyuan3dRapidImageTo3dV31RapidImageTo3d extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Hunyuan3dRapidImageTo3dV31RapidImageTo3d";
  static readonly title = "Hunyuan3d Rapid Image To3d V31 Rapid Image To3d";
  static readonly description = `Rapidly generate 3D models from images using Hunyuan 3D.
3d, hunyuan, image-to-3d`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d",
    unitPrice: 0.015,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "image", default: "", description: "Front view image URL. Resolution: 128-5000px, max 8MB (recommended ≤6MB for base64 encoding), formats: JPG/PNG/WEBP. Tips: simple background, single object, object >50% of frame." })
  declare input_image: any;

  @prop({ type: "bool", default: false, description: "Enable PBR material generation (metallic, roughness, normal textures). Does not take effect when enable_geometry is True." })
  declare enable_pbr: any;

  @prop({ type: "bool", default: false, description: "Generate geometry-only white model without textures. When enabled, enable_pbr is ignored and OBJ is not supported (default output is GLB)." })
  declare enable_geometry: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const enablePbr = Boolean(this.enable_pbr ?? false);
    const enableGeometry = Boolean(this.enable_geometry ?? false);

    const args: Record<string, unknown> = {
      "enable_pbr": enablePbr,
      "enable_geometry": enableGeometry,
    };

    const inputImageRef = this.input_image as Record<string, unknown> | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await imageToDataUrl(inputImageRef!) ?? await assetToFalUrl(apiKey, inputImageRef!);
      if (inputImageUrl) args["input_image_url"] = inputImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-3d-rapid-image-to-3d/v3.1/rapid/image-to-3d", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Hunyuan3dV21 extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Hunyuan3dV21";
  static readonly title = "Hunyuan3d V21";
  static readonly description = `Hunyuan3D-2.1 is a scalable 3D asset creation system that advances state-of-the-art 3D generation through Physically-Based Rendering (PBR).
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hunyuan3d-v21",
    unitPrice: 0.3,
    billingUnit: "generations",
    currency: "USD",
  };

  @prop({ type: "image", default: "", description: "URL of image to use while generating the 3D model." })
  declare input_image: any;

  @prop({ type: "int", default: 256, description: "Octree resolution for the model." })
  declare octree_resolution: any;

  @prop({ type: "float", default: 7.5, description: "Guidance scale for the model." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 50, description: "Number of inference steps to perform." })
  declare num_inference_steps: any;

  @prop({ type: "bool", default: false, description: "If set true, textured mesh will be generated and the price charged would be 3 times that of white mesh." })
  declare textured_mesh: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const octreeResolution = Number(this.octree_resolution ?? 256);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);
    const seed = String(this.seed ?? "");
    const numInferenceSteps = Number(this.num_inference_steps ?? 50);
    const texturedMesh = Boolean(this.textured_mesh ?? false);

    const args: Record<string, unknown> = {
      "octree_resolution": octreeResolution,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "num_inference_steps": numInferenceSteps,
      "textured_mesh": texturedMesh,
    };

    const inputImageRef = this.input_image as Record<string, unknown> | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await imageToDataUrl(inputImageRef!) ?? await assetToFalUrl(apiKey, inputImageRef!);
      if (inputImageUrl) args["input_image_url"] = inputImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan3d-v21", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Hunyuan3DV3ImageTo3D extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Hunyuan3DV3ImageTo3D";
  static readonly title = "Hunyuan3 D V3 Image To3 D";
  static readonly description = `Hunyuan3d V3
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hunyuan3d-v3/image-to-3d",
    unitPrice: 0.015,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "bool", default: false, description: "Whether to enable PBR material generation. Does not take effect when generate_type is Geometry." })
  declare enable_pbr: any;

  @prop({ type: "enum", default: "triangle", values: ["triangle", "quadrilateral"], description: "Polygon type. Only takes effect when GenerateType is LowPoly." })
  declare polygon_type: any;

  @prop({ type: "image", default: "", description: "Optional back view image URL for better 3D reconstruction." })
  declare back_image: any;

  @prop({ type: "image", default: "", description: "Optional right view image URL for better 3D reconstruction." })
  declare right_image: any;

  @prop({ type: "int", default: 500000, description: "Target face count. Range: 40000-1500000" })
  declare face_count: any;

  @prop({ type: "image", default: "", description: "URL of image to use while generating the 3D model." })
  declare input_image: any;

  @prop({ type: "enum", default: "Normal", values: ["Normal", "LowPoly", "Geometry"], description: "Generation type. Normal: textured model. LowPoly: polygon reduction. Geometry: white model without texture." })
  declare generate_type: any;

  @prop({ type: "image", default: "", description: "Optional left view image URL for better 3D reconstruction." })
  declare left_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const enablePbr = Boolean(this.enable_pbr ?? false);
    const polygonType = String(this.polygon_type ?? "triangle");
    const faceCount = Number(this.face_count ?? 500000);
    const generateType = String(this.generate_type ?? "Normal");

    const args: Record<string, unknown> = {
      "enable_pbr": enablePbr,
      "polygon_type": polygonType,
      "face_count": faceCount,
      "generate_type": generateType,
    };

    const backImageRef = this.back_image as Record<string, unknown> | undefined;
    if (isRefSet(backImageRef)) {
      const backImageUrl = await imageToDataUrl(backImageRef!) ?? await assetToFalUrl(apiKey, backImageRef!);
      if (backImageUrl) args["back_image_url"] = backImageUrl;
    }

    const rightImageRef = this.right_image as Record<string, unknown> | undefined;
    if (isRefSet(rightImageRef)) {
      const rightImageUrl = await imageToDataUrl(rightImageRef!) ?? await assetToFalUrl(apiKey, rightImageRef!);
      if (rightImageUrl) args["right_image_url"] = rightImageUrl;
    }

    const inputImageRef = this.input_image as Record<string, unknown> | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await imageToDataUrl(inputImageRef!) ?? await assetToFalUrl(apiKey, inputImageRef!);
      if (inputImageUrl) args["input_image_url"] = inputImageUrl;
    }

    const leftImageRef = this.left_image as Record<string, unknown> | undefined;
    if (isRefSet(leftImageRef)) {
      const leftImageUrl = await imageToDataUrl(leftImageRef!) ?? await assetToFalUrl(apiKey, leftImageRef!);
      if (leftImageUrl) args["left_image_url"] = leftImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan3d-v3-image-to-3d/image-to-3d", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Hunyuan3DV3SketchTo3D extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Hunyuan3DV3SketchTo3D";
  static readonly title = "Hunyuan3 D V3 Sketch To3 D";
  static readonly description = `Hunyuan3d V3
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hunyuan3d-v3/sketch-to-3d",
    unitPrice: 0.015,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "bool", default: false, description: "Whether to enable PBR material generation." })
  declare enable_pbr: any;

  @prop({ type: "image", default: "", description: "URL of sketch or line art image to transform into a 3D model. Image resolution must be between 128x128 and 5000x5000 pixels." })
  declare input_image: any;

  @prop({ type: "int", default: 500000, description: "Target face count. Range: 40000-1500000" })
  declare face_count: any;

  @prop({ type: "str", default: "", description: "Text prompt describing the 3D content attributes such as color, category, and material." })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const enablePbr = Boolean(this.enable_pbr ?? false);
    const faceCount = Number(this.face_count ?? 500000);
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      "enable_pbr": enablePbr,
      "face_count": faceCount,
      "prompt": prompt,
    };

    const inputImageRef = this.input_image as Record<string, unknown> | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await imageToDataUrl(inputImageRef!) ?? await assetToFalUrl(apiKey, inputImageRef!);
      if (inputImageUrl) args["input_image_url"] = inputImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan3d-v3-sketch-to-3d/sketch-to-3d", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Hyper3DRodinV2 extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Hyper3DRodinV2";
  static readonly title = "Hyper3 D Rodin V2";
  static readonly description = `Hyper3d
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/hyper3d/rodin/v2",
    unitPrice: 0.4,
    billingUnit: "generations",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "An array that specifies the bounding box dimensions [width, height, length]." })
  declare bbox_condition: any;

  @prop({ type: "enum", default: "500K Triangle", values: ["4K Quad", "8K Quad", "18K Quad", "50K Quad", "2K Triangle", "20K Triangle", "150K Triangle", "500K Triangle"], description: "Combined quality and mesh type selection. Quad = smooth surfaces, Triangle = detailed geometry. These corresponds to 'mesh_mode' (if the option contains 'Triangle', mesh_mode is 'Raw', otherwise 'Quad') and 'quality_override' (the numeric part of the option) parameters in Hyper3D API." })
  declare quality_mesh_option: any;

  @prop({ type: "bool", default: false, description: "Generate a preview render image of the 3D model along with the model files." })
  declare preview_render: any;

  @prop({ type: "str", default: "", description: "A textual prompt to guide model generation. Optional for Image-to-3D mode - if empty, AI will generate a prompt based on your images." })
  declare prompt: any;

  @prop({ type: "list[image]", default: [], description: "URL of images to use while generating the 3D model. Required for Image-to-3D mode. Up to 5 images allowed." })
  declare input_images: any;

  @prop({ type: "bool", default: false, description: "Generate characters in T-pose or A-pose format, making them easier to rig and animate in 3D software." })
  declare TAPose: any;

  @prop({ type: "bool", default: false, description: "When enabled, preserves the transparency channel from input images during 3D generation." })
  declare use_original_alpha: any;

  @prop({ type: "enum", default: "glb", values: ["glb", "usdz", "fbx", "obj", "stl"], description: "Format of the geometry file. Possible values: glb, usdz, fbx, obj, stl. Default is glb." })
  declare geometry_file_format: any;

  @prop({ type: "str", default: "", description: "The HighPack option will provide 4K resolution textures instead of the default 1K, as well as models with high-poly. It will cost **triple the billable units**." })
  declare addons: any;

  @prop({ type: "str", default: "", description: "Seed value for randomization, ranging from 0 to 65535. Optional." })
  declare seed: any;

  @prop({ type: "enum", default: "All", values: ["PBR", "Shaded", "All"], description: "Material type. PBR: Physically-based materials with realistic lighting. Shaded: Simple materials with baked lighting. All: Both types included." })
  declare material: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const bboxCondition = String(this.bbox_condition ?? "");
    const qualityMeshOption = String(this.quality_mesh_option ?? "500K Triangle");
    const previewRender = Boolean(this.preview_render ?? false);
    const prompt = String(this.prompt ?? "");
    const TAPose = Boolean(this.TAPose ?? false);
    const useOriginalAlpha = Boolean(this.use_original_alpha ?? false);
    const geometryFileFormat = String(this.geometry_file_format ?? "glb");
    const addons = String(this.addons ?? "");
    const seed = String(this.seed ?? "");
    const material = String(this.material ?? "All");

    const args: Record<string, unknown> = {
      "bbox_condition": bboxCondition,
      "quality_mesh_option": qualityMeshOption,
      "preview_render": previewRender,
      "prompt": prompt,
      "TAPose": TAPose,
      "use_original_alpha": useOriginalAlpha,
      "geometry_file_format": geometryFileFormat,
      "addons": addons,
      "seed": seed,
      "material": material,
    };

    const inputImagesList = this.input_images as Record<string, unknown>[] | undefined;
    if (inputImagesList?.length) {
      const inputImagesUrls: string[] = [];
      for (const ref of inputImagesList) {
        if (isRefSet(ref)) { const u = await assetToFalUrl(apiKey, ref); if (u) inputImagesUrls.push(u); }
      }
      if (inputImagesUrls.length) args["input_image_urls"] = inputImagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hyper3d/rodin/v2", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class MeshyV5MultiImageTo3D extends FalNode {
  static readonly nodeType = "fal.image_to_3d.MeshyV5MultiImageTo3D";
  static readonly title = "Meshy V5 Multi Image To3 D";
  static readonly description = `Meshy 5 Multi
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/meshy/v5/multi-image-to-3d",
    unitPrice: 0.4,
    billingUnit: "generations",
    currency: "USD",
  };

  @prop({ type: "bool", default: false, description: "Generate PBR Maps (metallic, roughness, normal) in addition to base color. Requires should_texture to be true." })
  declare enable_pbr: any;

  @prop({ type: "str", default: "", description: "Text prompt to guide the texturing process. Requires should_texture to be true." })
  declare texture_prompt: any;

  @prop({ type: "int", default: 30000, description: "Target number of polygons in the generated model" })
  declare target_polycount: any;

  @prop({ type: "bool", default: false, description: "Automatically rig the generated model as a humanoid character. Includes basic walking and running animations. Best results with humanoid characters that have clearly defined limbs." })
  declare enable_rigging: any;

  @prop({ type: "int", default: 1001, description: "Animation preset ID from Meshy's library (500+ presets). Only used when enable_animation is true. See https://docs.meshy.ai/en/api/animation-library for available action IDs." })
  declare animation_action_id: any;

  @prop({ type: "enum", default: "auto", values: ["off", "auto", "on"], description: "Controls symmetry behavior during model generation." })
  declare symmetry_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, input data will be checked for safety before processing." })
  declare enable_safety_checker: any;

  @prop({ type: "list[image]", default: [], description: "1 to 4 images for 3D model creation. All images should depict the same object from different angles. Supports .jpg, .jpeg, .png formats, and AVIF/HEIF which will be automatically converted. If more than 4 images are provided, only the first 4 will be used." })
  declare images: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the remesh phase. When false, returns triangular mesh ignoring topology and target_polycount." })
  declare should_remesh: any;

  @prop({ type: "bool", default: true, description: "Whether to generate textures. False provides mesh without textures for 5 credits, True adds texture generation for additional 10 credits." })
  declare should_texture: any;

  @prop({ type: "bool", default: false, description: "Apply an animation preset to the rigged model. Requires enable_rigging to be true." })
  declare enable_animation: any;

  @prop({ type: "enum", default: "", values: ["a-pose", "t-pose", ""], description: "Pose mode for the generated model. 'a-pose' generates an A-pose, 't-pose' generates a T-pose, empty string for no specific pose." })
  declare pose_mode: any;

  @prop({ type: "enum", default: "triangle", values: ["quad", "triangle"], description: "Specify the topology of the generated model. Quad for smooth surfaces, Triangle for detailed geometry." })
  declare topology: any;

  @prop({ type: "image", default: "", description: "2D image to guide the texturing process. Requires should_texture to be true." })
  declare texture_image: any;

  @prop({ type: "bool", default: false, description: "Deprecated: use pose_mode instead. When true, generates a T-pose model." })
  declare is_a_t_pose: any;

  @prop({ type: "float", default: 1.7, description: "Approximate height of the character in meters. Only used when enable_rigging is true." })
  declare rigging_height_meters: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const enablePbr = Boolean(this.enable_pbr ?? false);
    const texturePrompt = String(this.texture_prompt ?? "");
    const targetPolycount = Number(this.target_polycount ?? 30000);
    const enableRigging = Boolean(this.enable_rigging ?? false);
    const animationActionId = Number(this.animation_action_id ?? 1001);
    const symmetryMode = String(this.symmetry_mode ?? "auto");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const shouldRemesh = Boolean(this.should_remesh ?? true);
    const shouldTexture = Boolean(this.should_texture ?? true);
    const enableAnimation = Boolean(this.enable_animation ?? false);
    const poseMode = String(this.pose_mode ?? "");
    const topology = String(this.topology ?? "triangle");
    const isATPose = Boolean(this.is_a_t_pose ?? false);
    const riggingHeightMeters = Number(this.rigging_height_meters ?? 1.7);

    const args: Record<string, unknown> = {
      "enable_pbr": enablePbr,
      "texture_prompt": texturePrompt,
      "target_polycount": targetPolycount,
      "enable_rigging": enableRigging,
      "animation_action_id": animationActionId,
      "symmetry_mode": symmetryMode,
      "enable_safety_checker": enableSafetyChecker,
      "should_remesh": shouldRemesh,
      "should_texture": shouldTexture,
      "enable_animation": enableAnimation,
      "pose_mode": poseMode,
      "topology": topology,
      "is_a_t_pose": isATPose,
      "rigging_height_meters": riggingHeightMeters,
    };

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) { const u = await assetToFalUrl(apiKey, ref); if (u) imagesUrls.push(u); }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }

    const textureImageRef = this.texture_image as Record<string, unknown> | undefined;
    if (isRefSet(textureImageRef)) {
      const textureImageUrl = await imageToDataUrl(textureImageRef!) ?? await assetToFalUrl(apiKey, textureImageRef!);
      if (textureImageUrl) args["texture_image_url"] = textureImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/meshy/v5/multi-image-to-3d", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class MeshyV6PreviewImageTo3D extends FalNode {
  static readonly nodeType = "fal.image_to_3d.MeshyV6PreviewImageTo3D";
  static readonly title = "Meshy V6 Preview Image To3 D";
  static readonly description = `Meshy 6 Preview
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = null;

  @prop({ type: "bool", default: false, description: "Generate PBR Maps (metallic, roughness, normal) in addition to base color" })
  declare enable_pbr: any;

  @prop({ type: "str", default: "", description: "Text prompt to guide the texturing process" })
  declare texture_prompt: any;

  @prop({ type: "int", default: 30000, description: "Target number of polygons in the generated model" })
  declare target_polycount: any;

  @prop({ type: "bool", default: false, description: "Automatically rig the generated model as a humanoid character. Includes basic walking and running animations. Best results with humanoid characters that have clearly defined limbs." })
  declare enable_rigging: any;

  @prop({ type: "int", default: 1001, description: "Animation preset ID from Meshy's library (500+ presets). Only used when enable_animation is true. See https://docs.meshy.ai/en/api/animation-library for available action IDs." })
  declare animation_action_id: any;

  @prop({ type: "enum", default: "auto", values: ["off", "auto", "on"], description: "Controls symmetry behavior during model generation. Off disables symmetry, Auto determines it automatically, On enforces symmetry." })
  declare symmetry_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, input data will be checked for safety before processing." })
  declare enable_safety_checker: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the remesh phase" })
  declare should_remesh: any;

  @prop({ type: "bool", default: true, description: "Whether to generate textures" })
  declare should_texture: any;

  @prop({ type: "bool", default: false, description: "Apply an animation preset to the rigged model. Requires enable_rigging to be true." })
  declare enable_animation: any;

  @prop({ type: "enum", default: "", values: ["a-pose", "t-pose", ""], description: "Pose mode for the generated model. 'a-pose' generates an A-pose, 't-pose' generates a T-pose, empty string for no specific pose." })
  declare pose_mode: any;

  @prop({ type: "image", default: "", description: "Image URL or base64 data URI for 3D model creation. Supports .jpg, .jpeg, and .png formats. Also supports AVIF and HEIF formats which will be automatically converted." })
  declare image: any;

  @prop({ type: "enum", default: "triangle", values: ["quad", "triangle"], description: "Specify the topology of the generated model. Quad for smooth surfaces, Triangle for detailed geometry." })
  declare topology: any;

  @prop({ type: "image", default: "", description: "2D image to guide the texturing process" })
  declare texture_image: any;

  @prop({ type: "bool", default: false, description: "Deprecated: use pose_mode instead. When true, generates a T-pose model." })
  declare is_a_t_pose: any;

  @prop({ type: "float", default: 1.7, description: "Approximate height of the character in meters. Only used when enable_rigging is true." })
  declare rigging_height_meters: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const enablePbr = Boolean(this.enable_pbr ?? false);
    const texturePrompt = String(this.texture_prompt ?? "");
    const targetPolycount = Number(this.target_polycount ?? 30000);
    const enableRigging = Boolean(this.enable_rigging ?? false);
    const animationActionId = Number(this.animation_action_id ?? 1001);
    const symmetryMode = String(this.symmetry_mode ?? "auto");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const shouldRemesh = Boolean(this.should_remesh ?? true);
    const shouldTexture = Boolean(this.should_texture ?? true);
    const enableAnimation = Boolean(this.enable_animation ?? false);
    const poseMode = String(this.pose_mode ?? "");
    const topology = String(this.topology ?? "triangle");
    const isATPose = Boolean(this.is_a_t_pose ?? false);
    const riggingHeightMeters = Number(this.rigging_height_meters ?? 1.7);

    const args: Record<string, unknown> = {
      "enable_pbr": enablePbr,
      "texture_prompt": texturePrompt,
      "target_polycount": targetPolycount,
      "enable_rigging": enableRigging,
      "animation_action_id": animationActionId,
      "symmetry_mode": symmetryMode,
      "enable_safety_checker": enableSafetyChecker,
      "should_remesh": shouldRemesh,
      "should_texture": shouldTexture,
      "enable_animation": enableAnimation,
      "pose_mode": poseMode,
      "topology": topology,
      "is_a_t_pose": isATPose,
      "rigging_height_meters": riggingHeightMeters,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const textureImageRef = this.texture_image as Record<string, unknown> | undefined;
    if (isRefSet(textureImageRef)) {
      const textureImageUrl = await imageToDataUrl(textureImageRef!) ?? await assetToFalUrl(apiKey, textureImageRef!);
      if (textureImageUrl) args["texture_image_url"] = textureImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/meshy/v6-preview/image-to-3d", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class MeshyV6PreviewImageTo3D extends FalNode {
  static readonly nodeType = "fal.image_to_3d.MeshyV6PreviewImageTo3D";
  static readonly title = "Meshy V6 Preview Image To3 D";
  static readonly description = `Meshy 6 Preview
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/meshy/v6/image-to-3d",
    unitPrice: 0.8,
    billingUnit: "generations",
    currency: "USD",
  };

  @prop({ type: "bool", default: false, description: "Generate PBR Maps (metallic, roughness, normal) in addition to base color" })
  declare enable_pbr: any;

  @prop({ type: "str", default: "", description: "Text prompt to guide the texturing process" })
  declare texture_prompt: any;

  @prop({ type: "int", default: 30000, description: "Target number of polygons in the generated model" })
  declare target_polycount: any;

  @prop({ type: "bool", default: false, description: "Automatically rig the generated model as a humanoid character. Includes basic walking and running animations. Best results with humanoid characters that have clearly defined limbs." })
  declare enable_rigging: any;

  @prop({ type: "int", default: 1001, description: "Animation preset ID from Meshy's library (500+ presets). Only used when enable_animation is true. See https://docs.meshy.ai/en/api/animation-library for available action IDs." })
  declare animation_action_id: any;

  @prop({ type: "enum", default: "auto", values: ["off", "auto", "on"], description: "Controls symmetry behavior during model generation. Off disables symmetry, Auto determines it automatically, On enforces symmetry." })
  declare symmetry_mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, input data will be checked for safety before processing." })
  declare enable_safety_checker: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the remesh phase" })
  declare should_remesh: any;

  @prop({ type: "bool", default: true, description: "Whether to generate textures" })
  declare should_texture: any;

  @prop({ type: "bool", default: false, description: "Apply an animation preset to the rigged model. Requires enable_rigging to be true." })
  declare enable_animation: any;

  @prop({ type: "enum", default: "", values: ["a-pose", "t-pose", ""], description: "Pose mode for the generated model. 'a-pose' generates an A-pose, 't-pose' generates a T-pose, empty string for no specific pose." })
  declare pose_mode: any;

  @prop({ type: "image", default: "", description: "Image URL or base64 data URI for 3D model creation. Supports .jpg, .jpeg, and .png formats. Also supports AVIF and HEIF formats which will be automatically converted." })
  declare image: any;

  @prop({ type: "enum", default: "triangle", values: ["quad", "triangle"], description: "Specify the topology of the generated model. Quad for smooth surfaces, Triangle for detailed geometry." })
  declare topology: any;

  @prop({ type: "image", default: "", description: "2D image to guide the texturing process" })
  declare texture_image: any;

  @prop({ type: "bool", default: false, description: "Deprecated: use pose_mode instead. When true, generates a T-pose model." })
  declare is_a_t_pose: any;

  @prop({ type: "float", default: 1.7, description: "Approximate height of the character in meters. Only used when enable_rigging is true." })
  declare rigging_height_meters: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const enablePbr = Boolean(this.enable_pbr ?? false);
    const texturePrompt = String(this.texture_prompt ?? "");
    const targetPolycount = Number(this.target_polycount ?? 30000);
    const enableRigging = Boolean(this.enable_rigging ?? false);
    const animationActionId = Number(this.animation_action_id ?? 1001);
    const symmetryMode = String(this.symmetry_mode ?? "auto");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);
    const shouldRemesh = Boolean(this.should_remesh ?? true);
    const shouldTexture = Boolean(this.should_texture ?? true);
    const enableAnimation = Boolean(this.enable_animation ?? false);
    const poseMode = String(this.pose_mode ?? "");
    const topology = String(this.topology ?? "triangle");
    const isATPose = Boolean(this.is_a_t_pose ?? false);
    const riggingHeightMeters = Number(this.rigging_height_meters ?? 1.7);

    const args: Record<string, unknown> = {
      "enable_pbr": enablePbr,
      "texture_prompt": texturePrompt,
      "target_polycount": targetPolycount,
      "enable_rigging": enableRigging,
      "animation_action_id": animationActionId,
      "symmetry_mode": symmetryMode,
      "enable_safety_checker": enableSafetyChecker,
      "should_remesh": shouldRemesh,
      "should_texture": shouldTexture,
      "enable_animation": enableAnimation,
      "pose_mode": poseMode,
      "topology": topology,
      "is_a_t_pose": isATPose,
      "rigging_height_meters": riggingHeightMeters,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const textureImageRef = this.texture_image as Record<string, unknown> | undefined;
    if (isRefSet(textureImageRef)) {
      const textureImageUrl = await imageToDataUrl(textureImageRef!) ?? await assetToFalUrl(apiKey, textureImageRef!);
      if (textureImageUrl) args["texture_image_url"] = textureImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/meshy/v6-preview/image-to-3d", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Omnipart extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Omnipart";
  static readonly title = "Omnipart";
  static readonly description = `Omnipart
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/omnipart",
    unitPrice: 0.2,
    billingUnit: "requests",
    currency: "USD",
  };

  @prop({ type: "image", default: "", description: "URL of image to use while generating the 3D model." })
  declare input_image: any;

  @prop({ type: "str", default: "", description: "Specify which segments to merge (e.g., '0,1;3,4' merges segments 0&1 together and 3&4 together)" })
  declare parts: any;

  @prop({ type: "int", default: 765464, description: "\n            The same seed and the same prompt given to the same version of the model\n            will output the same image every time.\n        " })
  declare seed: any;

  @prop({ type: "int", default: 2000, description: "Minimum segment size (pixels) for the model." })
  declare minimum_segment_size: any;

  @prop({ type: "float", default: 7.5, description: "Guidance scale for the model." })
  declare guidance_scale: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const parts = String(this.parts ?? "");
    const seed = Number(this.seed ?? 765464);
    const minimumSegmentSize = Number(this.minimum_segment_size ?? 2000);
    const guidanceScale = Number(this.guidance_scale ?? 7.5);

    const args: Record<string, unknown> = {
      "parts": parts,
      "seed": seed,
      "minimum_segment_size": minimumSegmentSize,
      "guidance_scale": guidanceScale,
    };

    const inputImageRef = this.input_image as Record<string, unknown> | undefined;
    if (isRefSet(inputImageRef)) {
      const inputImageUrl = await imageToDataUrl(inputImageRef!) ?? await assetToFalUrl(apiKey, inputImageRef!);
      if (inputImageUrl) args["input_image_url"] = inputImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/omnipart", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Pshuman extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Pshuman";
  static readonly title = "Pshuman";
  static readonly description = `Pshuman
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "model_obj": "str", "preview_image": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/pshuman",
    unitPrice: 0.75,
    billingUnit: "generations",
    currency: "USD",
  };

  @prop({ type: "float", default: 4, description: "Guidance scale for the diffusion process. Controls how much the output adheres to the generated views." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Seed for reproducibility. If None, a random seed will be used." })
  declare seed: any;

  @prop({ type: "image", default: "", description: "A direct URL to the input image of a person." })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const guidanceScale = Number(this.guidance_scale ?? 4);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "guidance_scale": guidanceScale,
      "seed": seed,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/pshuman", args);
    return {
      "model_obj": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["model_obj"]),
      "preview_image": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["preview_image"]),
    };
  }
}

export class Sam33DBody extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Sam33DBody";
  static readonly title = "Sam33 D Body";
  static readonly description = `Sam 3
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/sam-3/3d-body",
    unitPrice: 0.02,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "image", default: "", description: "URL of the image containing humans" })
  declare image: any;

  @prop({ type: "bool", default: true, description: "Include 3D keypoint markers (spheres) in the GLB mesh for visualization" })
  declare include_3d_keypoints: any;

  @prop({ type: "image", default: "", description: "Optional URL of a binary mask image (white=person, black=background). When provided, skips auto human detection and uses this mask instead. Bbox is auto-computed from the mask." })
  declare mask_url: any;

  @prop({ type: "bool", default: true, description: "Export individual mesh files (.ply) per person" })
  declare export_meshes: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const include_3dKeypoints = Boolean(this.include_3d_keypoints ?? true);
    const exportMeshes = Boolean(this.export_meshes ?? true);

    const args: Record<string, unknown> = {
      "include_3d_keypoints": include_3dKeypoints,
      "export_meshes": exportMeshes,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }

    const maskUrlRef = this.mask_url as Record<string, unknown> | undefined;
    if (isRefSet(maskUrlRef)) {
      const maskUrlUrl = await imageToDataUrl(maskUrlRef!) ?? await assetToFalUrl(apiKey, maskUrlRef!);
      if (maskUrlUrl) args["mask_url"] = maskUrlUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-3/3d-body", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Sam33DObjects extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Sam33DObjects";
  static readonly title = "Sam33 D Objects";
  static readonly description = `Sam 3
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/sam-3/3d-objects",
    unitPrice: 0.02,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Optional URL to external pointmap/depth data (NPY or NPZ format) for improved 3D reconstruction depth estimation" })
  declare pointmap_url: any;

  @prop({ type: "bool", default: false, description: "If True, exports GLB with baked texture and UVs instead of vertex colors." })
  declare export_textured_glb: any;

  @prop({ type: "str", default: "", description: "Detection confidence threshold (0.1-1.0). Lower = more detections but less precise. If not set, uses the model's default." })
  declare detection_threshold: any;

  @prop({ type: "str", default: "car", description: "Text prompt for auto-segmentation when no masks provided (e.g., 'chair', 'lamp')" })
  declare prompt: any;

  @prop({ type: "list[BoxPromptBase]", default: [], description: "Box prompts for auto-segmentation when no masks provided. Multiple boxes supported - each produces a separate object mask for 3D reconstruction." })
  declare box_prompts: any;

  @prop({ type: "image", default: "", description: "URL of the image to reconstruct in 3D" })
  declare image: any;

  @prop({ type: "list[str]", default: [], description: "Optional list of mask URLs (one per object). If not provided, use prompt/point_prompts/box_prompts to auto-segment, or entire image will be used." })
  declare mask_urls: any;

  @prop({ type: "list[PointPromptBase]", default: [], description: "Point prompts for auto-segmentation when no masks provided" })
  declare point_prompts: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility" })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const pointmapUrl = String(this.pointmap_url ?? "");
    const exportTexturedGlb = Boolean(this.export_textured_glb ?? false);
    const detectionThreshold = String(this.detection_threshold ?? "");
    const prompt = String(this.prompt ?? "car");
    const boxPrompts = String(this.box_prompts ?? []);
    const maskUrls = String(this.mask_urls ?? []);
    const pointPrompts = String(this.point_prompts ?? []);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "pointmap_url": pointmapUrl,
      "export_textured_glb": exportTexturedGlb,
      "detection_threshold": detectionThreshold,
      "prompt": prompt,
      "box_prompts": boxPrompts,
      "mask_urls": maskUrls,
      "point_prompts": pointPrompts,
      "seed": seed,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-3/3d-objects", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Trellis extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Trellis";
  static readonly title = "Trellis";
  static readonly description = `Generate 3D models from your images using Trellis. A native 3D generative model enabling versatile and high-quality 3D asset creation.
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/trellis",
    unitPrice: 0.02,
    billingUnit: "",
    currency: "USD",
  };

  @prop({ type: "float", default: 7.5, description: "Guidance strength for sparse structure generation" })
  declare ss_guidance_strength: any;

  @prop({ type: "float", default: 0.95, description: "Mesh simplification factor" })
  declare mesh_simplify: any;

  @prop({ type: "image", default: "", description: "URL of the input image to convert to 3D" })
  declare image: any;

  @prop({ type: "float", default: 3, description: "Guidance strength for structured latent generation" })
  declare slat_guidance_strength: any;

  @prop({ type: "int", default: 12, description: "Sampling steps for structured latent generation" })
  declare slat_sampling_steps: any;

  @prop({ type: "int", default: 12, description: "Sampling steps for sparse structure generation" })
  declare ss_sampling_steps: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility" })
  declare seed: any;

  @prop({ type: "enum", default: 1024, values: [512, 1024, 2048], description: "Texture resolution" })
  declare texture_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const ssGuidanceStrength = Number(this.ss_guidance_strength ?? 7.5);
    const meshSimplify = Number(this.mesh_simplify ?? 0.95);
    const slatGuidanceStrength = Number(this.slat_guidance_strength ?? 3);
    const slatSamplingSteps = Number(this.slat_sampling_steps ?? 12);
    const ssSamplingSteps = Number(this.ss_sampling_steps ?? 12);
    const seed = String(this.seed ?? "");
    const textureSize = String(this.texture_size ?? 1024);

    const args: Record<string, unknown> = {
      "ss_guidance_strength": ssGuidanceStrength,
      "mesh_simplify": meshSimplify,
      "slat_guidance_strength": slatGuidanceStrength,
      "slat_sampling_steps": slatSamplingSteps,
      "ss_sampling_steps": ssSamplingSteps,
      "seed": seed,
      "texture_size": textureSize,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/trellis", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Trellis2 extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Trellis2";
  static readonly title = "Trellis2";
  static readonly description = `Trellis 2
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/trellis-2",
    unitPrice: 0.05,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "float", default: 1, description: "How closely the texture follows the input image colors. Higher values produce more vivid but potentially oversaturated textures." })
  declare tex_slat_guidance_strength: any;

  @prop({ type: "int", default: 12, description: "Number of denoising steps for texture generation. More steps = slower but potentially cleaner textures." })
  declare tex_slat_sampling_steps: any;

  @prop({ type: "float", default: 5, description: "Controls noise schedule sharpness for structure generation. Higher values produce sharper transitions." })
  declare ss_rescale_t: any;

  @prop({ type: "int", default: 12, description: "Number of denoising steps for shape refinement. More steps = slower but potentially smoother geometry." })
  declare shape_slat_sampling_steps: any;

  @prop({ type: "float", default: 3, description: "Controls noise schedule sharpness for texture generation. Higher values produce sharper texture details." })
  declare tex_slat_rescale_t: any;

  @prop({ type: "float", default: 7.5, description: "How closely the initial 3D structure follows the input image. Higher values produce more faithful but potentially noisier results." })
  declare ss_guidance_strength: any;

  @prop({ type: "int", default: 12, description: "Number of denoising steps for the initial structure. More steps = slower but potentially higher quality." })
  declare ss_sampling_steps: any;

  @prop({ type: "float", default: 0.7, description: "Dampens artifacts from high guidance in stage 1. Lower values allow stronger guidance effects, higher values stabilize the output." })
  declare ss_guidance_rescale: any;

  @prop({ type: "float", default: 0, description: "How much to project remeshed vertices back onto the original surface. 0 = no projection (smoother), 1 = full projection (preserves detail)." })
  declare remesh_project: any;

  @prop({ type: "enum", default: 2048, values: [1024, 2048, 4096], description: "Resolution of the texture image baked onto the mesh. Higher values capture finer surface details but produce larger files." })
  declare texture_size: any;

  @prop({ type: "float", default: 3, description: "Controls noise schedule sharpness for shape refinement. Higher values produce sharper geometric details." })
  declare shape_slat_rescale_t: any;

  @prop({ type: "enum", default: 1024, values: [512, 1024, 1536], description: "Output resolution; higher is slower but more detailed" })
  declare resolution: any;

  @prop({ type: "bool", default: true, description: "Rebuild the mesh topology for cleaner triangles. Slower but usually produces better results for downstream use (animation, 3D printing, etc)." })
  declare remesh: any;

  @prop({ type: "float", default: 0, description: "Dampens artifacts from high guidance in the texture stage. Increase if textures look noisy or have color banding." })
  declare tex_slat_guidance_rescale: any;

  @prop({ type: "float", default: 0.5, description: "Dampens artifacts from high guidance in the shape stage. Increase if you see noisy geometry." })
  declare shape_slat_guidance_rescale: any;

  @prop({ type: "image", default: "", description: "URL of the input image to convert to 3D" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility" })
  declare seed: any;

  @prop({ type: "float", default: 1, description: "Controls how far remeshing can move vertices from the original surface. Higher values allow more smoothing but may lose fine details." })
  declare remesh_band: any;

  @prop({ type: "float", default: 7.5, description: "How closely the detailed geometry follows the input image. Higher values add more detail but may introduce noise." })
  declare shape_slat_guidance_strength: any;

  @prop({ type: "int", default: 500000, description: "Target number of vertices in the final mesh. Lower values produce smaller files but less detail. 500k is good for most uses, reduce to 20k-50k for web/mobile." })
  declare decimation_target: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const texSlatGuidanceStrength = Number(this.tex_slat_guidance_strength ?? 1);
    const texSlatSamplingSteps = Number(this.tex_slat_sampling_steps ?? 12);
    const ssRescaleT = Number(this.ss_rescale_t ?? 5);
    const shapeSlatSamplingSteps = Number(this.shape_slat_sampling_steps ?? 12);
    const texSlatRescaleT = Number(this.tex_slat_rescale_t ?? 3);
    const ssGuidanceStrength = Number(this.ss_guidance_strength ?? 7.5);
    const ssSamplingSteps = Number(this.ss_sampling_steps ?? 12);
    const ssGuidanceRescale = Number(this.ss_guidance_rescale ?? 0.7);
    const remeshProject = Number(this.remesh_project ?? 0);
    const textureSize = String(this.texture_size ?? 2048);
    const shapeSlatRescaleT = Number(this.shape_slat_rescale_t ?? 3);
    const resolution = String(this.resolution ?? 1024);
    const remesh = Boolean(this.remesh ?? true);
    const texSlatGuidanceRescale = Number(this.tex_slat_guidance_rescale ?? 0);
    const shapeSlatGuidanceRescale = Number(this.shape_slat_guidance_rescale ?? 0.5);
    const seed = String(this.seed ?? "");
    const remeshBand = Number(this.remesh_band ?? 1);
    const shapeSlatGuidanceStrength = Number(this.shape_slat_guidance_strength ?? 7.5);
    const decimationTarget = Number(this.decimation_target ?? 500000);

    const args: Record<string, unknown> = {
      "tex_slat_guidance_strength": texSlatGuidanceStrength,
      "tex_slat_sampling_steps": texSlatSamplingSteps,
      "ss_rescale_t": ssRescaleT,
      "shape_slat_sampling_steps": shapeSlatSamplingSteps,
      "tex_slat_rescale_t": texSlatRescaleT,
      "ss_guidance_strength": ssGuidanceStrength,
      "ss_sampling_steps": ssSamplingSteps,
      "ss_guidance_rescale": ssGuidanceRescale,
      "remesh_project": remeshProject,
      "texture_size": textureSize,
      "shape_slat_rescale_t": shapeSlatRescaleT,
      "resolution": resolution,
      "remesh": remesh,
      "tex_slat_guidance_rescale": texSlatGuidanceRescale,
      "shape_slat_guidance_rescale": shapeSlatGuidanceRescale,
      "seed": seed,
      "remesh_band": remeshBand,
      "shape_slat_guidance_strength": shapeSlatGuidanceStrength,
      "decimation_target": decimationTarget,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/trellis-2", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Trellis2Retexture extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Trellis2Retexture";
  static readonly title = "Trellis2 Retexture";
  static readonly description = `Generate 3D models from your images using Trellis 2. A native 3D generative model enabling versatile and high-quality 3D asset creation.
image-to-3D`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/trellis-2/retexture",
    unitPrice: 0.04,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "enum", default: 1024, values: [512, 1024], description: "Internal resolution for texture generation. Higher produces finer texture details but is slower." })
  declare resolution: any;

  @prop({ type: "int", default: 12, description: "Number of denoising steps for texture generation. More steps = slower but potentially cleaner textures." })
  declare tex_slat_sampling_steps: any;

  @prop({ type: "float", default: 3, description: "Controls noise schedule sharpness for texture generation. Higher values produce sharper texture details." })
  declare tex_slat_rescale_t: any;

  @prop({ type: "float", default: 0, description: "Dampens artifacts from high guidance in the texture stage. Increase if textures look noisy or have color banding." })
  declare tex_slat_guidance_rescale: any;

  @prop({ type: "image", default: "", description: "URL of the reference image for texturing" })
  declare image: any;

  @prop({ type: "str", default: "", description: "URL of the untextured 3D mesh to retexture. Supports GLB, OBJ, PLY, and STL formats." })
  declare mesh_url: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility" })
  declare seed: any;

  @prop({ type: "float", default: 1, description: "How closely the texture follows the input image colors. Higher values produce more vivid but potentially oversaturated textures." })
  declare tex_slat_guidance_strength: any;

  @prop({ type: "enum", default: 2048, values: [1024, 2048, 4096], description: "Resolution of the texture image baked onto the mesh. Higher values capture finer surface details but produce larger files." })
  declare texture_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const resolution = String(this.resolution ?? 1024);
    const texSlatSamplingSteps = Number(this.tex_slat_sampling_steps ?? 12);
    const texSlatRescaleT = Number(this.tex_slat_rescale_t ?? 3);
    const texSlatGuidanceRescale = Number(this.tex_slat_guidance_rescale ?? 0);
    const meshUrl = String(this.mesh_url ?? "");
    const seed = String(this.seed ?? "");
    const texSlatGuidanceStrength = Number(this.tex_slat_guidance_strength ?? 1);
    const textureSize = String(this.texture_size ?? 2048);

    const args: Record<string, unknown> = {
      "resolution": resolution,
      "tex_slat_sampling_steps": texSlatSamplingSteps,
      "tex_slat_rescale_t": texSlatRescaleT,
      "tex_slat_guidance_rescale": texSlatGuidanceRescale,
      "mesh_url": meshUrl,
      "seed": seed,
      "tex_slat_guidance_strength": texSlatGuidanceStrength,
      "texture_size": textureSize,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/trellis-2/retexture", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class TrellisMulti extends FalNode {
  static readonly nodeType = "fal.image_to_3d.TrellisMulti";
  static readonly title = "Trellis Multi";
  static readonly description = `Generate 3D models from multiple images using Trellis. A native 3D generative model enabling versatile and high-quality 3D asset creation.
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/trellis/multi",
    unitPrice: 0.02,
    billingUnit: "",
    currency: "USD",
  };

  @prop({ type: "enum", default: "stochastic", values: ["stochastic", "multidiffusion"], description: "Algorithm for multi-image generation" })
  declare multiimage_algo: any;

  @prop({ type: "int", default: 12, description: "Sampling steps for structured latent generation" })
  declare slat_sampling_steps: any;

  @prop({ type: "float", default: 0.95, description: "Mesh simplification factor" })
  declare mesh_simplify: any;

  @prop({ type: "float", default: 7.5, description: "Guidance strength for sparse structure generation" })
  declare ss_guidance_strength: any;

  @prop({ type: "float", default: 3, description: "Guidance strength for structured latent generation" })
  declare slat_guidance_strength: any;

  @prop({ type: "int", default: 12, description: "Sampling steps for sparse structure generation" })
  declare ss_sampling_steps: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducibility" })
  declare seed: any;

  @prop({ type: "list[image]", default: [], description: "List of URLs of input images to convert to 3D" })
  declare images: any;

  @prop({ type: "enum", default: 1024, values: [512, 1024, 2048], description: "Texture resolution" })
  declare texture_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const multiimageAlgo = String(this.multiimage_algo ?? "stochastic");
    const slatSamplingSteps = Number(this.slat_sampling_steps ?? 12);
    const meshSimplify = Number(this.mesh_simplify ?? 0.95);
    const ssGuidanceStrength = Number(this.ss_guidance_strength ?? 7.5);
    const slatGuidanceStrength = Number(this.slat_guidance_strength ?? 3);
    const ssSamplingSteps = Number(this.ss_sampling_steps ?? 12);
    const seed = String(this.seed ?? "");
    const textureSize = String(this.texture_size ?? 1024);

    const args: Record<string, unknown> = {
      "multiimage_algo": multiimageAlgo,
      "slat_sampling_steps": slatSamplingSteps,
      "mesh_simplify": meshSimplify,
      "ss_guidance_strength": ssGuidanceStrength,
      "slat_guidance_strength": slatGuidanceStrength,
      "ss_sampling_steps": ssSamplingSteps,
      "seed": seed,
      "texture_size": textureSize,
    };

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) { const u = await assetToFalUrl(apiKey, ref); if (u) imagesUrls.push(u); }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/trellis/multi", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Tripo3dTripoV25ImageTo3d extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Tripo3dTripoV25ImageTo3d";
  static readonly title = "Tripo3d Tripo V25 Image To3d";
  static readonly description = `State of the art Image to 3D Object generation. Generate 3D model from a single image!
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "tripo3d/tripo/v2.5/image-to-3d",
    unitPrice: 0.00007,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "int", default: 0, description: "Limits the number of faces on the output model. If this option is not set, the face limit will be adaptively determined." })
  declare face_limit: any;

  @prop({ type: "enum", default: "", values: ["person:person2cartoon", "object:clay", "object:steampunk", "animal:venom", "object:barbie", "object:christmas", "gold", "ancient_bronze"], description: "[DEPRECATED] Defines the artistic style or transformation to be applied to the 3D model, altering its appearance according to preset options (extra $0.05 per generation). Omit this option to keep the original style and apperance." })
  declare style: any;

  @prop({ type: "bool", default: false, description: "A boolean option to enable pbr. The default value is True, set False to get a model without pbr. If this option is set to True, texture will be ignored and used as True." })
  declare pbr: any;

  @prop({ type: "enum", default: "original_image", values: ["original_image", "geometry"], description: "Determines the prioritization of texture alignment in the 3D model. The default value is original_image." })
  declare texture_alignment: any;

  @prop({ type: "image", default: "", description: "URL of the image to use for model generation." })
  declare image: any;

  @prop({ type: "enum", default: "standard", values: ["no", "standard", "HD"], description: "An option to enable texturing. Default is 'standard', set 'no' to get a model without any textures, and set 'HD' to get a model with hd quality textures." })
  declare texture: any;

  @prop({ type: "bool", default: false, description: "Automatically scale the model to real-world dimensions, with the unit in meters. The default value is False." })
  declare auto_size: any;

  @prop({ type: "int", default: -1, description: "This is the random seed for model generation. The seed controls the geometry generation process, ensuring identical models when the same seed is used. This parameter is an integer and is randomly chosen if not set." })
  declare seed: any;

  @prop({ type: "bool", default: false, description: "Set True to enable quad mesh output (extra $0.05 per generation). If quad=True and face_limit is not set, the default face_limit will be 10000. Note: Enabling this option will force the output to be an FBX model." })
  declare quad: any;

  @prop({ type: "enum", default: "default", values: ["default", "align_image"], description: "Set orientation=align_image to automatically rotate the model to align the original image. The default value is default." })
  declare orientation: any;

  @prop({ type: "int", default: -1, description: "This is the random seed for texture generation. Using the same seed will produce identical textures. This parameter is an integer and is randomly chosen if not set. If you want a model with different textures, please use same seed and different texture_seed." })
  declare texture_seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const faceLimit = Number(this.face_limit ?? 0);
    const style = String(this.style ?? "");
    const pbr = Boolean(this.pbr ?? false);
    const textureAlignment = String(this.texture_alignment ?? "original_image");
    const texture = String(this.texture ?? "standard");
    const autoSize = Boolean(this.auto_size ?? false);
    const seed = Number(this.seed ?? -1);
    const quad = Boolean(this.quad ?? false);
    const orientation = String(this.orientation ?? "default");
    const textureSeed = Number(this.texture_seed ?? -1);

    const args: Record<string, unknown> = {
      "face_limit": faceLimit,
      "style": style,
      "pbr": pbr,
      "texture_alignment": textureAlignment,
      "texture": texture,
      "auto_size": autoSize,
      "seed": seed,
      "quad": quad,
      "orientation": orientation,
      "texture_seed": textureSeed,
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await imageToDataUrl(imageRef!) ?? await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "Tripo3d/tripo/v2.5/image-to-3d", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export class Tripo3dTripoV25MultiviewTo3d extends FalNode {
  static readonly nodeType = "fal.image_to_3d.Tripo3dTripoV25MultiviewTo3d";
  static readonly title = "Tripo3d Tripo V25 Multiview To3d";
  static readonly description = `State of the art Multiview to 3D Object generation. Generate 3D models from multiple images!
3d, generation, image-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "model_3d" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "tripo3d/tripo/v2.5/multiview-to-3d",
    unitPrice: 0.00007,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "int", default: 0, description: "Limits the number of faces on the output model. If this option is not set, the face limit will be adaptively determined." })
  declare face_limit: any;

  @prop({ type: "image", default: "", description: "Right view image of the object." })
  declare right_image: any;

  @prop({ type: "enum", default: "", values: ["person:person2cartoon", "object:clay", "object:steampunk", "animal:venom", "object:barbie", "object:christmas", "gold", "ancient_bronze"], description: "[DEPRECATED] Defines the artistic style or transformation to be applied to the 3D model, altering its appearance according to preset options (extra $0.05 per generation). Omit this option to keep the original style and apperance." })
  declare style: any;

  @prop({ type: "bool", default: false, description: "Set True to enable quad mesh output (extra $0.05 per generation). If quad=True and face_limit is not set, the default face_limit will be 10000. Note: Enabling this option will force the output to be an FBX model." })
  declare quad: any;

  @prop({ type: "image", default: "", description: "Front view image of the object." })
  declare front_image: any;

  @prop({ type: "int", default: -1, description: "This is the random seed for texture generation. Using the same seed will produce identical textures. This parameter is an integer and is randomly chosen if not set. If you want a model with different textures, please use same seed and different texture_seed." })
  declare texture_seed: any;

  @prop({ type: "image", default: "", description: "Back view image of the object." })
  declare back_image: any;

  @prop({ type: "bool", default: false, description: "A boolean option to enable pbr. The default value is True, set False to get a model without pbr. If this option is set to True, texture will be ignored and used as True." })
  declare pbr: any;

  @prop({ type: "enum", default: "original_image", values: ["original_image", "geometry"], description: "Determines the prioritization of texture alignment in the 3D model. The default value is original_image." })
  declare texture_alignment: any;

  @prop({ type: "enum", default: "standard", values: ["no", "standard", "HD"], description: "An option to enable texturing. Default is 'standard', set 'no' to get a model without any textures, and set 'HD' to get a model with hd quality textures." })
  declare texture: any;

  @prop({ type: "bool", default: false, description: "Automatically scale the model to real-world dimensions, with the unit in meters. The default value is False." })
  declare auto_size: any;

  @prop({ type: "int", default: -1, description: "This is the random seed for model generation. The seed controls the geometry generation process, ensuring identical models when the same seed is used. This parameter is an integer and is randomly chosen if not set." })
  declare seed: any;

  @prop({ type: "enum", default: "default", values: ["default", "align_image"], description: "Set orientation=align_image to automatically rotate the model to align the original image. The default value is default." })
  declare orientation: any;

  @prop({ type: "image", default: "", description: "Left view image of the object." })
  declare left_image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const faceLimit = Number(this.face_limit ?? 0);
    const style = String(this.style ?? "");
    const quad = Boolean(this.quad ?? false);
    const textureSeed = Number(this.texture_seed ?? -1);
    const pbr = Boolean(this.pbr ?? false);
    const textureAlignment = String(this.texture_alignment ?? "original_image");
    const texture = String(this.texture ?? "standard");
    const autoSize = Boolean(this.auto_size ?? false);
    const seed = Number(this.seed ?? -1);
    const orientation = String(this.orientation ?? "default");

    const args: Record<string, unknown> = {
      "face_limit": faceLimit,
      "style": style,
      "quad": quad,
      "texture_seed": textureSeed,
      "pbr": pbr,
      "texture_alignment": textureAlignment,
      "texture": texture,
      "auto_size": autoSize,
      "seed": seed,
      "orientation": orientation,
    };

    const rightImageRef = this.right_image as Record<string, unknown> | undefined;
    if (isRefSet(rightImageRef)) {
      const rightImageUrl = await imageToDataUrl(rightImageRef!) ?? await assetToFalUrl(apiKey, rightImageRef!);
      if (rightImageUrl) args["right_image_url"] = rightImageUrl;
    }

    const frontImageRef = this.front_image as Record<string, unknown> | undefined;
    if (isRefSet(frontImageRef)) {
      const frontImageUrl = await imageToDataUrl(frontImageRef!) ?? await assetToFalUrl(apiKey, frontImageRef!);
      if (frontImageUrl) args["front_image_url"] = frontImageUrl;
    }

    const backImageRef = this.back_image as Record<string, unknown> | undefined;
    if (isRefSet(backImageRef)) {
      const backImageUrl = await imageToDataUrl(backImageRef!) ?? await assetToFalUrl(apiKey, backImageRef!);
      if (backImageUrl) args["back_image_url"] = backImageUrl;
    }

    const leftImageRef = this.left_image as Record<string, unknown> | undefined;
    if (isRefSet(leftImageRef)) {
      const leftImageUrl = await imageToDataUrl(leftImageRef!) ?? await assetToFalUrl(apiKey, leftImageRef!);
      if (leftImageUrl) args["left_image_url"] = leftImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "Tripo3d/tripo/v2.5/multiview-to-3d", args);
    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;
    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };
  }
}

export const FAL_IMAGE_TO_3D_NODES: readonly NodeClass[] = [
  Hunyuan_WorldImageToWorld,
  Hunyuan3dProImageTo3dV31ProImageTo3d,
  Hunyuan3dRapidImageTo3dV31RapidImageTo3d,
  Hunyuan3dV21,
  Hunyuan3DV3ImageTo3D,
  Hunyuan3DV3SketchTo3D,
  Hyper3DRodinV2,
  MeshyV5MultiImageTo3D,
  MeshyV6PreviewImageTo3D,
  MeshyV6PreviewImageTo3D,
  Omnipart,
  Pshuman,
  Sam33DBody,
  Sam33DObjects,
  Trellis,
  Trellis2,
  Trellis2Retexture,
  TrellisMulti,
  Tripo3dTripoV25ImageTo3d,
  Tripo3dTripoV25MultiviewTo3d,
] as const;