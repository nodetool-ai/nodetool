import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
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
