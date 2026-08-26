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
    },
    "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d": {
      className: "Hunyuan3dV31ProTextTo3d",
      docstring: "Generate 3D models from text prompts with Hunyuan 3D Pro",
      tags: ["generation", "text-to-3d", "3d", "mesh", "hunyuan", "pro"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/hunyuan-3d/v3.1/rapid/text-to-3d": {
      className: "Hunyuan3dV31RapidTextTo3d",
      docstring: "Create detailed, fully-textured 3D models with text",
      tags: ["generation", "text-to-3d", "3d", "mesh", "hunyuan", "rapid"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/hyper3d/rodin/v2.5/text-to-3d": {
      className: "Hyper3dRodinV25TextTo3d",
      docstring:
        "Rodin V2.5 by Hyper3D generates realistic and production ready 3D models from text or images.",
      tags: ["generation", "text-to-3d", "3d", "mesh", "hyper3d", "rodin"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/hyper3d/rodin/v2.5/text-to-3d/fast": {
      className: "Hyper3dRodinV25TextTo3dFast",
      docstring:
        "Rodin V2.5 by Hyper3D generates realistic and production ready 3D models from text or images. Do fast prototyping using the fast model.",
      tags: [
        "generation",
        "text-to-3d",
        "3d",
        "mesh",
        "hyper3d",
        "rodin",
        "fast"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/meshy/v6/text-to-3d": {
      className: "MeshyV6TextTo3d",
      docstring:
        "Meshy-6 is the latest model from Meshy. It generates realistic and production ready 3D models.",
      tags: ["generation", "text-to-3d", "3d", "mesh", "meshy", "v6"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "tripo3d/h3.1/text-to-3d": {
      className: "H31TextTo3d",
      docstring: "Generate 3D models from text descriptions using Tripo H3.1.",
      tags: ["generation", "text-to-3d", "3d", "mesh", "tripo3d", "h3"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "tripo3d/p1/text-to-3d": {
      className: "P1TextTo3d",
      docstring: "Generate 3D models from text descriptions using Tripo P1.",
      tags: ["generation", "text-to-3d", "3d", "mesh", "tripo3d", "p1"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },

    "meshy/v7/text-to-3d": {
      className: "MeshyV7TextTo3d",
      docstring:
        "Meshy V7 generates a textured PBR-ready mesh from text, with game-ready topology at a target polygon count.",
      tags: ["generation", "text-to-3d", "3d", "mesh", "pbr", "meshy"],
      useCases: [
        "Generate a game prop from a prompt",
        "Create PBR assets without modelling",
        "Hit a polygon budget from text",
        "Prototype 3D concepts quickly",
        "Fill an asset library from descriptions"
      ]
    }
  }
};
