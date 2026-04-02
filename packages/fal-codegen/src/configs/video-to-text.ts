import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "openrouter/router/video/enterprise": {
      className: "OpenrouterRouterVideoEnterprise",
      docstring:
        "Run any VLM (Video Language Model) with fal, powered by OpenRouter.",
      tags: ["video", "transcription", "analysis", "video-understanding"],
      useCases: [
        "Video transcription",
        "Video content analysis",
        "Automated captioning",
        "Video understanding",
        "Content indexing"
      ]
    },
    "openrouter/router/video": {
      className: "OpenrouterRouterVideo",
      docstring:
        "Run any VLM (Video Language Model) with fal, powered by OpenRouter.",
      tags: ["video", "transcription", "analysis", "video-understanding"],
      useCases: [
        "Video transcription",
        "Video content analysis",
        "Automated captioning",
        "Video understanding",
        "Content indexing"
      ]
    }
  }
};
