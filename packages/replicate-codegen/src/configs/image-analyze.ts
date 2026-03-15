import type { ModuleConfig } from "../types.js";

export const imageAnalyzeConfig: ModuleConfig = {
  configs: {
    "lucataco/sdxl-clip-interrogator": {
      className: "SDXLClipInterrogator",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "methexis-inc/img2prompt": {
      className: "Img2Prompt",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "lucataco/moondream2": {
      className: "Moondream2",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "falcons-ai/nsfw_image_detection": {
      className: "NSFWImageDetection",
      returnType: "str",
    },
    "salesforce/blip": {
      className: "Blip",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "andreasjansson/blip-2": {
      className: "Blip2",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "pharmapsychotic/clip-interrogator": {
      className: "ClipInterrogator",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "yorickvp/llava-13b": {
      className: "Llava13b",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "andreasjansson/clip-features": {
      className: "ClipFeatures",
      returnType: "str",
    },
  },
};
