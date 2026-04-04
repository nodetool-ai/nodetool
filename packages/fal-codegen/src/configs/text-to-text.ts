import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "half-moon-ai/ai-detector/detect-text": {
      className: "HalfMoonAiAiDetectorDetectText",
      docstring:
        "AI Detector (Text) is an advanced AI service that analyzes a passage and returns a verdict on whether it was likely written by AI.",
      tags: ["text", "processing", "transformation", "nlp"],
      useCases: [
        "Text transformation",
        "Content analysis",
        "Text classification",
        "Language processing",
        "Content detection"
      ]
    }
  }
};
