import type { ModuleConfig } from "../types.js";

export const videoEnhanceConfig: ModuleConfig = {
  configs: {
    "runwayml/upscale-v1": {
      className: "Runway_Upscale_V1",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" }
      }
    },
    "topazlabs/video-upscale": {
      className: "Topaz_Video_Upscale",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" }
      }
    }
  }
};
