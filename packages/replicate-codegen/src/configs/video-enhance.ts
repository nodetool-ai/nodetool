import type { ModuleConfig } from "../types.js";

export const videoEnhanceConfig: ModuleConfig = {
  configs: {
    "topazlabs/video-upscale": {
      className: "Topaz_Video_Upscale",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" }
      }
    },
    "bria/video-increase-resolution": {
      className: "Video_Increase_Resolution",
      returnType: "video",
      fieldOverrides: { video_url: { propType: "video" } }
    },
    "bria/video-remove-background": {
      className: "Video_Remove_Background",
      returnType: "video",
      fieldOverrides: { video_url: { propType: "video" } }
    },
    "bytedance/video-upscaler": {
      className: "Video_Upscaler",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "black-forest-labs/flux-video-upscale": {
      className: "Flux_Video_Upscale",
      returnType: "video",
      fieldOverrides: { input_video: { propType: "video" } }
    }
  }
};
