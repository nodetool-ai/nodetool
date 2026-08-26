import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "blackforestlabs/flux-3/extend-video": {
      className: "Flux3ExtendVideo",
      docstring:
        "FLUX 3 continues an existing video, generating more footage from where it ends.",
      tags: ["video", "editing", "video-to-video", "vid2vid", "flux-3"],
      useCases: [
        "Extend a clip that ends too early",
        "Continue a shot for an edit",
        "Chain clips into a longer sequence",
        "Add tail footage for transitions",
        "Lengthen generated b-roll"
      ]
    },

    "blackforestlabs/flux-3/extend-video/draft": {
      className: "Flux3ExtendVideoDraft",
      docstring:
        "FLUX 3 Draft continues an existing video as a low-cost preview, meant to be enhanced afterwards.",
      tags: [
        "video",
        "editing",
        "video-to-video",
        "vid2vid",
        "flux-3",
        "draft"
      ],
      useCases: [
        "Preview an extension before a full render",
        "Check how a shot continues",
        "Iterate cheaply on endings",
        "Review pacing of a longer cut",
        "Feed drafts into the enhance pass"
      ]
    },

    "blackforestlabs/flux-3/draft-enhance": {
      className: "Flux3DraftEnhance",
      docstring:
        "FLUX 3 Draft Enhance upgrades a draft video to full quality, keeping its motion and composition.",
      tags: [
        "video",
        "editing",
        "video-to-video",
        "vid2vid",
        "flux-3",
        "enhance"
      ],
      useCases: [
        "Finalize an approved draft",
        "Upgrade preview clips to delivery quality",
        "Keep motion while raising detail",
        "Render only the takes that survived review",
        "Complete the draft-then-enhance workflow"
      ]
    },

    "fal-ai/heygen/v3/filler-word-removal": {
      className: "HeygenV3FillerWordRemoval",
      docstring:
        "HeyGen v3 removes filler words from a talking-head video and closes the cuts.",
      tags: [
        "video",
        "editing",
        "video-to-video",
        "vid2vid",
        "heygen",
        "speech"
      ],
      useCases: [
        "Clean up ums and ahs in interviews",
        "Tighten talking-head footage",
        "Polish webinar and course recordings",
        "Shorten podcast video cuts",
        "Prepare footage for publishing"
      ]
    },

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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
    },
    "bria/video/background-removal/realtime": {
      className: "VideoBackgroundRemovalRealtime",
      docstring:
        "Remove video backgrounds in real time with Bria’s VRMBG 3.0 model. Built for live streaming, real-time video apps, content creation, and low-latency workflows that need fast, accurate background removal.",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "bria",
        "background",
        "removal",
        "realtime"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "bria/video/background-removal/v3": {
      className: "VideoBackgroundRemovalV3",
      docstring:
        "Remove backgrounds from any video with Bria's VRMBG 3.0. Fast, accurate background removal across talking heads, podcasts, product videos, commercials, and cinematic footage.",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "bria",
        "background",
        "removal"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "decart/lucy-2-5/realtime": {
      className: "Lucy25Realtime",
      docstring:
        "Real-time, prompt-driven video editing over WebRTC. Restyle, swap backgrounds, and add or replace objects live on a webcam or streamed feed at interactive latency.",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "decart",
        "lucy",
        "realtime"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "decart/lucy2-vton/realtime": {
      className: "Lucy2VtonRealtime",
      docstring: "Realtime Try On experience with Decart Lucy 2.1 VTON",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "decart",
        "lucy2",
        "vton",
        "realtime"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/bernini-r/edit-video": {
      className: "BerniniREditVideo",
      docstring:
        "Edit any video with a natural-language instruction using Bernini-R, changing objects, weather, background, or camera angle while keeping the rest of the scene intact.",
      tags: ["editing", "video-to-video", "vid2vid", "bernini"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/bernini-r/reference-edit-video": {
      className: "BerniniRReferenceEditVideo",
      docstring:
        "Edit a video guided by reference images with Bernini-R, bringing an object, material, background, style, or weather from a reference image into your video.",
      tags: ["editing", "video-to-video", "vid2vid", "bernini", "reference"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/bytedance/dreamactor/v2": {
      className: "BytedanceDreamactorV2",
      docstring:
        "Transfer motion from a video to characters in an image using Dreamactor v2. Great performance for non-human and multiple characters",
      tags: ["editing", "video-to-video", "vid2vid", "bytedance", "dreamactor"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/cosmos-predict-2.5/video-to-video": {
      className: "CosmosPredict25VideoToVideo",
      docstring:
        "Generate video from text and videos using NVIDIA's 2B Cosmos Post-Trained Model",
      tags: ["editing", "video-to-video", "vid2vid", "cosmos", "predict"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/depth-anything-video": {
      className: "DepthAnythingVideo",
      docstring:
        "Generates depth maps from video using Video Depth Anything (CVPR 2025). Produces per-frame depth estimation with temporal consistency across frames. Supports 3 model sizes (Small, Base, Large), 5 colormaps including grayscale, side-by-si...",
      tags: ["editing", "video-to-video", "vid2vid", "depth", "anything"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/heygen/v2/translate/precision": {
      className: "HeygenV2TranslatePrecision",
      docstring: "Heygen Translate Model with Extreme Precision",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "heygen",
        "translate",
        "precision"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/heygen/v2/translate/speed": {
      className: "HeygenV2TranslateSpeed",
      docstring: "Heygen Translate Model with Extreme Speed",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "heygen",
        "translate",
        "speed"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/kling-video/v3/pro/motion-control": {
      className: "KlingVideoV3ProMotionControl",
      docstring:
        "Transfer movements from a reference video to any character image. Cost-effective mode for motion transfer, perfect for portraits and simple animations.",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "kling",
        "pro",
        "motion",
        "control"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/kling-video/v3/standard/motion-control": {
      className: "KlingVideoV3StandardMotionControl",
      docstring:
        "Transfer movements from a reference video to any character image. Cost-effective mode for motion transfer, perfect for portraits and simple animations.",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "kling",
        "standard",
        "motion",
        "control"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/distilled/video-to-video": {
      className: "Ltx2322bDistilledVideoToVideo",
      docstring:
        "Generate video with audio from videos using LTX-2.3 Distilled",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "22b", "distilled"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/distilled/video-to-video/lora": {
      className: "Ltx2322bDistilledVideoToVideoLora",
      docstring:
        "Generate video with audio from videos using LTX-2.3 Distilled and custom LoRA",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
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
    "fal-ai/ltx-2.3-22b/extend-video": {
      className: "Ltx2322bExtendVideo",
      docstring: "Extend video with audio using LTX-2.3",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "22b", "extend"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/extend-video/lora": {
      className: "Ltx2322bExtendVideoLora",
      docstring: "Extend video with audio using LTX-2.3 and custom LoRA",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "22b",
        "extend",
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
    "fal-ai/ltx-2.3-22b/video-to-video": {
      className: "Ltx2322bVideoToVideo",
      docstring: "Generate video with audio from videos using LTX-2.3",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "22b"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/video-to-video/lora": {
      className: "Ltx2322bVideoToVideoLora",
      docstring:
        "Generate video with audio from videos using LTX-2.3 and custom LoRA",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "22b", "lora"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/clean-plate": {
      className: "Ltx23QualityCleanPlate",
      docstring: "Remove character from your video using Ltx 2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "clean",
        "plate"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/colorization": {
      className: "Ltx23QualityColorization",
      docstring: "Colorize high-quality video using LTX-2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "colorization"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/cross-eyed": {
      className: "Ltx23QualityCrossEyed",
      docstring: "Cross-eyes for high-quality video using LTX-2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "cross",
        "eyed"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/day-to-night": {
      className: "Ltx23QualityDayToNight",
      docstring: "Day to Night for high-quality video using LTX-2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "day",
        "night"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/deblur": {
      className: "Ltx23QualityDeblur",
      docstring: "Deblur high-quality video using LTX-2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "deblur"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/decompression": {
      className: "Ltx23QualityDecompression",
      docstring: "Decompression / Denoise high-quality video using LTX-2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "decompression"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/extend-video": {
      className: "Ltx23QualityExtendVideo",
      docstring:
        "Extend high-quality video with audio from input video using LTX-2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "extend"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/extend-video/lora": {
      className: "Ltx23QualityExtendVideoLora",
      docstring:
        "Extend high-quality video with audio from input video using LTX-2.3 with Lora",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "extend",
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
    "fal-ai/ltx-2.3-quality/hdr": {
      className: "Ltx23QualityHdr",
      docstring: "Generate HDR from reference video using LTX-2.3",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "quality", "hdr"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/hdr/lora": {
      className: "Ltx23QualityHdrLora",
      docstring: "Generate HDR from reference video using LTX-2.3 with lora",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "hdr",
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
    "fal-ai/ltx-2.3-quality/inpaint": {
      className: "Ltx23QualityInpaint",
      docstring: "Inpaint high-quality video using LTX-2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "inpaint"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/inpaint/lora": {
      className: "Ltx23QualityInpaintLora",
      docstring: "Inpaint high-quality video using LTX-2.3 with lora",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "inpaint",
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
    "fal-ai/ltx-2.3-quality/instant-shave": {
      className: "Ltx23QualityInstantShave",
      docstring: "Instant shave high-quality video using LTX-2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "instant",
        "shave"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/outpaint": {
      className: "Ltx23QualityOutpaint",
      docstring: "Outpaint high-quality video using LTX-2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "outpaint"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/outpaint/lora": {
      className: "Ltx23QualityOutpaintLora",
      docstring: "Outpaint high-quality video using LTX-2.3 with Lora",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "outpaint",
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
    "fal-ai/ltx-2.3-quality/reference-video-to-video": {
      className: "Ltx23QualityReferenceVideoToVideo",
      docstring:
        "Generate high-quality video with audio from reference video, text and images using LTX-2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "reference"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/reference-video-to-video/lora": {
      className: "Ltx23QualityReferenceVideoToVideoLora",
      docstring:
        "Generate high-quality video with audio from reference video, text and images using LTX-2.3 and custom LoRA",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "reference",
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
    "fal-ai/ltx-2.3-quality/render-to-real": {
      className: "Ltx23QualityRenderToReal",
      docstring:
        "Transform your 3D video render into realistic using first frame with Ltx 2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "render",
        "real"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/water-simulation": {
      className: "Ltx23QualityWaterSimulation",
      docstring:
        "Water Simulation transformation for high-quality video using LTX-2.3",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "ltx",
        "quality",
        "water",
        "simulation"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3/extend-video": {
      className: "Ltx23ExtendVideo",
      docstring:
        "LTX-2.3 is a high-quality, fast AI video model available in Pro and Fast variants for text-to-video, image-to-video, and audio-to-video.",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "extend"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3/reframe": {
      className: "Ltx23Reframe",
      docstring:
        "LTX-2.3 Reframe converts your videos to any aspect ratio without destructive cropping. It intelligently recenters the original footage and generatively fills the newly exposed areas with content that seamlessly matches the scene, so the...",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "reframe"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3/retake-video": {
      className: "Ltx23RetakeVideo",
      docstring:
        "LTX-2.3 is a high-quality, fast AI video model available in Pro and Fast variants for text-to-video, image-to-video, and audio-to-video.",
      tags: ["editing", "video-to-video", "vid2vid", "ltx", "retake"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/pixverse/v6/extend": {
      className: "PixverseV6Extend",
      docstring: "Pixverse's latest v6 Model.",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "pixverse",
        "v6",
        "extend"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/sam-3-1/video": {
      className: "Sam31Video",
      docstring:
        "SAM 3.1 builds comes with Object Multiplex, a shared-memory approach for joint multi-object tracking that delivers faster speeds with larger number of objects tracked.",
      tags: ["editing", "video-to-video", "vid2vid", "sam"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/sam-3-1/video-rle": {
      className: "Sam31VideoRle",
      docstring:
        "SAM 3.1 builds comes with Object Multiplex, a shared-memory approach for joint multi-object tracking that delivers faster speeds with larger number of objects tracked.",
      tags: ["editing", "video-to-video", "vid2vid", "sam", "rle"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/scail-2": {
      className: "Scail2",
      docstring:
        "SCAIL-2 is an end-to-end character animation model that drives a reference character from a source video without relying on intermediate pose representations like skeleton maps.",
      tags: ["editing", "video-to-video", "vid2vid", "scail"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/sync-lipsync/v3": {
      className: "SyncLipsyncV3",
      docstring:
        "sync-3 most powerful lipsync model yet, featuring native visual intelligence for professional-quality video.",
      tags: ["editing", "video-to-video", "vid2vid", "sync", "lipsync"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/wan-motion": {
      className: "WanMotion",
      docstring:
        "Wan Motion is a streamlined character animation model that transfers motion from a driving video onto a reference character image. Based on Wan-Animate which preserves the original character's proportions, Simple uses pose retargeting to...",
      tags: ["editing", "video-to-video", "vid2vid", "wan", "motion"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/wan/v2.7/edit-video": {
      className: "WanV27EditVideo",
      docstring:
        "Wan 2.7 is the latest generation AI video model, delivering enhanced motion smoothness, superior scene fidelity, and greater visual coherence.",
      tags: ["editing", "video-to-video", "vid2vid", "wan"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/workflow-utilities/blend-video": {
      className: "WorkflowUtilitiesBlendVideo",
      docstring: "FFMPEG Utility for Blending Videos",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "workflow",
        "utilities",
        "blend"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/workflow-utilities/reverse-video": {
      className: "WorkflowUtilitiesReverseVideo",
      docstring: "FFMPEG Utility to Reverse Videos",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "workflow",
        "utilities",
        "reverse"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/workflow-utilities/scale-video": {
      className: "WorkflowUtilitiesScaleVideo",
      docstring: "FFMPEG Utilities to Scale Videos",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "workflow",
        "utilities",
        "scale"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/workflow-utilities/trim-video": {
      className: "WorkflowUtilitiesTrimVideo",
      docstring: "FFMPEG Utility for Trim Video",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "workflow",
        "utilities",
        "trim"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "google/gemini-omni-flash/edit": {
      className: "GeminiOmniFlashEdit",
      docstring:
        "Edits generated video across multiple conversational turns while preserving scene coherence. Applies iterative changes through natural-language instructions without regenerating the full sequence from scratch.",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "google",
        "gemini",
        "omni",
        "flash"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "luma/agent/ray/v3.2/reframe": {
      className: "LumaAgentRayV32Reframe",
      docstring:
        "Luma Ray 3.2 reframes an existing video into a new aspect ratio guided by a text prompt, preserving the original footage frame-for-frame while controlling resolution and outpainting the surrounding canvas.",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "luma",
        "agent",
        "ray",
        "reframe"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "luma/agent/ray/v3.2/video-to-video": {
      className: "LumaAgentRayV32VideoToVideo",
      docstring:
        "Luma Ray 3.2 re-renders an existing video into new cinematic motion guided by a text prompt, preserving the source's look and movement while controlling resolution, duration, and HDR.",
      tags: ["editing", "video-to-video", "vid2vid", "luma", "agent", "ray"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "mirelo-ai/sfx1.6/video-to-video": {
      className: "Sfx16VideoToVideo",
      docstring:
        "Generate synced sounds for any video, and return it with its new sound track (like MMAudio). Now up to 60 seconds!",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "mirelo",
        "sfx1",
        "mirelo-ai"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "pixelcut/video-background-removal": {
      className: "VideoBackgroundRemoval",
      docstring:
        "Pixelcut's Video Background Remover is an AI segmentation model that erases backgrounds frame by frame, with seamless temporal consistency.",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "pixelcut",
        "background",
        "removal"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "sonilo/v1.1/video-to-video-music": {
      className: "SoniloV11VideoToVideoMusic",
      docstring:
        "Generates perfectly synced music for any video. Return a licensed music soundtrack ready for commercial use (optional preservation of the original speech in video)",
      tags: ["editing", "video-to-video", "vid2vid", "sonilo", "music"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "sonilo/v1.1/video-to-video-sound-effects": {
      className: "SoniloV11VideoToVideoSoundEffects",
      docstring:
        "Adds synchronized, royalty-free, commercial-use-safe sound effects to a video. Returns the finished video with the generated audio mixed in.",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "sonilo",
        "sound",
        "effects"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "veed/lipsync/v2": {
      className: "VeedLipsyncV2",
      docstring:
        "Generate production-quality lipsync from any audio using VEED's most advanced model yet.",
      tags: ["editing", "video-to-video", "vid2vid", "veed", "lipsync"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "veed/subtitles": {
      className: "Subtitles",
      docstring:
        "VEED’s Subtitles API transforms raw footage into polished, publish-ready content with professional burned-in subtitles starting at a base rate of $0.10 per minute.",
      tags: ["editing", "video-to-video", "vid2vid", "veed", "subtitles"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "wan/v2.6/reference-to-video/flash": {
      className: "WanV26ReferenceToVideoFlash",
      docstring: "Wan 2.6 reference-to-video flash model.",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "wan",
        "reference",
        "flash"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "xai/grok-imagine-video/edit-video": {
      className: "GrokImagineVideoEditVideo",
      docstring: "Edit videos using xAI's Grok Imagine",
      tags: ["editing", "video-to-video", "vid2vid", "xai", "grok", "imagine"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "xai/grok-imagine-video/extend-video": {
      className: "GrokImagineVideoExtendVideo",
      docstring: "Extend videos with xAI's Grok Imagine video model",
      tags: [
        "editing",
        "video-to-video",
        "vid2vid",
        "xai",
        "grok",
        "imagine",
        "extend"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },

    "alibaba/wan-3.0-prime/reference-to-video": {
      className: "Wan30PrimeReferenceToVideo",
      docstring:
        "Wan 3.0 Prime combines reference images, video, and audio into one clip with multimodal coherence.",
      tags: ["video-to-video", "vid2vid", "video", "reference", "wan", "wan-3"],
      useCases: [
        "Drive a video from image and audio references",
        "Keep an identity consistent across takes",
        "Restyle footage against a reference",
        "Match motion from a reference clip",
        "Produce controlled character animation"
      ]
    },

    "blackforestlabs/flux-video-upscale": {
      className: "FluxVideoUpscale",
      docstring:
        "FLUX video super-resolution upscales footage to 1080p, 2K, or 4K in a precise or creative detail mode.",
      tags: [
        "video-to-video",
        "vid2vid",
        "video",
        "upscale",
        "super-resolution",
        "flux",
        "enhancement"
      ],
      useCases: [
        "Upscale archive footage to 4K",
        "Sharpen low-resolution clips for delivery",
        "Enhance AI-generated video before edit",
        "Prepare social clips for large displays",
        "Recover detail in compressed footage"
      ]
    },

    "minimax/h3/reference-to-video/lora": {
      className: "MinimaxH3ReferenceToVideoLora",
      docstring:
        "MiniMax H3 generates video with synchronized audio from references, with LoRA support.",
      tags: [
        "video-to-video",
        "vid2vid",
        "video",
        "reference",
        "minimax",
        "h3",
        "lora",
        "audio"
      ],
      useCases: [
        "Drive video from reference material",
        "Combine a LoRA with reference control",
        "Keep a set and cast consistent",
        "Restyle references into new shots",
        "Produce continuity across episodes"
      ]
    },

    "topaz/upscale/video/precision": {
      className: "TopazUpscaleVideoPrecision",
      docstring:
        "Topaz precision video models enhance footage up to 4x while staying faithful to the source.",
      tags: [
        "video-to-video",
        "vid2vid",
        "video",
        "topaz",
        "upscale",
        "super-resolution",
        "enhancement"
      ],
      useCases: [
        "Upscale real-world footage to 4K",
        "Enhance interviews without artifacts",
        "Prepare archive video for delivery",
        "Scale drone footage faithfully",
        "Deliver clean natural upscales"
      ]
    },

    "topaz/upscale/video/generative": {
      className: "TopazUpscaleVideoGenerative",
      docstring:
        "Topaz Starlight generative video upscaling rebuilds detail absent from the source, with cheaper fast variants.",
      tags: [
        "video-to-video",
        "vid2vid",
        "video",
        "topaz",
        "upscale",
        "generative",
        "super-resolution"
      ],
      useCases: [
        "Restore heavily compressed footage",
        "Rebuild detail in archive video",
        "Upscale low-quality user clips",
        "Recover detail lost to re-encoding",
        "Trade cost for quality with fast variants"
      ]
    },

    "topaz/upscale/video/creative": {
      className: "TopazUpscaleVideoCreative",
      docstring:
        "Topaz Astra creative video upscaling reimagines fine detail and typically delivers 4K output.",
      tags: [
        "video-to-video",
        "vid2vid",
        "video",
        "topaz",
        "upscale",
        "creative",
        "super-resolution"
      ],
      useCases: [
        "Push a hero shot to maximum impact",
        "Reimagine detail in cinematic footage",
        "Finish stylized clips at 4K",
        "Enhance generated video for delivery",
        "Add invented texture to flat footage"
      ]
    },

    "topaz/denoise/video": {
      className: "TopazDenoiseVideo",
      docstring:
        "Topaz Nyx models remove video noise at source resolution, with a lighter fast pass.",
      tags: [
        "video-to-video",
        "vid2vid",
        "video",
        "topaz",
        "denoise",
        "noise-reduction",
        "enhancement"
      ],
      useCases: [
        "Clean low-light footage",
        "Remove grain from high-ISO clips",
        "Denoise before upscaling",
        "Reduce noise in night interviews",
        "Run a cheaper fast denoise pass"
      ]
    },

    "topaz/deblur/video": {
      className: "TopazDeblurVideo",
      docstring:
        "Topaz Themis 2 restores clarity to motion-blurred footage at source resolution.",
      tags: [
        "video-to-video",
        "vid2vid",
        "video",
        "topaz",
        "deblur",
        "motion-blur",
        "enhancement"
      ],
      useCases: [
        "Sharpen fast-moving sports footage",
        "Recover clarity in action clips",
        "Fix handheld motion blur",
        "Clean up panning shots",
        "Prepare blurred footage for upscale"
      ]
    },

    "topaz/interpolate/video": {
      className: "TopazInterpolateVideo",
      docstring:
        "Topaz Apollo, Chronos, and Aion retime footage up to 120 fps for smooth motion or slow motion.",
      tags: [
        "video-to-video",
        "vid2vid",
        "video",
        "topaz",
        "interpolate",
        "frame-rate",
        "slow-motion"
      ],
      useCases: [
        "Convert 24 fps footage to 60 fps",
        "Create extreme slow motion",
        "Smooth stuttering motion",
        "Retime clips for a timeline",
        "Generate 120 fps from standard footage"
      ]
    },

    "topaz/colorize/video": {
      className: "TopazColorizeVideo",
      docstring:
        "Topaz video colorization brings natural color to black-and-white footage, upscaled to at least 1080p.",
      tags: [
        "video-to-video",
        "vid2vid",
        "video",
        "topaz",
        "colorize",
        "restoration",
        "archival"
      ],
      useCases: [
        "Colorize historical footage",
        "Restore black-and-white home movies",
        "Prepare archive clips for a documentary",
        "Add color to vintage advertising",
        "Modernize monochrome material"
      ]
    },

    "topaz/sdr-to-hdr/video": {
      className: "TopazSdrToHdrVideo",
      docstring:
        "Topaz Hyperion 2.5 converts SDR footage to HDR, preserving detail in text, faces, and motion.",
      tags: [
        "video-to-video",
        "vid2vid",
        "video",
        "topaz",
        "hdr",
        "sdr-to-hdr",
        "color"
      ],
      useCases: [
        "Give SDR footage an HDR look",
        "Prepare legacy video for HDR delivery",
        "Expand dynamic range without clipping",
        "Grade archive material for HDR displays",
        "Convert a catalog to HDR"
      ]
    }
  }
};
