import type { ModuleConfig } from "../types.js";

const IMAGE_REF = {
  type: "image" as const,
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};
const AUDIO_REF = {
  type: "audio" as const,
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};
const VIDEO_REF = {
  type: "video" as const,
  uri: "",
  asset_id: null,
  data: null,
  metadata: null,
  duration: null,
  format: null
};

export const videoConfig: ModuleConfig = {
  moduleName: "video",
  defaultPollInterval: 8000,
  defaultMaxAttempts: 450,
  nodes: [
    // -----------------------------------------------------------------------
    // 1. KlingTextToVideo
    // -----------------------------------------------------------------------
    {
      className: "KlingTextToVideo",
      modelId: "kling-2.6/text-to-video",
      title: "Kling 2.6 Text To Video",
      description:
        "Generate videos from text using Kuaishou's Kling 2.6 model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, text-to-video, 2.6\n\n    Kling 2.6 produces high-quality videos from text descriptions with\n    realistic motion, natural lighting, and cinematic detail.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["16:9", "9:16", "1:1"]
        },
        {
          name: "duration",
          type: "int",
          default: 5,
          title: "Duration",
          description: "Video duration in seconds.",
          min: 1,
          max: 10
        },
        {
          name: "resolution",
          type: "enum",
          default: "768P",
          title: "Resolution",
          description: "Video resolution.",
          values: ["768P"]
        },
        {
          name: "seed",
          type: "int",
          default: -1,
          title: "Seed",
          description:
            "Random seed for reproducible results. Use -1 for random seed."
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 2. KlingImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "KlingImageToVideo",
      modelId: "kling-2.6/image-to-video",
      title: "Kling 2.6 Image To Video",
      description:
        "Generate videos from images using Kuaishou's Kling 2.6 model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, image-to-video, 2.6\n\n    Transforms static images into dynamic videos with realistic motion\n    and temporal consistency while preserving the original visual style.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Optional text prompt to guide the video generation."
        },
        {
          name: "image1",
          type: "image",
          default: IMAGE_REF,
          title: "Image1",
          description: "First source image for the video generation."
        },
        {
          name: "image2",
          type: "image",
          default: IMAGE_REF,
          title: "Image2",
          description: "Second source image (optional)."
        },
        {
          name: "image3",
          type: "image",
          default: IMAGE_REF,
          title: "Image3",
          description: "Third source image (optional)."
        },
        {
          name: "sound",
          type: "bool",
          default: false,
          title: "Sound",
          description: "Whether to generate sound for the video."
        },
        {
          name: "duration",
          type: "int",
          default: 5,
          title: "Duration",
          description: "Video duration in seconds."
        }
      ],
      uploads: [
        {
          field: "image1",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        },
        {
          field: "image2",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        },
        {
          field: "image3",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 3. KlingAIAvatarStandard
    // -----------------------------------------------------------------------
    {
      className: "KlingAIAvatarStandard",
      modelId: "kling/v1-avatar-standard",
      title: "Kling AIAvatar Standard",
      description:
        "Generate talking avatar videos using Kuaishou's Kling AI via Kie.ai.\n\n    kie, kling, kuaishou, avatar, video generation, ai, talking-head, lip-sync\n\n    Transforms a photo plus audio track into a lip-synced talking avatar video\n    with natural-looking speech animation and consistent identity.",
      outputType: "video",
      fields: [
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "The face/character image to animate."
        },
        {
          name: "audio",
          type: "audio",
          default: AUDIO_REF,
          title: "Audio",
          description: "The audio track for lip-syncing."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Optional text to guide emotions and expressions."
        },
        {
          name: "mode",
          type: "enum",
          default: "standard",
          title: "Mode",
          description:
            "Generation mode: 'standard' or 'pro' for higher quality.",
          values: ["standard", "pro"]
        }
      ],
      uploads: [
        { field: "image", kind: "image", paramName: "image_url" },
        { field: "audio", kind: "audio", paramName: "audio_url" }
      ]
    },

    // -----------------------------------------------------------------------
    // 4. KlingAIAvatarPro
    // -----------------------------------------------------------------------
    {
      className: "KlingAIAvatarPro",
      modelId: "kling/v1-avatar-pro",
      title: "Kling AIAvatar Pro",
      description:
        "Generate talking avatar videos using Kuaishou's Kling AI via Kie.ai.\n\n    kie, kling, kuaishou, avatar, video generation, ai, talking-head, lip-sync\n\n    Transforms a photo plus audio track into a lip-synced talking avatar video\n    with natural-looking speech animation and consistent identity.",
      outputType: "video",
      fields: [
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "The face/character image to animate."
        },
        {
          name: "audio",
          type: "audio",
          default: AUDIO_REF,
          title: "Audio",
          description: "The audio track for lip-syncing."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Optional text to guide emotions and expressions."
        },
        {
          name: "mode",
          type: "enum",
          default: "standard",
          title: "Mode",
          description:
            "Generation mode: 'standard' or 'pro' for higher quality.",
          values: ["standard", "pro"]
        }
      ],
      uploads: [
        { field: "image", kind: "image", paramName: "image_url" },
        { field: "audio", kind: "audio", paramName: "audio_url" }
      ]
    },

    // -----------------------------------------------------------------------
    // 5. GrokImagineTextToVideo
    // -----------------------------------------------------------------------
    {
      className: "GrokImagineTextToVideo",
      modelId: "grok-imagine/text-to-video",
      title: "Grok Imagine Text To Video",
      description:
        "Generate videos from text using xAI's Grok Imagine model via Kie.ai.\n\n    kie, grok, xai, video generation, ai, text-to-video, multimodal\n\n    Grok Imagine generates videos from text prompts using xAI's\n    multimodal generation capabilities.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "resolution",
          type: "enum",
          default: "1080p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p", "1080p"]
        },
        {
          name: "duration",
          type: "enum",
          default: "medium",
          title: "Duration",
          description: "The duration tier of the video.",
          values: ["short", "medium", "long"]
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 6. GrokImagineImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "GrokImagineImageToVideo",
      modelId: "grok-imagine/image-to-video",
      title: "Grok Imagine Image To Video",
      description:
        "Generate videos from images using xAI's Grok Imagine model via Kie.ai.\n\n    kie, grok, xai, video generation, ai, image-to-video, multimodal\n\n    Grok Imagine transforms images into videos using xAI's\n    multimodal generation capabilities.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Optional text guide for the animation."
        },
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "The source image to animate."
        },
        {
          name: "duration",
          type: "enum",
          default: "medium",
          title: "Duration",
          description: "The duration tier of the video.",
          values: ["short", "medium", "long"]
        }
      ],
      uploads: [{ field: "image", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 7. SeedanceV1LiteTextToVideo
    // -----------------------------------------------------------------------
    {
      className: "SeedanceV1LiteTextToVideo",
      modelId: "seedance/v1-lite-text-to-video",
      title: "Seedance V1 Lite Text To Video",
      description:
        "Bytedance 1.0 - text-to-video-lite via Kie.ai.\n\n    kie, seedance, bytedance, video generation, ai, text-to-video, lite\n\n    Seedance V1 Lite offers efficient text-to-video generation\n    with good quality and faster processing times.",
      outputType: "video",
      fields: [
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "720p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p"]
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5", "10"]
        },
        {
          name: "remove_watermark",
          type: "bool",
          default: true,
          title: "Remove Watermark",
          description: "Whether to remove the watermark from the video."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 8. SeedanceV1ProTextToVideo
    // -----------------------------------------------------------------------
    {
      className: "SeedanceV1ProTextToVideo",
      modelId: "seedance/v1-pro-text-to-video",
      title: "Seedance V1 Pro Text To Video",
      description: "Bytedance 1.0 - text-to-video-pro via Kie.ai.",
      outputType: "video",
      fields: [
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "720p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p"]
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5", "10"]
        },
        {
          name: "remove_watermark",
          type: "bool",
          default: true,
          title: "Remove Watermark",
          description: "Whether to remove the watermark from the video."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 9. SeedanceV1LiteImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "SeedanceV1LiteImageToVideo",
      modelId: "seedance/v1-lite-image-to-video",
      title: "Seedance V1 Lite Image To Video",
      description: "Bytedance 1.0 - image-to-video-lite via Kie.ai.",
      outputType: "video",
      fields: [
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "720p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p"]
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5", "10"]
        },
        {
          name: "remove_watermark",
          type: "bool",
          default: true,
          title: "Remove Watermark",
          description: "Whether to remove the watermark from the video."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Optional text guide for the video generation."
        },
        {
          name: "image1",
          type: "image",
          default: IMAGE_REF,
          title: "Image1",
          description: "First source image for the video generation."
        },
        {
          name: "image2",
          type: "image",
          default: IMAGE_REF,
          title: "Image2",
          description: "Second source image (optional)."
        },
        {
          name: "image3",
          type: "image",
          default: IMAGE_REF,
          title: "Image3",
          description: "Third source image (optional)."
        }
      ],
      uploads: [
        {
          field: "image1",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        },
        {
          field: "image2",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        },
        {
          field: "image3",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 10. SeedanceV1ProImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "SeedanceV1ProImageToVideo",
      modelId: "seedance/v1-pro-image-to-video",
      title: "Seedance V1 Pro Image To Video",
      description: "Bytedance 1.0 - image-to-video-pro via Kie.ai.",
      outputType: "video",
      fields: [
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "720p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p"]
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5", "10"]
        },
        {
          name: "remove_watermark",
          type: "bool",
          default: true,
          title: "Remove Watermark",
          description: "Whether to remove the watermark from the video."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Optional text guide for the video generation."
        },
        {
          name: "image1",
          type: "image",
          default: IMAGE_REF,
          title: "Image1",
          description: "First source image for the video generation."
        },
        {
          name: "image2",
          type: "image",
          default: IMAGE_REF,
          title: "Image2",
          description: "Second source image (optional)."
        },
        {
          name: "image3",
          type: "image",
          default: IMAGE_REF,
          title: "Image3",
          description: "Third source image (optional)."
        }
      ],
      uploads: [
        {
          field: "image1",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        },
        {
          field: "image2",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        },
        {
          field: "image3",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 11. SeedanceV1ProFastImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "SeedanceV1ProFastImageToVideo",
      modelId: "seedance/v1-pro-fast-image-to-video",
      title: "Seedance V1 Pro Fast Image To Video",
      description: "Bytedance 1.0 - fast-image-to-video-pro via Kie.ai.",
      outputType: "video",
      fields: [
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "720p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p"]
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5", "10"]
        },
        {
          name: "remove_watermark",
          type: "bool",
          default: true,
          title: "Remove Watermark",
          description: "Whether to remove the watermark from the video."
        },
        {
          name: "image1",
          type: "image",
          default: IMAGE_REF,
          title: "Image1",
          description: "First source image for the video generation."
        },
        {
          name: "image2",
          type: "image",
          default: IMAGE_REF,
          title: "Image2",
          description: "Second source image (optional)."
        },
        {
          name: "image3",
          type: "image",
          default: IMAGE_REF,
          title: "Image3",
          description: "Third source image (optional)."
        }
      ],
      uploads: [
        {
          field: "image1",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        },
        {
          field: "image2",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        },
        {
          field: "image3",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 12. HailuoTextToVideoPro
    // -----------------------------------------------------------------------
    {
      className: "HailuoTextToVideoPro",
      modelId: "hailuo/2-3-text-to-video-pro",
      title: "Hailuo 2.3 Pro Text To Video",
      description:
        "Generate videos from text using MiniMax's Hailuo 2.3 Pro model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, text-to-video, pro\n\n    Hailuo 2.3 Pro offers the highest quality text-to-video generation with\n    realistic motion, detailed textures, and cinematic quality.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "duration",
          type: "enum",
          default: "6",
          title: "Duration",
          description:
            "The duration of the video in seconds. 10s is not supported for 1080p.",
          values: ["6", "10"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "768P",
          title: "Resolution",
          description: "Video resolution.",
          values: ["768P", "1080P"]
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 13. HailuoTextToVideoStandard
    // -----------------------------------------------------------------------
    {
      className: "HailuoTextToVideoStandard",
      modelId: "hailuo/2-3-text-to-video-standard",
      title: "Hailuo 2.3 Standard Text To Video",
      description:
        "Generate videos from text using MiniMax's Hailuo 2.3 Standard model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, text-to-video, standard, fast",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "duration",
          type: "enum",
          default: "6",
          title: "Duration",
          description:
            "The duration of the video in seconds. 10s is not supported for 1080p.",
          values: ["6", "10"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "768P",
          title: "Resolution",
          description: "Video resolution.",
          values: ["768P", "1080P"]
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 14. HailuoImageToVideoPro
    // -----------------------------------------------------------------------
    {
      className: "HailuoImageToVideoPro",
      modelId: "hailuo/2-3-image-to-video-pro",
      title: "Hailuo 2.3 Pro Image To Video",
      description:
        "Generate videos from images using MiniMax's Hailuo 2.3 Pro model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, image-to-video, pro\n\n    Hailuo 2.3 Pro offers the highest quality image-to-video generation with\n    realistic motion, detailed textures, and cinematic quality.",
      outputType: "video",
      fields: [
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "The reference image to animate into a video."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Optional text to guide the video generation."
        },
        {
          name: "duration",
          type: "enum",
          default: "6",
          title: "Duration",
          description:
            "The duration of the video in seconds. 10s is not supported for 1080p.",
          values: ["6", "10"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "768P",
          title: "Resolution",
          description: "Video resolution.",
          values: ["768P", "1080P"]
        }
      ],
      uploads: [{ field: "image", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 15. HailuoImageToVideoStandard
    // -----------------------------------------------------------------------
    {
      className: "HailuoImageToVideoStandard",
      modelId: "hailuo/2-3-image-to-video-standard",
      title: "Hailuo 2.3 Standard Image To Video",
      description:
        "Generate videos from images using MiniMax's Hailuo 2.3 Standard model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, image-to-video, standard, fast\n\n    Hailuo 2.3 Standard offers efficient image-to-video generation with good quality\n    and faster processing times for practical use cases.",
      outputType: "video",
      fields: [
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "The reference image to animate into a video."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Optional text to guide the video generation."
        },
        {
          name: "duration",
          type: "enum",
          default: "6",
          title: "Duration",
          description:
            "The duration of the video in seconds. 10s is not supported for 1080p.",
          values: ["6", "10"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "768P",
          title: "Resolution",
          description: "Video resolution.",
          values: ["768P", "1080P"]
        }
      ],
      uploads: [{ field: "image", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 16. Kling25TurboTextToVideo
    // -----------------------------------------------------------------------
    {
      className: "Kling25TurboTextToVideo",
      modelId: "kling/v2-5-turbo-text-to-video-pro",
      title: "Kling 2.5 Turbo Text To Video",
      description:
        "Generate videos from text using Kuaishou's Kling 2.5 Turbo model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, text-to-video, turbo\n\n    Kling 2.5 Turbo offers improved prompt adherence, fluid motion,\n    consistent artistic styles, and realistic physics simulation.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "Video duration in seconds.",
          values: ["5", "10"]
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["16:9", "9:16", "1:1"]
        },
        {
          name: "negative_prompt",
          type: "str",
          default: "",
          title: "Negative Prompt",
          description: "Things to avoid in the generated video."
        },
        {
          name: "cfg_scale",
          type: "float",
          default: 0.5,
          title: "Cfg Scale",
          description:
            "The CFG scale for prompt adherence. Lower values allow more creativity.",
          min: 0,
          max: 1
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 17. Kling25TurboImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "Kling25TurboImageToVideo",
      modelId: "kling/v2-5-turbo-image-to-video",
      title: "Kling 2.5 Turbo Image To Video",
      description:
        "Generate videos from images using Kuaishou's Kling 2.5 Turbo model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, image-to-video, turbo\n\n    Transforms a static image into a dynamic video while preserving\n    visual style, colors, lighting, and texture.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Text description to guide the video generation."
        },
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "The source image to animate."
        },
        {
          name: "tail_image",
          type: "image",
          default: IMAGE_REF,
          title: "Tail Image",
          description: "Tail frame image for the video (optional)."
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "Video duration in seconds.",
          values: ["5", "10"]
        },
        {
          name: "negative_prompt",
          type: "str",
          default: "",
          title: "Negative Prompt",
          description: "Elements to avoid in the video."
        },
        {
          name: "cfg_scale",
          type: "float",
          default: 0.5,
          title: "Cfg Scale",
          description:
            "The CFG scale for prompt adherence. Lower values allow more creativity.",
          min: 0,
          max: 1
        }
      ],
      uploads: [{ field: "image", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 18. Sora2ProTextToVideo
    // -----------------------------------------------------------------------
    {
      className: "Sora2ProTextToVideo",
      modelId: "sora-2/pro-text-to-video",
      title: "Sora 2 Pro Text To Video",
      description:
        "Generate videos from text using Sora 2 Pro via Kie.ai.\n\n    kie, sora, openai, video generation, ai, text-to-video, pro\n\n    Sora 2 Pro generates high-quality videos from text descriptions\n    with advanced motion and temporal consistency.",
      outputType: "video",
      fields: [
        {
          name: "aspect_ratio",
          type: "enum",
          default: "landscape",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["landscape", "portrait", "square"]
        },
        {
          name: "remove_watermark",
          type: "bool",
          default: true,
          title: "Remove Watermark",
          description: "Whether to remove the watermark from the video."
        },
        {
          name: "n_frames",
          type: "enum",
          default: "10",
          title: "N Frames",
          description: "Number of frames for the video output.",
          values: ["10", "15"]
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 19. Sora2ProImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "Sora2ProImageToVideo",
      modelId: "sora-2/pro-image-to-video",
      title: "Sora 2 Pro Image To Video",
      description:
        "Generate videos from images using Sora 2 Pro via Kie.ai.\n\n    kie, sora, openai, video generation, ai, image-to-video, pro\n\n    Sora 2 Pro transforms images into high-quality videos with\n    realistic motion and temporal consistency.",
      outputType: "video",
      fields: [
        {
          name: "aspect_ratio",
          type: "enum",
          default: "landscape",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["landscape", "portrait", "square"]
        },
        {
          name: "remove_watermark",
          type: "bool",
          default: true,
          title: "Remove Watermark",
          description: "Whether to remove the watermark from the video."
        },
        {
          name: "n_frames",
          type: "enum",
          default: "10",
          title: "N Frames",
          description: "Number of frames for the video output.",
          values: ["10", "15"]
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Optional text guide for the video generation."
        },
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "The source image to animate."
        }
      ],
      uploads: [{ field: "image", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 20. Sora2ProStoryboard
    // -----------------------------------------------------------------------
    {
      className: "Sora2ProStoryboard",
      modelId: "sora-2/pro-storyboard",
      title: "Sora 2 Pro Storyboard",
      description:
        "Generate videos from storyboards using Sora 2 Pro via Kie.ai.\n\n    kie, sora, openai, video generation, ai, storyboard, pro\n\n    Sora 2 Pro creates videos from storyboard sequences with\n    consistent characters and scenes across frames.",
      outputType: "video",
      fields: [
        {
          name: "aspect_ratio",
          type: "enum",
          default: "landscape",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["landscape", "portrait", "square"]
        },
        {
          name: "remove_watermark",
          type: "bool",
          default: true,
          title: "Remove Watermark",
          description: "Whether to remove the watermark from the video."
        },
        {
          name: "n_frames",
          type: "enum",
          default: "10",
          title: "N Frames",
          description: "Number of frames for the video output.",
          values: ["10", "15", "25"]
        },
        {
          name: "shots",
          type: "str",
          default: "",
          title: "Shots",
          description: "The shots to generate, with columns: Scene, duration."
        },
        {
          name: "images",
          type: "list[image]",
          default: [],
          title: "Images",
          description: "The images to use for the video generation."
        }
      ],
      uploads: [
        {
          field: "images",
          kind: "image",
          isList: true,
          paramName: "image_urls"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 21. Sora2TextToVideo
    // -----------------------------------------------------------------------
    {
      className: "Sora2TextToVideo",
      modelId: "sora-2/text-to-video",
      title: "Sora 2 Text To Video",
      description:
        "Generate videos from text using Sora 2 Standard via Kie.ai.\n\n    kie, sora, openai, video generation, ai, text-to-video, standard\n\n    Sora 2 Standard generates quality videos from text descriptions\n    with efficient processing and good visual quality.",
      outputType: "video",
      fields: [
        {
          name: "aspect_ratio",
          type: "enum",
          default: "landscape",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["landscape", "portrait", "square"]
        },
        {
          name: "remove_watermark",
          type: "bool",
          default: true,
          title: "Remove Watermark",
          description: "Whether to remove the watermark from the video."
        },
        {
          name: "n_frames",
          type: "enum",
          default: "10",
          title: "N Frames",
          description: "Number of frames for the video output.",
          values: ["10", "15"]
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 22. WanMultiShotTextToVideoPro
    // -----------------------------------------------------------------------
    {
      className: "WanMultiShotTextToVideoPro",
      modelId: "wan/multi-shot-text-to-video-pro",
      title: "Wan 2.1 Multi-Shot Text To Video",
      description:
        "Generate videos from text using Alibaba's Wan 2.1 model via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, text-to-video, multi-shot, 2.1\n\n    Wan 2.1 Multi-Shot generates complex videos with multiple shots\n    and scene transitions from text descriptions.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["16:9", "9:16", "1:1", "4:3", "3:4"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "1080p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p", "1080p"]
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5", "10"]
        },
        {
          name: "remove_watermark",
          type: "bool",
          default: true,
          title: "Remove Watermark",
          description: "Whether to remove the watermark from the video."
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 23. Wan26TextToVideo
    // -----------------------------------------------------------------------
    {
      className: "Wan26TextToVideo",
      modelId: "wan/2-6-text-to-video",
      title: "Wan 2.6 Text To Video",
      description:
        "Generate videos from text using Alibaba's Wan 2.6 model via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, text-to-video, 2.6\n\n    Wan 2.6 generates high-quality videos from text descriptions\n    with advanced motion and visual fidelity.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "duration",
          type: "enum",
          default: "5s",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5s", "10"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "1080p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["1080p", "720p"]
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 24. Wan26ImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "Wan26ImageToVideo",
      modelId: "wan/2-6-image-to-video",
      title: "Wan 2.6 Image To Video",
      description:
        "Generate videos from images using Alibaba's Wan 2.6 model via Kie.ai.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "image1",
          type: "image",
          default: IMAGE_REF,
          title: "Image1",
          description: "First source image for the video generation."
        },
        {
          name: "image2",
          type: "image",
          default: IMAGE_REF,
          title: "Image2",
          description: "Second source image (optional)."
        },
        {
          name: "image3",
          type: "image",
          default: IMAGE_REF,
          title: "Image3",
          description: "Third source image (optional)."
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5", "10"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "1080p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["1080p", "720p"]
        }
      ],
      uploads: [{ field: "image1", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 25. Wan26VideoToVideo
    // -----------------------------------------------------------------------
    {
      className: "Wan26VideoToVideo",
      modelId: "wan/2-6-video-to-video",
      title: "Wan 2.6 Video To Video",
      description:
        "Generate videos from videos using Alibaba's Wan 2.6 model via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, video-to-video, 2.6\n\n    Wan 2.6 transforms and enhances existing videos with AI-powered\n    editing and style transfer capabilities.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the changes."
        },
        {
          name: "video1",
          type: "video",
          default: VIDEO_REF,
          title: "Video1",
          description: "First source video for the video-to-video task."
        },
        {
          name: "video2",
          type: "video",
          default: VIDEO_REF,
          title: "Video2",
          description: "Second source video (optional)."
        },
        {
          name: "video3",
          type: "video",
          default: VIDEO_REF,
          title: "Video3",
          description: "Third source video (optional)."
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5", "10"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "1080p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["1080p", "720p"]
        }
      ],
      uploads: [{ field: "video1", kind: "video", paramName: "video_url" }]
    },

    // -----------------------------------------------------------------------
    // 26. TopazVideoUpscale
    // -----------------------------------------------------------------------
    {
      className: "TopazVideoUpscale",
      modelId: "topaz/video-upscale",
      title: "Topaz Video Upscale",
      description: "Upscale and enhance videos using Topaz Labs AI via Kie.ai.",
      outputType: "video",
      fields: [
        {
          name: "video",
          type: "video",
          default: VIDEO_REF,
          title: "Video",
          description: "The video to upscale."
        },
        {
          name: "resolution",
          type: "enum",
          default: "1080p",
          title: "Resolution",
          description: "Target resolution for upscaling.",
          values: ["1080p", "4k"]
        },
        {
          name: "denoise",
          type: "bool",
          default: true,
          title: "Denoise",
          description: "Apply denoising to reduce artifacts."
        }
      ],
      uploads: [{ field: "video", kind: "video", paramName: "video_url" }]
    },

    // -----------------------------------------------------------------------
    // 27. InfinitalkV1
    // -----------------------------------------------------------------------
    {
      className: "InfinitalkV1",
      modelId: "infinitalk/v1",
      title: "Infinitalk V1",
      description:
        "Generate videos using Infinitalk v1 (image-to-video) via Kie.ai.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Optional text guide for the video generation."
        },
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "The source image."
        },
        {
          name: "audio",
          type: "audio",
          default: AUDIO_REF,
          title: "Audio",
          description: "The source audio track."
        },
        {
          name: "resolution",
          type: "enum",
          default: "480p",
          title: "Resolution",
          description: "Video resolution.",
          values: ["480p"]
        }
      ],
      uploads: [
        { field: "image", kind: "image", paramName: "image_url" },
        { field: "audio", kind: "audio", paramName: "audio_url" }
      ]
    },

    // -----------------------------------------------------------------------
    // 28. Veo31TextToVideo
    // -----------------------------------------------------------------------
    {
      className: "Veo31TextToVideo",
      modelId: "veo-3-1/text-to-video",
      title: "Veo 31 Text To Video",
      description:
        "Generate videos from text using Google's Veo 3.1 via Kie.ai.\n\n    kie, google, veo, veo3, veo3.1, video generation, ai, text-to-video\n\n    Veo 3.1 offers native 9:16 vertical video support, multilingual prompt processing,\n    and significant cost savings (25% of Google's direct API pricing).",
      outputType: "video",
      fields: [
        {
          name: "model",
          type: "enum",
          default: "veo3_fast",
          title: "Model",
          description: "The model to use for video generation.",
          values: ["veo3", "veo3_fast"]
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "Video aspect ratio.",
          values: ["16:9", "9:16"]
        },
        {
          name: "call_back_url",
          type: "str",
          default: "",
          title: "Call Back Url",
          description: "Optional callback URL for task completion."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 29. RunwayGen3AlphaTextToVideo
    // -----------------------------------------------------------------------
    {
      className: "RunwayGen3AlphaTextToVideo",
      modelId: "runway/gen3-alpha-text-to-video",
      title: "Runway Gen-3 Alpha Text To Video",
      description:
        "Generate videos from text using Runway's Gen-3 Alpha model via Kie.ai.\n\n    kie, runway, gen-3, gen3alpha, video generation, ai, text-to-video\n\n    Runway Gen-3 Alpha produces high-quality videos from text descriptions\n    with advanced motion and temporal consistency.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description:
            "The aspect ratio of the generated video. Required for text-to-video generation.",
          values: ["16:9", "4:3", "1:1", "3:4", "9:16"]
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description:
            "Video duration in seconds. If 10-second video is selected, 1080p resolution cannot be used.",
          values: ["5", "10"]
        },
        {
          name: "quality",
          type: "enum",
          default: "720p",
          title: "Quality",
          description:
            "Video resolution. If 1080p is selected, 10-second video cannot be generated.",
          values: ["720p", "1080p"]
        },
        {
          name: "water_mark",
          type: "str",
          default: "",
          title: "Water Mark",
          description:
            "Video watermark text content. An empty string indicates no watermark."
        },
        {
          name: "call_back_url",
          type: "str",
          default: "",
          title: "Call Back Url",
          description:
            "Optional callback URL to receive task completion updates."
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 30. RunwayGen3AlphaImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "RunwayGen3AlphaImageToVideo",
      modelId: "runway/gen3-alpha-image-to-video",
      title: "Runway Gen-3 Alpha Image To Video",
      description:
        "Generate videos from images using Runway's Gen-3 Alpha model via Kie.ai.\n\n    kie, runway, gen-3, gen3alpha, video generation, ai, image-to-video\n\n    Runway Gen-3 Alpha transforms static images into dynamic videos\n    with realistic motion and temporal consistency.",
      outputType: "video",
      fields: [
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "Reference image to base the video on."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description:
            "Optional text to guide the video generation. Maximum length is 1800 characters."
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description:
            "Video duration in seconds. If 10-second video is selected, 1080p resolution cannot be used.",
          values: ["5", "10"]
        },
        {
          name: "quality",
          type: "enum",
          default: "720p",
          title: "Quality",
          description:
            "Video resolution. If 1080p is selected, 10-second video cannot be generated.",
          values: ["720p", "1080p"]
        },
        {
          name: "water_mark",
          type: "str",
          default: "",
          title: "Water Mark",
          description:
            "Video watermark text content. An empty string indicates no watermark."
        },
        {
          name: "call_back_url",
          type: "str",
          default: "",
          title: "Call Back Url",
          description:
            "Optional callback URL to receive task completion updates."
        }
      ],
      uploads: [{ field: "image", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 31. RunwayGen3AlphaExtendVideo
    // -----------------------------------------------------------------------
    {
      className: "RunwayGen3AlphaExtendVideo",
      modelId: "runway/gen3-alpha-extend-video",
      title: "Runway Gen-3 Alpha Extend Video",
      description:
        "Extend videos using Runway's Gen-3 Alpha model via Kie.ai.\n\n    kie, runway, gen-3, gen3alpha, video generation, ai, video-extension\n\n    Runway Gen-3 Alpha can extend existing videos with additional generated content.",
      outputType: "video",
      fields: [
        {
          name: "video_url",
          type: "str",
          default: "",
          title: "Video Url",
          description: "The source video URL to extend."
        },
        {
          name: "prompt",
          type: "str",
          default: "Continue the motion naturally with smooth transitions.",
          title: "Prompt",
          description:
            "Text prompt to guide the video extension. Maximum length is 1800 characters."
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description:
            "Duration to extend the video by in seconds. If 10-second extension is selected, 1080p resolution cannot be used.",
          values: ["5", "10"]
        },
        {
          name: "quality",
          type: "enum",
          default: "720p",
          title: "Quality",
          description:
            "Video resolution. If 1080p is selected, 10-second extension cannot be generated.",
          values: ["720p", "1080p"]
        },
        {
          name: "water_mark",
          type: "str",
          default: "",
          title: "Water Mark",
          description:
            "Video watermark text content. An empty string indicates no watermark."
        },
        {
          name: "call_back_url",
          type: "str",
          default: "",
          title: "Call Back Url",
          description:
            "Optional callback URL to receive task completion updates."
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 32. RunwayAlephVideo
    // -----------------------------------------------------------------------
    {
      className: "RunwayAlephVideo",
      modelId: "runway/aleph-video",
      title: "Runway Aleph Video",
      description:
        "Generate videos using Runway's Aleph model via Kie.ai.\n\n    kie, runway, aleph, video generation, ai, text-to-video\n\n    Aleph is Runway's advanced video generation model offering\n    high-quality output with sophisticated motion handling.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description:
            "The aspect ratio of the generated video. Required for text-to-video generation.",
          values: ["16:9", "9:16", "1:1"]
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description:
            "Video duration in seconds. If 10-second video is selected, 1080p resolution cannot be used.",
          values: ["5", "10"]
        },
        {
          name: "quality",
          type: "enum",
          default: "720p",
          title: "Quality",
          description:
            "Video resolution. If 1080p is selected, 10-second video cannot be generated.",
          values: ["720p", "1080p"]
        },
        {
          name: "water_mark",
          type: "str",
          default: "",
          title: "Water Mark",
          description:
            "Video watermark text content. An empty string indicates no watermark."
        },
        {
          name: "call_back_url",
          type: "str",
          default: "",
          title: "Call Back Url",
          description:
            "Optional callback URL to receive task completion updates."
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 33. LumaModifyVideo
    // -----------------------------------------------------------------------
    {
      className: "LumaModifyVideo",
      modelId: "luma/modify-video",
      title: "Luma Modify Video",
      description:
        "Modify and enhance videos using Luma's API via Kie.ai.\n\n    kie, luma, video modification, ai, video-editing\n\n    Luma's video modification API allows for sophisticated video editing\n    and enhancement capabilities.",
      outputType: "video",
      fields: [
        {
          name: "video",
          type: "video",
          default: VIDEO_REF,
          title: "Video",
          description: "The source video to modify."
        },
        {
          name: "prompt",
          type: "str",
          default: "Enhance the video quality and add smooth motion.",
          title: "Prompt",
          description: "Text prompt describing the modifications to make."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the output video.",
          values: ["16:9", "9:16", "1:1"]
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "Duration of the modified video segment.",
          values: ["5", "10"]
        }
      ],
      uploads: [{ field: "video", kind: "video", paramName: "video_url" }]
    },

    // -----------------------------------------------------------------------
    // 34. Veo31ImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "Veo31ImageToVideo",
      modelId: "veo-3-1/image-to-video",
      title: "Veo 3.1 Image To Video",
      description:
        "Generate videos from images using Google's Veo 3.1 model via Kie.ai.\n\n    kie, google, veo, veo3, veo3.1, video generation, ai, image-to-video, i2v\n\n    Supports single image (image comes alive) or two images (first and last frames transition).\n    For two images, the first image serves as the video's first frame and the second as the last frame.",
      outputType: "video",
      fields: [
        {
          name: "model",
          type: "enum",
          default: "veo3_fast",
          title: "Model",
          description: "The model to use for video generation.",
          values: ["veo3", "veo3_fast"]
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "Video aspect ratio.",
          values: ["16:9", "9:16"]
        },
        {
          name: "call_back_url",
          type: "str",
          default: "",
          title: "Call Back Url",
          description: "Optional callback URL for task completion."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description:
            "Optional text prompt describing how the image should come alive."
        },
        {
          name: "image1",
          type: "image",
          default: IMAGE_REF,
          title: "Image1",
          description:
            "First source image. Required. Serves as the video's first frame."
        },
        {
          name: "image2",
          type: "image",
          default: IMAGE_REF,
          title: "Image2",
          description:
            "Second source image (optional). If provided, serves as the video's last frame."
        }
      ],
      uploads: [{ field: "image1", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 35. Veo31ReferenceToVideo
    // -----------------------------------------------------------------------
    {
      className: "Veo31ReferenceToVideo",
      modelId: "veo-3-1/reference-to-video",
      title: "Veo 3.1 Reference To Video",
      description:
        "Generate videos from reference images using Google's Veo 3.1 Fast model via Kie.ai.\n\n    kie, google, veo, veo3, veo3.1, video generation, ai, reference-to-video, material-to-video\n\n    Material-to-video generation based on reference images. Only supports veo3_fast model\n    and requires 1-3 reference images.",
      outputType: "video",
      fields: [
        {
          name: "model",
          type: "enum",
          default: "veo3_fast",
          title: "Model",
          description: "The model to use for video generation.",
          values: ["veo3", "veo3_fast"]
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "Video aspect ratio.",
          values: ["16:9", "9:16"]
        },
        {
          name: "call_back_url",
          type: "str",
          default: "",
          title: "Call Back Url",
          description: "Optional callback URL for task completion."
        },
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Text prompt describing the desired video content."
        },
        {
          name: "image1",
          type: "image",
          default: IMAGE_REF,
          title: "Image1",
          description:
            "First reference image. Required. Minimum 1, maximum 3 images."
        },
        {
          name: "image2",
          type: "image",
          default: IMAGE_REF,
          title: "Image2",
          description: "Second reference image (optional)."
        },
        {
          name: "image3",
          type: "image",
          default: IMAGE_REF,
          title: "Image3",
          description: "Third reference image (optional)."
        }
      ],
      uploads: [
        {
          field: "image1",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        },
        {
          field: "image2",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        },
        {
          field: "image3",
          kind: "image",
          paramName: "image_urls",
          groupKey: "images"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 36. KlingMotionControl
    // -----------------------------------------------------------------------
    {
      className: "KlingMotionControl",
      modelId: "kling/motion-control",
      title: "Kling 2.6 Motion Control",
      description:
        "Generate videos with motion control using Kuaishou's Kling 2.6 model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, motion-control, character-animation, 2.6\n\n    Kling Motion Control generates videos where character actions are guided by a reference video,\n    while the visual appearance is based on a reference image. Perfect for character animation\n    and motion transfer tasks.",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "The cartoon character is dancing.",
          title: "Prompt",
          description:
            "A text description of the desired output. Maximum 2500 characters."
        },
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description:
            "Reference image. The characters, backgrounds, and other elements in the generated video are based on this image. Supports .jpg/.jpeg/.png, max 10MB, size needs to be greater than 300px, aspect ratio 2:5 to 5:2."
        },
        {
          name: "video",
          type: "video",
          default: VIDEO_REF,
          title: "Video",
          description:
            "Reference video. The character actions in the generated video will be consistent with this reference video. Supports .mp4/.mov, max 100MB, 3-30 seconds duration depending on character_orientation."
        },
        {
          name: "character_orientation",
          type: "enum",
          default: "video",
          title: "Character Orientation",
          description:
            "Generate the orientation of the characters in the video. 'image': same orientation as the person in the picture (max 10s video). 'video': consistent with the orientation of the characters in the video (max 30s video).",
          values: ["image", "video"]
        },
        {
          name: "mode",
          type: "enum",
          default: "720p",
          title: "Mode",
          description:
            "Output resolution mode. Use '720p' for 720p or '1080p' for 1080p.",
          values: ["720p", "1080p"]
        }
      ],
      uploads: [{ field: "image", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 37. Kling21TextToVideo
    // -----------------------------------------------------------------------
    {
      className: "Kling21TextToVideo",
      modelId: "kling/v2-1-text-to-video",
      title: "Kling 2.1 Text To Video",
      description:
        "Generate videos from text using Kuaishou's Kling 2.1 model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, text-to-video, 2.1\n\n    Kling 2.1 powers cutting-edge video generation with hyper-realistic motion,\n    advanced physics, and high-resolution outputs up to 1080p.\n\n    Use cases:\n    - Generate high-quality videos from text descriptions\n    - Create dynamic, professional-grade video content\n    - Produce videos with realistic motion and physics",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["16:9", "9:16", "1:1"]
        },
        {
          name: "duration",
          type: "int",
          default: 5,
          title: "Duration",
          description: "Video duration in seconds.",
          min: 1,
          max: 10
        },
        {
          name: "resolution",
          type: "enum",
          default: "720P",
          title: "Resolution",
          description: "Video resolution.",
          values: ["720P", "1080P"]
        },
        {
          name: "mode",
          type: "enum",
          default: "standard",
          title: "Mode",
          description: "Generation mode: standard or pro for higher quality.",
          values: ["standard", "pro"]
        },
        {
          name: "seed",
          type: "int",
          default: -1,
          title: "Seed",
          description:
            "Random seed for reproducible results. Use -1 for random seed."
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 38. Kling21ImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "Kling21ImageToVideo",
      modelId: "kling/v2-1-image-to-video",
      title: "Kling 2.1 Image To Video",
      description:
        "Generate videos from images using Kuaishou's Kling 2.1 model via Kie.ai.\n\n    kie, kling, kuaishou, video generation, ai, image-to-video, 2.1\n\n    Kling 2.1 transforms static images into dynamic videos with hyper-realistic\n    motion and advanced physics simulation.\n\n    Use cases:\n    - Animate static images with realistic motion\n    - Create videos from photos and artwork\n    - Produce dynamic content from still images",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "Text prompt to guide the video generation."
        },
        {
          name: "image1",
          type: "image",
          default: IMAGE_REF,
          title: "Image1",
          description: "First source image for the video generation."
        },
        {
          name: "image2",
          type: "image",
          default: IMAGE_REF,
          title: "Image2",
          description: "Second source image (optional)."
        },
        {
          name: "image3",
          type: "image",
          default: IMAGE_REF,
          title: "Image3",
          description: "Third source image (optional)."
        },
        {
          name: "sound",
          type: "bool",
          default: false,
          title: "Sound",
          description: "Whether to generate sound for the video."
        },
        {
          name: "duration",
          type: "int",
          default: 5,
          title: "Duration",
          description: "Video duration in seconds."
        },
        {
          name: "mode",
          type: "enum",
          default: "standard",
          title: "Mode",
          description: "Generation mode: standard or pro for higher quality.",
          values: ["standard", "pro"]
        }
      ],
      uploads: [{ field: "image1", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 39. Wan25TextToVideo
    // -----------------------------------------------------------------------
    {
      className: "Wan25TextToVideo",
      modelId: "wan/2-5-text-to-video",
      title: "Wan 2.5 Text To Video",
      description:
        "Generate videos from text using Alibaba's Wan 2.5 model via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, text-to-video, 2.5\n\n    Wan 2.5 is designed for cinematic AI video generation with native audio\n    synchronization including dialogue, ambient sound, and background music.\n\n    Use cases:\n    - Generate cinematic videos from text descriptions\n    - Create videos with synchronized audio\n    - Produce content for social media and advertising",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "duration",
          type: "enum",
          default: "5s",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5s", "10s"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "1080p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["1080p", "720p"]
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["16:9", "9:16", "1:1"]
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 40. Wan25ImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "Wan25ImageToVideo",
      modelId: "wan/2-5-image-to-video",
      title: "Wan 2.5 Image To Video",
      description:
        "Generate videos from images using Alibaba's Wan 2.5 model via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, image-to-video, 2.5\n\n    Wan 2.5 transforms images into cinematic videos with native audio\n    synchronization.\n\n    Use cases:\n    - Animate static images with cinematic quality\n    - Create videos from photos with audio\n    - Produce dynamic content from still images",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "image1",
          type: "image",
          default: IMAGE_REF,
          title: "Image1",
          description: "First source image for the video generation."
        },
        {
          name: "image2",
          type: "image",
          default: IMAGE_REF,
          title: "Image2",
          description: "Second source image (optional)."
        },
        {
          name: "image3",
          type: "image",
          default: IMAGE_REF,
          title: "Image3",
          description: "Third source image (optional)."
        },
        {
          name: "duration",
          type: "enum",
          default: "5s",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5s", "10s"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "1080p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["1080p", "720p"]
        }
      ],
      uploads: [{ field: "image1", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 41. WanAnimate
    // -----------------------------------------------------------------------
    {
      className: "WanAnimate",
      modelId: "wan/animate",
      title: "Wan 2.2 Animate",
      description:
        "Generate character animation videos using Alibaba's Wan 2.2 Animate via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, image-to-video, animate, character\n\n    Wan 2.2 Animate generates realistic character videos with motion, expressions,\n    and lighting from static images.\n\n    Use cases:\n    - Animate character images with realistic motion\n    - Create character-driven video content\n    - Produce animated videos from portraits or character art",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "The character is moving naturally with realistic expressions.",
          title: "Prompt",
          description: "The text prompt describing the character animation."
        },
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "Character image to animate."
        },
        {
          name: "duration",
          type: "enum",
          default: "3",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["3", "5"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "720p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p", "1080p"]
        }
      ],
      uploads: [{ field: "image", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 42. WanSpeechToVideo
    // -----------------------------------------------------------------------
    {
      className: "WanSpeechToVideo",
      modelId: "wan/speech-to-video",
      title: "Wan 2.2 Speech To Video",
      description:
        "Generate videos from speech using Alibaba's Wan 2.2 A14B Turbo via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, speech-to-video, lip-sync\n\n    Wan 2.2 A14B Turbo Speech to Video turns static images and audio clips\n    into dynamic, expressive videos.\n\n    Use cases:\n    - Create talking head videos from images and audio\n    - Generate lip-synced content for presentations\n    - Produce dynamic videos from voice recordings",
      outputType: "video",
      fields: [
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "Character/face image to animate."
        },
        {
          name: "audio",
          type: "audio",
          default: AUDIO_REF,
          title: "Audio",
          description: "Audio file for speech/lip-sync."
        },
        {
          name: "resolution",
          type: "enum",
          default: "720p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p", "1080p"]
        }
      ],
      uploads: [
        { field: "image", kind: "image", paramName: "image_url" },
        { field: "audio", kind: "audio", paramName: "audio_url" }
      ]
    },

    // -----------------------------------------------------------------------
    // 43. Wan22TextToVideo
    // -----------------------------------------------------------------------
    {
      className: "Wan22TextToVideo",
      modelId: "wan/2-2-text-to-video",
      title: "Wan 2.2 Text To Video",
      description:
        "Generate videos from text using Alibaba's Wan 2.2 A14B Turbo via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, text-to-video, 2.2\n\n    Wan 2.2 A14B Turbo delivers smooth 720p@24fps clips with cinematic quality,\n    stable motion, and consistent visual style.\n\n    Use cases:\n    - Generate high-quality videos from text\n    - Create content for diverse creative uses\n    - Produce consistent video clips with stable motion",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "duration",
          type: "enum",
          default: "3",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["3", "5"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "720p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p"]
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["16:9", "9:16", "1:1"]
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 44. Wan22ImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "Wan22ImageToVideo",
      modelId: "wan/2-2-image-to-video",
      title: "Wan 2.2 Image To Video",
      description:
        "Generate videos from images using Alibaba's Wan 2.2 A14B Turbo via Kie.ai.\n\n    kie, wan, alibaba, video generation, ai, image-to-video, 2.2\n\n    Wan 2.2 A14B Turbo transforms images into smooth video clips with\n    cinematic quality and stable motion.\n\n    Use cases:\n    - Animate static images with smooth motion\n    - Create videos from photos or artwork\n    - Produce consistent video content from images",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "Source image for the video generation."
        },
        {
          name: "duration",
          type: "enum",
          default: "3",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["3", "5"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "720p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p"]
        }
      ],
      uploads: [{ field: "image", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 45. Hailuo02TextToVideo
    // -----------------------------------------------------------------------
    {
      className: "Hailuo02TextToVideo",
      modelId: "hailuo/0-2-text-to-video",
      title: "Hailuo 02 Text To Video",
      description:
        "Generate videos from text using Minimax's Hailuo 02 model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, text-to-video\n\n    Hailuo 02 is Minimax's advanced AI video generation model that produces\n    short, cinematic clips with realistic motion and physics simulation.\n\n    Use cases:\n    - Generate cinematic video clips from text\n    - Create videos with realistic motion and physics\n    - Produce high-quality content up to 1080P",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5", "10"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "720p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p", "1080p"]
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "16:9",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated video.",
          values: ["16:9", "9:16", "1:1"]
        }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "Prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 46. Hailuo02ImageToVideo
    // -----------------------------------------------------------------------
    {
      className: "Hailuo02ImageToVideo",
      modelId: "hailuo/0-2-image-to-video",
      title: "Hailuo 02 Image To Video",
      description:
        "Generate videos from images using Minimax's Hailuo 02 model via Kie.ai.\n\n    kie, hailuo, minimax, video generation, ai, image-to-video\n\n    Hailuo 02 transforms images into cinematic clips with realistic motion\n    and physics simulation.\n\n    Use cases:\n    - Animate images with realistic motion\n    - Create videos from photos with physics simulation\n    - Produce dynamic content from still images",
      outputType: "video",
      fields: [
        {
          name: "prompt",
          type: "str",
          default:
            "A cinematic video with smooth motion, natural lighting, and high detail.",
          title: "Prompt",
          description: "The text prompt describing the video."
        },
        {
          name: "image",
          type: "image",
          default: IMAGE_REF,
          title: "Image",
          description: "Source image for the video generation."
        },
        {
          name: "duration",
          type: "enum",
          default: "5",
          title: "Duration",
          description: "The duration of the video in seconds.",
          values: ["5", "10"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "720p",
          title: "Resolution",
          description: "The resolution of the video.",
          values: ["720p", "1080p"]
        }
      ],
      uploads: [{ field: "image", kind: "image", paramName: "image_url" }]
    },

    // -----------------------------------------------------------------------
    // 47. Sora2WatermarkRemover
    // -----------------------------------------------------------------------
    {
      className: "Sora2WatermarkRemover",
      modelId: "sora-2/watermark-remover",
      title: "Sora 2 Watermark Remover",
      description:
        "Remove watermarks from Sora 2 videos using Kie.ai.\n\n    kie, sora, openai, video editing, watermark removal\n\n    Sora 2 Watermark Remover uses AI detection and motion tracking to remove\n    dynamic watermarks from Sora 2 videos while keeping frames smooth and natural.\n\n    Use cases:\n    - Remove watermarks from generated videos\n    - Clean up video content for final output\n    - Prepare videos for professional use",
      outputType: "video",
      fields: [
        {
          name: "video",
          type: "video",
          default: VIDEO_REF,
          title: "Video",
          description:
            "Video to remove watermark from. Must be publicly accessible."
        }
      ],
      uploads: [{ field: "video", kind: "video", paramName: "video_url" }]
    }
  ]
};
