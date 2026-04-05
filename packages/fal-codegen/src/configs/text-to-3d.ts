import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/hunyuan-motion/fast": {
      className: "HunyuanMotionFast",
      docstring:
        "Generate 3D human motions via text-to-generation interface of Hunyuan Motion!",
      tags: ["3d", "generation", "text-to-3d", "modeling", "fast"],
      useCases: [
        "3D model generation from text",
        "Concept visualization",
        "Game asset creation",
        "Architectural prototyping",
        "Product design visualization"
      ]
    },
    "fal-ai/hunyuan-motion": {
      className: "HunyuanMotion",
      docstring:
        "Generate 3D human motions via text-to-generation interface of Hunyuan Motion!",
      tags: ["3d", "generation", "text-to-3d", "modeling"],
      useCases: [
        "3D model generation from text",
        "Concept visualization",
        "Game asset creation",
        "Architectural prototyping",
        "Product design visualization"
      ]
    },
    "fal-ai/hunyuan3d-v3/text-to-3d": {
      className: "Hunyuan3dV3TextTo3d",
      docstring:
        "Turn simple sketches into detailed, fully-textured 3D models. Instantly convert your concept designs into formats ready for Unity, Unreal, and Blender.",
      tags: ["3d", "generation", "text-to-3d", "modeling"],
      useCases: [
        "3D model generation from text",
        "Concept visualization",
        "Game asset creation",
        "Architectural prototyping",
        "Product design visualization"
      ]
    },
    "fal-ai/meshy/v6-preview/text-to-3d": {
      className: "MeshyV6PreviewTextTo3d",
      docstring:
        "Meshy-6-Preview is the latest model from Meshy. It generates realistic and production ready 3D models.",
      tags: ["3d", "generation", "text-to-3d", "modeling"],
      useCases: [
        "3D model generation from text",
        "Concept visualization",
        "Game asset creation",
        "Architectural prototyping",
        "Product design visualization"
      ]
    }
  }
};
