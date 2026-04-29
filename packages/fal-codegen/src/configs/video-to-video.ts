import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/amt-interpolation": {
      className: "AMTInterpolation",
      docstring:
        "AMT (Any-to-Many Temporal) Interpolation creates smooth transitions between video frames.",
      tags: [
        "video",
        "interpolation",
        "frame-generation",
        "amt",
        "video-to-video"
      ],
      useCases: [
        "Increase video frame rate smoothly",
        "Create slow-motion effects",
        "Smooth out choppy video",
        "Generate intermediate frames",
        "Enhance video playback quality"
      ],
      basicFields: ["video"]
    },
    "half-moon-ai/ai-face-swap/faceswapvideo": {
      className: "AIFaceSwapVideo",
      docstring:
        "AI Face Swap replaces faces in videos with target faces while preserving expressions and movements.",
      tags: [
        "video",
        "face-swap",
        "deepfake",
        "face-replacement",
        "video-to-video"
      ],
      useCases: [
        "Replace faces in video content",
        "Create personalized video content",
        "Swap actors in video scenes",
        "Generate face replacement effects",
        "Create video with different faces"
      ],
      basicFields: ["video", "target_face"]
    },
    "fal-ai/fast-animatediff/video-to-video": {
      className: "AnimateDiffVideoToVideo",
      docstring:
        "AnimateDiff re-animates videos with new styles and effects using diffusion models.",
      tags: [
        "video",
        "style-transfer",
        "animatediff",
        "re-animation",
        "video-to-video"
      ],
      useCases: [
        "Restyle existing videos",
        "Apply artistic effects to videos",
        "Transform video aesthetics",
        "Create stylized video versions",
        "Generate video variations"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/fast-animatediff/turbo/video-to-video": {
      className: "AnimateDiffTurboVideoToVideo",
      docstring:
        "AnimateDiff Turbo re-animates videos quickly with reduced generation time.",
      tags: [
        "video",
        "style-transfer",
        "animatediff",
        "turbo",
        "fast",
        "video-to-video"
      ],
      useCases: [
        "Quickly restyle videos",
        "Rapid video transformations",
        "Fast video effect application",
        "Efficient video processing",
        "Real-time video styling"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/auto-caption": {
      className: "AutoCaption",
      docstring:
        "Auto Caption automatically generates and adds captions to videos with speech recognition.",
      tags: [
        "video",
        "captions",
        "subtitles",
        "speech-to-text",
        "video-to-video"
      ],
      useCases: [
        "Add subtitles to videos automatically",
        "Generate captions for accessibility",
        "Create multilingual subtitles",
        "Transcribe video speech",
        "Add text overlays to videos"
      ],
      basicFields: ["video"]
    },
    "fal-ai/ben/v2/video": {
      className: "BenV2Video",
      docstring:
        "Ben v2 Video enhances and processes video content with advanced AI techniques.",
      tags: ["video", "enhancement", "processing", "ben", "video-to-video"],
      useCases: [
        "Enhance video quality",
        "Process video content",
        "Improve video clarity",
        "Apply video enhancements",
        "Optimize video output"
      ],
      basicFields: ["video"]
    },
    "fal-ai/birefnet/v2/video": {
      className: "BiRefNetV2Video",
      docstring:
        "BiRefNet v2 Video performs background removal from videos with high accuracy.",
      tags: [
        "video",
        "background-removal",
        "segmentation",
        "birefnet",
        "video-to-video"
      ],
      useCases: [
        "Remove backgrounds from videos",
        "Create transparent video backgrounds",
        "Isolate video subjects",
        "Generate video mattes",
        "Prepare videos for compositing"
      ],
      basicFields: ["video"]
    },
    "bria/bria_video_eraser/erase/mask": {
      className: "BriaVideoEraserMask",
      docstring:
        "Bria Video Eraser removes objects from videos using mask-based selection.",
      tags: [
        "video",
        "object-removal",
        "eraser",
        "inpainting",
        "bria",
        "video-to-video"
      ],
      useCases: [
        "Remove unwanted objects from videos",
        "Erase people or items from footage",
        "Clean up video backgrounds",
        "Remove watermarks from videos",
        "Edit video content seamlessly"
      ],
      basicFields: ["video", "mask"]
    },
    "bria/bria_video_eraser/erase/keypoints": {
      className: "BriaVideoEraserKeypoints",
      docstring:
        "Bria Video Eraser removes objects from videos using keypoint-based selection.",
      tags: [
        "video",
        "object-removal",
        "eraser",
        "keypoints",
        "bria",
        "video-to-video"
      ],
      useCases: [
        "Remove objects using keypoint selection",
        "Erase specific areas from videos",
        "Targeted video content removal",
        "Precision video editing",
        "Remove elements with point markers"
      ],
      basicFields: ["video", "keypoints"]
    },
    "bria/bria_video_eraser/erase/prompt": {
      className: "BriaVideoEraserPrompt",
      docstring:
        "Bria Video Eraser removes objects from videos using text prompt descriptions.",
      tags: [
        "video",
        "object-removal",
        "eraser",
        "prompt",
        "bria",
        "video-to-video"
      ],
      useCases: [
        "Remove objects by describing them",
        "Text-based video editing",
        "Natural language video cleanup",
        "Prompt-driven object removal",
        "Semantic video editing"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/cogvideox-5b/video-to-video": {
      className: "CogVideoX5BVideoToVideo",
      docstring:
        "CogVideoX-5B transforms existing videos with new styles and effects.",
      tags: [
        "video",
        "transformation",
        "cogvideo",
        "style-transfer",
        "video-to-video"
      ],
      useCases: [
        "Transform video styles",
        "Apply effects to existing videos",
        "Restyle video content",
        "Generate video variations",
        "Create artistic video versions"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/frame-forge": {
      className: "FrameForge",
      docstring:
        "Frame Forge processes and transforms individual video frames for creative effects.",
      tags: [
        "video",
        "frame-processing",
        "effects",
        "transformation",
        "video-to-video"
      ],
      useCases: [
        "Process video frames individually",
        "Apply per-frame effects",
        "Transform frame sequences",
        "Create frame-based effects",
        "Generate processed video output"
      ],
      basicFields: ["video"]
    },
    "fal-ai/hunyuan-video/video-to-video": {
      className: "HunyuanVideoToVideo",
      docstring:
        "Hunyuan Video transforms existing videos with advanced AI-powered effects.",
      tags: ["video", "transformation", "hunyuan", "video-to-video"],
      useCases: [
        "Transform video content",
        "Apply AI effects to videos",
        "Restyle existing footage",
        "Generate video variations",
        "Create enhanced video versions"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/ltx-video/video-to-video": {
      className: "LTXVideoToVideo",
      docstring:
        "LTX Video transforms videos with temporal consistency and high quality.",
      tags: ["video", "transformation", "ltx", "temporal", "video-to-video"],
      useCases: [
        "Transform videos with consistency",
        "Apply temporal effects",
        "Generate smooth video transitions",
        "Create consistent video variations",
        "Maintain temporal coherence"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/luma-dream-machine/video-to-video": {
      className: "LumaDreamMachineVideoToVideo",
      docstring:
        "Luma Dream Machine transforms videos with dreamlike artistic effects.",
      tags: [
        "video",
        "transformation",
        "luma",
        "dream-machine",
        "artistic",
        "video-to-video"
      ],
      useCases: [
        "Create dreamlike video effects",
        "Transform videos artistically",
        "Generate surreal video versions",
        "Apply creative effects",
        "Produce artistic video content"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/minimax-video/v1/video-to-video": {
      className: "MinimaxVideoV1VideoToVideo",
      docstring:
        "Minimax Video v1 transforms videos efficiently with minimal resource usage.",
      tags: [
        "video",
        "transformation",
        "minimax",
        "efficient",
        "video-to-video"
      ],
      useCases: [
        "Transform videos efficiently",
        "Process videos with minimal resources",
        "Generate optimized video outputs",
        "Create scalable video transformations",
        "Efficient video processing"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/runway-gen3/turbo/video-to-video": {
      className: "RunwayGen3TurboVideoToVideo",
      docstring:
        "Runway Gen-3 Turbo transforms videos quickly with high-quality output.",
      tags: [
        "video",
        "transformation",
        "runway",
        "gen3",
        "turbo",
        "video-to-video"
      ],
      useCases: [
        "Transform videos rapidly",
        "Quick video style transfers",
        "Fast video processing",
        "Real-time video effects",
        "Efficient video transformations"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/stable-video/video-to-video": {
      className: "StableVideoToVideo",
      docstring:
        "Stable Video transforms videos with consistent and stable results.",
      tags: [
        "video",
        "transformation",
        "stable",
        "consistent",
        "video-to-video"
      ],
      useCases: [
        "Transform videos consistently",
        "Generate stable video outputs",
        "Create predictable video effects",
        "Maintain video stability",
        "Reliable video transformations"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/wan-x-labs/svd-v1": {
      className: "WanXLabsSVDV1",
      docstring:
        "Wan X Labs SVD v1 performs stable video diffusion for video transformation.",
      tags: ["video", "diffusion", "svd", "transformation", "video-to-video"],
      useCases: [
        "Apply diffusion effects to videos",
        "Transform videos with SVD",
        "Generate diffusion-based variations",
        "Create stable video transformations",
        "Produce diffusion video effects"
      ],
      basicFields: ["video"]
    },
    "fal-ai/video-upscaler": {
      className: "VideoUpscaler",
      docstring:
        "Video Upscaler enhances video resolution and quality using AI.",
      tags: [
        "video",
        "upscaling",
        "enhancement",
        "resolution",
        "video-to-video"
      ],
      useCases: [
        "Upscale low resolution videos",
        "Enhance video quality",
        "Increase video resolution",
        "Improve video clarity",
        "Restore old video footage"
      ],
      basicFields: ["video"]
    },
    "fal-ai/ccsr": {
      className: "CCSR",
      docstring:
        "CCSR (Controllable Color Style Restoration) restores and enhances video colors.",
      tags: [
        "video",
        "color-restoration",
        "enhancement",
        "ccsr",
        "video-to-video"
      ],
      useCases: [
        "Restore video colors",
        "Enhance video color quality",
        "Fix color issues in videos",
        "Improve video color grading",
        "Restore faded video footage"
      ],
      basicFields: ["video"]
    },
    "fal-ai/luma-photon/video-to-video": {
      className: "LumaPhotonVideoToVideo",
      docstring:
        "Luma Photon transforms videos with photorealistic effects and enhancements.",
      tags: [
        "video",
        "transformation",
        "luma",
        "photon",
        "photorealistic",
        "video-to-video"
      ],
      useCases: [
        "Create photorealistic video effects",
        "Transform videos realistically",
        "Generate realistic video variations",
        "Enhance video realism",
        "Produce lifelike video content"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/kling-video/v1/standard/video-to-video": {
      className: "KlingVideoV1StandardVideoToVideo",
      docstring:
        "Kling Video v1 Standard transforms videos with balanced quality and speed.",
      tags: ["video", "transformation", "kling", "standard", "video-to-video"],
      useCases: [
        "Transform videos efficiently",
        "Balanced video processing",
        "Standard quality transformations",
        "General purpose video effects",
        "Moderate speed processing"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/kling-video/v1/pro/video-to-video": {
      className: "KlingVideoV1ProVideoToVideo",
      docstring:
        "Kling Video v1 Pro transforms videos with professional quality output.",
      tags: [
        "video",
        "transformation",
        "kling",
        "pro",
        "professional",
        "video-to-video"
      ],
      useCases: [
        "Professional video transformations",
        "High-quality video effects",
        "Premium video processing",
        "Cinematic video enhancements",
        "Professional grade output"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/moondream/video": {
      className: "MoondreamVideo",
      docstring:
        "Moondream Video analyzes and processes video content with AI understanding.",
      tags: [
        "video",
        "analysis",
        "understanding",
        "moondream",
        "video-to-video"
      ],
      useCases: [
        "Analyze video content",
        "Process videos with AI understanding",
        "Extract video insights",
        "Generate video descriptions",
        "Intelligent video processing"
      ],
      basicFields: ["video"]
    },
    "fal-ai/video-depth-crafter": {
      className: "VideoDepthCrafter",
      docstring:
        "Video Depth Crafter generates depth maps from videos for 3D effects.",
      tags: ["video", "depth-estimation", "3d", "depth-map", "video-to-video"],
      useCases: [
        "Generate depth maps from videos",
        "Create 3D effects from videos",
        "Extract depth information",
        "Enable video 3D conversion",
        "Produce depth-aware video effects"
      ],
      basicFields: ["video"]
    },
    "fal-ai/video-portrait": {
      className: "VideoPortrait",
      docstring:
        "Video Portrait processes and enhances portrait videos with face-aware effects.",
      tags: [
        "video",
        "portrait",
        "face-processing",
        "enhancement",
        "video-to-video"
      ],
      useCases: [
        "Process portrait videos",
        "Enhance face quality in videos",
        "Apply portrait effects",
        "Improve video selfies",
        "Face-aware video processing"
      ],
      basicFields: ["video"]
    },
    "fal-ai/viggle/v2": {
      className: "ViggleV2",
      docstring:
        "Viggle v2 applies motion and animation effects to video content.",
      tags: ["video", "motion", "animation", "viggle", "video-to-video"],
      useCases: [
        "Apply motion effects to videos",
        "Animate video content",
        "Create dynamic video effects",
        "Generate motion-based variations",
        "Add movement to videos"
      ],
      basicFields: ["video"]
    },
    "fal-ai/video-retalking": {
      className: "VideoRetalking",
      docstring:
        "Video Retalking synchronizes lip movements in videos with new audio.",
      tags: ["video", "lip-sync", "audio-sync", "retalking", "video-to-video"],
      useCases: [
        "Sync lips with new audio",
        "Dub videos naturally",
        "Change video dialogue",
        "Create multilingual videos",
        "Resync video speech"
      ],
      basicFields: ["video", "audio"]
    },
    "fal-ai/video-stabilizer": {
      className: "VideoStabilizer",
      docstring:
        "Video Stabilizer removes camera shake and stabilizes shaky video footage.",
      tags: [
        "video",
        "stabilization",
        "shake-removal",
        "smoothing",
        "video-to-video"
      ],
      useCases: [
        "Stabilize shaky videos",
        "Remove camera shake",
        "Smooth handheld footage",
        "Fix unstable video",
        "Improve video stability"
      ],
      basicFields: ["video"]
    },
    "fal-ai/ltx-2-19b/distilled/video-to-video/lora": {
      className: "Ltx219BDistilledVideoToVideoLora",
      docstring: "LTX-2 19B Distilled",
      tags: ["video", "editing", "video-to-video", "vid2vid", "lora"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-2-19b/distilled/video-to-video": {
      className: "Ltx219BDistilledVideoToVideo",
      docstring: "LTX-2 19B Distilled",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-2-19b/video-to-video/lora": {
      className: "Ltx219BVideoToVideoLora",
      docstring: "LTX-2 19B",
      tags: ["video", "editing", "video-to-video", "vid2vid", "lora"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-2-19b/video-to-video": {
      className: "Ltx219BVideoToVideo",
      docstring: "LTX-2 19B",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-2-19b/distilled/extend-video/lora": {
      className: "Ltx219BDistilledExtendVideoLora",
      docstring: "LTX-2 19B Distilled",
      tags: ["video", "editing", "video-to-video", "vid2vid", "lora"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-2-19b/distilled/extend-video": {
      className: "Ltx219BDistilledExtendVideo",
      docstring: "LTX-2 19B Distilled",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-2-19b/extend-video/lora": {
      className: "Ltx219BExtendVideoLora",
      docstring: "LTX-2 19B",
      tags: ["video", "editing", "video-to-video", "vid2vid", "lora"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-2-19b/extend-video": {
      className: "Ltx219BExtendVideo",
      docstring: "LTX-2 19B",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "bria/video/erase/keypoints": {
      className: "BriaVideoEraseKeypoints",
      docstring: "Video",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "bria/video/erase/prompt": {
      className: "BriaVideoErasePrompt",
      docstring: "Video",
      tags: ["video", "editing", "video-to-video", "vid2vid", "professional"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "bria/video/erase/mask": {
      className: "BriaVideoEraseMask",
      docstring: "Video",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/lightx/relight": {
      className: "LightxRelight",
      docstring: "Lightx",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/lightx/recamera": {
      className: "LightxRecamera",
      docstring: "Lightx",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/kling-video/v2.6/standard/motion-control": {
      className: "KlingVideoV26StandardMotionControl",
      docstring: "Kling Video v2.6 Motion Control [Standard]",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/kling-video/v2.6/pro/motion-control": {
      className: "KlingVideoV26ProMotionControl",
      docstring: "Kling Video v2.6 Motion Control [Pro]",
      tags: ["video", "editing", "video-to-video", "vid2vid", "professional"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "decart/lucy-restyle": {
      className: "DecartLucyRestyle",
      docstring: "Lucy Restyle",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/scail": {
      className: "Scail",
      docstring: "Scail",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "clarityai/crystal-video-upscaler": {
      className: "ClarityaiCrystalVideoUpscaler",
      docstring: "Crystal Upscaler [Video]",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "wan/v2.6/reference-to-video": {
      className: "WanV26ReferenceToVideo",
      docstring: "Wan v2.6 Reference to Video",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/veo3.1/fast/extend-video": {
      className: "Veo31FastExtendVideo",
      docstring: "Veo 3.1 Fast",
      tags: ["video", "editing", "video-to-video", "vid2vid", "fast"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/veo3.1/extend-video": {
      className: "Veo31ExtendVideo",
      docstring: "Veo 3.1",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/kling-video/o1/standard/video-to-video/reference": {
      className: "KlingVideoO1StandardVideoToVideoReference",
      docstring: "Kling O1 Reference Video to Video [Standard]",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/kling-video/o1/standard/video-to-video/edit": {
      className: "KlingVideoO1StandardVideoToVideoEdit",
      docstring: "Kling O1 Edit Video [Standard]",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/kling-video/o3/standard/video-to-video/reference": {
      className: "KlingVideoO3StandardVideoToVideoReference",
      docstring: "Kling O3 Reference Video to Video [Standard]",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ],
      basicFields: ["video", "prompt", "duration"]
    },
    "fal-ai/kling-video/o3/standard/video-to-video/edit": {
      className: "KlingVideoO3StandardVideoToVideoEdit",
      docstring: "Kling O3 Edit Video [Standard]",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/kling-video/o3/pro/video-to-video/reference": {
      className: "KlingVideoO3ProVideoToVideoReference",
      docstring: "Kling O3 Reference Video to Video [Pro]",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ],
      basicFields: ["video", "prompt", "duration"]
    },
    "fal-ai/kling-video/o3/pro/video-to-video/edit": {
      className: "KlingVideoO3ProVideoToVideoEdit",
      docstring: "Kling O3 Edit Video [Pro]",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ],
      basicFields: ["video", "prompt"]
    },
    "fal-ai/steady-dancer": {
      className: "SteadyDancer",
      docstring: "Steady Dancer",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/one-to-all-animation/1.3b": {
      className: "OneToAllAnimation13B",
      docstring: "One To All Animation",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/one-to-all-animation/14b": {
      className: "OneToAllAnimation14B",
      docstring: "One To All Animation",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-vision-enhancer": {
      className: "WanVisionEnhancer",
      docstring: "Wan Vision Enhancer",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/sync-lipsync/react-1": {
      className: "SyncLipsyncReact1",
      docstring: "Sync React-1",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "veed/video-background-removal/fast": {
      className: "VeedVideoBackgroundRemovalFast",
      docstring: "Video Background Removal",
      tags: ["video", "editing", "video-to-video", "vid2vid", "fast"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/kling-video/o1/video-to-video/edit": {
      className: "KlingVideoO1VideoToVideoEdit",
      docstring: "Kling O1 Edit Video [Pro]",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/kling-video/o1/video-to-video/reference": {
      className: "KlingVideoO1VideoToVideoReference",
      docstring: "Kling O1 Reference Video to Video [Pro]",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "veed/video-background-removal": {
      className: "VeedVideoBackgroundRemoval",
      docstring: "Video Background Removal",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "veed/video-background-removal/green-screen": {
      className: "VeedVideoBackgroundRemovalGreenScreen",
      docstring: "Video Background Removal",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-2/retake-video": {
      className: "Ltx2RetakeVideo",
      docstring: "LTX Video 2.0 Retake",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "decart/lucy-edit/fast": {
      className: "DecartLucyEditFast",
      docstring: "Lucy Edit [Fast]",
      tags: ["video", "editing", "video-to-video", "vid2vid", "fast"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/sam-3/video-rle": {
      className: "Sam3VideoRle",
      docstring: "Sam 3",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/sam-3/video": {
      className: "Sam3Video",
      docstring: "Sam 3",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/editto": {
      className: "Editto",
      docstring: "Editto",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/flashvsr/upscale/video": {
      className: "FlashvsrUpscaleVideo",
      docstring: "Flashvsr",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/workflow-utilities/auto-subtitle": {
      className: "WorkflowUtilitiesAutoSubtitle",
      docstring: "Workflow Utilities",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/bytedance-upscaler/upscale/video": {
      className: "BytedanceUpscalerUpscaleVideo",
      docstring: "Bytedance Upscaler",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/video-as-prompt": {
      className: "VideoAsPrompt",
      docstring: "Video As Prompt",
      tags: ["video", "editing", "video-to-video", "vid2vid", "professional"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/vidu/q2/video-extension/pro": {
      className: "ViduQ2VideoExtensionPro",
      docstring: "Vidu",
      tags: ["video", "editing", "video-to-video", "vid2vid", "professional"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "mirelo-ai/sfx-v1.5/video-to-video": {
      className: "MireloAiSfxV15VideoToVideo",
      docstring: "Mirelo SFX V1.5",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/krea-wan-14b/video-to-video": {
      className: "KreaWan14BVideoToVideo",
      docstring: "Krea Wan 14B",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/sora-2/video-to-video/remix": {
      className: "Sora2VideoToVideoRemix",
      docstring: "Sora 2",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-vace-apps/long-reframe": {
      className: "WanVaceAppsLongReframe",
      docstring: "Wan 2.1 VACE Long Reframe",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/infinitalk/video-to-video": {
      className: "InfinitalkVideoToVideo",
      docstring: "Infinitalk",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/seedvr/upscale/video": {
      className: "SeedvrUpscaleVideo",
      docstring: "SeedVR2",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-vace-apps/video-edit": {
      className: "WanVaceAppsVideoEdit",
      docstring: "Wan VACE Video Edit",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan/v2.2-14b/animate/replace": {
      className: "WanV2214bAnimateReplace",
      docstring:
        "Wan-Animate Replace is a model that can integrate animated characters into reference videos, replacing the original character while preserving the scene's lighting and color tone for seamless environmental integration.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan/v2.2-14b/animate/move": {
      className: "WanV2214bAnimateMove",
      docstring:
        "Wan-Animate is a video model that generates high-fidelity character videos by replicating the expressions and movements of characters from reference videos.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "decart/lucy-edit/pro": {
      className: "DecartLucyEditPro",
      docstring:
        "Edit outfits, objects, faces, or restyle your video - all with maximum detail retention.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "decart/lucy-edit/dev": {
      className: "DecartLucyEditDev",
      docstring:
        "Edit outfits, objects, faces, or restyle your video - all with maximum detail retention.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-22-vace-fun-a14b/reframe": {
      className: "Wan22VaceFunA14bReframe",
      docstring: "VACE Fun for Wan 2.2 A14B from Alibaba-PAI",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-22-vace-fun-a14b/outpainting": {
      className: "Wan22VaceFunA14bOutpainting",
      docstring: "VACE Fun for Wan 2.2 A14B from Alibaba-PAI",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-22-vace-fun-a14b/inpainting": {
      className: "Wan22VaceFunA14bInpainting",
      docstring: "VACE Fun for Wan 2.2 A14B from Alibaba-PAI",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-22-vace-fun-a14b/depth": {
      className: "Wan22VaceFunA14bDepth",
      docstring: "VACE Fun for Wan 2.2 A14B from Alibaba-PAI",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-22-vace-fun-a14b/pose": {
      className: "Wan22VaceFunA14bPose",
      docstring: "VACE Fun for Wan 2.2 A14B from Alibaba-PAI",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/hunyuan-video-foley": {
      className: "HunyuanVideoFoley",
      docstring:
        "Use the capabilities of the hunyuan foley model to bring life to your videos by adding sound effect to them.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/sync-lipsync/v2/pro": {
      className: "SyncLipsyncV2Pro",
      docstring:
        "Generate high-quality realistic lipsync animations from audio while preserving unique details like natural teeth and unique facial features using the state-of-the-art Sync Lipsync 2 Pro model.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-fun-control": {
      className: "WanFunControl",
      docstring:
        "Generate pose or depth controlled video using Alibaba-PAI's Wan 2.2 Fun",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "bria/video/increase-resolution": {
      className: "BriaVideoIncreaseResolution",
      docstring:
        "Upscale videos up to 8K output resolution. Trained on fully licensed and commercially safe data.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/infinitalk": {
      className: "Infinitalk",
      docstring:
        "Infinitalk model generates a talking avatar video from an image and audio file. The avatar lip-syncs to the provided audio with natural facial expressions.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "mirelo-ai/sfx-v1/video-to-video": {
      className: "MireloAiSfxV1VideoToVideo",
      docstring:
        "Generate synced sounds for any video, and return it with its new sound track (like MMAudio) ",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "moonvalley/marey/pose-transfer": {
      className: "MoonvalleyMareyPoseTransfer",
      docstring:
        "Ideal for matching human movement. Your input video determines human poses, gestures, and body movements that will appear in the generated video.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "moonvalley/marey/motion-transfer": {
      className: "MoonvalleyMareyMotionTransfer",
      docstring:
        "Pull motion from a reference video and apply it to new subjects or scenes.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ffmpeg-api/merge-videos": {
      className: "FfmpegApiMergeVideos",
      docstring: "Use ffmpeg capabilities to merge 2 or more videos.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan/v2.2-a14b/video-to-video": {
      className: "WanV22A14bVideoToVideo",
      docstring:
        "Wan-2.2 video-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts and source videos.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltxv-13b-098-distilled/extend": {
      className: "Ltxv13b098DistilledExtend",
      docstring:
        "Extend videos using LTX Video-0.9.8 13B Distilled and custom LoRA",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/rife/video": {
      className: "RifeVideo",
      docstring:
        "Interpolate videos with RIFE - Real-Time Intermediate Flow Estimation",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/film/video": {
      className: "FilmVideo",
      docstring:
        "Interpolate videos with FILM - Frame Interpolation for Large Motion",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/luma-dream-machine/ray-2-flash/modify": {
      className: "LumaDreamMachineRay2FlashModify",
      docstring:
        "Ray2 Flash Modify is a video generative model capable of restyling or retexturing the entire shot, from turning live-action into CG or stylized animation, to changing wardrobe, props, or the overall aesthetic and swap environments or time periods, giving you control over background, location, or even weather.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltxv-13b-098-distilled/multiconditioning": {
      className: "Ltxv13b098DistilledMulticonditioning",
      docstring:
        "Generate long videos from prompts, images, and videos using LTX Video-0.9.8 13B Distilled and custom LoRA",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/pixverse/sound-effects": {
      className: "PixverseSoundEffects",
      docstring:
        "Add immersive sound effects and background music to your videos using PixVerse sound effects  generation",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/thinksound/audio": {
      className: "ThinksoundAudio",
      docstring:
        "Generate realistic audio from a video with an optional text prompt",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/thinksound": {
      className: "Thinksound",
      docstring:
        "Generate realistic audio for a video with an optional text prompt and combine",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/pixverse/extend/fast": {
      className: "PixverseExtendFast",
      docstring:
        "PixVerse Extend model is a video extending tool for your videos using with high-quality video extending techniques ",
      tags: ["video", "editing", "video-to-video", "vid2vid", "fast"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/pixverse/extend": {
      className: "PixverseExtend",
      docstring:
        "PixVerse Extend model is a video extending tool for your videos using with high-quality video extending techniques ",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/pixverse/lipsync": {
      className: "PixverseLipsync",
      docstring:
        "Generate realistic lipsync animations from audio using advanced algorithms for high-quality synchronization with PixVerse Lipsync model",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/luma-dream-machine/ray-2/modify": {
      className: "LumaDreamMachineRay2Modify",
      docstring:
        "Ray2 Modify is a video generative model capable of restyling or retexturing the entire shot, from turning live-action into CG or stylized animation, to changing wardrobe, props, or the overall aesthetic and swap environments or time periods, giving you control over background, location, or even weather.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-vace-14b/reframe": {
      className: "WanVace14bReframe",
      docstring:
        "VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-vace-14b/outpainting": {
      className: "WanVace14bOutpainting",
      docstring:
        "VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-vace-14b/inpainting": {
      className: "WanVace14bInpainting",
      docstring:
        "VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-vace-14b/pose": {
      className: "WanVace14bPose",
      docstring:
        "VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-vace-14b/depth": {
      className: "WanVace14bDepth",
      docstring:
        "VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/dwpose/video": {
      className: "DwposeVideo",
      docstring: "Predict poses from videos.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ffmpeg-api/merge-audio-video": {
      className: "FfmpegApiMergeAudioVideo",
      docstring:
        "Merge videos with standalone audio files or audio from video files.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-vace-1-3b": {
      className: "WanVace13b",
      docstring:
        "Vace a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/luma-dream-machine/ray-2-flash/reframe": {
      className: "LumaDreamMachineRay2FlashReframe",
      docstring:
        "Adjust and enhance videos with Ray-2 Reframe. This advanced tool seamlessly reframes videos to your desired aspect ratio, intelligently inpainting missing regions to ensure realistic visuals and coherent motion, delivering exceptional quality and creative flexibility.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/luma-dream-machine/ray-2/reframe": {
      className: "LumaDreamMachineRay2Reframe",
      docstring:
        "Adjust and enhance videos with Ray-2 Reframe. This advanced tool seamlessly reframes videos to your desired aspect ratio, intelligently inpainting missing regions to ensure realistic visuals and coherent motion, delivering exceptional quality and creative flexibility.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "veed/lipsync": {
      className: "VeedLipsync",
      docstring:
        "Generate realistic lipsync from any audio using VEED's latest model",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-vace-14b": {
      className: "WanVace14b",
      docstring:
        "VACE is a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-video-13b-distilled/extend": {
      className: "LtxVideo13bDistilledExtend",
      docstring:
        "Extend videos using LTX Video-0.9.7 13B Distilled and custom LoRA",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-video-13b-distilled/multiconditioning": {
      className: "LtxVideo13bDistilledMulticonditioning",
      docstring:
        "Generate videos from prompts, images, and videos using LTX Video-0.9.7 13B Distilled and custom LoRA",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-video-13b-dev/multiconditioning": {
      className: "LtxVideo13bDevMulticonditioning",
      docstring:
        "Generate videos from prompts, images, and videos using LTX Video-0.9.7 13B and custom LoRA",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-video-13b-dev/extend": {
      className: "LtxVideo13bDevExtend",
      docstring: "Extend videos using LTX Video-0.9.7 13B and custom LoRA",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-video-lora/multiconditioning": {
      className: "LtxVideoLoraMulticonditioning",
      docstring:
        "Generate videos from prompts, images, and videos using LTX Video-0.9.7 and custom LoRA",
      tags: ["video", "editing", "video-to-video", "vid2vid", "lora"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/magi/extend-video": {
      className: "MagiExtendVideo",
      docstring:
        "MAGI-1 extends videos with an exceptional understanding of physical interactions and prompts",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/magi-distilled/extend-video": {
      className: "MagiDistilledExtendVideo",
      docstring:
        "MAGI-1 distilled extends videos faster with an exceptional understanding of physical interactions and prompts",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/wan-vace": {
      className: "WanVace",
      docstring:
        "Vace a video generation model that uses a source image, mask, and video to create prompted videos with controllable sources.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "cassetteai/video-sound-effects-generator": {
      className: "CassetteaiVideoSoundEffectsGenerator",
      docstring: "Add sound effects to your videos",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/sync-lipsync/v2": {
      className: "SyncLipsyncV2",
      docstring:
        "Generate realistic lipsync animations from audio using advanced algorithms for high-quality synchronization with Sync Lipsync 2.0 model",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/latentsync": {
      className: "Latentsync",
      docstring:
        "LatentSync is a video-to-video model that generates lip sync animations from audio using advanced algorithms for high-quality synchronization.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/pika/v2/pikadditions": {
      className: "PikaV2Pikadditions",
      docstring:
        "Pikadditions is a powerful video-to-video AI model that allows you to add anyone or anything to any video with seamless integration.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-video-v095/extend": {
      className: "LtxVideoV095Extend",
      docstring:
        "Generate videos from prompts and videos using LTX Video-0.9.5",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ltx-video-v095/multiconditioning": {
      className: "LtxVideoV095Multiconditioning",
      docstring:
        "Generate videos from prompts,images, and videos using LTX Video-0.9.5",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/topaz/upscale/video": {
      className: "TopazUpscaleVideo",
      docstring:
        "Professional-grade video upscaling using Topaz technology. Enhance your videos with high-quality upscaling.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/hunyuan-video-lora/video-to-video": {
      className: "HunyuanVideoLoraVideoToVideo",
      docstring:
        "Hunyuan Video is an Open video generation model with high visual quality, motion diversity, text-video alignment, and generation stability. Use this endpoint to generate videos from videos.",
      tags: ["video", "editing", "video-to-video", "vid2vid", "lora"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/ffmpeg-api/compose": {
      className: "FfmpegApiCompose",
      docstring: "Compose videos from multiple media sources using FFmpeg API.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/sync-lipsync": {
      className: "SyncLipsync",
      docstring:
        "Generate realistic lipsync animations from audio using advanced algorithms for high-quality synchronization.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/dubbing": {
      className: "Dubbing",
      docstring:
        "This endpoint delivers seamlessly localized videos by generating lip-synced dubs in multiple languages, ensuring natural and immersive multilingual experiences",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/controlnext": {
      className: "Controlnext",
      docstring:
        "Animate a reference image with a driving video using ControlNeXt.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "fal-ai/sam2/video": {
      className: "Sam2Video",
      docstring:
        "SAM 2 is a model for segmenting images and videos in real-time.",
      tags: ["video", "editing", "video-to-video", "vid2vid"],
      useCases: [
        "Video style transfer",
        "Video enhancement and restoration",
        "Automated video editing",
        "Special effects generation",
        "Content repurposing"
      ]
    },
    "alibaba/happy-horse/video-edit": {
      className: "AlibabaHappyHorseVideoEdit",
      docstring: "Edit videos with Alibaba Happy Horse.",
      tags: ["editing", "video-to-video", "vid2vid", "happy-horse", "alibaba"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/heygen/v3/lipsync/speed": {
      className: "HeygenV3LipsyncSpeed",
      docstring: "HeyGen v3 lipsync (speed mode).",
      tags: ["editing", "video-to-video", "vid2vid", "heygen", "lipsync"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/heygen/v3/lipsync/precision": {
      className: "HeygenV3LipsyncPrecision",
      docstring: "HeyGen v3 lipsync (precision mode).",
      tags: ["editing", "video-to-video", "vid2vid", "heygen", "lipsync"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/distilled/reference-video-to-video": {
      className: "Ltx2322bDistilledReferenceVideoToVideo",
      docstring: "LTX 2.3-22b distilled reference video-to-video.",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "reference"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/distilled/reference-video-to-video/lora": {
      className: "Ltx2322bDistilledReferenceVideoToVideoLora",
      docstring: "LTX 2.3-22b distilled reference video-to-video with LoRA.",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "lora"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/reference-video-to-video": {
      className: "Ltx2322bReferenceVideoToVideo",
      docstring: "LTX 2.3-22b reference video-to-video.",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "reference"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/reference-video-to-video/lora": {
      className: "Ltx2322bReferenceVideoToVideoLora",
      docstring: "LTX 2.3-22b reference video-to-video with LoRA.",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "lora"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/void-video-inpainting": {
      className: "VoidVideoInpainting",
      docstring: "Void: video inpainting.",
      tags: ["editing", "video-to-video", "vid2vid", "inpainting"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    }
  }
};
