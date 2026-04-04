import type { ModuleConfig } from "../types.js";

export const videoFaceConfig: ModuleConfig = {
  configs: {
    "bytedance/latentsync": {
      className: "LatentSync",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" },
        audio: { propType: "audio" }
      }
    },
    "bytedance/omni-human": {
      className: "OmniHuman",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        audio: { propType: "audio" }
      }
    },
    "bytedance/dreamactor-m2.0": {
      className: "DreamActor_M2",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "cjwbw/sadtalker": {
      className: "SadTalker",
      returnType: "video",
      fieldOverrides: {
        source_image: { propType: "image" },
        driven_audio: { propType: "audio" }
      }
    },
    "cjwbw/aniportrait-audio2vid": {
      className: "AniPortrait",
      returnType: "video",
      fieldOverrides: {
        reference_image: { propType: "image" },
        audio: { propType: "audio" }
      }
    },
    "chenxwh/video-retalking": {
      className: "VideoRetalking",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" },
        audio: { propType: "audio" }
      }
    },
    "pixverse-ai/lipsync": {
      className: "Pixverse_Lipsync",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" },
        audio: { propType: "audio" }
      }
    },
    "pixverse/lipsync": {
      className: "Pixverse_Lipsync_V2",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" },
        audio: { propType: "audio" }
      }
    },
    "latentlabs/latentsync": {
      className: "LatentLabs_LatentSync",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" },
        audio: { propType: "audio" }
      }
    },
    "zsxkib/multitalk": {
      className: "MultiTalk",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        audio: { propType: "audio" }
      }
    },
    "kwaivgi/kling-avatar-v2": {
      className: "Kling_Avatar_V2",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        audio: { propType: "audio" }
      }
    },
    "lucataco/modelscope-facefusion": {
      className: "FaceFusion",
      returnType: "video",
      fieldOverrides: {
        source: { propType: "image" },
        target: { propType: "video" }
      }
    },
    "codeplugtech/face-swap": {
      className: "FaceSwap",
      returnType: "image",
      fieldOverrides: {
        source_image: { propType: "image" },
        target_image: { propType: "image" }
      }
    },
    "easel/advanced-face-swap": {
      className: "AdvancedFaceSwap",
      returnType: "image",
      fieldOverrides: {
        source_image: { propType: "image" },
        target_image: { propType: "image" }
      }
    },
    "fofr/face-swap-with-ideogram": {
      className: "FaceSwapIdeogram",
      returnType: "image",
      fieldOverrides: { face_image: { propType: "image" } }
    },
    "zsxkib/flash-face": {
      className: "FlashFace",
      returnType: "image",
      fieldOverrides: { face_image: { propType: "image" } }
    }
  }
};
