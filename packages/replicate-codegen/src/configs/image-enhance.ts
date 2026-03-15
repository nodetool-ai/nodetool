import type { ModuleConfig } from "../types.js";

export const imageEnhanceConfig: ModuleConfig = {
  configs: {
    "lucataco/codeformer": {
      className: "CodeFormer",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "cjwbw/night-enhancement": {
      className: "Night_Enhancement",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "cjwbw/supir-v0q": {
      className: "Supir_V0Q",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "cjwbw/supir-v0f": {
      className: "Supir_V0F",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "google-research/maxim": {
      className: "Maxim",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "microsoft/bringing-old-photos-back-to-life": {
      className: "OldPhotosRestoration",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
  },
};
