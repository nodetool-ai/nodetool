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
    },

    "hitem3d/hi3d/texture": {
      className: "Hi3dTexture",
      docstring:
        "Hi3D textures an existing geometry mesh from a reference image.",
      tags: ["3d-to-3d", "3d", "mesh", "texture", "hi3d"],
      useCases: [
        "Texture an untextured mesh",
        "Apply a reference look to geometry",
        "Retexture an imported model",
        "Produce PBR-ready assets",
        "Match a mesh to concept art"
      ]
    },

    "hitem3d/hi3d/split": {
      className: "Hi3dSplit",
      docstring: "Hi3D splits a 3D model into separate parts.",
      tags: ["3d-to-3d", "3d", "mesh", "segmentation", "hi3d"],
      useCases: [
        "Split a model for separate printing",
        "Break a mesh into editable parts",
        "Prepare components for rigging",
        "Isolate parts for texturing",
        "Decompose an asset for reuse"
      ]
    },

    "hitem3d/hi3d/multicolor": {
      className: "Hi3dMulticolor",
      docstring:
        "Hi3D converts a textured 3D model into a multicolor model suited to multicolor 3D printing.",
      tags: ["3d-to-3d", "3d", "mesh", "3d-printing", "color", "hi3d"],
      useCases: [
        "Prepare a model for multicolor printing",
        "Convert textures into printable color",
        "Produce color-separated geometry",
        "Ready an asset for a color printer",
        "Turn a textured mesh into print parts"
      ]
    },

    "tripo3d/tripo/remesh": {
      className: "Tripo3dRemesh",
      docstring:
        "Tripo3D converts triangle meshes into clean quad topology at a target polygon count.",
      tags: ["3d-to-3d", "3d", "mesh", "retopology", "quad", "tripo"],
      useCases: [
        "Retopologize a scanned mesh",
        "Prepare geometry for animation",
        "Hit a polygon budget for a game",
        "Clean up generated 3D output",
        "Convert triangles to quads"
      ]
    },

    "tripo3d/tripo/segment": {
      className: "Tripo3dSegment",
      docstring:
        "Tripo3D splits a 3D model into semantic parts for editing, texturing, and rigging.",
      tags: ["3d-to-3d", "3d", "mesh", "segmentation", "tripo"],
      useCases: [
        "Separate a model into named parts",
        "Prepare a mesh for rigging",
        "Texture parts independently",
        "Edit one component of an asset",
        "Extract parts for reuse"
      ]
    }
  }
};
