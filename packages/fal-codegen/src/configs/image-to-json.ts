import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "bria/ad-delayer": {
      className: "AdDelayer",
      docstring:
        "Split a flat ad image into editable layers: background, product and logo cutouts, live text with typography, and vector shapes, returned as structured JSON.",
      tags: ["vision", "analysis", "json", "bria", "ad", "layers"],
      useCases: [
        "Recover layers from a flattened ad",
        "Extract ad copy with its typography",
        "Rebuild a creative for a new size",
        "Localize text in an existing ad",
        "Feed ad structure into a design tool"
      ]
    },
    "fal-ai/vggt-1b": {
      className: "Vggt1b",
      docstring:
        "VGGT-1B reconstructs a 3D scene from images or video, returning depth maps, camera poses, and a colored point cloud.",
      tags: ["vision", "analysis", "json", "3d", "depth", "point-cloud"],
      useCases: [
        "Recover camera poses from footage",
        "Build a point cloud from photos",
        "Extract depth maps for compositing",
        "Reconstruct a set from a scout video",
        "Measure scene geometry from stills"
      ]
    },
    "fal-ai/bagel/understand": {
      className: "BagelUnderstand",
      docstring:
        "Bagel is a 7B parameter multimodal model from Bytedance-Seed that can generate both text and images.",
      tags: ["vision", "analysis", "json", "image-understanding"],
      useCases: [
        "Image analysis to structured data",
        "Visual content understanding",
        "Automated image metadata extraction",
        "Content classification",
        "Image-based data extraction"
      ]
    }
  }
};
