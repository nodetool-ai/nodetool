import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/ltx-2-19b/distilled/audio-to-video/lora": {
      className: "Ltx219BDistilledAudioToVideoLora",
      docstring: "LTX-2 19B Distilled",
      tags: ["video", "generation", "audio-to-video", "visualization", "lora"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2-19b/audio-to-video/lora": {
      className: "Ltx219BAudioToVideoLora",
      docstring: "LTX-2 19B",
      tags: ["video", "generation", "audio-to-video", "visualization", "lora"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2-19b/distilled/audio-to-video": {
      className: "Ltx219BDistilledAudioToVideo",
      docstring: "LTX-2 19B Distilled",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2-19b/audio-to-video": {
      className: "Ltx219BAudioToVideo",
      docstring: "LTX-2 19B",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/elevenlabs/dubbing": {
      className: "ElevenlabsDubbing",
      docstring: "ElevenLabs Dubbing",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/longcat-multi-avatar/image-audio-to-video": {
      className: "LongcatMultiAvatarImageAudioToVideo",
      docstring: "Longcat Multi Avatar",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/longcat-multi-avatar/image-audio-to-video/multi-speaker": {
      className: "LongcatMultiAvatarImageAudioToVideoMultiSpeaker",
      docstring: "Longcat Multi Avatar",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/longcat-single-avatar/image-audio-to-video": {
      className: "LongcatSingleAvatarImageAudioToVideo",
      docstring:
        "LongCat-Video-Avatar is an audio-driven video generation model that can generates super-realistic, lip-synchronized long video generation with natural dynamics and consistent identity.",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Audio-driven video generation",
        "Music visualization",
        "Talking head animation",
        "Audio-synced content creation",
        "Podcast video generation"
      ]
    },
    "fal-ai/longcat-single-avatar/audio-to-video": {
      className: "LongcatSingleAvatarAudioToVideo",
      docstring:
        "LongCat-Video-Avatar is an audio-driven video generation model that can generates super-realistic, lip-synchronized long video generation with natural dynamics and consistent identity.",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Audio-driven video generation",
        "Music visualization",
        "Talking head animation",
        "Audio-synced content creation",
        "Podcast video generation"
      ]
    },
    "argil/avatars/audio-to-video": {
      className: "ArgilAvatarsAudioToVideo",
      docstring:
        "High-quality avatar videos that feel real, generated from your audio",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Audio-driven video generation",
        "Music visualization",
        "Talking head animation",
        "Audio-synced content creation",
        "Podcast video generation"
      ]
    },
    "fal-ai/wan/v2.2-14b/speech-to-video": {
      className: "WanV2214bSpeechToVideo",
      docstring:
        "Wan-S2V is a video model that generates high-quality videos from static images and audio, with realistic facial expressions, body movements, and professional camera work for film and television applications",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Audio-driven video generation",
        "Music visualization",
        "Talking head animation",
        "Audio-synced content creation",
        "Podcast video generation"
      ]
    },
    "fal-ai/stable-avatar": {
      className: "StableAvatar",
      docstring:
        "Stable Avatar generates audio-driven video avatars up to five minutes long",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Audio-driven video generation",
        "Music visualization",
        "Talking head animation",
        "Audio-synced content creation",
        "Podcast video generation"
      ]
    },
    "fal-ai/echomimic-v3": {
      className: "EchomimicV3",
      docstring:
        "EchoMimic V3 generates a talking avatar model from a picture, audio and text prompt.",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Audio-driven video generation",
        "Music visualization",
        "Talking head animation",
        "Audio-synced content creation",
        "Podcast video generation"
      ]
    },
    "veed/avatars/audio-to-video": {
      className: "VeedAvatarsAudioToVideo",
      docstring:
        "Generate high-quality videos with UGC-like avatars from audio",
      tags: ["video", "generation", "audio-to-video", "visualization"],
      useCases: [
        "Audio-driven video generation",
        "Music visualization",
        "Talking head animation",
        "Audio-synced content creation",
        "Podcast video generation"
      ]
    }
  }
};
