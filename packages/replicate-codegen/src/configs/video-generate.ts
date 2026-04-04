import type { ModuleConfig } from "../types.js";

export const videoGenerateConfig: ModuleConfig = {
  configs: {
    "luma/ray": {
      className: "Ray",
      returnType: "video",
      fieldOverrides: {
        start_image_url: { propType: "image" },
        end_image_url: { propType: "image" }
      }
    },
    "lucataco/hotshot-xl": {
      className: "HotshotXL",
      returnType: "video"
    },
    "anotherjesse/zeroscope-v2-xl": {
      className: "Zeroscope_V2_XL",
      returnType: "video"
    },
    "arielreplicate/robust_video_matting": {
      className: "RobustVideoMatting",
      returnType: "video",
      fieldOverrides: {
        input_video: { propType: "video" }
      }
    },
    "fofr/audio-to-waveform": {
      className: "AudioToWaveform",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" }
      }
    },
    "tencent/hunyuan-video": {
      className: "Hunyuan_Video",
      returnType: "video"
    },
    "minimax/video-01-live": {
      className: "Video_01_Live",
      returnType: "video"
    },
    "minimax/video-01": {
      className: "Video_01",
      returnType: "video"
    },
    "minimax/music-01": {
      className: "Music_01",
      returnType: "audio",
      fieldOverrides: {
        voice_file: { propType: "audio" },
        song_file: { propType: "audio" },
        instumental_file: { propType: "audio" }
      }
    },
    "lightricks/ltx-video": {
      className: "LTX_Video",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "wavespeedai/wan-2.1-i2v-480p": {
      className: "Wan_2_1_I2V_480p",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "wan-video/wan-2.1-1.3b": {
      className: "Wan_2_1_1_3B",
      returnType: "video"
    },
    "pixverse/pixverse-v5": {
      className: "Pixverse_V5",
      returnType: "video"
    },
    "runwayml/gen4-turbo": {
      className: "Gen4_Turbo",
      returnType: "video"
    },
    "runwayml/gen4-aleph": {
      className: "Gen4_Aleph",
      returnType: "video"
    },
    "kwaivgi/kling-v2.1": {
      className: "Kling_V2_1",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "kwaivgi/kling-lip-sync": {
      className: "Kling_Lip_Sync",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        video: { propType: "video" }
      }
    },
    "minimax/hailuo-02": {
      className: "Hailuo_02",
      returnType: "video"
    },
    "sync/lipsync-2": {
      className: "Lipsync_2",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        video: { propType: "video" }
      }
    },
    "sync/lipsync-2-pro": {
      className: "Lipsync_2_Pro",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        video: { propType: "video" }
      }
    },
    "wan-video/wan-2.2-t2v-fast": {
      className: "Wan_2_2_T2V_Fast",
      returnType: "video"
    },
    "wan-video/wan-2.2-i2v-fast": {
      className: "Wan_2_2_I2V_Fast",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "google/veo-3.1": {
      className: "Veo_3_1",
      returnType: "video"
    },
    "runwayml/gen-4.5": {
      className: "Gen4_5",
      returnType: "video"
    },
    "kwaivgi/kling-v3-video": {
      className: "Kling_V3_Video",
      returnType: "video"
    },
    "kwaivgi/kling-v3-omni-video": {
      className: "Kling_V3_Omni_Video",
      returnType: "video"
    },
    "kwaivgi/kling-v2.5-turbo-pro": {
      className: "Kling_V2_5_Turbo_Pro",
      returnType: "video"
    },
    "kwaivgi/kling-v2.6": {
      className: "Kling_V2_6",
      returnType: "video"
    },
    "google/veo-3": {
      className: "Veo_3",
      returnType: "video"
    },
    "google/veo-3-fast": {
      className: "Veo_3_Fast",
      returnType: "video"
    },
    "google/veo-2": {
      className: "Veo_2",
      returnType: "video"
    },
    "minimax/hailuo-2.3": {
      className: "Hailuo_2_3",
      returnType: "video"
    },
    "minimax/hailuo-2.3-fast": {
      className: "Hailuo_2_3_Fast",
      returnType: "video"
    },
    "pixverse/pixverse-v5.6": {
      className: "Pixverse_V5_6",
      returnType: "video"
    },
    "pixverse/pixverse-v4": {
      className: "Pixverse_V4",
      returnType: "video"
    },
    "pixverse/pixverse-v4.5": {
      className: "Pixverse_V4_5",
      returnType: "video"
    },
    "wan-video/wan-2.5-t2v": {
      className: "Wan_2_5_T2V",
      returnType: "video"
    },
    "wan-video/wan-2.5-t2v-fast": {
      className: "Wan_2_5_T2V_Fast",
      returnType: "video"
    },
    "wan-video/wan-2.5-i2v": {
      className: "Wan_2_5_I2V",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "wan-video/wan-2.5-i2v-fast": {
      className: "Wan_2_5_I2V_Fast",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "bytedance/seedance-1-pro": {
      className: "Seedance_1_Pro",
      returnType: "video"
    },
    "bytedance/seedance-1-lite": {
      className: "Seedance_1_Lite",
      returnType: "video"
    },
    "bytedance/seedance-1-pro-fast": {
      className: "Seedance_1_Pro_Fast",
      returnType: "video"
    },
    "luma/ray-2-540p": {
      className: "Ray_2_540p",
      returnType: "video"
    },
    "luma/ray-2-720p": {
      className: "Ray_2_720p",
      returnType: "video"
    },
    "luma/ray-flash-2-720p": {
      className: "Ray_Flash_2_720p",
      returnType: "video"
    },
    "luma/ray-flash-2-540p": {
      className: "Ray_Flash_2_540p",
      returnType: "video"
    },
    "openai/sora-2": {
      className: "Sora_2",
      returnType: "video"
    },
    "openai/sora-2-pro": {
      className: "Sora_2_Pro",
      returnType: "video"
    },
    "minimax/video-01-director": {
      className: "Video_01_Director",
      returnType: "video"
    }
  }
};
