import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
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
    },
    "fal-ai/hunyuan-3d/v3.1/part": {
      className: "Hunyuan3dV31Part",
      docstring: "Split 3D models into parts with Hunyuan 3D",
      tags: ["processing", "3d-to-3d", "3d", "mesh", "hunyuan", "part"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/hunyuan-3d/v3.1/smart-topology": {
      className: "Hunyuan3dV31SmartTopology",
      docstring: "Optimize 3D mesh topology with Hunyuan 3D Smart Topology.",
      tags: [
        "processing",
        "3d-to-3d",
        "3d",
        "mesh",
        "hunyuan",
        "smart",
        "topology"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/meshy/rigging": {
      className: "MeshyRigging",
      docstring:
        "Rig humanoid 3D models from GLB URLs with Meshy, returning rigged GLB/FBX files plus basic animations.",
      tags: ["processing", "3d-to-3d", "3d", "mesh", "meshy", "rigging"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/meshy/rigging/multi-animation": {
      className: "MeshyRiggingMultiAnimation",
      docstring:
        "Meshy auto-rigs a humanoid 3D model fitting a skeleton and binding the mesh, then applies several motion presets from its animation library",
      tags: [
        "processing",
        "3d-to-3d",
        "3d",
        "mesh",
        "meshy",
        "rigging",
        "multi",
        "animation"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    }
  }
};
