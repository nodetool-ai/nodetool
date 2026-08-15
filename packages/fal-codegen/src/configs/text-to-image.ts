import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  sharedEnums: {
    ImageSizePreset: {
      name: "ImageSizePreset",
      values: [
        ["SQUARE_HD", "square_hd"],
        ["SQUARE", "square"],
        ["PORTRAIT_4_3", "portrait_4_3"],
        ["PORTRAIT_16_9", "portrait_16_9"],
        ["LANDSCAPE_4_3", "landscape_4_3"],
        ["LANDSCAPE_16_9", "landscape_16_9"]
      ],
      description: "Preset sizes for image generation"
    }
  },
  configs: {
    "fal-ai/flux-2": {
      className: "Flux2",
      docstring:
        "FLUX.2 generates images from text with strong prompt adherence and photographic detail.",
      tags: ["generation", "text-to-image", "txt2img", "flux", "flux-2"],
      useCases: [
        "Generate photorealistic images from prompts",
        "Create detailed illustrations and concept art",
        "Produce marketing and product visuals",
        "Render text inside images accurately",
        "Generate variations of a single prompt"
      ]
    },

    "fal-ai/flux-2/lora": {
      className: "Flux2Lora",
      docstring:
        "FLUX.2 with LoRA weights applies custom-trained styles and subjects to text-to-image generation.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "flux",
        "flux-2",
        "lora"
      ],
      useCases: [
        "Generate images in a custom-trained style",
        "Render a fine-tuned subject or character",
        "Apply brand styles to generated images",
        "Combine multiple LoRA adapters",
        "Produce consistent art direction across a set"
      ]
    },

    "microsoft/mai-image-2.5-pro": {
      className: "MaiImage25Pro",
      docstring:
        "MAI Image 2.5 Pro is Microsoft's high-end text-to-image model for photorealistic generation.",
      tags: ["generation", "text-to-image", "txt2img", "mai", "microsoft"],
      useCases: [
        "Generate photorealistic images from prompts",
        "Create editorial and advertising visuals",
        "Produce detailed product renders",
        "Generate stylized illustrations",
        "Create high-resolution creative assets"
      ]
    },

    "alibaba/qwen-image-3/text-to-image": {
      className: "QwenImage3TextToImage",
      docstring:
        "Qwen Image 3 generates images from text with strong multilingual text rendering.",
      tags: ["generation", "text-to-image", "txt2img", "qwen", "alibaba"],
      useCases: [
        "Generate images from English or Chinese prompts",
        "Render legible text inside images",
        "Create posters and social media graphics",
        "Produce illustrations with fine detail",
        "Generate design mockups from descriptions"
      ]
    },

    "fal-ai/flux/dev": {
      className: "FluxDev",
      docstring:
        "FLUX.1 [dev] is a powerful open-weight text-to-image model with 12 billion parameters. Optimized for prompt following and visual quality.",
      tags: ["image", "generation", "flux", "text-to-image", "txt2img"],
      useCases: [
        "Generate high-quality images from text prompts",
        "Create detailed illustrations with precise control",
        "Produce professional artwork and designs",
        "Generate multiple variations from one prompt",
        "Create safe-for-work content with built-in safety checker"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "Size preset for the generated image"
        },
        num_inference_steps: {
          description:
            "Number of denoising steps. More steps typically improve quality"
        },
        guidance_scale: {
          description:
            "How strictly to follow the prompt. Higher values are more literal"
        },
        num_images: {
          description: "Number of images to generate"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        },
        enable_safety_checker: {
          description: "Enable safety checker to filter unsafe content"
        }
      },
      enumOverrides: { ImageSize: "ImageSizePreset" }
    },

    "fal-ai/flux/schnell": {
      className: "FluxSchnell",
      docstring:
        "FLUX.1 [schnell] is a fast distilled version of FLUX.1 optimized for speed. Can generate high-quality images in 1-4 steps.",
      tags: ["image", "generation", "flux", "fast", "text-to-image", "txt2img"],
      useCases: [
        "Generate images quickly for rapid iteration",
        "Create concept art with minimal latency",
        "Produce preview images before final generation",
        "Generate multiple variations efficiently",
        "Real-time image generation applications"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "Size preset for the generated image"
        },
        num_inference_steps: {
          description: "Number of denoising steps (1-4 recommended for schnell)"
        },
        num_images: {
          description: "Number of images to generate"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        },
        enable_safety_checker: {
          description: "Enable safety checker to filter unsafe content"
        }
      },
      enumOverrides: { ImageSize: "ImageSizePreset" }
    },

    "fal-ai/flux-pro/v1.1": {
      className: "FluxV1Pro",
      docstring:
        "FLUX.1 Pro is a state-of-the-art image generation model with superior prompt following and image quality.",
      tags: ["image", "generation", "flux", "pro", "text-to-image", "txt2img"],
      useCases: [
        "Generate professional-grade images for commercial use",
        "Create highly detailed artwork with complex prompts",
        "Produce marketing materials and brand assets",
        "Generate photorealistic images",
        "Create custom visual content with precise control"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        image_size: {
          description: "Size preset for the generated image"
        },
        guidance_scale: {
          description:
            "How strictly to follow the prompt. Higher values are more literal"
        },
        num_inference_steps: {
          description:
            "Number of denoising steps. More steps typically improve quality"
        },
        seed: {
          description: "Seed for reproducible results. Use -1 for random"
        },
        num_images: {
          description: "Number of images to generate"
        },
        enable_safety_checker: {
          description: "Enable safety checker to filter unsafe content"
        },
        safety_tolerance: {
          description:
            "Safety checker tolerance level (1-6). Higher is more permissive"
        },
        output_format: {
          description: "Output image format (jpeg or png)"
        }
      }
    },

    "fal-ai/flux-pro/v1.1-ultra": {
      className: "FluxV1ProUltra",
      docstring:
        "FLUX.1 Pro Ultra delivers the highest quality image generation with enhanced detail and realism.",
      tags: [
        "image",
        "generation",
        "flux",
        "pro",
        "ultra",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Generate ultra-high quality photorealistic images",
        "Create professional photography-grade visuals",
        "Produce detailed product renders",
        "Generate premium marketing materials",
        "Create artistic masterpieces with fine details"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        image_size: {
          description: "Size preset for the generated image"
        },
        guidance_scale: {
          description: "How strictly to follow the prompt"
        },
        num_inference_steps: {
          description: "Number of denoising steps"
        },
        seed: {
          description: "Seed for reproducible results. Use -1 for random"
        },
        num_images: {
          description: "Number of images to generate"
        },
        raw: {
          description: "Generate less processed, more natural results"
        },
        aspect_ratio: {
          description: "Aspect ratio for the generated image"
        },
        image_prompt_strength: {
          description: "Strength of image prompt influence (0-1)"
        }
      }
    },

    "fal-ai/flux-lora": {
      className: "FluxLora",
      docstring:
        "FLUX with LoRA support enables fine-tuned image generation using custom LoRA models for specific styles or subjects.",
      tags: [
        "image",
        "generation",
        "flux",
        "lora",
        "fine-tuning",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Generate images with custom artistic styles",
        "Create consistent characters across images",
        "Apply brand-specific visual styles",
        "Generate images with specialized subjects",
        "Combine multiple LoRA models for unique results"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        image_size: {
          description: "Size preset for the generated image"
        },
        num_inference_steps: {
          description: "Number of denoising steps"
        },
        guidance_scale: {
          description: "How strictly to follow the prompt"
        },
        loras: {
          description: "List of LoRA models to apply with their weights"
        },
        seed: {
          description: "Seed for reproducible results. Use -1 for random"
        },
        enable_safety_checker: {
          description: "Enable safety checker to filter unsafe content"
        }
      }
    },

    "fal-ai/ideogram/v2": {
      className: "IdeogramV2",
      docstring:
        "Ideogram V2 is a state-of-the-art image generation model optimized for commercial and creative use, featuring exceptional typography handling and realistic outputs.",
      tags: [
        "image",
        "generation",
        "ai",
        "typography",
        "realistic",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Create commercial artwork and designs",
        "Generate realistic product visualizations",
        "Design marketing materials with text",
        "Produce high-quality illustrations",
        "Create brand assets and logos"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        aspect_ratio: {
          description: "The aspect ratio of the generated image"
        },
        expand_prompt: {
          description:
            "Whether to expand the prompt with MagicPrompt functionality"
        },
        style: {
          description: "The style of the generated image"
        },
        negative_prompt: {
          description: "A negative prompt to avoid in the generated image"
        },
        seed: {
          description: "Seed for reproducible results. Use -1 for random"
        }
      }
    },

    "fal-ai/ideogram/v2/turbo": {
      className: "IdeogramV2Turbo",
      docstring:
        "Ideogram V2 Turbo offers faster image generation with the same exceptional quality and typography handling as V2.",
      tags: [
        "image",
        "generation",
        "ai",
        "typography",
        "realistic",
        "fast",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Rapidly generate commercial designs",
        "Quick iteration on marketing materials",
        "Fast prototyping of visual concepts",
        "Real-time design exploration",
        "Efficient batch generation of branded content"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        aspect_ratio: {
          description: "The aspect ratio of the generated image"
        },
        expand_prompt: {
          description:
            "Whether to expand the prompt with MagicPrompt functionality"
        },
        style: {
          description: "The style of the generated image"
        },
        negative_prompt: {
          description: "A negative prompt to avoid in the generated image"
        },
        seed: {
          description: "Seed for reproducible results. Use -1 for random"
        }
      }
    },

    "fal-ai/recraft-v3": {
      className: "RecraftV3",
      docstring:
        "Recraft V3 is a powerful image generation model with exceptional control over style and colors, ideal for brand consistency and design work.",
      tags: [
        "image",
        "generation",
        "design",
        "branding",
        "style",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Create brand-consistent visual assets",
        "Generate designs with specific color palettes",
        "Produce stylized illustrations and artwork",
        "Design marketing materials with brand colors",
        "Create cohesive visual content series"
      ],
      enumOverrides: { Style: "RecraftV3Style" },
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        image_size: {
          description: "Size preset for the generated image"
        },
        style: {
          description: "Visual style preset for the generated image"
        },
        colors: {
          description: "Specific color palette to use in the generation"
        },
        style_id: {
          description: "Custom style ID for brand-specific styles"
        }
      }
    },

    "fal-ai/stable-diffusion-v35-large": {
      className: "StableDiffusionV35Large",
      docstring:
        "Stable Diffusion 3.5 Large is a powerful open-weight model with excellent prompt adherence and diverse output capabilities.",
      tags: [
        "image",
        "generation",
        "stable-diffusion",
        "open-source",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Generate diverse artistic styles",
        "Create high-quality illustrations",
        "Produce photorealistic images",
        "Generate concept art and designs",
        "Create custom visual content"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        negative_prompt: {
          description: "Elements to avoid in the generated image"
        },
        aspect_ratio: {
          description: "The aspect ratio of the generated image"
        }
      }
    },

    "fal-ai/flux-pro/new": {
      className: "FluxProNew",
      docstring:
        "FLUX.1 Pro New is the latest version of the professional FLUX model with enhanced capabilities and improved output quality.",
      tags: [
        "image",
        "generation",
        "flux",
        "professional",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Generate professional-grade marketing visuals",
        "Create high-quality product renders",
        "Produce detailed architectural visualizations",
        "Design premium brand assets",
        "Generate photorealistic commercial imagery"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "Size preset for the generated image"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        }
      }
    },

    "fal-ai/flux-2/turbo": {
      className: "Flux2Turbo",
      docstring:
        "FLUX.2 Turbo is a blazing-fast image generation model optimized for speed without sacrificing quality, ideal for real-time applications.",
      tags: [
        "image",
        "generation",
        "flux",
        "fast",
        "turbo",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Real-time image generation for interactive apps",
        "Rapid prototyping of visual concepts",
        "Generate multiple variations instantly",
        "Live visual effects and augmented reality",
        "High-throughput batch image processing"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "Size preset for the generated image"
        },
        num_images: {
          description: "Number of images to generate"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        }
      }
    },

    "fal-ai/flux-2/flash": {
      className: "Flux2Flash",
      docstring:
        "FLUX.2 Flash is an ultra-fast variant of FLUX.2 designed for instant image generation with minimal latency.",
      tags: [
        "image",
        "generation",
        "flux",
        "ultra-fast",
        "flash",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Instant preview generation for user interfaces",
        "Real-time collaborative design tools",
        "Lightning-fast concept exploration",
        "High-speed batch processing",
        "Interactive gaming and entertainment applications"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "Size preset for the generated image"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        }
      }
    },

    "fal-ai/ideogram/v3": {
      className: "IdeogramV3",
      docstring:
        "Ideogram V3 is the latest generation with enhanced text rendering, superior image quality, and expanded creative controls.",
      tags: [
        "image",
        "generation",
        "ideogram",
        "typography",
        "text-rendering",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Create professional graphics with embedded text",
        "Design social media posts with perfect typography",
        "Generate logos and brand identities",
        "Produce marketing materials with text overlays",
        "Create educational content with clear text"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        aspect_ratio: {
          description: "The aspect ratio of the generated image"
        },
        style: {
          description: "The style preset for the generated image"
        },
        expand_prompt: {
          description: "Automatically enhance the prompt for better results"
        }
      }
    },

    "fal-ai/omnigen-v1": {
      className: "OmniGenV1",
      docstring:
        "OmniGen V1 is a versatile unified model for multi-modal image generation and editing with text, supporting complex compositional tasks.",
      tags: [
        "image",
        "generation",
        "multi-modal",
        "editing",
        "unified",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Generate images with multiple input modalities",
        "Edit existing images with text instructions",
        "Create complex compositional scenes",
        "Combine text and image inputs for generation",
        "Perform advanced image manipulations"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate or edit an image"
        },
        guidance_scale: {
          description: "How strictly to follow the prompt and inputs"
        },
        num_inference_steps: {
          description: "Number of denoising steps for generation quality"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        }
      }
    },

    "fal-ai/sana": {
      className: "Sana",
      docstring:
        "Sana is an efficient high-resolution image generation model that balances quality and speed for practical applications.",
      tags: [
        "image",
        "generation",
        "efficient",
        "high-resolution",
        "text-to-image",
        "txt2img"
      ],
      useCases: [
        "Generate high-resolution images efficiently",
        "Create detailed artwork with good performance",
        "Produce quality visuals with limited compute",
        "Generate images for web and mobile applications",
        "Balanced quality-speed image production"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to generate an image from"
        },
        negative_prompt: {
          description: "Elements to avoid in the generated image"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "Size preset for the generated image"
        },
        guidance_scale: {
          description: "How strictly to follow the prompt"
        },
        num_inference_steps: {
          description: "Number of denoising steps"
        }
      }
    },

    "fal-ai/hunyuan-image/v3/instruct/text-to-image": {
      className: "HunyuanImageV3InstructTextToImage",
      docstring:
        "Hunyuan Image v3 Instruct generates high-quality images from text with advanced instruction understanding.",
      tags: [
        "image",
        "generation",
        "hunyuan",
        "v3",
        "instruct",
        "text-to-image"
      ],
      useCases: [
        "Generate images with detailed instructions",
        "Create artwork with precise text control",
        "Produce high-quality visual content",
        "Generate images with advanced understanding",
        "Create professional visuals from text"
      ]
    },

    "fal-ai/qwen-image-max/text-to-image": {
      className: "QwenImageMaxTextToImage",
      docstring:
        "Qwen Image Max generates premium quality images from text with superior detail and accuracy.",
      tags: ["image", "generation", "qwen", "max", "premium", "text-to-image"],
      useCases: [
        "Generate premium quality images",
        "Create detailed artwork from text",
        "Produce high-fidelity visual content",
        "Generate professional-grade images",
        "Create superior quality visuals"
      ]
    },

    "fal-ai/qwen-image-2512": {
      className: "QwenImage2512",
      docstring:
        "Qwen Image 2512 generates high-resolution images from text with excellent quality and detail.",
      tags: [
        "image",
        "generation",
        "qwen",
        "2512",
        "high-resolution",
        "text-to-image"
      ],
      useCases: [
        "Generate high-resolution images",
        "Create detailed visual content",
        "Produce quality artwork from text",
        "Generate images with fine details",
        "Create high-quality visuals"
      ]
    },

    "fal-ai/qwen-image-2512/lora": {
      className: "QwenImage2512Lora",
      docstring:
        "Qwen Image 2512 with LoRA support enables custom-trained models for specialized image generation.",
      tags: ["image", "generation", "qwen", "2512", "lora", "custom"],
      useCases: [
        "Generate images with custom models",
        "Create specialized visual content",
        "Produce domain-specific artwork",
        "Generate images with fine-tuned models",
        "Create customized visuals"
      ]
    },

    "fal-ai/z-image/base": {
      className: "ZImageBase",
      docstring:
        "Z-Image Base generates quality images from text with efficient processing and good results.",
      tags: [
        "image",
        "generation",
        "z-image",
        "base",
        "efficient",
        "text-to-image"
      ],
      useCases: [
        "Generate images efficiently",
        "Create quality artwork from text",
        "Produce visual content quickly",
        "Generate images with good performance",
        "Create efficient visuals"
      ]
    },

    "fal-ai/z-image/base/lora": {
      className: "ZImageBaseLora",
      docstring:
        "Z-Image Base with LoRA enables efficient custom-trained models for specialized generation tasks.",
      tags: ["image", "generation", "z-image", "base", "lora", "custom"],
      useCases: [
        "Generate images with custom efficient models",
        "Create specialized content quickly",
        "Produce domain-specific visuals",
        "Generate with fine-tuned base model",
        "Create efficient custom visuals"
      ]
    },

    "fal-ai/z-image/turbo": {
      className: "ZImageTurbo",
      docstring:
        "Z-Image Turbo generates images from text with maximum speed for rapid iteration and prototyping.",
      tags: [
        "image",
        "generation",
        "z-image",
        "turbo",
        "fast",
        "text-to-image"
      ],
      useCases: [
        "Generate images at maximum speed",
        "Create rapid prototypes from text",
        "Produce quick visual iterations",
        "Generate images for fast workflows",
        "Create instant visual content"
      ]
    },

    "fal-ai/z-image/turbo/lora": {
      className: "ZImageTurboLora",
      docstring:
        "Z-Image Turbo with LoRA combines maximum speed with custom models for fast specialized generation.",
      tags: ["image", "generation", "z-image", "turbo", "lora", "fast"],
      useCases: [
        "Generate custom images at turbo speed",
        "Create specialized content rapidly",
        "Produce quick domain-specific visuals",
        "Generate with fast fine-tuned models",
        "Create instant custom visuals"
      ]
    },

    "fal-ai/flux-2/klein/4b": {
      className: "Flux2Klein4B",
      docstring:
        "FLUX-2 Klein 4B generates images with the efficient 4-billion parameter model for balanced quality and speed.",
      tags: ["image", "generation", "flux-2", "klein", "4b", "text-to-image"],
      useCases: [
        "Generate images with 4B model",
        "Create balanced quality-speed content",
        "Produce efficient visual artwork",
        "Generate images with good performance",
        "Create optimized visuals"
      ]
    },

    "fal-ai/flux-2/klein/4b/base": {
      className: "Flux2Klein4BBase",
      docstring:
        "FLUX-2 Klein 4B Base provides foundation model generation with 4-billion parameters.",
      tags: ["image", "generation", "flux-2", "klein", "4b", "base"],
      useCases: [
        "Generate with base 4B model",
        "Create foundation quality content",
        "Produce standard visual artwork",
        "Generate images with base model",
        "Create baseline visuals"
      ]
    },

    "fal-ai/flux-2/klein/4b/base/lora": {
      className: "Flux2Klein4BBaseLora",
      docstring:
        "FLUX-2 Klein 4B Base with LoRA enables custom-trained 4B models for specialized generation.",
      tags: ["image", "generation", "flux-2", "klein", "4b", "base", "lora"],
      useCases: [
        "Generate with custom 4B base model",
        "Create specialized foundation content",
        "Produce domain-specific visuals",
        "Generate with fine-tuned 4B model",
        "Create customized baseline visuals"
      ]
    },

    "fal-ai/flux-2/klein/9b": {
      className: "Flux2Klein9B",
      docstring:
        "FLUX-2 Klein 9B generates high-quality images with the powerful 9-billion parameter model.",
      tags: ["image", "generation", "flux-2", "klein", "9b", "text-to-image"],
      useCases: [
        "Generate high-quality images with 9B model",
        "Create superior visual content",
        "Produce detailed artwork",
        "Generate images with powerful model",
        "Create premium quality visuals"
      ]
    },

    "fal-ai/flux-2/klein/9b/base": {
      className: "Flux2Klein9BBase",
      docstring:
        "FLUX-2 Klein 9B Base provides foundation generation with the full 9-billion parameter model.",
      tags: ["image", "generation", "flux-2", "klein", "9b", "base"],
      useCases: [
        "Generate with base 9B model",
        "Create high-quality foundation content",
        "Produce superior baseline artwork",
        "Generate images with powerful base",
        "Create premium baseline visuals"
      ]
    },

    "fal-ai/flux-2/klein/9b/base/lora": {
      className: "Flux2Klein9BBaseLora",
      docstring:
        "FLUX-2 Klein 9B Base with LoRA combines powerful generation with custom-trained models.",
      tags: ["image", "generation", "flux-2", "klein", "9b", "base", "lora"],
      useCases: [
        "Generate with custom 9B base model",
        "Create specialized high-quality content",
        "Produce custom superior visuals",
        "Generate with fine-tuned 9B model",
        "Create advanced customized visuals"
      ]
    },

    "fal-ai/flux-2-max": {
      className: "Flux2Max",
      docstring:
        "FLUX-2 Max generates maximum quality images with the most advanced FLUX-2 model for premium results.",
      tags: [
        "image",
        "generation",
        "flux-2",
        "max",
        "premium",
        "text-to-image"
      ],
      useCases: [
        "Generate maximum quality images",
        "Create premium visual content",
        "Produce professional-grade artwork",
        "Generate images with best model",
        "Create superior quality visuals"
      ]
    },

    "fal-ai/glm-image": {
      className: "GlmImage",
      docstring:
        "GLM Image generates images from text with advanced AI understanding and quality output.",
      tags: ["image", "generation", "glm", "ai", "text-to-image"],
      useCases: [
        "Generate images with GLM AI",
        "Create intelligent visual content",
        "Produce AI-powered artwork",
        "Generate images with understanding",
        "Create smart visuals from text"
      ]
    },

    "fal-ai/gpt-image-1.5": {
      className: "GptImage15",
      docstring:
        "GPT Image 1.5 generates images from text with GPT-powered language understanding and visual creation.",
      tags: ["image", "generation", "gpt", "language-ai", "text-to-image"],
      useCases: [
        "Generate images with GPT understanding",
        "Create language-aware visual content",
        "Produce intelligent artwork",
        "Generate images with natural language",
        "Create GPT-powered visuals"
      ]
    },

    "wan/v2.6/text-to-image": {
      className: "WanV26TextToImage",
      docstring:
        "Wan v2.6 generates high-quality images from text with advanced capabilities and consistent results.",
      tags: ["image", "generation", "wan", "v2.6", "quality", "text-to-image"],
      useCases: [
        "Generate quality images with Wan v2.6",
        "Create consistent visual content",
        "Produce reliable artwork from text",
        "Generate images with advanced model",
        "Create high-quality visuals"
      ]
    },

    "fal-ai/longcat-image": {
      className: "LongcatImage",
      docstring:
        "Longcat Image generates creative and unique images from text with distinctive AI characteristics.",
      tags: ["image", "generation", "longcat", "creative", "text-to-image"],
      useCases: [
        "Generate creative images",
        "Create unique visual content",
        "Produce distinctive artwork",
        "Generate images with character",
        "Create artistic visuals"
      ]
    },

    "fal-ai/bytedance/seedream/v4.5/text-to-image": {
      className: "BytedanceSeedreamV45TextToImage",
      docstring:
        "ByteDance SeeDream v4.5 generates advanced images from text with cutting-edge AI technology.",
      tags: [
        "image",
        "generation",
        "bytedance",
        "seedream",
        "v4.5",
        "text-to-image"
      ],
      useCases: [
        "Generate images with SeeDream v4.5",
        "Create cutting-edge visual content",
        "Produce advanced AI artwork",
        "Generate images with latest tech",
        "Create modern AI visuals"
      ]
    },

    "fal-ai/vidu/q2/text-to-image": {
      className: "ViduQ2TextToImage",
      docstring:
        "Vidu Q2 generates quality images from text with optimized performance and consistent results.",
      tags: ["image", "generation", "vidu", "q2", "optimized", "text-to-image"],
      useCases: [
        "Generate optimized quality images",
        "Create consistent visual content",
        "Produce balanced artwork",
        "Generate images efficiently",
        "Create reliable visuals"
      ]
    },

    "imagineart/imagineart-1.5-pro-preview/text-to-image": {
      className: "ImagineartImagineart15ProPreviewTextToImage",
      docstring: "ImagineArt 1.5 Pro Preview",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "professional"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "bria/fibo-lite/generate": {
      className: "BriaFiboLiteGenerate",
      docstring: "Fibo Lite",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/ovis-image": {
      className: "OvisImage",
      docstring: "Ovis Image",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-2-lora-gallery/sepia-vintage": {
      className: "Flux2LoraGallerySepiaVintage",
      docstring: "Flux 2 Lora Gallery",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-2-lora-gallery/satellite-view-style": {
      className: "Flux2LoraGallerySatelliteViewStyle",
      docstring: "Flux 2 Lora Gallery",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-2-lora-gallery/realism": {
      className: "Flux2LoraGalleryRealism",
      docstring: "Flux 2 Lora Gallery",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-2-lora-gallery/hdr-style": {
      className: "Flux2LoraGalleryHdrStyle",
      docstring: "Flux 2 Lora Gallery",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-2-lora-gallery/digital-comic-art": {
      className: "Flux2LoraGalleryDigitalComicArt",
      docstring: "Flux 2 Lora Gallery",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-2-lora-gallery/ballpoint-pen-sketch": {
      className: "Flux2LoraGalleryBallpointPenSketch",
      docstring: "Flux 2 Lora Gallery",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-2-flex": {
      className: "Flux2Flex",
      docstring: "Flux 2 Flex",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/gemini-3-pro-image-preview": {
      className: "Gemini3ProImagePreview",
      docstring: "Gemini 3 Pro Image Preview",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "professional"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/nano-banana-pro": {
      className: "NanoBananaPro",
      docstring: "Nano Banana Pro",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "professional"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "imagineart/imagineart-1.5-preview/text-to-image": {
      className: "ImagineartImagineart15PreviewTextToImage",
      docstring: "Imagineart 1.5 Preview",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/emu-3.5-image/text-to-image": {
      className: "Emu35ImageTextToImage",
      docstring: "Emu 3.5 Image",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "bria/fibo/generate": {
      className: "BriaFiboGenerate",
      docstring: "Fibo",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/piflow": {
      className: "Piflow",
      docstring: "Piflow",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/gpt-image-1-mini": {
      className: "GptImage1Mini",
      docstring: "GPT Image 1 Mini",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/reve/text-to-image": {
      className: "ReveTextToImage",
      docstring: "Reve",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/hunyuan-image/v3/text-to-image": {
      className: "HunyuanImageV3TextToImage",
      docstring: "Hunyuan Image",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/wan-25-preview/text-to-image": {
      className: "Wan25PreviewTextToImage",
      docstring: "Wan 2.5 Text to Image",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux/srpo": {
      className: "FluxSrpo",
      docstring: "FLUX.1 SRPO [dev]",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-1/srpo": {
      className: "Flux1Srpo",
      docstring: "FLUX.1 SRPO [dev]",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/hunyuan-image/v2.1/text-to-image": {
      className: "HunyuanImageV21TextToImage",
      docstring: "Hunyuan Image",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/bytedance/seedream/v4/text-to-image": {
      className: "BytedanceSeedreamV4TextToImage",
      docstring: "Bytedance Seedream v4",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/gemini-25-flash-image": {
      className: "Gemini25FlashImage",
      docstring: "Gemini 2.5 Flash Image",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/nano-banana": {
      className: "NanoBanana",
      docstring: "Nano Banana",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/bytedance/dreamina/v3.1/text-to-image": {
      className: "BytedanceDreaminaV31TextToImage",
      docstring: "Bytedance",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/wan/v2.2-a14b/text-to-image/lora": {
      className: "WanV22A14BTextToImageLora",
      docstring: "Wan v2.2 A14B Text-to-Image A14B with LoRAs",
      tags: ["generation", "text-to-image", "txt2img", "ai-art", "lora"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/wan/v2.2-5b/text-to-image": {
      className: "WanV225BTextToImage",
      docstring: "Wan",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/wan/v2.2-a14b/text-to-image": {
      className: "WanV22A14BTextToImage",
      docstring: "Wan",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/qwen-image": {
      className: "QwenImage",
      docstring: "Qwen Image",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-krea-lora/stream": {
      className: "FluxKreaLoraStream",
      docstring: "Flux Krea Lora",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-krea-lora": {
      className: "FluxKreaLora",
      docstring: "FLUX.1 Krea [dev] with LoRAs",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux/krea": {
      className: "FluxKrea",
      docstring: "FLUX.1 Krea [dev]",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-1/krea": {
      className: "Flux1Krea",
      docstring: "FLUX.1 Krea [dev]",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/sky-raccoon": {
      className: "SkyRaccoon",
      docstring: "Sky Raccoon",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-kontext-lora/text-to-image": {
      className: "FluxKontextLoraTextToImage",
      docstring: "Flux Kontext Lora",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/omnigen-v2": {
      className: "OmnigenV2",
      docstring: "Omnigen V2",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/bytedance/seedream/v3/text-to-image": {
      className: "BytedanceSeedreamV3TextToImage",
      docstring: "Bytedance",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-1/schnell": {
      className: "Flux1Schnell",
      docstring:
        "Fastest inference in the world for the 12 billion parameter FLUX.1 [schnell] text-to-image model. ",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-1/dev": {
      className: "Flux1Dev",
      docstring:
        "FLUX.1 [dev] is a 12 billion parameter flow transformer that generates high-quality images from text. It is suitable for personal and commercial use. ",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-pro/kontext/max/text-to-image": {
      className: "FluxProKontextMaxTextToImage",
      docstring:
        "FLUX.1 Kontext [max] text-to-image is a new premium model brings maximum performance across all aspects – greatly improved prompt adherence.",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-pro/kontext/text-to-image": {
      className: "FluxProKontextTextToImage",
      docstring:
        "The FLUX.1 Kontext [pro] text-to-image delivers state-of-the-art image generation results with unprecedented prompt following, photorealistic rendering, and flawless typography.",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/bagel": {
      className: "Bagel",
      docstring:
        "Bagel is a 7B parameter from Bytedance-Seed multimodal model that can generate both text and images.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/imagen4/preview/ultra": {
      className: "Imagen4PreviewUltra",
      docstring: "Google's highest quality image generation model",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/dreamo": {
      className: "Dreamo",
      docstring:
        "DreamO is an image customization framework designed to support a wide range of tasks while facilitating seamless integration of multiple conditions.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-lora/stream": {
      className: "FluxLoraStream",
      docstring:
        "Super fast endpoint for the FLUX.1 [dev] model with LoRA support, enabling rapid and high-quality image generation using pre-trained LoRA adaptations for personalization, specific styles, brand identities, and product-specific outputs.",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/minimax/image-01": {
      className: "MinimaxImage01",
      docstring:
        "Generate high quality images from text prompts using MiniMax Image-01. Longer text prompts will result in better quality images.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/pony-v7": {
      className: "PonyV7",
      docstring:
        "Pony V7 is a finetuned text to image for superior aesthetics and prompt following.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/f-lite/standard": {
      className: "FLiteStandard",
      docstring:
        "F Lite is a 10B parameter diffusion model created by Fal and Freepik, trained exclusively on copyright-safe and SFW content.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/f-lite/texture": {
      className: "FLiteTexture",
      docstring:
        "F Lite is a 10B parameter diffusion model created by Fal and Freepik, trained exclusively on copyright-safe and SFW content. This is a high texture density variant of the model.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/gpt-image-1/text-to-image": {
      className: "GptImage1TextToImage",
      docstring:
        "OpenAI's latest image generation and editing model: gpt-1-image.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/sana/v1.5/1.6b": {
      className: "SanaV1516b",
      docstring:
        "Sana v1.5 1.6B is a lightweight text-to-image model that delivers 4K image generation with impressive efficiency.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/sana/v1.5/4.8b": {
      className: "SanaV1548b",
      docstring:
        "Sana v1.5 4.8B is a powerful text-to-image model that generates ultra-high quality 4K images with remarkable detail.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/sana/sprint": {
      className: "SanaSprint",
      docstring:
        "Sana Sprint is a text-to-image model capable of generating 4K images with exceptional speed.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "rundiffusion-fal/juggernaut-flux-lora": {
      className: "RundiffusionFalJuggernautFluxLora",
      docstring:
        "Juggernaut Base Flux LoRA by RunDiffusion is a drop-in replacement for Flux [Dev] that delivers sharper details, richer colors, and enhanced realism to all your LoRAs and LyCORIS with full compatibility.",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "rundiffusion-fal/juggernaut-flux/base": {
      className: "RundiffusionFalJuggernautFluxBase",
      docstring:
        "Juggernaut Base Flux by RunDiffusion is a drop-in replacement for Flux [Dev] that delivers sharper details, richer colors, and enhanced realism, while instantly boosting LoRAs and LyCORIS with full compatibility.",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "rundiffusion-fal/juggernaut-flux/lightning": {
      className: "RundiffusionFalJuggernautFluxLightning",
      docstring:
        "Juggernaut Lightning Flux by RunDiffusion provides blazing-fast, high-quality images rendered at five times the speed of Flux. Perfect for mood boards and mass ideation, this model excels in both realism and prompt adherence.",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "rundiffusion-fal/juggernaut-flux/pro": {
      className: "RundiffusionFalJuggernautFluxPro",
      docstring:
        "Juggernaut Pro Flux by RunDiffusion is the flagship Juggernaut model rivaling some of the most advanced image models available, often surpassing them in realism. It combines Juggernaut Base with RunDiffusion Photo and features enhancements like reduced background blurriness.",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "rundiffusion-fal/rundiffusion-photo-flux": {
      className: "RundiffusionFalRundiffusionPhotoFlux",
      docstring:
        "RunDiffusion Photo Flux provides insane realism. With this enhancer, textures and skin details burst to life, turning your favorite prompts into vivid, lifelike creations. Recommended to keep it at 0.65 to 0.80 weight. Supports resolutions up to 1536x1536.",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/cogview4": {
      className: "Cogview4",
      docstring:
        "Generate high quality images from text prompts using CogView4. Longer text prompts will result in better quality images.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/ideogram/v2a": {
      className: "IdeogramV2a",
      docstring:
        "Generate high-quality images, posters, and logos with Ideogram V2A. Features exceptional typography handling and realistic outputs optimized for commercial and creative use.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/ideogram/v2a/turbo": {
      className: "IdeogramV2aTurbo",
      docstring:
        "Accelerated image generation with Ideogram V2A Turbo. Create high-quality visuals, posters, and logos with enhanced speed while maintaining Ideogram's signature quality.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art", "fast"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-control-lora-canny": {
      className: "FluxControlLoraCanny",
      docstring:
        "FLUX Control LoRA Canny is a high-performance endpoint that uses a control image to transfer structure to the generated image, using a Canny edge map.",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-control-lora-depth": {
      className: "FluxControlLoraDepth",
      docstring:
        "FLUX Control LoRA Depth is a high-performance endpoint that uses a control image to transfer structure to the generated image, using a depth map.",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/imagen3/fast": {
      className: "Imagen3Fast",
      docstring:
        "Imagen3 Fast is a high-quality text-to-image model that generates realistic images from text prompts.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art", "fast"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/imagen3": {
      className: "Imagen3",
      docstring:
        "Imagen3 is a high-quality text-to-image model that generates realistic images from text prompts.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/lumina-image/v2": {
      className: "LuminaImageV2",
      docstring:
        "Lumina-Image-2.0 is a 2 billion parameter flow-based diffusion transforer which features improved performance in image quality, typography, complex prompt understanding, and resource-efficiency.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/janus": {
      className: "Janus",
      docstring:
        "DeepSeek Janus-Pro is a novel text-to-image model that unifies multimodal understanding and generation through an autoregressive framework",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-pro/v1.1-ultra-finetuned": {
      className: "FluxProV11UltraFinetuned",
      docstring:
        "FLUX1.1 [pro] ultra fine-tuned is the newest version of FLUX1.1 [pro] with a fine-tuned LoRA, maintaining professional-grade image quality while delivering up to 2K resolution with improved photo realism.",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/switti": {
      className: "Switti",
      docstring:
        "Switti is a scale-wise transformer for fast text-to-image generation that outperforms existing T2I AR models and competes with state-of-the-art T2I diffusion models while being faster than distilled diffusion models.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/switti/512": {
      className: "Switti512",
      docstring:
        "Switti is a scale-wise transformer for fast text-to-image generation that outperforms existing T2I AR models and competes with state-of-the-art T2I diffusion models while being faster than distilled diffusion models.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/bria/text-to-image/base": {
      className: "BriaTextToImageBase",
      docstring:
        "Bria's Text-to-Image model, trained exclusively on licensed data for safe and risk-free commercial use. Available also as source code and weights. For access to weights: https://bria.ai/contact-us",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/bria/text-to-image/fast": {
      className: "BriaTextToImageFast",
      docstring:
        "Bria's Text-to-Image model with perfect harmony of latency and quality. Trained exclusively on licensed data for safe and risk-free commercial use. Available also as source code and weights. For access to weights: https://bria.ai/contact-us",
      tags: ["generation", "text-to-image", "txt2img", "ai-art", "fast"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/bria/text-to-image/hd": {
      className: "BriaTextToImageHd",
      docstring:
        "Bria's Text-to-Image model for HD images. Trained exclusively on licensed data for safe and risk-free commercial use. Available also as source code and weights. For access to weights: https://bria.ai/contact-us",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/recraft-20b": {
      className: "Recraft20b",
      docstring: "Recraft 20b is a new and affordable text-to-image model.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/luma-photon/flash": {
      className: "LumaPhotonFlash",
      docstring:
        "Generate images from your prompts using Luma Photon Flash. Photon Flash is the most creative, personalizable, and intelligent visual models for creatives, bringing a step-function change in the cost of high-quality image generation.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/aura-flow": {
      className: "AuraFlow",
      docstring:
        "AuraFlow v0.3 is an open-source flow-based text-to-image generation model that achieves state-of-the-art results on GenEval. The model is currently in beta.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/stable-diffusion-v35-medium": {
      className: "StableDiffusionV35Medium",
      docstring:
        "Stable Diffusion 3.5 Medium is a Multimodal Diffusion Transformer (MMDiT) text-to-image model that features improved performance in image quality, typography, complex prompt understanding, and resource-efficiency.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-lora/inpainting": {
      className: "FluxLoraInpainting",
      docstring:
        "Super fast endpoint for the FLUX.1 [dev] inpainting model with LoRA support, enabling rapid and high-quality image inpaingting using pre-trained LoRA adaptations for personalization, specific styles, brand identities, and product-specific outputs.",
      tags: [
        "flux",
        "generation",
        "text-to-image",
        "txt2img",
        "ai-art",
        "lora"
      ],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/stable-diffusion-v3-medium": {
      className: "StableDiffusionV3Medium",
      docstring:
        "Stable Diffusion 3 Medium (Text to Image) is a Multimodal Diffusion Transformer (MMDiT) model that improves image quality, typography, prompt understanding, and efficiency.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/fooocus/upscale-or-vary": {
      className: "FooocusUpscaleOrVary",
      docstring:
        "Default parameters with automated optimizations and quality improvements.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/pixart-sigma": {
      className: "PixartSigma",
      docstring:
        "Weak-to-Strong Training of Diffusion Transformer for 4K Text-to-Image Generation",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/flux-subject": {
      className: "FluxSubject",
      docstring:
        "Super fast endpoint for the FLUX.1 [schnell] model with subject input capabilities, enabling rapid and high-quality image generation for personalization, specific styles, brand identities, and product-specific outputs.",
      tags: ["flux", "generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/sdxl-controlnet-union": {
      className: "SdxlControlnetUnion",
      docstring: "An efficent SDXL multi-controlnet text-to-image model.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/kolors": {
      className: "Kolors",
      docstring: "Photorealistic Text-to-Image",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/stable-cascade": {
      className: "StableCascade",
      docstring:
        "Stable Cascade: Image generation on a smaller & cheaper latent space.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/fast-sdxl": {
      className: "FastSdxl",
      docstring: "Run SDXL at the speed of light",
      tags: ["generation", "text-to-image", "txt2img", "ai-art", "fast"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/stable-cascade/sote-diffusion": {
      className: "StableCascadeSoteDiffusion",
      docstring: "Anime finetune of Würstchen V3.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/lightning-models": {
      className: "LightningModels",
      docstring: "Collection of SDXL Lightning models.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/playground-v25": {
      className: "PlaygroundV25",
      docstring: "State-of-the-art open-source model in aesthetic quality",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/realistic-vision": {
      className: "RealisticVision",
      docstring: "Generate realistic images.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/dreamshaper": {
      className: "Dreamshaper",
      docstring: "Dreamshaper model.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/stable-diffusion-v15": {
      className: "StableDiffusionV15",
      docstring: "Stable Diffusion v1.5",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/fast-lightning-sdxl": {
      className: "FastLightningSdxl",
      docstring: "Run SDXL at the speed of light",
      tags: ["generation", "text-to-image", "txt2img", "ai-art", "fast"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/fast-fooocus-sdxl/image-to-image": {
      className: "FastFooocusSdxlImageToImage",
      docstring: "Fooocus extreme speed mode as a standalone app.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art", "fast"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/fast-sdxl-controlnet-canny": {
      className: "FastSdxlControlnetCanny",
      docstring: "Generate Images with ControlNet.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art", "fast"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/fast-lcm-diffusion": {
      className: "FastLcmDiffusion",
      docstring: "Run SDXL at the speed of light",
      tags: ["generation", "text-to-image", "txt2img", "ai-art", "fast"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/fast-fooocus-sdxl": {
      className: "FastFooocusSdxl",
      docstring: "Fooocus extreme speed mode as a standalone app.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art", "fast"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/illusion-diffusion": {
      className: "IllusionDiffusion",
      docstring: "Create illusions conditioned on image.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/fooocus/image-prompt": {
      className: "FooocusImagePrompt",
      docstring:
        "Default parameters with automated optimizations and quality improvements.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/fooocus/inpaint": {
      className: "FooocusInpaint",
      docstring:
        "Default parameters with automated optimizations and quality improvements.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/lcm": {
      className: "Lcm",
      docstring: "Produce high-quality images with minimal inference steps.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/kling-image/o3/text-to-image": {
      className: "KlingImageO3TextToImage",
      docstring:
        "Kling Image O3 generates high-quality images from text prompts with refined detail.",
      tags: ["image", "generation", "kling", "o3", "text-to-image", "txt2img"],
      useCases: [
        "Generate images from detailed text prompts",
        "Create high-fidelity concept art",
        "Produce marketing visuals from descriptions",
        "Generate creative illustrations from ideas",
        "Create polished images for presentations"
      ]
    },

    "fal-ai/fooocus": {
      className: "Fooocus",
      docstring:
        "Default parameters with automated optimizations and quality improvements.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },

    "fal-ai/lora": {
      className: "Lora",
      docstring:
        "Run Any Stable Diffusion model with customizable LoRA weights.",
      tags: ["generation", "text-to-image", "txt2img", "ai-art", "lora"],
      useCases: [
        "AI-powered art generation",
        "Marketing and advertising visuals",
        "Concept art and ideation",
        "Social media content creation",
        "Rapid prototyping and mockups"
      ]
    },
    "fal-ai/ernie-image": {
      className: "ErnieImage",
      docstring: "ERNIE Image text-to-image generation by Baidu.",
      tags: ["generation", "text-to-image", "txt2img", "ernie", "baidu"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ernie-image/lora": {
      className: "ErnieImageLora",
      docstring: "ERNIE Image with LoRA weights.",
      tags: ["generation", "text-to-image", "txt2img", "ernie", "lora"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ernie-image/lora/turbo": {
      className: "ErnieImageLoraTurbo",
      docstring: "ERNIE Image Turbo with LoRA weights.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "ernie",
        "lora",
        "turbo"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ernie-image/turbo": {
      className: "ErnieImageTurbo",
      docstring: "ERNIE Image Turbo: faster ERNIE text-to-image generation.",
      tags: ["generation", "text-to-image", "txt2img", "ernie", "turbo"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/nucleus-image": {
      className: "NucleusImage",
      docstring: "Nucleus Image text-to-image model.",
      tags: ["generation", "text-to-image", "txt2img", "nucleus"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/nano-banana-2": {
      className: "NanoBanana2",
      docstring: "Nano Banana 2 text-to-image generation.",
      tags: ["generation", "text-to-image", "txt2img", "nano-banana"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/flux-2-pro": {
      className: "Flux2Pro",
      docstring: "FLUX.2 Pro text-to-image generation.",
      tags: ["generation", "text-to-image", "txt2img", "flux", "flux-2"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "openai/gpt-image-2": {
      className: "GptImage2",
      docstring: "OpenAI GPT Image 2 text-to-image generation.",
      tags: ["generation", "text-to-image", "txt2img", "openai", "gpt-image"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ],
      fieldOverrides: {
        image_size: {
          customSizeConstraints: {
            maxEdge: 3840,
            maxPixels: 8_294_400,
            multipleOf: 16
          }
        }
      }
    },
    "imagineart/imagineart-2.0-preview/text-to-image": {
      className: "ImagineartImagineart20PreviewTextToImage",
      docstring: "ImagineArt 2.0 Preview text-to-image.",
      tags: ["generation", "text-to-image", "txt2img", "imagineart"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ideogram/custom-models/generate": {
      className: "IdeogramCustomModelsGenerate",
      docstring: "Generate images with a custom-trained Ideogram model.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "ideogram",
        "custom-model"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "bria/fibo-bbq-preview/generate": {
      className: "FiboBbqPreviewGenerate",
      docstring:
        "A preview to the next level of control of Text-to-Image models.",
      tags: ["generation", "text-to-image", "txt2img", "bria", "fibo", "bbq"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "bytedance/seedream/v5/lite/text-to-image": {
      className: "SeedreamV5LiteTextToImage",
      docstring:
        "Text to Image endpoint for the fast Lite version of Seedream 5.0, supporting high quality intelligent text-to-image generation.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "bytedance",
        "seedream",
        "v5"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "bytedance/seedream/v5/pro/text-to-image": {
      className: "SeedreamV5ProTextToImage",
      docstring:
        "ByteDance's Seedream 5.0 Pro is flagship text-to-image model, with deep-thinking prompt understanding, native text in 14 languages, and precise control over dense layouts and structured designs.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "bytedance",
        "seedream",
        "v5",
        "pro"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/bitdance": {
      className: "Bitdance",
      docstring:
        "Image generation with BitDance. Fast, high-resolution photorealistic images using an autoregressive LLM— for efficient, high-quality results.",
      tags: ["generation", "text-to-image", "txt2img", "bitdance"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/boogu-image": {
      className: "BooguImage",
      docstring: "Text To Image Model using Boogu-Image",
      tags: ["generation", "text-to-image", "txt2img", "boogu"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/flux-2/klein/4b/lora": {
      className: "Flux2Klein4bLora",
      docstring:
        "Text-to-image generation with FLUX.2 [klein] 4B from Black Forest Labs and custom LoRA. Enhanced realism, crisper text generation, and native editing capabilities.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "flux",
        "klein",
        "4b",
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
    "fal-ai/flux-2/klein/9b/lora": {
      className: "Flux2Klein9bLora",
      docstring:
        "Text-to-image generation with FLUX.2 [klein] 9B from Black Forest Labs and custom LoRA.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "flux",
        "klein",
        "9b",
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
    "fal-ai/gemini-3.1-flash-image-preview": {
      className: "Gemini31FlashImagePreview",
      docstring:
        "Gemini 3.1 Flash Image (a.k.a Nano Banana 2) is Google's new state-of-the-art fast image generation and editing model",
      tags: ["generation", "text-to-image", "txt2img", "gemini", "flash"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/hidream-o1-image": {
      className: "HidreamO1Image",
      docstring:
        "Unified image generation with HiDream-O1-Image. Create, edit, and personalize high-resolution images up to 2K—single native model handles text-to-image, editing, and custom subjects without external components.",
      tags: ["generation", "text-to-image", "txt2img", "hidream", "o1"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/hidream-o1-image/dev": {
      className: "HidreamO1ImageDev",
      docstring:
        "Unified image generation with HiDream-O1-Image. Create, edit, and personalize high-resolution images up to 2K—single native model handles text-to-image, editing, and custom subjects without external components.",
      tags: ["generation", "text-to-image", "txt2img", "hidream", "o1", "dev"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ideogram/v3/generate-transparent": {
      className: "IdeogramV3GenerateTransparent",
      docstring:
        "Generate images with transparent backgrounds using Ideogram Transparent model",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "ideogram",
        "transparent"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/kling-image/v3/text-to-image": {
      className: "KlingImageV3TextToImage",
      docstring: "Kling V3: Latest Kling Image model",
      tags: ["generation", "text-to-image", "txt2img", "kling"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/krea-2/turbo": {
      className: "Krea2Turbo",
      docstring:
        "Generate high-fidelity images from text in seconds with Krea 2 Turbo, the speed-optimized open-source version of Krea 2, preserving its aesthetic range for rapid ideation.",
      tags: ["generation", "text-to-image", "txt2img", "krea", "turbo"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/krea-2/turbo/lora": {
      className: "Krea2TurboLora",
      docstring:
        "Generate high-fidelity images from text with Krea 2 using a custom-trained LoRA. Apply your LoRA weights to carry a learned subject, character, or style into new generations, with aspect ratio, creativity, and seed controls.",
      tags: ["generation", "text-to-image", "txt2img", "krea", "turbo", "lora"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/krea-2/turbo/style": {
      className: "Krea2TurboStyle",
      docstring:
        "Generate high-fidelity images from text with Krea 2 using a style reference image. Apply a reference image to guide the visual style into new generations, with aspect ratio, creativity, and seed controls.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "krea",
        "turbo",
        "style"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/patina/material": {
      className: "PatinaMaterial",
      docstring:
        "Generate complete seamlessly tiling PBR materials including normal, roughness, basecolor, height and metalness maps up to 8K",
      tags: ["generation", "text-to-image", "txt2img", "patina", "material"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/phota": {
      className: "Phota",
      docstring:
        "Phota's model empowers developers, photographers, and creators with personalized photograph generation and editing.",
      tags: ["generation", "text-to-image", "txt2img", "phota"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/qwen-image-2/pro/text-to-image": {
      className: "QwenImage2ProTextToImage",
      docstring:
        "Qwen-Image-2.0 is a next-generation foundational unified generation-and-editing model",
      tags: ["generation", "text-to-image", "txt2img", "qwen", "pro"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/qwen-image-2/text-to-image": {
      className: "QwenImage2TextToImage",
      docstring:
        "Qwen-Image-2.0 is a next-generation foundational unified generation-and-editing model",
      tags: ["generation", "text-to-image", "txt2img", "qwen"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/recraft/v4.1/pro/text-to-image": {
      className: "RecraftV41ProTextToImage",
      docstring:
        "Recraft V4.1 Pro pushes the V4.1 model into high-resolution territory — up to 2048×2048 and ultra-wide formats. Made for hero imagery, campaign work, and print, it preserves the same design taste at sizes ready for the final deliverable.",
      tags: ["generation", "text-to-image", "txt2img", "recraft", "v4", "pro"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/recraft/v4.1/pro/text-to-vector": {
      className: "RecraftV41ProTextToVector",
      docstring:
        "Recraft V4.1 Pro Vector generates large-format, fully editable SVGs with the structural clarity professional illustrators expect. Built for poster art, complex brand assets, and detailed scene illustration, it scales without losing geome...",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "recraft",
        "v4",
        "pro",
        "vector"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/recraft/v4.1/text-to-image": {
      className: "RecraftV41TextToImage",
      docstring:
        "Recraft V4.1 builds on the design-first foundation of V4 with sharper prompt control and cleaner composition. Tuned for brand systems and editorial work, it delivers production-ready raster images that hold up next to a designer's hand.",
      tags: ["generation", "text-to-image", "txt2img", "recraft", "v4"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/recraft/v4.1/text-to-vector": {
      className: "RecraftV41TextToVector",
      docstring:
        "Recraft V4.1 Vector turns prompts into fully editable SVGs with structured layers and clean geometry. Built for logos, icons, and illustration systems, it produces artwork that goes straight from generation into Figma or Illustrator.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "recraft",
        "v4",
        "vector"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/recraft/v4.1/utility/pro/text-to-image": {
      className: "RecraftV41UtilityProTextToImage",
      docstring:
        "Recraft V4.1 Utility Pro pairs the high-resolution output of V4.1 Pro with a faster, cost-efficient runtime. Designed for studios shipping large-format work at scale, it makes premium-quality raster generation viable across full creative...",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "recraft",
        "v4",
        "utility",
        "pro"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/recraft/v4.1/utility/text-to-image": {
      className: "RecraftV41UtilityTextToImage",
      docstring:
        "Recraft V4.1 Utility is a faster, lighter variant of V4.1 made for high-volume creative workflows. Ideal for ideation, A/B exploration, and content pipelines, it keeps Recraft's design sensibility while optimizing for throughput and cost.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "recraft",
        "v4",
        "utility"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/recraft/v4/pro/text-to-image": {
      className: "RecraftV4ProTextToImage",
      docstring:
        "Recraft V4 was developed with designers to bring true visual taste to AI image generation. Built for brand systems and production-ready workflows, it goes beyond prompt accuracy — delivering stronger composition, refined lighting, realis...",
      tags: ["generation", "text-to-image", "txt2img", "recraft", "v4", "pro"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/recraft/v4/pro/text-to-vector": {
      className: "RecraftV4ProTextToVector",
      docstring:
        "Recraft V4 was developed with designers to bring true visual taste to AI image generation. Built for brand systems and production-ready workflows, it goes beyond prompt accuracy — delivering stronger composition, refined lighting, realis...",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "recraft",
        "v4",
        "pro",
        "vector"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/recraft/v4/text-to-image": {
      className: "RecraftV4TextToImage",
      docstring:
        "Recraft V4 was developed with designers to bring true visual taste to AI image generation. Built for brand systems and production-ready workflows, it goes beyond prompt accuracy delivering stronger composition, refined lighting, realisti...",
      tags: ["generation", "text-to-image", "txt2img", "recraft", "v4"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/recraft/v4/text-to-vector": {
      className: "RecraftV4TextToVector",
      docstring:
        "Recraft V4 was developed with designers to bring true visual taste to AI image generation. Built for brand systems and production-ready workflows, it goes beyond prompt accuracy — delivering stronger composition, refined lighting, realis...",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "recraft",
        "v4",
        "vector"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/sensenova-u1-infographic": {
      className: "SensenovaU1Infographic",
      docstring: "Generate Infographic Image with Sensenova U1",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "sensenova",
        "u1",
        "infographic"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/vecglypher": {
      className: "Vecglypher",
      docstring:
        "Vector font generation with VecGlypher. Create custom glyphs from text descriptions or reference images—outputs clean SVG paths directly without raster-to-vector conversion.",
      tags: ["generation", "text-to-image", "txt2img", "vecglypher"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/wan/v2.7/pro/text-to-image": {
      className: "WanV27ProTextToImage",
      docstring:
        "Generate premium-quality images from text prompts using the enhanced WAN 2.7 Pro model with superior detail and composition.",
      tags: ["generation", "text-to-image", "txt2img", "wan", "pro"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/wan/v2.7/text-to-image": {
      className: "WanV27TextToImage",
      docstring:
        "Generate high-quality images from text prompts using the WAN 2.7 model with advanced prompt understanding and detailed output.",
      tags: ["generation", "text-to-image", "txt2img", "wan"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/z-image/turbo/tiling": {
      className: "ZImageTurboTiling",
      docstring:
        "Generate seamlessly tiling photorealistic images from text using Z-Image Turbo",
      tags: ["generation", "text-to-image", "txt2img", "turbo", "tiling"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/z-image/turbo/tiling/lora": {
      className: "ZImageTurboTilingLora",
      docstring:
        "Generate seamlessly tiling photorealistic images from text using Z-Image Turbo and custom LoRA",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "turbo",
        "tiling",
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
    "google/nano-banana-2-lite": {
      className: "NanoBanana2Lite",
      docstring:
        "Nano banana lite is the efficiency-focused model in the image generation family. Sub-2 second latency with cost-effective generation and editing, fast multi-turn local edits, and 14 supported aspect ratios.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "google",
        "nano",
        "banana"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "google/nano-banana-lite": {
      className: "NanoBananaLite",
      docstring:
        "Nano banana lite is the efficiency-focused model in the image generation family. Sub-2 second latency with cost-effective generation and editing, fast multi-turn local edits, and 14 supported aspect ratios.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "google",
        "nano",
        "banana"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "ideogram/v4": {
      className: "IdeogramV4",
      docstring:
        "Generate high-quality images, posters, and logos with Ideogram's latest V4.0q — producing crisp visuals with accurate text rendering, fine detail, and full creative control for polished, ready-to-use designs.",
      tags: ["generation", "text-to-image", "txt2img", "ideogram", "v4"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "ideogram/v4/fast": {
      className: "IdeogramV4Fast",
      docstring:
        "Generate high-quality images, posters, and logos with Ideogram's latest V4.0q — producing crisp visuals with accurate text rendering, fine detail, and full creative control for polished, ready-to-use designs IN A SECOND.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "ideogram",
        "v4",
        "fast"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "ideogram/v4/instant": {
      className: "IdeogramV4Instant",
      docstring:
        "Generate high-quality images, posters, and logos with Ideogram's latest V4.0q — producing crisp visuals with accurate text rendering, fine detail, and full creative control for polished, ready-to-use designs FRACTION OF A SECOND.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "ideogram",
        "v4",
        "instant"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "ideogram/v4/lora": {
      className: "IdeogramV4Lora",
      docstring:
        "Generate high-quality images, posters, and logos with Ideogram's latest V4.0q using LoRA — producing crisp visuals with accurate text rendering, fine detail, and full creative control for polished, ready-to-use designs.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "ideogram",
        "v4",
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
    "krea/v2/large/text-to-image": {
      className: "KreaV2LargeTextToImage",
      docstring:
        "Generate high-fidelity images from text with Krea 2 Large, supporting aspect ratio, creativity, seed controls, and optional style references.",
      tags: ["generation", "text-to-image", "txt2img", "krea", "large"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "krea/v2/medium/text-to-image": {
      className: "KreaV2MediumTextToImage",
      docstring:
        "Generate high-quality images from text with Krea 2 Medium, supporting aspect ratio, creativity controls, seeds, and optional style references.",
      tags: ["generation", "text-to-image", "txt2img", "krea", "medium"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "krea/v2/medium/turbo/text-to-image": {
      className: "KreaV2MediumTurboTextToImage",
      docstring:
        "Generate high-fidelity images extremely fast from text with Krea 2 Medium Turbo, supporting aspect ratio, creativity, seed controls, and optional style references.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "krea",
        "medium",
        "turbo"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "luma/agent/uni-1/v1/max": {
      className: "LumaAgentUni1V1Max",
      docstring:
        "Luma Uni-1 Max generates a single image at the model's highest fidelity, delivering richer detail and stronger prompt adherence than the base tier for hero-quality stills.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "luma",
        "agent",
        "uni",
        "max"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "luma/agent/uni-1/v1/text-to-image": {
      className: "LumaAgentUni1V1TextToImage",
      docstring:
        "Luma Uni-1 turns a text prompt into a single high-fidelity image, with control over aspect ratio and visual style, plus optional web-sourced and reference-image guidance for sharper grounding.",
      tags: ["generation", "text-to-image", "txt2img", "luma", "agent", "uni"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "microsoft/mai-image-2.5": {
      className: "MaiImage25",
      docstring:
        "MAI-Image-2.5 is Microsoft's photorealistic image generation and editing model that turns text prompts or uploaded images into high-quality, design-ready visuals with fine-grained, pixel-level control.",
      tags: ["generation", "text-to-image", "txt2img", "microsoft", "mai"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "nvidia/cosmos-3-super/text-to-image": {
      className: "Cosmos3SuperTextToImage",
      docstring:
        "Cosmos3 is a collection of Omnimodal world models capable of generating dynamic, high-quality video, image, audio, and action commands from combinations of text, image, video, and action trajectory inputs.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "nvidia",
        "cosmos",
        "super"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "reve/2.1/text-to-image": {
      className: "Reve21TextToImage",
      docstring:
        "Generate high-quality images from text prompts with strong prompt adherence, layout intelligence, and accurate text rendering using Reve 2.1.",
      tags: ["generation", "text-to-image", "txt2img", "reve"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "xai/grok-imagine-image": {
      className: "GrokImagineImage",
      docstring:
        "Generate highly aesthetic images with xAI's Grok Imagine Image generation model.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "xai",
        "grok",
        "imagine"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "xai/grok-imagine-image/quality/text-to-image": {
      className: "GrokImagineImageQualityTextToImage",
      docstring:
        "Grok Imagine Pro is an advanced AI model from xAI that creates high-quality visuals from text prompts and allows you to edit or analyze existing images.",
      tags: [
        "generation",
        "text-to-image",
        "txt2img",
        "xai",
        "grok",
        "imagine",
        "quality"
      ],
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
