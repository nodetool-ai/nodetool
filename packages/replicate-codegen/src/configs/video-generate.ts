import type { ModuleConfig } from "../types.js";

export const videoGenerateConfig: ModuleConfig = {
  configs: {
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
    },
    "bytedance/seedance-2.0": {
      className: "Seedance_2",
      returnType: "video"
    },
    "google/veo-3.1-lite": {
      className: "Veo_3_1_Lite",
      returnType: "video"
    },
    "alibaba/happyhorse-1.0": {
      className: "HappyHorse_1",
      returnType: "video"
    },
    "pixverse/pixverse-v6": {
      className: "Pixverse_V6",
      returnType: "video"
    },
    "xai/grok-imagine-video": {
      className: "Grok_Imagine_Video",
      returnType: "video"
    },
    "alibaba/happyhorse-1.1": {
      className: "Happyhorse_1_1",
      returnType: "video",
      fieldOverrides: { images: { propType: "list[image]" } }
    },
    "bytedance/seedance-2.0-fast": {
      className: "Seedance_2_0_Fast",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        last_frame_image: { propType: "image" },
        reference_audios: { propType: "list[audio]" },
        reference_images: { propType: "list[image]" },
        reference_videos: { propType: "list[video]" }
      }
    },
    "bytedance/seedance-2.0-mini": {
      className: "Seedance_2_0_Mini",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        last_frame_image: { propType: "image" },
        reference_audios: { propType: "list[audio]" },
        reference_images: { propType: "list[image]" },
        reference_videos: { propType: "list[video]" }
      }
    },
    "bytedance/seedance-2.5": {
      className: "Seedance_2_5",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        last_frame_image: { propType: "image" },
        reference_audios: { propType: "list[audio]" },
        reference_images: { propType: "list[image]" },
        reference_videos: { propType: "list[video]" }
      }
    },
    "decart/lucy-edit-2": {
      className: "Lucy_Edit_2",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" },
        reference_image: { propType: "image" }
      }
    },
    "heygen/avatar-iv": {
      className: "Avatar_Iv",
      returnType: "video"
    },
    "heygen/avatar-v": {
      className: "Avatar_V",
      returnType: "video"
    },
    "heygen/video-agent": {
      className: "Video_Agent",
      returnType: "video"
    },
    "kwaivgi/kling-o1": {
      className: "Kling_O1",
      returnType: "video",
      fieldOverrides: {
        end_image: { propType: "image" },
        start_image: { propType: "image" },
        reference_video: { propType: "video" },
        reference_images: { propType: "list[image]" }
      }
    },
    "kwaivgi/kling-v3-motion-control": {
      className: "Kling_V3_Motion_Control",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        video: { propType: "video" }
      }
    },
    "lightricks/audio-to-video": {
      className: "Audio_To_Video",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        image: { propType: "image" }
      }
    },
    "lightricks/ltx-2.3-fast": {
      className: "Ltx_2_3_Fast",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        last_frame_image: { propType: "image" }
      }
    },
    "lightricks/ltx-2.3-pro": {
      className: "Ltx_2_3_Pro",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        image: { propType: "image" },
        video: { propType: "video" },
        last_frame_image: { propType: "image" }
      }
    },
    "lightricks/ltx-2-distilled": {
      className: "Ltx_2_Distilled",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "luma/ray-3.2": {
      className: "Ray_3_2",
      returnType: "video",
      fieldOverrides: {
        end_image: { propType: "image" },
        start_image: { propType: "image" }
      }
    },
    "prunaai/p-video": {
      className: "P_Video",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        image: { propType: "image" },
        last_frame_image: { propType: "image" }
      }
    },
    "prunaai/p-video-animate": {
      className: "P_Video_Animate",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        video: { propType: "video" }
      }
    },
    "prunaai/p-video-replace": {
      className: "P_Video_Replace",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" },
        images: { propType: "list[image]" }
      }
    },
    "runwayml/aleph-2": {
      className: "Aleph_2",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" },
        keyframe_images: { propType: "list[image]" }
      }
    },
    "vidu/q3-pro": {
      className: "Q3_Pro",
      returnType: "video",
      fieldOverrides: {
        end_image: { propType: "image" },
        start_image: { propType: "image" }
      }
    },
    "vidu/q3-turbo": {
      className: "Q3_Turbo",
      returnType: "video",
      fieldOverrides: {
        end_image: { propType: "image" },
        start_image: { propType: "image" }
      }
    },
    "wan-video/wan2.6-i2v-flash": {
      className: "Wan2_6_I2v_Flash",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        image: { propType: "image" }
      }
    },
    "wan-video/wan-2.7-i2v": {
      className: "Wan_2_7_I2v",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        first_clip: { propType: "video" },
        last_frame: { propType: "image" },
        first_frame: { propType: "image" }
      }
    },
    "wan-video/wan-2.7-r2v": {
      className: "Wan_2_7_R2v",
      returnType: "video",
      fieldOverrides: {
        reference_images: { propType: "list[image]" },
        reference_videos: { propType: "list[video]" }
      }
    },
    "wan-video/wan-2.7-t2v": {
      className: "Wan_2_7_T2v",
      returnType: "video",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "wan-video/wan-2.7-videoedit": {
      className: "Wan_2_7_Videoedit",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" },
        reference_image: { propType: "image" }
      }
    },
    "alibaba/wan-3": {
      className: "Wan_3",
      returnType: "video"
    },
    "alibaba/wan-3-prime": {
      className: "Wan_3_Prime",
      returnType: "video"
    },
    "xai/grok-imagine-r2v": {
      className: "Grok_Imagine_R2v",
      returnType: "video",
      fieldOverrides: { reference_images: { propType: "list[image]" } }
    },
    "xai/grok-imagine-video-1.5": {
      className: "Grok_Imagine_Video_1_5",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "xai/grok-imagine-video-extension": {
      className: "Grok_Imagine_Video_Extension",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "andreasjansson/wan-1.3b-inpaint": {
      className: "Wan_1_3b_Inpaint",
      returnType: "video",
      fieldOverrides: {
        mask_video: { propType: "video" },
        input_video: { propType: "video" }
      }
    },
    "bria/video-erase-object": {
      className: "Video_Erase_Object",
      returnType: "video",
      fieldOverrides: {
        mask_url: { propType: "image" },
        video_url: { propType: "video" }
      }
    },
    "bytedance/omni-human-1.5": {
      className: "Omni_Human_1_5",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        image: { propType: "image" }
      }
    },
    "bytedance/seedance-1.5-pro": {
      className: "Seedance_1_5_Pro",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        last_frame_image: { propType: "image" }
      }
    },
    "character-ai/ovi-i2v": {
      className: "Ovi_I2v",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        audio_negative_prompt: { propType: "audio" },
        video_negative_prompt: { propType: "video" }
      }
    },
    "easel/ai-avatars": {
      className: "Ai_Avatars",
      returnType: "video",
      fieldOverrides: {
        face_image: { propType: "image" },
        face_image_b: { propType: "image" }
      }
    },
    "flux-kontext-apps/restyle-video-frame": {
      className: "Restyle_Video_Frame",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "fofr/kontext-ps1": {
      className: "Kontext_Ps1",
      returnType: "video",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "google/veo-3.1-fast": {
      className: "Veo_3_1_Fast",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        last_frame: { propType: "image" }
      }
    },
    "heygen/video-translate": {
      className: "Video_Translate",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "kwaivgi/kling-v1.5-pro": {
      className: "Kling_V1_5_Pro",
      returnType: "video",
      fieldOverrides: {
        end_image: { propType: "image" },
        start_image: { propType: "image" }
      }
    },
    "kwaivgi/kling-v1.5-standard": {
      className: "Kling_V1_5_Standard",
      returnType: "video",
      fieldOverrides: { start_image: { propType: "image" } }
    },
    "kwaivgi/kling-v1.6-pro": {
      className: "Kling_V1_6_Pro",
      returnType: "video",
      fieldOverrides: {
        end_image: { propType: "image" },
        start_image: { propType: "image" },
        reference_images: { propType: "list[image]" }
      }
    },
    "kwaivgi/kling-v1.6-standard": {
      className: "Kling_V1_6_Standard",
      returnType: "video",
      fieldOverrides: {
        start_image: { propType: "image" },
        reference_images: { propType: "list[image]" }
      }
    },
    "kwaivgi/kling-v2.0": {
      className: "Kling_V2_0",
      returnType: "video",
      fieldOverrides: { start_image: { propType: "image" } }
    },
    "kwaivgi/kling-v2.1-master": {
      className: "Kling_V2_1_Master",
      returnType: "video",
      fieldOverrides: { start_image: { propType: "image" } }
    },
    "kwaivgi/kling-v2.6-motion-control": {
      className: "Kling_V2_6_Motion_Control",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        video: { propType: "video" }
      }
    },
    "leonardoai/motion-2.0": {
      className: "Motion_2_0",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lightricks/ltx-2-fast": {
      className: "Ltx_2_Fast",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lightricks/ltx-2-pro": {
      className: "Ltx_2_Pro",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lightricks/ltx-2-retake": {
      className: "Ltx_2_Retake",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "lightricks/ltx-video-0.9.7": {
      className: "Ltx_Video_0_9_7",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lightricks/ltx-video-0.9.7-distilled": {
      className: "Ltx_Video_0_9_7_Distilled",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        video: { propType: "video" }
      }
    },
    "lucataco/frame-extractor": {
      className: "Frame_Extractor",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "lucataco/split-screen-video": {
      className: "Split_Screen_Video",
      returnType: "video",
      fieldOverrides: {
        video_1: { propType: "video" },
        video_2: { propType: "video" }
      }
    },
    "lucataco/trim-video": {
      className: "Trim_Video",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    },
    "lucataco/video-audio-merge": {
      className: "Video_Audio_Merge",
      returnType: "video",
      fieldOverrides: {
        audio_file: { propType: "audio" },
        video_file: { propType: "video" }
      }
    },
    "lucataco/video-merge": {
      className: "Video_Merge",
      returnType: "video",
      fieldOverrides: { video_files: { propType: "list[video]" } }
    },
    "lucataco/wan-2.1-1.3b-vid2vid": {
      className: "Wan_2_1_1_3b_Vid2vid",
      returnType: "video",
      fieldOverrides: { input_video: { propType: "video" } }
    },
    "minimax/hailuo-02-fast": {
      className: "Hailuo_02_Fast",
      returnType: "video",
      fieldOverrides: {
        last_frame_image: { propType: "image" },
        first_frame_image: { propType: "image" }
      }
    },
    "nicolascoutureau/video-utils": {
      className: "Video_Utils",
      returnType: "video",
      fieldOverrides: { input_file: { propType: "video" } }
    },
    "pixverse/pixverse-v3.5": {
      className: "Pixverse_V3_5",
      returnType: "video",
      fieldOverrides: {
        image: { propType: "image" },
        last_frame_image: { propType: "image" }
      }
    },
    "prunaai/vace-1.3b": {
      className: "Vace_1_3b",
      returnType: "video",
      fieldOverrides: {
        src_mask: { propType: "image" },
        src_video: { propType: "video" },
        src_ref_images: { propType: "list[image]" }
      }
    },
    "prunaai/vace-14b": {
      className: "Vace_14b",
      returnType: "video",
      fieldOverrides: {
        src_mask: { propType: "image" },
        src_video: { propType: "video" },
        src_ref_images: { propType: "list[image]" }
      }
    },
    "retro-diffusion/rd-animation": {
      className: "Rd_Animation",
      returnType: "video",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "shridharathi/ghibli-vid": {
      className: "Ghibli_Vid",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "sync/react-1": {
      className: "React_1",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        video: { propType: "video" }
      }
    },
    "wan-video/wan2.1-with-lora": {
      className: "Wan2_1_With_Lora",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "wan-video/wan-2.2-5b-fast": {
      className: "Wan_2_2_5b_Fast",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "wan-video/wan-2.2-animate-animation": {
      className: "Wan_2_2_Animate_Animation",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" },
        character_image: { propType: "image" }
      }
    },
    "wan-video/wan-2.2-animate-replace": {
      className: "Wan_2_2_Animate_Replace",
      returnType: "video",
      fieldOverrides: {
        video: { propType: "video" },
        character_image: { propType: "image" }
      }
    },
    "wan-video/wan-2.2-i2v-a14b": {
      className: "Wan_2_2_I2v_A14b",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "wan-video/wan-2.6-i2v": {
      className: "Wan_2_6_I2v",
      returnType: "video",
      fieldOverrides: {
        audio: { propType: "audio" },
        image: { propType: "image" }
      }
    },
    "wan-video/wan-2.6-t2v": {
      className: "Wan_2_6_T2v",
      returnType: "video",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "wavespeedai/wan-2.1-i2v-720p": {
      className: "Wan_2_1_I2v_720p",
      returnType: "video",
      fieldOverrides: { image: { propType: "image" } }
    },
    "wavespeedai/wan-2.1-t2v-480p": {
      className: "Wan_2_1_T2v_480p",
      returnType: "video"
    },
    "wavespeedai/wan-2.1-t2v-720p": {
      className: "Wan_2_1_T2v_720p",
      returnType: "video"
    }
  }
};
