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
    },
    "fal-ai/flashtalk": {
      className: "Flashtalk",
      docstring:
        "Audio-driven talking avatar generation powered by the SoulX-FlashTalk 14B model.",
      tags: ["generation", "audio-to-video", "video", "flashtalk"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/audio-to-video": {
      className: "Ltx2322bAudioToVideo",
      docstring:
        "Generate video with audio from audio, text and images using LTX-2",
      tags: ["generation", "audio-to-video", "video", "ltx", "22b"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/audio-to-video/lora": {
      className: "Ltx2322bAudioToVideoLora",
      docstring:
        "Generate video with audio from audio, text and images using LTX-2.3 and custom LoRA",
      tags: ["generation", "audio-to-video", "video", "ltx", "22b", "lora"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/distilled/audio-to-video": {
      className: "Ltx2322bDistilledAudioToVideo",
      docstring:
        "Generate video with audio from audio, text and images using LTX-2 Distilled",
      tags: [
        "generation",
        "audio-to-video",
        "video",
        "ltx",
        "22b",
        "distilled"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/distilled/audio-to-video/lora": {
      className: "Ltx2322bDistilledAudioToVideoLora",
      docstring:
        "Generate video with audio from audio, text and images using LTX-2.3 Distilled and custom LoRA",
      tags: [
        "generation",
        "audio-to-video",
        "video",
        "ltx",
        "22b",
        "distilled",
        "lora"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/audio-to-video": {
      className: "Ltx23QualityAudioToVideo",
      docstring:
        "Generate high-quality video with audio from audio, text and images using LTX-2.3",
      tags: ["generation", "audio-to-video", "video", "ltx", "quality"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/audio-to-video/lora": {
      className: "Ltx23QualityAudioToVideoLora",
      docstring:
        "Generate high-quality video with audio from audio, text and images using LTX-2.3 and custom LoRA",
      tags: ["generation", "audio-to-video", "video", "ltx", "quality", "lora"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3/audio-to-video": {
      className: "Ltx23AudioToVideo",
      docstring:
        "LTX-2.3 is a high-quality, fast AI video model available in Pro and Fast variants for text-to-video, image-to-video, and audio-to-video.",
      tags: ["generation", "audio-to-video", "video", "ltx"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },

    "lightricks/ltx-2.5/audio-to-video/fast": {
      className: "Ltx25AudioToVideoFast",
      docstring:
        "LTX 2.5 generates video timed to a supplied audio clip in a speed-optimized pass.",
      tags: [
        "generation",
        "audio-to-video",
        "video",
        "ltx",
        "ltx-2-5",
        "lipsync",
        "fast"
      ],
      useCases: [
        "Preview visuals against a music track",
        "Draft a dialogue-led short",
        "Time a clip to an existing voiceover",
        "Iterate on a music video concept",
        "Test sync before a final render"
      ]
    },

    "lightricks/ltx-2.5/audio-to-video/pro": {
      className: "Ltx25AudioToVideoPro",
      docstring:
        "LTX 2.5 generates video timed to a supplied audio clip in a quality-optimized pass.",
      tags: [
        "generation",
        "audio-to-video",
        "video",
        "ltx",
        "ltx-2-5",
        "lipsync",
        "quality"
      ],
      useCases: [
        "Render final visuals for a track",
        "Produce a music-driven video",
        "Sync footage to recorded dialogue",
        "Deliver an ad keyed to a soundtrack",
        "Finish an approved audio-timed draft"
      ]
    }
  }
};
