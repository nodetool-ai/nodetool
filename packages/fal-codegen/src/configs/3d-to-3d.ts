import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/ultrashape": {
      className: "Ultrashape",
      docstring: "Ultrashape",
      tags: ["3d_to_3d"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/sam-3/3d-align": {
      className: "Sam33DAlign",
      docstring: "Sam 3",
      tags: ["3d_to_3d"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/meshy/v5/retexture": {
      className: "MeshyV5Retexture",
      docstring:
        "Meshy-5 retexture applies new, high-quality textures to existing 3D models using either text prompts or reference images. It supports PBR material generation for realistic, production-ready results.",
      tags: ["3d", "editing", "transformation", "modeling"],
      useCases: [
        "3D model editing and refinement",
        "Mesh optimization",
        "Texture application",
        "3D format conversion",
        "Model retopology"
      ]
    },
    "fal-ai/meshy/v5/remesh": {
      className: "MeshyV5Remesh",
      docstring:
        "Meshy-5 remesh allows you to remesh and export existing 3D models into various formats",
      tags: ["3d", "editing", "transformation", "modeling"],
      useCases: [
        "3D model editing and refinement",
        "Mesh optimization",
        "Texture application",
        "3D format conversion",
        "Model retopology"
      ]
    },
    "fal-ai/hunyuan-part": {
      className: "HunyuanPart",
      docstring:
        "Use the capabilities of hunyuan part to generate point clouds from your 3D files.",
      tags: ["3d", "editing", "transformation", "modeling"],
      useCases: [
        "3D model editing and refinement",
        "Mesh optimization",
        "Texture application",
        "3D format conversion",
        "Model retopology"
      ]
    }
  }
};
