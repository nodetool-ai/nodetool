import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/pixverse/v5.6/image-to-video": {
      className: "PixverseV56ImageToVideo",
      docstring: "Generate high-quality videos from images with Pixverse v5.6.",
      tags: [
        "video",
        "generation",
        "pixverse",
        "v5.6",
        "image-to-video",
        "img2vid"
      ],
      useCases: [
        "Animate photos into professional video clips",
        "Create dynamic product showcase videos",
        "Generate stylized video content from artwork",
        "Produce high-resolution social media animations",
        "Transform static images with various visual styles"
      ],
      fieldOverrides: {
        image_url: { description: "The image to transform into a video" },
        prompt: {
          description: "Text prompt describing the desired video motion"
        },
        resolution: {
          description: "The resolution quality of the output video"
        },
        duration: {
          description: "The duration of the generated video in seconds"
        },
        negative_prompt: {
          description: "What to avoid in the generated video"
        },
        style: { description: "Optional visual style for the video" },
        seed: { description: "Optional seed for reproducible generation" },
        generate_audio_switch: {
          description: "Whether to generate audio for the video"
        },
        thinking_type: { description: "Thinking mode for video generation" }
      },
      enumOverrides: {
        Resolution: "PixverseV56Resolution",
        Duration: "PixverseV56Duration",
        Style: "PixverseV56Style",
        ThinkingType: "PixverseV56ThinkingType"
      },
      enumValueOverrides: {
        Duration: {
          VALUE_5: "FIVE_SECONDS",
          VALUE_8: "EIGHT_SECONDS",
          VALUE_10: "TEN_SECONDS"
        },
        Resolution: {
          "360P": "RES_360P",
          "540P": "RES_540P",
          "720P": "RES_720P",
          "1080P": "RES_1080P"
        },
        Style: {
          "3D_ANIMATION": "ANIMATION_3D"
        }
      },
      basicFields: ["image", "prompt", "resolution"]
    },

    "fal-ai/luma-dream-machine/image-to-video": {
      className: "LumaDreamMachine",
      docstring:
        "Generate video clips from your images using Luma Dream Machine v1.5. Supports various aspect ratios and optional end-frame blending.",
      tags: [
        "video",
        "generation",
        "animation",
        "blending",
        "aspect-ratio",
        "img2vid",
        "image-to-video"
      ],
      useCases: [
        "Create seamless video loops",
        "Generate video transitions",
        "Transform images into animations",
        "Create motion graphics",
        "Produce video content"
      ]
    },

    "fal-ai/amt-interpolation/frame-interpolation": {
      className: "AMTFrameInterpolation",
      docstring:
        "AMT Frame Interpolation creates smooth transitions between image frames.",
      tags: [
        "video",
        "interpolation",
        "frame-generation",
        "amt",
        "image-to-video"
      ],
      useCases: [
        "Create smooth transitions between images",
        "Generate intermediate frames",
        "Animate image sequences",
        "Create video from image pairs",
        "Produce smooth motion effects"
      ],
      basicFields: ["image"]
    },

    "fal-ai/ai-avatar": {
      className: "AIAvatar",
      docstring:
        "MultiTalk generates talking avatar videos from images and audio files.",
      tags: ["video", "avatar", "talking-head", "multitalk", "image-to-video"],
      useCases: [
        "Create talking avatar videos",
        "Animate portrait photos with audio",
        "Generate spokesperson videos",
        "Produce avatar presentations",
        "Create personalized video messages"
      ],
      enumOverrides: { Resolution: "AIAvatarResolution" },
      basicFields: ["image", "audio"]
    },

    "fal-ai/ai-avatar/single-text": {
      className: "AIAvatarSingleText",
      docstring:
        "MultiTalk generates talking avatar videos from an image and text input.",
      tags: [
        "video",
        "avatar",
        "talking-head",
        "text-to-speech",
        "image-to-video"
      ],
      useCases: [
        "Create avatar videos from text",
        "Generate talking heads with TTS",
        "Produce text-driven avatars",
        "Create virtual presenters",
        "Generate automated spokesperson videos"
      ],
      enumOverrides: { Resolution: "AIAvatarSingleTextResolution" },
      basicFields: ["image", "text"]
    },

    "fal-ai/ai-avatar/multi-text": {
      className: "AIAvatarMultiText",
      docstring:
        "MultiTalk generates multi-speaker avatar videos from images and text.",
      tags: [
        "video",
        "avatar",
        "multi-speaker",
        "talking-head",
        "image-to-video"
      ],
      useCases: [
        "Create multi-speaker conversations",
        "Generate dialogue between avatars",
        "Produce interactive presentations",
        "Create conversational content",
        "Generate multi-character scenes"
      ],
      enumOverrides: { Resolution: "AIAvatarMultiTextResolution" },
      basicFields: ["images", "texts"]
    },

    "fal-ai/ai-avatar/multi": {
      className: "AIAvatarMulti",
      docstring:
        "MultiTalk generates multi-speaker avatar videos with audio synchronization.",
      tags: [
        "video",
        "avatar",
        "multi-speaker",
        "talking-head",
        "image-to-video"
      ],
      useCases: [
        "Create multi-speaker videos with audio",
        "Generate synchronized dialogue",
        "Produce conversation videos",
        "Create interactive characters",
        "Generate multi-avatar content"
      ],
      enumOverrides: { Resolution: "AIAvatarMultiResolution" },
      basicFields: ["images", "audio"]
    },

    "fal-ai/bytedance/seedance/v1.5/pro/image-to-video": {
      className: "SeeDanceV15ProImageToVideo",
      docstring:
        "SeeDance v1.5 Pro generates high-quality dance videos from images.",
      tags: [
        "video",
        "dance",
        "animation",
        "seedance",
        "bytedance",
        "image-to-video"
      ],
      useCases: [
        "Animate photos into dance videos",
        "Create dance choreography from images",
        "Generate dance performances",
        "Produce music video content",
        "Create dance training materials"
      ],
      enumOverrides: {
        Resolution: "SeeDanceV15ProResolution",
        AspectRatio: "SeeDanceV15ProAspectRatio",
        Duration: "SeeDanceV15ProDuration"
      },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/bytedance/seedance/v1/pro/fast/image-to-video": {
      className: "SeeDanceV1ProFastImageToVideo",
      docstring:
        "SeeDance v1 Pro Fast generates dance videos quickly from images.",
      tags: [
        "video",
        "dance",
        "fast",
        "seedance",
        "bytedance",
        "image-to-video"
      ],
      useCases: [
        "Rapidly generate dance videos",
        "Quick dance animation",
        "Fast dance prototypes",
        "Create dance previews",
        "Efficient dance video generation"
      ],
      enumOverrides: {
        Resolution: "SeeDanceV1ProFastResolution",
        AspectRatio: "SeeDanceV1ProFastAspectRatio",
        Duration: "SeeDanceV1ProFastDuration"
      },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/bytedance/seedance/v1/lite/reference-to-video": {
      className: "SeeDanceV1LiteReferenceToVideo",
      docstring:
        "SeeDance v1 Lite generates lightweight dance videos using reference images.",
      tags: [
        "video",
        "dance",
        "lite",
        "reference",
        "seedance",
        "image-to-video"
      ],
      useCases: [
        "Generate efficient dance videos",
        "Create reference-based animations",
        "Produce lightweight dance content",
        "Generate quick dance outputs",
        "Create optimized dance videos"
      ],
      enumOverrides: {
        Resolution: "SeeDanceV1LiteResolution",
        AspectRatio: "SeeDanceV1LiteAspectRatio",
        Duration: "SeeDanceV1LiteDuration"
      },
      basicFields: ["image", "reference"]
    },

    "fal-ai/bytedance/video-stylize": {
      className: "ByteDanceVideoStylize",
      docstring:
        "ByteDance Video Stylize applies artistic styles to image-based video generation.",
      tags: [
        "video",
        "style-transfer",
        "artistic",
        "bytedance",
        "image-to-video"
      ],
      useCases: [
        "Apply artistic styles to videos",
        "Create stylized video content",
        "Generate artistic animations",
        "Produce style-transferred videos",
        "Create visually unique content"
      ],
      enumOverrides: { Resolution: "ByteDanceVideoStylizeResolution" },
      basicFields: ["image", "style"]
    },

    "fal-ai/bytedance/omnihuman/v1.5": {
      className: "OmniHumanV15",
      docstring: "OmniHuman v1.5 generates realistic human videos from images.",
      tags: ["video", "human", "realistic", "bytedance", "image-to-video"],
      useCases: [
        "Generate realistic human videos",
        "Create human motion animations",
        "Produce lifelike character videos",
        "Generate human performances",
        "Create realistic human content"
      ],
      enumOverrides: {
        Resolution: "OmniHumanV15Resolution",
        AspectRatio: "OmniHumanV15AspectRatio"
      },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/cogvideox-5b/image-to-video": {
      className: "CogVideoX5BImageToVideo",
      docstring:
        "CogVideoX-5B generates high-quality videos from images with advanced motion.",
      tags: ["video", "generation", "cogvideo", "image-to-video", "img2vid"],
      useCases: [
        "Generate videos from images",
        "Create dynamic image animations",
        "Produce high-quality video content",
        "Animate static images",
        "Generate motion from photos"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/stable-video": {
      className: "StableVideoImageToVideo",
      docstring:
        "Stable Video generates consistent video animations from images.",
      tags: ["video", "generation", "stable", "consistent", "image-to-video"],
      useCases: [
        "Generate stable video animations",
        "Create consistent motion",
        "Produce reliable video outputs",
        "Animate images consistently",
        "Generate predictable videos"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/hunyuan-video/image-to-video": {
      className: "HunyuanImageToVideo",
      docstring:
        "Hunyuan Video generates high-quality videos from images with advanced AI.",
      tags: ["video", "generation", "hunyuan", "tencent", "image-to-video"],
      useCases: [
        "Generate cinematic videos from images",
        "Create high-quality animations",
        "Produce professional video content",
        "Animate images with detail",
        "Generate advanced video effects"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/ltx-video/image-to-video": {
      className: "LTXImageToVideo",
      docstring:
        "LTX Video generates temporally consistent videos from images.",
      tags: ["video", "generation", "ltx", "temporal", "image-to-video"],
      useCases: [
        "Generate temporally consistent videos",
        "Create smooth image animations",
        "Produce coherent video sequences",
        "Animate with temporal awareness",
        "Generate fluid motion videos"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/kling-video/v1/standard/image-to-video": {
      className: "KlingVideoV1StandardImageToVideo",
      docstring:
        "Kling Video v1 Standard generates videos from images with balanced quality.",
      tags: ["video", "generation", "kling", "standard", "image-to-video"],
      useCases: [
        "Generate standard quality videos",
        "Create balanced video animations",
        "Produce efficient video content",
        "Generate videos for web use",
        "Create moderate quality outputs"
      ],
      enumOverrides: { Duration: "KlingVideoV1StandardDuration" },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/kling-video/v1/pro/image-to-video": {
      className: "KlingVideoV1ProImageToVideo",
      docstring:
        "Kling Video v1 Pro generates professional quality videos from images.",
      tags: [
        "video",
        "generation",
        "kling",
        "pro",
        "professional",
        "image-to-video"
      ],
      useCases: [
        "Generate professional videos",
        "Create high-quality animations",
        "Produce premium video content",
        "Generate cinematic outputs",
        "Create professional grade videos"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/pixverse/v5.6/transition": {
      className: "PixverseV56Transition",
      docstring:
        "Pixverse v5.6 Transition creates smooth video transitions between two images with professional effects.",
      tags: ["video", "transition", "pixverse", "v5.6", "effects"],
      useCases: [
        "Create smooth transitions between images",
        "Generate professional video effects",
        "Produce seamless image morphing",
        "Create transition animations",
        "Generate video connecting two scenes"
      ],
      enumOverrides: {
        Resolution: "PixverseV56TransitionResolution",
        Duration: "PixverseV56TransitionDuration"
      },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/vidu/q2/reference-to-video/pro": {
      className: "ViduQ2ReferenceToVideoPro",
      docstring:
        "Vidu Q2 Reference-to-Video Pro generates professional quality videos using reference images for style and content.",
      tags: ["video", "generation", "vidu", "q2", "pro", "reference"],
      useCases: [
        "Generate pro videos from references",
        "Create style-consistent animations",
        "Produce reference-guided videos",
        "Generate videos matching examples",
        "Create professional reference-based content"
      ],
      enumOverrides: { Resolution: "ViduQ2ReferenceToVideoProResolution" },
      basicFields: ["image", "prompt"]
    },

    "wan/v2.6/image-to-video/flash": {
      className: "WanV26ImageToVideoFlash",
      docstring:
        "Wan v2.6 Flash generates videos from images with ultra-fast processing for rapid iteration.",
      tags: ["video", "generation", "wan", "v2.6", "flash", "fast"],
      useCases: [
        "Generate videos at maximum speed",
        "Create rapid video prototypes",
        "Produce instant video previews",
        "Generate quick video iterations",
        "Create fast video animations"
      ],
      enumOverrides: {
        Resolution: "WanV26FlashResolution",
        Duration: "WanV26FlashDuration"
      },
      basicFields: ["image", "prompt"]
    },

    "wan/v2.6/image-to-video": {
      className: "WanV26ImageToVideo",
      docstring:
        "Wan v2.6 generates high-quality videos from images with balanced quality and performance.",
      tags: ["video", "generation", "wan", "v2.6", "image-to-video"],
      useCases: [
        "Generate quality videos from images",
        "Create balanced video animations",
        "Produce reliable video content",
        "Generate consistent videos",
        "Create professional animations"
      ],
      enumOverrides: {
        Resolution: "WanV26Resolution",
        Duration: "WanV26Duration"
      },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/ltx-2-19b/image-to-video": {
      className: "Ltx219BImageToVideo",
      docstring:
        "LTX-2 19B generates high-quality videos from images using the powerful 19-billion parameter model.",
      tags: ["video", "generation", "ltx-2", "19b", "large-model"],
      useCases: [
        "Generate high-quality videos with large model",
        "Create detailed video animations",
        "Produce superior video content",
        "Generate videos with powerful AI",
        "Create premium video animations"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/ltx-2-19b/image-to-video/lora": {
      className: "Ltx219BImageToVideoLora",
      docstring:
        "LTX-2 19B with LoRA enables custom-trained 19B models for specialized video generation.",
      tags: ["video", "generation", "ltx-2", "19b", "lora", "custom"],
      useCases: [
        "Generate videos with custom 19B model",
        "Create specialized video content",
        "Produce domain-specific animations",
        "Generate with fine-tuned large model",
        "Create customized video animations"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/ltx-2-19b/distilled/image-to-video": {
      className: "Ltx219BDistilledImageToVideo",
      docstring:
        "LTX-2 19B Distilled generates videos efficiently using knowledge distillation from the 19B model.",
      tags: ["video", "generation", "ltx-2", "19b", "distilled", "efficient"],
      useCases: [
        "Generate videos efficiently with distilled model",
        "Create fast quality video animations",
        "Produce optimized video content",
        "Generate videos with good performance",
        "Create balanced quality-speed videos"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/ltx-2-19b/distilled/image-to-video/lora": {
      className: "Ltx219BDistilledImageToVideoLora",
      docstring:
        "LTX-2 19B Distilled with LoRA combines efficient generation with custom-trained models.",
      tags: ["video", "generation", "ltx-2", "19b", "distilled", "lora"],
      useCases: [
        "Generate videos with custom distilled model",
        "Create efficient specialized content",
        "Produce fast domain-specific videos",
        "Generate with optimized custom model",
        "Create quick customized animations"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/wan-move": {
      className: "WanMove",
      docstring:
        "Wan Move generates videos with natural motion and movement from static images.",
      tags: ["video", "generation", "wan", "motion", "animation"],
      useCases: [
        "Add natural motion to images",
        "Create animated movements",
        "Produce dynamic video content",
        "Generate moving scenes from stills",
        "Create motion animations"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/kandinsky5-pro/image-to-video": {
      className: "Kandinsky5ProImageToVideo",
      docstring:
        "Kandinsky5 Pro generates professional quality videos from images with artistic style and control.",
      tags: ["video", "generation", "kandinsky", "pro", "artistic"],
      useCases: [
        "Generate artistic videos from images",
        "Create stylized video animations",
        "Produce creative video content",
        "Generate videos with artistic flair",
        "Create professional artistic videos"
      ],
      enumOverrides: {
        Resolution: "Kandinsky5ProResolution",
        Duration: "Kandinsky5ProDuration"
      },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/live-avatar": {
      className: "LiveAvatar",
      docstring:
        "Live Avatar creates animated talking avatars from portrait images with realistic lip-sync and expressions.",
      tags: ["video", "avatar", "talking-head", "animation", "portrait"],
      useCases: [
        "Create talking avatar videos",
        "Animate portrait images",
        "Generate lip-synced avatars",
        "Produce speaking character videos",
        "Create animated presenters"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/hunyuan-video-v1.5/image-to-video": {
      className: "HunyuanVideoV15ImageToVideo",
      docstring:
        "Hunyuan Video v1.5 generates high-quality videos from images with advanced AI capabilities.",
      tags: ["video", "generation", "hunyuan", "v1.5", "advanced"],
      useCases: [
        "Generate advanced quality videos",
        "Create sophisticated animations",
        "Produce high-fidelity video content",
        "Generate videos with AI excellence",
        "Create cutting-edge video animations"
      ],
      enumOverrides: { Resolution: "HunyuanVideoV15Resolution" },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/kling-video/o1/standard/image-to-video": {
      className: "KlingVideoO1StandardImageToVideo",
      docstring:
        "Kling Video O1 Standard generates videos with optimized standard quality from images.",
      tags: ["video", "generation", "kling", "o1", "standard"],
      useCases: [
        "Generate standard O1 quality videos",
        "Create optimized video animations",
        "Produce efficient video content",
        "Generate balanced quality videos",
        "Create standard tier animations"
      ],
      enumOverrides: { Duration: "KlingVideoO1StandardDuration" },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/kling-video/o1/standard/reference-to-video": {
      className: "KlingVideoO1StandardReferenceToVideo",
      docstring:
        "Kling Video O1 Standard generates videos using reference images for style consistency.",
      tags: ["video", "generation", "kling", "o1", "standard", "reference"],
      useCases: [
        "Generate videos from reference images",
        "Create style-consistent animations",
        "Produce reference-guided content",
        "Generate videos matching examples",
        "Create standardized reference videos"
      ],
      enumOverrides: {
        Duration: "KlingVideoO1StandardReferenceToVideoDuration"
      },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/kling-video/o3/standard/image-to-video": {
      className: "KlingVideoO3StandardImageToVideo",
      docstring:
        "Kling Video O3 Standard generates videos from images with balanced quality and speed.",
      tags: [
        "video",
        "generation",
        "kling",
        "o3",
        "standard",
        "image-to-video",
        "img2vid"
      ],
      useCases: [
        "Animate static images into videos",
        "Create balanced quality image animations",
        "Produce efficient video content from photos",
        "Generate consistent video clips from images",
        "Create standard-tier visual storytelling"
      ],
      basicFields: ["image", "prompt", "duration"]
    },

    "fal-ai/kling-video/o3/pro/image-to-video": {
      className: "KlingVideoO3ProImageToVideo",
      docstring:
        "Kling Video O3 Pro generates professional quality videos from images with enhanced fidelity.",
      tags: [
        "video",
        "generation",
        "kling",
        "o3",
        "pro",
        "image-to-video",
        "img2vid"
      ],
      useCases: [
        "Create professional image-driven video content",
        "Generate premium animations from photos",
        "Produce cinematic video clips from images",
        "Create high-fidelity marketing videos from photos",
        "Generate polished video sequences from images"
      ],
      basicFields: ["image", "prompt", "duration"]
    },

    "fal-ai/kling-video/o3/standard/reference-to-video": {
      className: "KlingVideoO3StandardReferenceToVideo",
      docstring:
        "Kling Video O3 Standard generates videos using reference images for style consistency.",
      tags: ["video", "generation", "kling", "o3", "standard", "reference"],
      useCases: [
        "Generate videos from reference images",
        "Create style-consistent animations",
        "Produce reference-guided content",
        "Generate videos matching examples",
        "Create standardized reference videos"
      ],
      basicFields: ["start_image", "prompt", "duration"]
    },

    "fal-ai/kling-video/o3/pro/reference-to-video": {
      className: "KlingVideoO3ProReferenceToVideo",
      docstring:
        "Kling Video O3 Pro generates high-fidelity videos using reference images for style and structure.",
      tags: ["video", "generation", "kling", "o3", "pro", "reference"],
      useCases: [
        "Generate high-fidelity videos from reference images",
        "Create premium style-consistent animations",
        "Produce reference-guided professional content",
        "Generate videos matching premium examples",
        "Create polished reference-based video clips"
      ],
      basicFields: ["start_image", "prompt", "duration"]
    },

    "fal-ai/kling-video/v2.6/pro/image-to-video": {
      className: "KlingVideoV26ProImageToVideo",
      docstring:
        "Kling Video v2.6 Pro generates professional quality videos with latest model improvements.",
      tags: ["video", "generation", "kling", "v2.6", "pro"],
      useCases: [
        "Generate professional v2.6 videos",
        "Create latest quality animations",
        "Produce premium video content",
        "Generate advanced videos",
        "Create pro-tier animations"
      ],
      enumOverrides: { Duration: "KlingVideoV26ProDuration" },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/kling-video/ai-avatar/v2/standard": {
      className: "KlingVideoAiAvatarV2Standard",
      docstring:
        "Kling Video AI Avatar v2 Standard creates animated talking avatars with standard quality.",
      tags: ["video", "avatar", "kling", "v2", "standard", "talking-head"],
      useCases: [
        "Create standard quality talking avatars",
        "Animate portraits with speech",
        "Generate avatar presentations",
        "Produce speaking character videos",
        "Create AI-driven avatars"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/kling-video/ai-avatar/v2/pro": {
      className: "KlingVideoAiAvatarV2Pro",
      docstring:
        "Kling Video AI Avatar v2 Pro creates professional quality animated talking avatars with enhanced realism.",
      tags: ["video", "avatar", "kling", "v2", "pro", "talking-head"],
      useCases: [
        "Create professional talking avatars",
        "Animate portraits with high quality",
        "Generate realistic avatar videos",
        "Produce premium speaking characters",
        "Create pro-grade AI avatars"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/creatify/aurora": {
      className: "CreatifyAurora",
      docstring:
        "Creatify Aurora generates creative and visually stunning videos from images with unique effects.",
      tags: [
        "video",
        "generation",
        "creatify",
        "aurora",
        "creative",
        "effects"
      ],
      useCases: [
        "Generate creative visual effects videos",
        "Create stunning video animations",
        "Produce artistic video content",
        "Generate unique video effects",
        "Create visually impressive videos"
      ],
      enumOverrides: { Resolution: "CreatifyAuroraResolution" },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/pixverse/v5.5/effects": {
      className: "PixverseV55Effects",
      docstring: "Pixverse",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v5.5/transition": {
      className: "PixverseV55Transition",
      docstring: "Pixverse",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v5.5/image-to-video": {
      className: "PixverseV55ImageToVideo",
      docstring: "Pixverse",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/kling-video/o1/image-to-video": {
      className: "KlingVideoO1ImageToVideo",
      docstring: "Kling O1 First Frame Last Frame to Video [Pro]",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/kling-video/o1/reference-to-video": {
      className: "KlingVideoO1ReferenceToVideo",
      docstring: "Kling O1 Reference Image to Video [Pro]",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/ltx-2/image-to-video/fast": {
      className: "Ltx2ImageToVideoFast",
      docstring: "LTX Video 2.0 Fast",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/ltx-2/image-to-video": {
      className: "Ltx2ImageToVideo",
      docstring: "LTX Video 2.0 Pro",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "bytedance/lynx": {
      className: "BytedanceLynx",
      docstring: "Lynx",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/swap": {
      className: "PixverseSwap",
      docstring: "Pixverse",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pika/v2.2/pikaframes": {
      className: "PikaV22Pikaframes",
      docstring: "Pika",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/longcat-video/image-to-video/720p": {
      className: "LongcatVideoImageToVideo720P",
      docstring: "LongCat Video",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/longcat-video/image-to-video/480p": {
      className: "LongcatVideoImageToVideo480P",
      docstring: "LongCat Video",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/longcat-video/distilled/image-to-video/720p": {
      className: "LongcatVideoDistilledImageToVideo720P",
      docstring: "LongCat Video Distilled",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/longcat-video/distilled/image-to-video/480p": {
      className: "LongcatVideoDistilledImageToVideo480P",
      docstring: "LongCat Video Distilled",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video": {
      className: "MinimaxHailuo23FastStandardImageToVideo",
      docstring: "MiniMax Hailuo 2.3 Fast [Standard] (Image to Video)",
      tags: [
        "video",
        "animation",
        "image-to-video",
        "img2vid",
        "fast",
        "professional"
      ],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/minimax/hailuo-2.3/standard/image-to-video": {
      className: "MinimaxHailuo23StandardImageToVideo",
      docstring: "MiniMax Hailuo 2.3 [Standard] (Image to Video)",
      tags: ["video", "animation", "image-to-video", "img2vid", "professional"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video": {
      className: "MinimaxHailuo23FastProImageToVideo",
      docstring: "MiniMax Hailuo 2.3 Fast [Pro] (Image to Video)",
      tags: [
        "video",
        "animation",
        "image-to-video",
        "img2vid",
        "fast",
        "professional"
      ],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/vidu/q2/image-to-video/turbo": {
      className: "ViduQ2ImageToVideoTurbo",
      docstring: "Vidu",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/vidu/q2/image-to-video/pro": {
      className: "ViduQ2ImageToVideoPro",
      docstring: "Vidu",
      tags: ["video", "animation", "image-to-video", "img2vid", "professional"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/kling-video/v2.5-turbo/standard/image-to-video": {
      className: "KlingVideoV25TurboStandardImageToVideo",
      docstring: "Kling Video",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/veo3.1/fast/first-last-frame-to-video": {
      className: "Veo31FastFirstLastFrameToVideo",
      docstring: "Veo 3.1 Fast",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/veo3.1/first-last-frame-to-video": {
      className: "Veo31FirstLastFrameToVideo",
      docstring: "Veo 3.1",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/veo3.1/reference-to-video": {
      className: "Veo31ReferenceToVideo",
      docstring: "Veo 3.1",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/veo3.1/fast/image-to-video": {
      className: "Veo31FastImageToVideo",
      docstring: "Veo 3.1 Fast",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/veo3.1/image-to-video": {
      className: "Veo31ImageToVideo",
      docstring: "Veo 3.1",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/sora-2/image-to-video/pro": {
      className: "Sora2ImageToVideoPro",
      docstring: "Sora 2",
      tags: ["video", "animation", "image-to-video", "img2vid", "professional"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/sora-2/image-to-video": {
      className: "Sora2ImageToVideo",
      docstring: "Sora 2",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/ovi/image-to-video": {
      className: "OviImageToVideo",
      docstring: "Ovi",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "veed/fabric-1.0/fast": {
      className: "VeedFabric10Fast",
      docstring: "Fabric 1.0 Fast",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "veed/fabric-1.0": {
      className: "VeedFabric10",
      docstring: "Fabric 1.0",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/kling-video/v1/standard/ai-avatar": {
      className: "KlingVideoV1StandardAiAvatar",
      docstring: "Kling AI Avatar",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/kling-video/v1/pro/ai-avatar": {
      className: "KlingVideoV1ProAiAvatar",
      docstring: "Kling AI Avatar Pro",
      tags: ["video", "animation", "image-to-video", "img2vid", "professional"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "decart/lucy-14b/image-to-video": {
      className: "DecartLucy14BImageToVideo",
      docstring: "Decart Lucy 14b",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/wan-ati": {
      className: "WanAti",
      docstring: "Wan Ati",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/decart/lucy-5b/image-to-video": {
      className: "DecartLucy5bImageToVideo",
      docstring:
        "Lucy-5B is a model that can create 5-second I2V videos in under 5 seconds, achieving >1x RTF end-to-end",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v5/transition": {
      className: "PixverseV5Transition",
      docstring: "Create seamless transition between images using PixVerse v5",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v5/effects": {
      className: "PixverseV5Effects",
      docstring:
        "Generate high quality video clips with different effects using PixVerse v5",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v5/image-to-video": {
      className: "PixverseV5ImageToVideo",
      docstring:
        "Generate high quality video clips from text and image prompts using PixVerse v5",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "moonvalley/marey/i2v": {
      className: "MoonvalleyMareyI2v",
      docstring:
        "Generate a video starting from an image as the first frame with Marey, a generative video model trained exclusively on fully licensed data.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/wan/v2.2-a14b/image-to-video/lora": {
      className: "WanV22A14bImageToVideoLora",
      docstring:
        "Wan-2.2 image-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts and images. This endpoint supports LoRAs made for Wan 2.2",
      tags: ["video", "animation", "image-to-video", "img2vid", "lora"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/minimax/hailuo-02-fast/image-to-video": {
      className: "MinimaxHailuo02FastImageToVideo",
      docstring:
        "Create blazing fast and economical videos with MiniMax Hailuo-02 Image To Video API at 512p resolution",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/veo3/image-to-video": {
      className: "Veo3ImageToVideo",
      docstring:
        "Veo 3 is the latest state-of-the art video generation model from Google DeepMind",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/wan/v2.2-a14b/image-to-video/turbo": {
      className: "WanV22A14bImageToVideoTurbo",
      docstring:
        "Wan-2.2 Turbo image-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts. ",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/wan/v2.2-5b/image-to-video": {
      className: "WanV225bImageToVideo",
      docstring:
        "Wan 2.2's 5B model produces up to 5 seconds of video 720p at 24FPS with fluid motion and powerful prompt understanding",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/wan/v2.2-a14b/image-to-video": {
      className: "WanV22A14bImageToVideo",
      docstring: "fal-ai/wan/v2.2-A14B/image-to-video",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/bytedance/omnihuman": {
      className: "BytedanceOmnihuman",
      docstring:
        "OmniHuman generates video using an image of a human figure paired with an audio file. It produces vivid, high-quality videos where the character's emotions and movements maintain a strong correlation with the audio.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/ltxv-13b-098-distilled/image-to-video": {
      className: "Ltxv13b098DistilledImageToVideo",
      docstring:
        "Generate long videos from prompts and images using LTX Video-0.9.8 13B Distilled and custom LoRA",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/veo3/fast/image-to-video": {
      className: "Veo3FastImageToVideo",
      docstring:
        "Now with a 50% price drop. Generate videos from your image prompts using Veo 3 fast.",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/vidu/q1/reference-to-video": {
      className: "ViduQ1ReferenceToVideo",
      docstring:
        "Generate video clips from your multiple image references using Vidu Q1",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/minimax/hailuo-02/pro/image-to-video": {
      className: "MinimaxHailuo02ProImageToVideo",
      docstring:
        "MiniMax Hailuo-02 Image To Video API (Pro, 1080p): Advanced image-to-video generation model with 1080p resolution",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/bytedance/seedance/v1/lite/image-to-video": {
      className: "BytedanceSeedanceV1LiteImageToVideo",
      docstring: "Seedance 1.0 Lite",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/hunyuan-avatar": {
      className: "HunyuanAvatar",
      docstring:
        "HunyuanAvatar is a High-Fidelity Audio-Driven Human Animation model for Multiple Characters .",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/kling-video/v2.1/pro/image-to-video": {
      className: "KlingVideoV21ProImageToVideo",
      docstring:
        "Kling 2.1 Pro is an advanced endpoint for the Kling 2.1 model, offering professional-grade videos with enhanced visual fidelity, precise camera movements, and dynamic motion control, perfect for cinematic storytelling.  ",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/hunyuan-portrait": {
      className: "HunyuanPortrait",
      docstring:
        "HunyuanPortrait is a diffusion-based framework for generating lifelike, temporally consistent portrait animations.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/kling-video/v1.6/standard/elements": {
      className: "KlingVideoV16StandardElements",
      docstring:
        "Generate video clips from your multiple image references using Kling 1.6 (standard)",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/kling-video/v1.6/pro/elements": {
      className: "KlingVideoV16ProElements",
      docstring:
        "Generate video clips from your multiple image references using Kling 1.6 (pro)",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/ltx-video-13b-distilled/image-to-video": {
      className: "LtxVideo13bDistilledImageToVideo",
      docstring:
        "Generate videos from prompts and images using LTX Video-0.9.7 13B Distilled and custom LoRA",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/ltx-video-13b-dev/image-to-video": {
      className: "LtxVideo13bDevImageToVideo",
      docstring:
        "Generate videos from prompts and images using LTX Video-0.9.7 13B and custom LoRA",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/ltx-video-lora/image-to-video": {
      className: "LtxVideoLoraImageToVideo",
      docstring:
        "Generate videos from prompts and images using LTX Video-0.9.7 and custom LoRA",
      tags: ["video", "animation", "image-to-video", "img2vid", "lora"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v4.5/transition": {
      className: "PixverseV45Transition",
      docstring:
        "Create seamless transition between images using PixVerse v4.5",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v4.5/image-to-video/fast": {
      className: "PixverseV45ImageToVideoFast",
      docstring:
        "Generate fast high quality video clips from text and image prompts using PixVerse v4.5",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v4.5/effects": {
      className: "PixverseV45Effects",
      docstring:
        "Generate high quality video clips with different effects using PixVerse v4.5",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/hunyuan-custom": {
      className: "HunyuanCustom",
      docstring:
        "HunyuanCustom revolutionizes video generation with unmatched identity consistency across multiple input types. Its innovative fusion modules and alignment networks outperform competitors, maintaining subject integrity while responding flexibly to text, image, audio, and video conditions.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/framepack/f1": {
      className: "FramepackF1",
      docstring:
        "Framepack is an efficient Image-to-video model that autoregressively generates videos.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/vidu/q1/start-end-to-video": {
      className: "ViduQ1StartEndToVideo",
      docstring:
        "Vidu Q1 Start-End to Video generates smooth transition 1080p videos between specified start and end images.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/vidu/q1/image-to-video": {
      className: "ViduQ1ImageToVideo",
      docstring:
        "Vidu Q1 Image to Video generates high-quality 1080p videos with exceptional visual quality and motion diversity from a single image",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/magi/image-to-video": {
      className: "MagiImageToVideo",
      docstring:
        "MAGI-1 generates videos from images with exceptional understanding of physical interactions and prompting",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v4/effects": {
      className: "PixverseV4Effects",
      docstring:
        "Generate high quality video clips with different effects using PixVerse v4",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/magi-distilled/image-to-video": {
      className: "MagiDistilledImageToVideo",
      docstring:
        "MAGI-1 distilled generates videos faster from images with exceptional understanding of physical interactions and prompting",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/framepack/flf2v": {
      className: "FramepackFlf2v",
      docstring:
        "Framepack is an efficient Image-to-video model that autoregressively generates videos.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/wan-flf2v": {
      className: "WanFlf2v",
      docstring:
        "Wan-2.1 flf2v generates dynamic videos by intelligently bridging a given first frame to a desired end frame through smooth, coherent motion sequences.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/framepack": {
      className: "Framepack",
      docstring:
        "Framepack is an efficient Image-to-video model that autoregressively generates videos.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v4/image-to-video/fast": {
      className: "PixverseV4ImageToVideoFast",
      docstring:
        "Generate fast high quality video clips from text and image prompts using PixVerse v4",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v4/image-to-video": {
      className: "PixverseV4ImageToVideo",
      docstring:
        "Generate high quality video clips from text and image prompts using PixVerse v4",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v3.5/effects": {
      className: "PixverseV35Effects",
      docstring:
        "Generate high quality video clips with different effects using PixVerse v3.5",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v3.5/transition": {
      className: "PixverseV35Transition",
      docstring:
        "Create seamless transition between images using PixVerse v3.5",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/luma-dream-machine/ray-2-flash/image-to-video": {
      className: "LumaDreamMachineRay2FlashImageToVideo",
      docstring:
        "Ray2 Flash is a fast video generative model capable of creating realistic visuals with natural, coherent motion.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pika/v1.5/pikaffects": {
      className: "PikaV15Pikaffects",
      docstring:
        "Pika Effects are AI-powered video effects designed to modify objects, characters, and environments in a fun, engaging, and visually compelling manner.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pika/v2.1/image-to-video": {
      className: "PikaV21ImageToVideo",
      docstring:
        "Turn photos into mind-blowing, dynamic videos. Your images can can come to life with sharp details, impressive character control and cinematic camera moves.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pika/v2.2/image-to-video": {
      className: "PikaV22ImageToVideo",
      docstring:
        "Turn photos into mind-blowing, dynamic videos in up to 1080p. Experience better image clarity and crisper, sharper visuals.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pika/v2.2/pikascenes": {
      className: "PikaV22Pikascenes",
      docstring:
        "Pika Scenes v2.2 creates videos from a images with high quality output.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pika/v2/turbo/image-to-video": {
      className: "PikaV2TurboImageToVideo",
      docstring:
        "Turbo is the model to use when you feel the need for speed. Turn your image to stunning video up to 3x faster – all with high quality outputs. ",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/vidu/image-to-video": {
      className: "ViduImageToVideo",
      docstring:
        "Vidu Image to Video generates high-quality videos with exceptional visual quality and motion diversity from a single image",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/vidu/reference-to-video": {
      className: "ViduReferenceToVideo",
      docstring:
        "Vidu Reference to Video creates videos by using a reference images and combining them with a prompt.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/vidu/start-end-to-video": {
      className: "ViduStartEndToVideo",
      docstring:
        "Vidu Start-End to Video generates smooth transition videos between specified start and end images.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/vidu/template-to-video": {
      className: "ViduTemplateToVideo",
      docstring:
        "Vidu Template to Video lets you create different effects by applying motion templates to your images.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/wan-i2v-lora": {
      className: "WanI2vLora",
      docstring:
        "Add custom LoRAs to Wan-2.1 is a image-to-video model that generates high-quality videos with high visual quality and motion diversity from images",
      tags: ["video", "animation", "image-to-video", "img2vid", "lora"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/hunyuan-video-image-to-video": {
      className: "HunyuanVideoImageToVideo",
      docstring: "Image to Video for the high-quality Hunyuan Video I2V model.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/minimax/video-01-director/image-to-video": {
      className: "MinimaxVideo01DirectorImageToVideo",
      docstring:
        "Generate video clips more accurately with respect to initial image, natural language descriptions, and using camera movement instructions for shot control.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/skyreels-i2v": {
      className: "SkyreelsI2v",
      docstring:
        "SkyReels V1 is the first and most advanced open-source human-centric video foundation model. By fine-tuning HunyuanVideo on O(10M) high-quality film and television clips",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/luma-dream-machine/ray-2/image-to-video": {
      className: "LumaDreamMachineRay2ImageToVideo",
      docstring:
        "Ray2 is a large-scale video generative model capable of creating realistic visuals with natural, coherent motion.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/hunyuan-video-img2vid-lora": {
      className: "HunyuanVideoImg2vidLora",
      docstring:
        "Image to Video for the Hunyuan Video model using a custom trained LoRA.",
      tags: ["video", "animation", "image-to-video", "img2vid", "lora"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v3.5/image-to-video/fast": {
      className: "PixverseV35ImageToVideoFast",
      docstring:
        "Generate high quality video clips from text and image prompts quickly using PixVerse v3.5 Fast",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/pixverse/v3.5/image-to-video": {
      className: "PixverseV35ImageToVideo",
      docstring:
        "Generate high quality video clips from text and image prompts using PixVerse v3.5",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/minimax/video-01-subject-reference": {
      className: "MinimaxVideo01SubjectReference",
      docstring:
        "Generate video clips maintaining consistent, realistic facial features and identity across dynamic video content",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/kling-video/v1.6/standard/image-to-video": {
      className: "KlingVideoV16StandardImageToVideo",
      docstring: "Generate video clips from your images using Kling 1.6 (std)",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/sadtalker/reference": {
      className: "SadtalkerReference",
      docstring:
        "Learning Realistic 3D Motion Coefficients for Stylized Audio-Driven Single Image Talking Face Animation",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/minimax/video-01-live/image-to-video": {
      className: "MinimaxVideo01LiveImageToVideo",
      docstring:
        "Generate video clips from your images using MiniMax Video model",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/kling-video/v1.5/pro/image-to-video": {
      className: "KlingVideoV15ProImageToVideo",
      docstring: "Generate video clips from your images using Kling 1.5 (pro)",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/live-portrait": {
      className: "LivePortrait",
      docstring: "Transfer expression from a video to a portrait.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/musetalk": {
      className: "Musetalk",
      docstring:
        "MuseTalk is a real-time high quality audio-driven lip-syncing model. Use MuseTalk to animate a face with your own audio.",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/sadtalker": {
      className: "Sadtalker",
      docstring:
        "Learning Realistic 3D Motion Coefficients for Stylized Audio-Driven Single Image Talking Face Animation",
      tags: ["video", "animation", "image-to-video", "img2vid"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/fast-svd-lcm": {
      className: "FastSvdLcm",
      docstring:
        "Generate short video clips from your images using SVD v1.1 at Lightning Speed",
      tags: ["video", "animation", "image-to-video", "img2vid", "fast"],
      useCases: [
        "Animate static images",
        "Create engaging social media content",
        "Product demonstrations",
        "Marketing and promotional videos",
        "Visual storytelling"
      ]
    },

    "fal-ai/kling-video/v3/standard/image-to-video": {
      className: "KlingVideoV3StandardImageToVideo",
      docstring:
        "Kling Video V3 Standard generates videos from images with balanced quality and speed using the latest V3 model.",
      tags: [
        "video",
        "generation",
        "kling",
        "v3",
        "standard",
        "image-to-video"
      ],
      useCases: [
        "Animate static images into short video clips",
        "Create engaging social media content from photos",
        "Generate product demonstration videos",
        "Produce marketing and promotional videos",
        "Transform images into cinematic animations"
      ],
      basicFields: ["start_image_url", "prompt", "duration"]
    },

    "fal-ai/kling-video/v3/pro/image-to-video": {
      className: "KlingVideoV3ProImageToVideo",
      docstring:
        "Kling Video V3 Pro generates professional quality videos from images with enhanced visual fidelity using the latest V3 model.",
      tags: ["video", "generation", "kling", "v3", "pro", "image-to-video"],
      useCases: [
        "Create professional-grade video animations from images",
        "Generate cinematic video content with precise motion",
        "Produce high-fidelity product showcase videos",
        "Animate images with enhanced visual quality",
        "Create premium video content for advertising"
      ],
      basicFields: ["start_image_url", "prompt", "duration"]
    }
  }
};
