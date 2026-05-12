import type { ModuleConfig } from "../types.js";

export const videoProcessConfig: ModuleConfig = {
  configs: {
    "luma/modify-video": {
      className: "Modify_Video",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "luma/reframe-video": {
      className: "Reframe_Video",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "pollinations/real-basicvsr-video-superresolution": {
      className: "RealBasicVSR",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "philz1337x/crystal-video-upscaler": {
      className: "Crystal_Video_Upscaler",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "lucataco/real-esrgan-video": {
      className: "RealEsrGan_Video",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "zsxkib/stable-video-face-restoration": {
      className: "StableVideoFaceRestoration",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "arielreplicate/deoldify_video": {
      className: "Deoldify_Video",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "fictions-ai/autocaption": {
      className: "AutoCaption",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "wan-video/wan-2.2-s2v": {
      className: "Wan_2_2_S2V",
      returnType: "video"
    },
    "veed/fabric-1.0": {
      className: "VEED_Fabric",
      returnType: "video"
    }
  }
};
