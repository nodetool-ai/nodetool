import type { ModuleConfig } from "../types.js";

export const imageUpscaleConfig: ModuleConfig = {
  configs: {
    "daanelson/real-esrgan-a100": {
      className: "RealEsrGan",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "tencentarc/gfpgan": {
      className: "GFPGAN",
      returnType: "image",
      fieldOverrides: {
        img: { propType: "image" }
      }
    },
    "philz1337x/clarity-upscaler": {
      className: "ClarityUpscaler",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "fermatresearch/magic-image-refiner": {
      className: "MagicImageRefiner",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "cjwbw/rudalle-sr": {
      className: "ruDallE_SR",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "fermatresearch/high-resolution-controlnet-tile": {
      className: "HighResolutionControlNetTile",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "fewjative/ultimate-sd-upscale": {
      className: "UltimateSDUpscale",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "jingyunliang/swinir": {
      className: "SwinIR",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "mv-lab/swin2sr": {
      className: "Swin2SR",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "alexgenovese/upscaler": {
      className: "Alexgenovese_Upscaler",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "bria/increase-resolution": {
      className: "Bria_IncreaseResolution",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "cjwbw/real-esrgan": {
      className: "CjwbwRealEsrGan",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "google/upscaler": {
      className: "Google_Upscaler",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lucataco/demofusion-enhance": {
      className: "DemofusionEnhance",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lucataco/pasd-magnify": {
      className: "PASD_Magnify",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lucataco/stable-diffusion-x4-upscaler": {
      className: "SD_X4_Upscaler",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "nightmareai/real-esrgan": {
      className: "NightmareAI_RealEsrGan",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "philz1337x/crystal-upscaler": {
      className: "Crystal_Upscaler",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "recraft-ai/recraft-creative-upscale": {
      className: "Recraft_Creative_Upscale",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "recraft-ai/recraft-crisp-upscale": {
      className: "Recraft_Crisp_Upscale",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "topazlabs/image-upscale": {
      className: "Topaz_Image_Upscale",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "xinntao/esrgan": {
      className: "ESRGAN",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "zsxkib/aura-sr": {
      className: "Aura_SR",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "zsxkib/aura-sr-v2": {
      className: "Aura_SR_V2",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "zsxkib/bsrgan": {
      className: "BSRGAN",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "zsxkib/diffbir": {
      className: "DiffBIR",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "zsyoaoa/invsr": {
      className: "InvSR",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    }
  }
};
