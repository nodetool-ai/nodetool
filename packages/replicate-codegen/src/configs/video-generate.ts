import type { ModuleConfig } from "../types.js";

export const videoGenerateConfig: ModuleConfig = {
  configs: {
    "luma/ray": {
      className: "Ray",
      returnType: "video",
      fieldOverrides: {
        start_image_url: { propType: "image" },
        end_image_url: { propType: "image" },
      },
    },
    "lucataco/hotshot-xl": {
      className: "HotshotXL",
      returnType: "video",
    },
    "anotherjesse/zeroscope-v2-xl": {
      className: "Zeroscope_V2_XL",
      returnType: "video",
    },
    "arielreplicate/robust_video_matting": {
      className: "RobustVideoMatting",
      returnType: "video",
      fieldOverrides: {
        input_video: { propType: "video" },
      },
    },
    "fofr/audio-to-waveform": {
      className: "AudioToWaveform",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
      },
    },
    "tencent/hunyuan-video": {
      className: "Hunyuan_Video",
      returnType: "video",
    },
    "minimax/video-01-live": {
      className: "Video_01_Live",
      returnType: "video",
    },
    "minimax/video-01": {
      className: "Video_01",
      returnType: "video",
    },
    "minimax/music-01": {
      className: "Music_01",
      returnType: "audio",
      fieldOverrides: {
        voice_file: { propType: "audio" },
        song_file: { propType: "audio" },
        instumental_file: { propType: "audio" },
      },
    },
    "lightricks/ltx-video": {
      className: "LTX_Video",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "wavespeedai/wan-2.1-i2v-480p": {
      className: "Wan_2_1_I2V_480p",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "wan-video/wan-2.1-1.3b": {
      className: "Wan_2_1_1_3B",
      returnType: "video",
    },
    "pixverse/pixverse-v5": {
      className: "Pixverse_V5",
      returnType: "video",
    },
    "runwayml/gen4-turbo": {
      className: "Gen4_Turbo",
      returnType: "video",
    },
    "runwayml/gen4-aleph": {
      className: "Gen4_Aleph",
      returnType: "video",
    },
    "kwaivgi/kling-v2.1": {
      className: "Kling_V2_1",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "kwaivgi/kling-lip-sync": {
      className: "Kling_Lip_Sync",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        video: { propType: "video" },
      },
    },
    "minimax/hailuo-02": {
      className: "Hailuo_02",
      returnType: "video",
    },
    "sync/lipsync-2": {
      className: "Lipsync_2",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        video: { propType: "video" },
      },
    },
    "sync/lipsync-2-pro": {
      className: "Lipsync_2_Pro",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        video: { propType: "video" },
      },
    },
    "wan-video/wan-2.2-t2v-fast": {
      className: "Wan_2_2_T2V_Fast",
      returnType: "video",
    },
    "wan-video/wan-2.2-i2v-fast": {
      className: "Wan_2_2_I2V_Fast",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "google/veo-3.1": {
      className: "Veo_3_1",
      returnType: "video",
    },
  },
};
