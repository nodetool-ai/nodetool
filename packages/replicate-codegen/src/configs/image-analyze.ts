import type { ModuleConfig } from "../types.js";

export const imageAnalyzeConfig: ModuleConfig = {
  configs: {
    "lucataco/sdxl-clip-interrogator": {
      className: "SDXLClipInterrogator",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "methexis-inc/img2prompt": {
      className: "Img2Prompt",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "lucataco/moondream2": {
      className: "Moondream2",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "falcons-ai/nsfw_image_detection": {
      className: "NSFWImageDetection",
      returnType: "str"
    },
    "salesforce/blip": {
      className: "Blip",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "andreasjansson/blip-2": {
      className: "Blip2",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "pharmapsychotic/clip-interrogator": {
      className: "ClipInterrogator",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "yorickvp/llava-13b": {
      className: "Llava13b",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "andreasjansson/clip-features": {
      className: "ClipFeatures",
      returnType: "str"
    },
    "lucataco/apollo-3b": {
      className: "Apollo_3B",
      returnType: "str",
      fieldOverrides: { video: { propType: "video" } }
    },
    "lucataco/apollo-7b": {
      className: "Apollo_7B",
      returnType: "str",
      fieldOverrides: { video: { propType: "video" } }
    },
    "lucataco/minicpm-v-4": {
      className: "MiniCPM_V4",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lucataco/videollama3-7b": {
      className: "VideoLlama3_7B",
      returnType: "str",
      fieldOverrides: { video: { propType: "video" } }
    },
    "yorickvp/llava-v1.6-mistral-7b": {
      className: "Llava_V1_6_Mistral",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "yorickvp/llava-v1.6-vicuna-13b": {
      className: "Llava_V1_6_Vicuna",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "google/gemini-3-flash": {
      className: "Gemini_3_Flash",
      returnType: "str"
    }
  }
};
