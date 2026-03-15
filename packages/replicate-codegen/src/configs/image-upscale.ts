import type { ModuleConfig } from "../types.js";

export const imageUpscaleConfig: ModuleConfig = {
  configs: {
    "daanelson/real-esrgan-a100": {
      className: "RealEsrGan",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "tencentarc/gfpgan": {
      className: "GFPGAN",
      returnType: "image",
      fieldOverrides: {
        img: { propType: "image" },
      },
    },
    "philz1337x/clarity-upscaler": {
      className: "ClarityUpscaler",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "fermatresearch/magic-image-refiner": {
      className: "MagicImageRefiner",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "cjwbw/rudalle-sr": {
      className: "ruDallE_SR",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "fermatresearch/high-resolution-controlnet-tile": {
      className: "HighResolutionControlNetTile",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "fewjative/ultimate-sd-upscale": {
      className: "UltimateSDUpscale",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "jingyunliang/swinir": {
      className: "SwinIR",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "mv-lab/swin2sr": {
      className: "Swin2SR",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
  },
};
