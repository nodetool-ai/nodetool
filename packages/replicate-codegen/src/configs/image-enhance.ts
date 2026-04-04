import type { ModuleConfig } from "../types.js";

export const imageEnhanceConfig: ModuleConfig = {
  configs: {
    "lucataco/codeformer": {
      className: "CodeFormer",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "cjwbw/night-enhancement": {
      className: "Night_Enhancement",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "cjwbw/supir-v0q": {
      className: "Supir_V0Q",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "cjwbw/supir-v0f": {
      className: "Supir_V0F",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "google-research/maxim": {
      className: "Maxim",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "microsoft/bringing-old-photos-back-to-life": {
      className: "OldPhotosRestoration",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "arielreplicate/deoldify_image": {
      className: "Deoldify_Image",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "cjwbw/bigcolor": {
      className: "BigColor",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "megvii-research/nafnet": {
      className: "NAFNet",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "mv-lab/instructir": {
      className: "InstructIR",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "tencentarc/animesr": {
      className: "AnimeSR",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "tencentarc/vqfr": {
      className: "VQFR",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "topazlabs/dust-and-scratch-v2": {
      className: "Topaz_DustScratch_V2",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "topazlabs/image-colorization": {
      className: "Topaz_Colorization",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "yangxy/gpen": {
      className: "GPEN",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "cjwbw/supir": {
      className: "SUPIR",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    }
  }
};
