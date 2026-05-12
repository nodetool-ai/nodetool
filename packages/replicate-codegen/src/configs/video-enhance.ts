import type { ModuleConfig } from "../types.js";

export const videoEnhanceConfig: ModuleConfig = {
  configs: {
    "topazlabs/video-upscale": {
      className: "Topaz_Video_Upscale",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" }
      }
    }
  }
};
