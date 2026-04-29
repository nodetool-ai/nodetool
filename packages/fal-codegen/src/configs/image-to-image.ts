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
      ] as [string, string][],
      description: "Preset sizes for image generation"
    }
  },
  configs: {
    // FLUX Redux Family - Style Transfer
    "fal-ai/flux/schnell/redux": {
      className: "FluxSchnellRedux",
      docstring:
        "FLUX.1 [schnell] Redux enables rapid transformation of existing images with high-quality style transfers and modifications using the fast FLUX.1 schnell model.",
      tags: [
        "image",
        "transformation",
        "style-transfer",
        "fast",
        "flux",
        "redux"
      ],
      useCases: [
        "Transform images with artistic style transfers",
        "Apply quick modifications to photos",
        "Create image variations for rapid iteration",
        "Generate stylized versions of existing images",
        "Produce fast image transformations"
      ],
      fieldOverrides: {
        image: {
          description: "The input image to transform"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "The size of the generated image"
        },
        num_inference_steps: {
          default: 4,
          description: "The number of inference steps to perform (1-50)"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        },
        enable_safety_checker: {
          description: "Enable safety checker to filter unsafe content"
        },
        num_images: {
          description: "The number of images to generate (1-4)"
        },
        output_format: {
          description: "Output format (jpeg or png)"
        },
        acceleration: {
          description: "Acceleration speed: 'none', 'regular', or 'high'"
        }
      },
      enumOverrides: {
        ImageSize: "ImageSizePreset"
      },
      basicFields: ["image", "image_size", "num_inference_steps"]
    },

    "fal-ai/flux/dev/redux": {
      className: "FluxDevRedux",
      docstring:
        "FLUX.1 [dev] Redux provides advanced image transformation capabilities with superior quality and more control over the style transfer process.",
      tags: [
        "image",
        "transformation",
        "style-transfer",
        "development",
        "flux",
        "redux"
      ],
      useCases: [
        "Transform images with advanced quality controls",
        "Create customized image variations with guidance",
        "Apply precise style modifications",
        "Generate high-quality artistic transformations",
        "Produce refined image edits with better prompt adherence"
      ],
      fieldOverrides: {
        image: {
          description: "The input image to transform"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "The size of the generated image"
        },
        num_inference_steps: {
          default: 28,
          description: "The number of inference steps to perform (1-50)"
        },
        guidance_scale: {
          description: "How strictly to follow the image structure (1-20)"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        },
        enable_safety_checker: {
          description: "Enable safety checker to filter unsafe content"
        },
        num_images: {
          description: "The number of images to generate (1-4)"
        },
        output_format: {
          description: "Output format (jpeg or png)"
        }
      },
      enumOverrides: {
        ImageSize: "ImageSizePreset"
      },
      basicFields: ["image", "image_size", "guidance_scale"]
    },

    "fal-ai/flux-pro/v1/redux": {
      className: "FluxProRedux",
      docstring:
        "FLUX.1 Pro Redux delivers professional-grade image transformations with the highest quality and safety controls for commercial use.",
      tags: [
        "image",
        "transformation",
        "style-transfer",
        "professional",
        "flux",
        "redux"
      ],
      useCases: [
        "Create professional-quality image transformations",
        "Apply commercial-grade style transfers",
        "Generate high-fidelity image variations",
        "Produce brand-safe image modifications",
        "Transform images for production use"
      ],
      fieldOverrides: {
        image: {
          description: "The input image to transform"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "The size of the generated image"
        },
        num_inference_steps: {
          default: 28,
          description: "The number of inference steps to perform (1-50)"
        },
        guidance_scale: {
          description: "How strictly to follow the image structure (1-20)"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        },
        safety_tolerance: {
          description: "Safety tolerance level (1-6, higher is stricter)"
        },
        num_images: {
          description: "The number of images to generate (1-4)"
        },
        output_format: {
          description: "Output format (jpeg or png)"
        }
      },
      enumOverrides: {
        ImageSize: "ImageSizePreset"
      },
      basicFields: ["image", "image_size", "guidance_scale"]
    },

    // Ideogram Family - Editing
    "fal-ai/ideogram/v2/edit": {
      className: "IdeogramV2Edit",
      docstring:
        "Transform existing images with Ideogram V2's editing capabilities. Modify, adjust, and refine images while maintaining high fidelity with precise prompt and mask control.",
      tags: [
        "image",
        "editing",
        "inpainting",
        "mask",
        "ideogram",
        "transformation"
      ],
      useCases: [
        "Edit specific parts of images with precision",
        "Create targeted image modifications using masks",
        "Refine and enhance image details",
        "Generate contextual image edits",
        "Replace or modify masked regions"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to fill the masked part of the image"
        },
        image: {
          description: "The image to edit"
        },
        mask: {
          description:
            "The mask defining areas to edit (white = edit, black = keep)"
        },
        style: {
          description:
            "Style of generated image (auto, general, realistic, design, render_3D, anime)"
        },
        expand_prompt: {
          description:
            "Whether to expand the prompt with MagicPrompt functionality"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        }
      },
      basicFields: ["prompt", "image", "mask"]
    },

    "fal-ai/ideogram/v2/remix": {
      className: "IdeogramV2Remix",
      docstring:
        "Reimagine existing images with Ideogram V2's remix feature. Create variations and adaptations while preserving core elements through prompt guidance and strength control.",
      tags: [
        "image",
        "remix",
        "variation",
        "creativity",
        "ideogram",
        "adaptation"
      ],
      useCases: [
        "Create artistic variations of images",
        "Generate style-transferred versions",
        "Produce creative image adaptations",
        "Transform images while preserving key elements",
        "Generate alternative interpretations"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to remix the image with"
        },
        image: {
          description: "The image to remix"
        },
        aspect_ratio: {
          description: "The aspect ratio of the generated image"
        },
        strength: {
          description:
            "Strength of the input image in the remix (0-1, higher = more variation)"
        },
        expand_prompt: {
          description:
            "Whether to expand the prompt with MagicPrompt functionality"
        },
        style: {
          description:
            "Style of generated image (auto, general, realistic, design, render_3D, anime)"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        }
      },
      basicFields: ["prompt", "image", "strength"]
    },

    "fal-ai/ideogram/v3/edit": {
      className: "IdeogramV3Edit",
      docstring:
        "Transform images with Ideogram V3's enhanced editing capabilities. Latest generation editing with improved quality, control, and style consistency.",
      tags: ["image", "editing", "inpainting", "mask", "ideogram", "v3"],
      useCases: [
        "Edit images with the latest Ideogram technology",
        "Apply high-fidelity masked edits",
        "Generate professional image modifications",
        "Create precise content-aware fills",
        "Refine image details with advanced controls"
      ],
      fieldOverrides: {
        prompt: {
          description: "The prompt to fill the masked part of the image"
        },
        image: {
          description: "The image to edit"
        },
        mask: {
          description:
            "The mask defining areas to edit (white = edit, black = keep)"
        },
        style: {
          description: "Style of generated image"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        }
      },
      basicFields: ["prompt", "image", "mask"]
    },

    // FLUX Pro Family - Advanced Controls
    "fal-ai/flux-pro/v1/fill": {
      className: "FluxProFill",
      docstring:
        "FLUX.1 Pro Fill provides professional inpainting and outpainting capabilities. Generate or modify image content within masked regions with precise prompt control.",
      tags: [
        "image",
        "inpainting",
        "outpainting",
        "fill",
        "flux",
        "professional"
      ],
      useCases: [
        "Fill masked regions with new content",
        "Extend images beyond their boundaries (outpainting)",
        "Remove unwanted objects and fill gaps",
        "Generate content-aware image expansions",
        "Create seamless image modifications"
      ],
      fieldOverrides: {
        prompt: {
          description:
            "The prompt describing what to generate in the masked area"
        },
        image: {
          description: "The image to fill"
        },
        mask: {
          description:
            "The mask defining areas to fill (white = fill, black = keep)"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "The size of the generated image"
        },
        num_inference_steps: {
          description: "The number of inference steps to perform"
        },
        guidance_scale: {
          description: "How strictly to follow the prompt"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        },
        safety_tolerance: {
          description: "Safety tolerance level (1-6, higher is stricter)"
        }
      },
      enumOverrides: {
        ImageSize: "ImageSizePreset"
      },
      basicFields: ["prompt", "image", "mask"]
    },

    "fal-ai/flux-pro/v1/canny": {
      className: "FluxProCanny",
      docstring:
        "FLUX.1 Pro with Canny edge detection control. Generate images guided by edge maps for precise structural control while maintaining FLUX's quality.",
      tags: ["image", "controlnet", "canny", "edges", "flux", "professional"],
      useCases: [
        "Generate images following edge structures",
        "Transform images while preserving edges",
        "Create controlled variations with edge guidance",
        "Apply style transfers with structural constraints",
        "Generate content from edge maps"
      ],
      fieldOverrides: {
        prompt: {
          description: "The text prompt describing the desired output"
        },
        image: {
          description:
            "The control image (edges will be detected automatically)"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "The size of the generated image"
        },
        num_inference_steps: {
          description: "The number of inference steps to perform"
        },
        guidance_scale: {
          description: "How strictly to follow the prompt"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        },
        control_strength: {
          description: "How strongly to follow the edge structure (0-1)"
        }
      },
      enumOverrides: {
        ImageSize: "ImageSizePreset"
      },
      basicFields: ["prompt", "image", "control_strength"]
    },

    "fal-ai/flux-pro/v1/depth": {
      className: "FluxProDepth",
      docstring:
        "FLUX.1 Pro with depth map control. Generate images guided by depth information for precise 3D structure control while maintaining FLUX's quality.",
      tags: ["image", "controlnet", "depth", "3d", "flux", "professional"],
      useCases: [
        "Generate images following depth structures",
        "Transform images while preserving 3D composition",
        "Create controlled variations with depth guidance",
        "Apply style transfers with spatial constraints",
        "Generate content from depth maps"
      ],
      fieldOverrides: {
        prompt: {
          description: "The text prompt describing the desired output"
        },
        image: {
          description:
            "The control image (depth will be estimated automatically)"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",
          default: "landscape_4_3",
          description: "The size of the generated image"
        },
        num_inference_steps: {
          description: "The number of inference steps to perform"
        },
        guidance_scale: {
          description: "How strictly to follow the prompt"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        },
        control_strength: {
          description: "How strongly to follow the depth structure (0-1)"
        }
      },
      enumOverrides: {
        ImageSize: "ImageSizePreset"
      },
      basicFields: ["prompt", "image", "control_strength"]
    },

    // Bria Family - Professional Editing Tools
    "bria/eraser": {
      className: "BriaEraser",
      docstring:
        "Bria Eraser removes unwanted objects from images using intelligent inpainting. Seamlessly fill removed areas with contextually appropriate content.",
      tags: ["image", "eraser", "removal", "inpainting", "bria", "cleanup"],
      useCases: [
        "Remove unwanted objects from photos",
        "Clean up image backgrounds",
        "Erase text or watermarks",
        "Delete distracting elements",
        "Create clean product shots"
      ],
      fieldOverrides: {
        image: {
          description: "The image containing objects to remove"
        },
        mask: {
          description:
            "The mask defining areas to erase (white = erase, black = keep)"
        }
      },
      basicFields: ["image", "mask"]
    },

    "bria/replace-background": {
      className: "BriaBackgroundReplace",
      docstring:
        "Bria Background Replace swaps image backgrounds with new content. Intelligently separates subjects and generates contextually appropriate backgrounds.",
      tags: ["image", "background", "replacement", "segmentation", "bria"],
      useCases: [
        "Replace photo backgrounds with custom scenes",
        "Create product shots with various backgrounds",
        "Change image context while preserving subject",
        "Generate professional portraits with studio backgrounds",
        "Create marketing materials with branded backgrounds"
      ],
      fieldOverrides: {
        image: {
          description: "The image whose background to replace"
        },
        prompt: {
          description: "Description of the new background to generate"
        }
      },
      basicFields: ["image", "prompt"]
    },

    // Enhancement/Upscaling
    "fal-ai/clarity-upscaler": {
      className: "ClarityUpscaler",
      docstring:
        "Clarity Upscaler increases image resolution using AI-powered super-resolution. Enhance image quality, sharpness, and detail up to 4x scale.",
      tags: [
        "image",
        "upscaling",
        "enhancement",
        "super-resolution",
        "clarity"
      ],
      useCases: [
        "Increase image resolution for printing",
        "Improve clarity of low-quality images",
        "Enhance textures and fine details",
        "Prepare images for large displays",
        "Restore detail in compressed images"
      ],
      fieldOverrides: {
        image: {
          description: "Input image to upscale"
        },
        scale: {
          default: 2,
          description: "Upscaling factor (1-4x)"
        }
      },
      basicFields: ["image", "scale"]
    },

    // Alternative Model Families
    "fal-ai/recraft/v3/image-to-image": {
      className: "RecraftV3ImageToImage",
      docstring:
        "Recraft V3 transforms images with advanced style control and quality preservation. Professional-grade image-to-image generation with fine-tuned artistic control.",
      tags: ["image", "transformation", "recraft", "style", "professional"],
      useCases: [
        "Transform images with precise style control",
        "Create high-quality image variations",
        "Apply artistic modifications with consistency",
        "Generate professional design alternatives",
        "Produce style-coherent image transformations"
      ],
      enumOverrides: {
        Style: "RecraftV3ImageToImageStyle"
      },
      fieldOverrides: {
        prompt: {
          description: "The text prompt describing the desired transformation"
        },
        image: {
          description: "The input image to transform"
        },
        style: {
          description: "The artistic style to apply"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        }
      },
      basicFields: ["prompt", "image", "style"]
    },

    "fal-ai/kolors/image-to-image": {
      className: "KolorsImageToImage",
      docstring:
        "Kolors transforms images using an advanced diffusion model. High-quality image-to-image generation with natural color preservation and detail retention.",
      tags: ["image", "transformation", "kolors", "diffusion", "quality"],
      useCases: [
        "Transform images with natural color handling",
        "Create variations with preserved color harmony",
        "Apply modifications with detail retention",
        "Generate style transfers with color consistency",
        "Produce high-fidelity image transformations"
      ],
      fieldOverrides: {
        prompt: {
          description: "The text prompt describing the desired transformation"
        },
        image: {
          description: "The input image to transform"
        },
        strength: {
          description:
            "Strength of the transformation (0-1, higher = more change)"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        }
      },
      basicFields: ["prompt", "image", "strength"]
    },

    // Specialized Tools
    "fal-ai/birefnet": {
      className: "BiRefNet",
      docstring:
        "BiRefNet (Bilateral Reference Network) performs high-quality background removal with precise edge detection and detail preservation.",
      tags: ["image", "background-removal", "segmentation", "birefnet", "mask"],
      useCases: [
        "Remove backgrounds from product photos",
        "Create transparent PNGs from images",
        "Extract subjects for compositing",
        "Generate clean cutouts for design work",
        "Prepare images for background replacement"
      ],
      fieldOverrides: {
        image: {
          description: "The image to remove background from"
        }
      },
      basicFields: ["image"]
    },

    "fal-ai/codeformer": {
      className: "CodeFormer",
      docstring:
        "CodeFormer restores and enhances face quality in images. Advanced face restoration with fidelity control for natural-looking results.",
      tags: [
        "image",
        "face-restoration",
        "enhancement",
        "codeformer",
        "quality"
      ],
      useCases: [
        "Restore quality in degraded face photos",
        "Enhance facial details in low-quality images",
        "Improve portrait quality for professional use",
        "Fix compressed or damaged face images",
        "Enhance facial features while maintaining identity"
      ],
      fieldOverrides: {
        image: {
          description: "The image containing faces to restore"
        },
        fidelity: {
          description: "Fidelity level (0-1, higher = more faithful to input)"
        }
      },
      basicFields: ["image", "fidelity"]
    },

    // Hunyuan Image Family
    "fal-ai/hunyuan-image/v3/instruct/edit": {
      className: "HunyuanImageV3InstructEdit",
      docstring:
        "Hunyuan Image v3 Instruct Edit allows precise image editing through natural language instructions with advanced understanding.",
      tags: ["image", "editing", "hunyuan", "instruct", "ai-editing"],
      useCases: [
        "Edit images using natural language instructions",
        "Modify specific elements in photos with text commands",
        "Apply precise adjustments through conversational editing",
        "Transform images with instruction-based control",
        "Create variations with detailed text guidance"
      ],
      basicFields: ["image", "prompt"]
    },

    // Qwen Image Family - Max Edit
    "fal-ai/qwen-image-max/edit": {
      className: "QwenImageMaxEdit",
      docstring:
        "Qwen Image Max Edit provides powerful image editing capabilities with advanced AI understanding and high-quality results.",
      tags: ["image", "editing", "qwen", "max", "ai-editing"],
      useCases: [
        "Edit images with advanced AI understanding",
        "Apply complex modifications to photos",
        "Transform images with high-quality results",
        "Create professional edits with natural prompts",
        "Modify images with precise control"
      ],
      basicFields: ["image", "prompt"]
    },

    // Qwen Image Family - 2511 Series
    "fal-ai/qwen-image-edit-2511": {
      className: "QwenImageEdit2511",
      docstring:
        "Qwen Image Edit 2511 provides state-of-the-art image editing with latest AI advancements and improved quality.",
      tags: ["image", "editing", "qwen", "2511", "latest"],
      useCases: [
        "Edit images with latest Qwen technology",
        "Apply advanced modifications to photos",
        "Create high-quality edits with AI assistance",
        "Transform images with cutting-edge models",
        "Produce professional image modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/qwen-image-edit-2511/lora": {
      className: "QwenImageEdit2511Lora",
      docstring:
        "Qwen Image Edit 2511 with LoRA support enables custom-trained models for specialized editing tasks.",
      tags: ["image", "editing", "qwen", "lora", "custom"],
      useCases: [
        "Edit images with custom-trained models",
        "Apply specialized modifications using LoRA",
        "Create domain-specific edits",
        "Transform images with fine-tuned models",
        "Produce customized image modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/qwen-image-edit-2511-multiple-angles": {
      className: "QwenImageEdit2511MultipleAngles",
      docstring:
        "Qwen Image Edit 2511 Multiple Angles generates images from different viewpoints based on a single input image.",
      tags: ["image", "editing", "qwen", "multi-angle", "viewpoint"],
      useCases: [
        "Generate multiple viewpoints from single image",
        "Create product views from different angles",
        "Visualize objects from various perspectives",
        "Produce multi-angle image sets",
        "Transform images to show different sides"
      ],
      basicFields: ["image", "prompt"]
    },

    // Qwen Image Family - 2509 Series
    "fal-ai/qwen-image-edit-2509": {
      className: "QwenImageEdit2509",
      docstring:
        "Qwen Image Edit 2509 provides powerful image editing with advanced AI capabilities and high-quality output.",
      tags: ["image", "editing", "qwen", "2509", "ai-editing"],
      useCases: [
        "Edit images with Qwen 2509 technology",
        "Apply sophisticated modifications to photos",
        "Create quality edits with AI assistance",
        "Transform images with advanced models",
        "Produce professional image changes"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/qwen-image-edit-2509-lora": {
      className: "QwenImageEdit2509Lora",
      docstring:
        "Qwen Image Edit 2509 with LoRA enables fine-tuned models for specialized image editing applications.",
      tags: ["image", "editing", "qwen", "lora", "fine-tuned"],
      useCases: [
        "Edit images with fine-tuned models",
        "Apply custom modifications using LoRA",
        "Create specialized edits for specific domains",
        "Transform images with trained models",
        "Produce tailored image modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    // Qwen Image Layered
    "fal-ai/qwen-image-layered": {
      className: "QwenImageLayered",
      docstring:
        "Qwen Image Layered provides layer-based image editing for complex compositions and precise control.",
      tags: ["image", "editing", "qwen", "layered", "composition"],
      useCases: [
        "Edit images with layer-based control",
        "Create complex compositions",
        "Apply modifications to specific layers",
        "Build multi-layer image edits",
        "Produce sophisticated image compositions"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/qwen-image-layered/lora": {
      className: "QwenImageLayeredLora",
      docstring:
        "Qwen Image Layered with LoRA combines layer-based editing with custom-trained models for specialized tasks.",
      tags: ["image", "editing", "qwen", "layered", "lora"],
      useCases: [
        "Edit layered images with custom models",
        "Create specialized layer compositions",
        "Apply fine-tuned modifications",
        "Build complex edits with trained models",
        "Produce custom layer-based results"
      ],
      basicFields: ["image", "prompt"]
    },

    // FLUX-2 Klein Family - Base Edit
    "fal-ai/flux-2/klein/4b/base/edit": {
      className: "Flux2Klein4BBaseEdit",
      docstring:
        "FLUX-2 Klein 4B Base Edit provides fast image editing with the 4-billion parameter model.",
      tags: ["image", "editing", "flux-2", "klein", "4b"],
      useCases: [
        "Edit images with FLUX-2 Klein 4B",
        "Apply fast modifications to photos",
        "Create quick edits with AI assistance",
        "Transform images efficiently",
        "Produce rapid image modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/flux-2/klein/4b/base/edit/lora": {
      className: "Flux2Klein4BBaseEditLora",
      docstring:
        "FLUX-2 Klein 4B Base Edit with LoRA enables custom-trained models for specialized editing.",
      tags: ["image", "editing", "flux-2", "klein", "4b", "lora"],
      useCases: [
        "Edit images with custom FLUX-2 models",
        "Apply specialized modifications using LoRA",
        "Create domain-specific edits",
        "Transform images with fine-tuned 4B model",
        "Produce customized modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/flux-2/klein/9b/base/edit": {
      className: "Flux2Klein9BBaseEdit",
      docstring:
        "FLUX-2 Klein 9B Base Edit provides high-quality image editing with the 9-billion parameter model.",
      tags: ["image", "editing", "flux-2", "klein", "9b"],
      useCases: [
        "Edit images with FLUX-2 Klein 9B",
        "Apply high-quality modifications to photos",
        "Create advanced edits with powerful AI",
        "Transform images with superior quality",
        "Produce professional image modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/flux-2/klein/9b/base/edit/lora": {
      className: "Flux2Klein9BBaseEditLora",
      docstring:
        "FLUX-2 Klein 9B Base Edit with LoRA combines powerful editing with custom-trained models.",
      tags: ["image", "editing", "flux-2", "klein", "9b", "lora"],
      useCases: [
        "Edit images with custom 9B models",
        "Apply specialized high-quality modifications",
        "Create professional custom edits",
        "Transform images with fine-tuned powerful model",
        "Produce advanced customized results"
      ],
      basicFields: ["image", "prompt"]
    },

    // FLUX-2 Klein Family - Standard Edit
    "fal-ai/flux-2/klein/4b/edit": {
      className: "Flux2Klein4BEdit",
      docstring:
        "FLUX-2 Klein 4B Edit provides efficient image editing with the streamlined 4-billion parameter model.",
      tags: ["image", "editing", "flux-2", "klein", "4b", "efficient"],
      useCases: [
        "Edit images efficiently with FLUX-2",
        "Apply quick modifications to photos",
        "Create fast edits for rapid workflows",
        "Transform images with streamlined model",
        "Produce quick image modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/flux-2/klein/9b/edit": {
      className: "Flux2Klein9BEdit",
      docstring:
        "FLUX-2 Klein 9B Edit provides advanced image editing with the full 9-billion parameter model.",
      tags: ["image", "editing", "flux-2", "klein", "9b", "advanced"],
      useCases: [
        "Edit images with advanced FLUX-2 model",
        "Apply sophisticated modifications",
        "Create high-quality edits",
        "Transform images with powerful AI",
        "Produce superior image modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    // FLUX-2 Other Variants
    "fal-ai/flux-2/flash/edit": {
      className: "Flux2FlashEdit",
      docstring:
        "FLUX-2 Flash Edit provides ultra-fast image editing for rapid iteration and quick modifications.",
      tags: ["image", "editing", "flux-2", "flash", "ultra-fast"],
      useCases: [
        "Edit images with ultra-fast processing",
        "Apply instant modifications to photos",
        "Create rapid edits for quick turnaround",
        "Transform images at maximum speed",
        "Produce instant image modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/flux-2/turbo/edit": {
      className: "Flux2TurboEdit",
      docstring:
        "FLUX-2 Turbo Edit provides accelerated image editing with balanced quality and speed.",
      tags: ["image", "editing", "flux-2", "turbo", "fast"],
      useCases: [
        "Edit images with turbo speed",
        "Apply fast modifications with good quality",
        "Create quick edits efficiently",
        "Transform images rapidly",
        "Produce fast quality modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/flux-2-max/edit": {
      className: "Flux2MaxEdit",
      docstring:
        "FLUX-2 Max Edit provides maximum quality image editing with the most advanced FLUX-2 model.",
      tags: ["image", "editing", "flux-2", "max", "premium"],
      useCases: [
        "Edit images with maximum quality",
        "Apply premium modifications to photos",
        "Create professional-grade edits",
        "Transform images with best quality",
        "Produce highest quality modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/flux-2-flex/edit": {
      className: "Flux2FlexEdit",
      docstring:
        "FLUX-2 Flex Edit provides flexible image editing with customizable parameters and versatile control.",
      tags: ["image", "editing", "flux-2", "flex", "versatile"],
      useCases: [
        "Edit images with flexible controls",
        "Apply customizable modifications",
        "Create versatile edits",
        "Transform images with adaptable settings",
        "Produce flexible image modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    // FLUX-2 LoRA Gallery
    "fal-ai/flux-2-lora-gallery/virtual-tryon": {
      className: "Flux2LoraGalleryVirtualTryon",
      docstring:
        "FLUX-2 LoRA Gallery Virtual Try-on enables realistic clothing and accessory visualization on people.",
      tags: ["image", "editing", "flux-2", "virtual-tryon", "fashion"],
      useCases: [
        "Visualize clothing on models",
        "Try on accessories virtually",
        "Create fashion previews",
        "Test product appearances",
        "Generate try-on images"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/flux-2-lora-gallery/multiple-angles": {
      className: "Flux2LoraGalleryMultipleAngles",
      docstring:
        "FLUX-2 LoRA Gallery Multiple Angles generates images from different viewpoints for comprehensive visualization.",
      tags: ["image", "editing", "flux-2", "multi-angle", "viewpoint"],
      useCases: [
        "Generate multiple product angles",
        "Create viewpoint variations",
        "Visualize objects from different sides",
        "Produce multi-angle image sets",
        "Generate comprehensive views"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/flux-2-lora-gallery/face-to-full-portrait": {
      className: "Flux2LoraGalleryFaceToFullPortrait",
      docstring:
        "FLUX-2 LoRA Gallery Face to Full Portrait expands face crops into complete portrait images.",
      tags: ["image", "editing", "flux-2", "portrait", "expansion"],
      useCases: [
        "Expand face crops to full portraits",
        "Generate complete portrait from face",
        "Create full-body images from headshots",
        "Extend facial images to portraits",
        "Produce complete portrait compositions"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/flux-2-lora-gallery/add-background": {
      className: "Flux2LoraGalleryAddBackground",
      docstring:
        "FLUX-2 LoRA Gallery Add Background places subjects in new environments with realistic integration.",
      tags: ["image", "editing", "flux-2", "background", "compositing"],
      useCases: [
        "Add backgrounds to cutout images",
        "Place subjects in new environments",
        "Create realistic background compositions",
        "Generate contextual settings",
        "Produce integrated background images"
      ],
      basicFields: ["image", "prompt"]
    },

    // Bria FIBO Edit Suite
    "bria/fibo-edit/edit": {
      className: "BriaFiboEdit",
      docstring:
        "Bria FIBO Edit provides general-purpose image editing with AI-powered modifications and enhancements.",
      tags: ["image", "editing", "bria", "fibo", "general"],
      useCases: [
        "Edit images with general-purpose AI",
        "Apply various modifications to photos",
        "Create edited versions of images",
        "Transform images with flexible edits",
        "Produce AI-powered modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "bria/fibo-edit/add_object_by_text": {
      className: "BriaFiboEditAddObjectByText",
      docstring:
        "Bria FIBO Edit Add Object by Text inserts new objects into images using text descriptions.",
      tags: ["image", "editing", "bria", "fibo", "object-insertion"],
      useCases: [
        "Add objects to images with text",
        "Insert elements using descriptions",
        "Place new items in scenes",
        "Augment images with additional objects",
        "Generate object additions"
      ],
      basicFields: ["image", "prompt"]
    },

    "bria/fibo-edit/erase_by_text": {
      className: "BriaFiboEditEraseByText",
      docstring:
        "Bria FIBO Edit Erase by Text removes objects from images using natural language descriptions.",
      tags: ["image", "editing", "bria", "fibo", "object-removal"],
      useCases: [
        "Remove objects using text descriptions",
        "Erase unwanted elements from photos",
        "Clean up images by describing what to remove",
        "Delete specific items from scenes",
        "Remove objects with natural language"
      ],
      basicFields: ["image", "prompt"]
    },

    "bria/fibo-edit/replace_object_by_text": {
      className: "BriaFiboEditReplaceObjectByText",
      docstring:
        "Bria FIBO Edit Replace Object by Text replaces objects in images with new ones specified by text.",
      tags: ["image", "editing", "bria", "fibo", "object-replacement"],
      useCases: [
        "Replace objects using text descriptions",
        "Swap elements in photos",
        "Change specific items in scenes",
        "Transform objects with text guidance",
        "Substitute objects with new ones"
      ],
      basicFields: ["image", "prompt"]
    },

    "bria/fibo-edit/blend": {
      className: "BriaFiboEditBlend",
      docstring:
        "Bria FIBO Edit Blend seamlessly combines multiple images or elements with natural transitions.",
      tags: ["image", "editing", "bria", "fibo", "blending"],
      useCases: [
        "Blend multiple images together",
        "Create seamless compositions",
        "Merge elements naturally",
        "Combine images with smooth transitions",
        "Generate blended composites"
      ],
      basicFields: ["image", "prompt"]
    },

    "bria/fibo-edit/colorize": {
      className: "BriaFiboEditColorize",
      docstring:
        "Bria FIBO Edit Colorize adds realistic colors to grayscale or black-and-white images.",
      tags: ["image", "editing", "bria", "fibo", "colorization"],
      useCases: [
        "Colorize black and white photos",
        "Add colors to grayscale images",
        "Restore color in old photographs",
        "Transform monochrome to color",
        "Generate colored versions of grayscale images"
      ],
      basicFields: ["image"]
    },

    "bria/fibo-edit/restore": {
      className: "BriaFiboEditRestore",
      docstring:
        "Bria FIBO Edit Restore repairs and enhances damaged or degraded images with AI reconstruction.",
      tags: ["image", "editing", "bria", "fibo", "restoration"],
      useCases: [
        "Restore damaged photographs",
        "Repair degraded images",
        "Enhance old photo quality",
        "Fix scratches and artifacts",
        "Reconstruct missing image parts"
      ],
      basicFields: ["image"]
    },

    "bria/fibo-edit/restyle": {
      className: "BriaFiboEditRestyle",
      docstring:
        "Bria FIBO Edit Restyle transforms images with artistic style transfers and visual aesthetics.",
      tags: ["image", "editing", "bria", "fibo", "style-transfer"],
      useCases: [
        "Apply artistic styles to images",
        "Transform photos with new aesthetics",
        "Create stylized versions of images",
        "Generate artistic variations",
        "Produce style-transferred images"
      ],
      basicFields: ["image", "prompt"]
    },

    "bria/fibo-edit/relight": {
      className: "BriaFiboEditRelight",
      docstring:
        "Bria FIBO Edit Relight adjusts lighting conditions in images for dramatic or natural effects.",
      tags: ["image", "editing", "bria", "fibo", "relighting"],
      useCases: [
        "Adjust lighting in photos",
        "Change illumination conditions",
        "Create dramatic lighting effects",
        "Relight scenes for better ambiance",
        "Transform lighting in images"
      ],
      basicFields: ["image", "prompt"]
    },

    "bria/fibo-edit/reseason": {
      className: "BriaFiboEditReseason",
      docstring:
        "Bria FIBO Edit Reseason changes the seasonal appearance of outdoor scenes in images.",
      tags: ["image", "editing", "bria", "fibo", "seasonal"],
      useCases: [
        "Change seasons in outdoor photos",
        "Transform summer to winter scenes",
        "Modify seasonal appearance",
        "Create seasonal variations",
        "Generate different season versions"
      ],
      basicFields: ["image", "prompt"]
    },

    "bria/fibo-edit/rewrite_text": {
      className: "BriaFiboEditRewriteText",
      docstring:
        "Bria FIBO Edit Rewrite Text modifies or replaces text content within images naturally.",
      tags: ["image", "editing", "bria", "fibo", "text-editing"],
      useCases: [
        "Change text in images",
        "Replace written content in photos",
        "Modify signs and labels",
        "Update text naturally in scenes",
        "Edit textual elements in images"
      ],
      basicFields: ["image", "prompt"]
    },

    "bria/fibo-edit/sketch_to_colored_image": {
      className: "BriaFiboEditSketchToColoredImage",
      docstring:
        "Bria FIBO Edit Sketch to Colored Image transforms sketches and line art into full-color images.",
      tags: ["image", "editing", "bria", "fibo", "sketch-to-image"],
      useCases: [
        "Convert sketches to colored images",
        "Transform line art to full color",
        "Generate colored versions of drawings",
        "Create realistic images from sketches",
        "Produce colored artwork from outlines"
      ],
      basicFields: ["image", "prompt"]
    },

    // GLM Image
    "fal-ai/glm-image/image-to-image": {
      className: "GlmImageImageToImage",
      docstring:
        "GLM Image image-to-image transforms and modifies images using advanced AI understanding.",
      tags: ["image", "transformation", "glm", "ai-editing"],
      useCases: [
        "Transform images with GLM AI",
        "Apply modifications using advanced understanding",
        "Create variations with GLM model",
        "Generate modified versions",
        "Produce AI-powered transformations"
      ],
      basicFields: ["image", "prompt"]
    },

    // GPT Image
    "fal-ai/gpt-image-1.5/edit": {
      className: "GptImage15Edit",
      docstring:
        "GPT Image 1.5 Edit provides intelligent image editing with GPT-powered understanding and control.",
      tags: ["image", "editing", "gpt", "intelligent", "ai-editing"],
      useCases: [
        "Edit images with GPT intelligence",
        "Apply smart modifications to photos",
        "Create intelligent edits",
        "Transform images with language understanding",
        "Produce GPT-powered modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    // Z-Image Turbo Family
    "fal-ai/z-image/turbo/image-to-image": {
      className: "ZImageTurboImageToImage",
      docstring:
        "Z-Image Turbo image-to-image provides fast image transformations with quality output.",
      tags: ["image", "transformation", "z-image", "turbo", "fast"],
      useCases: [
        "Transform images quickly with Z-Image",
        "Apply fast modifications to photos",
        "Create rapid image variations",
        "Generate speedy transformations",
        "Produce quick image modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/z-image/turbo/image-to-image/lora": {
      className: "ZImageTurboImageToImageLora",
      docstring:
        "Z-Image Turbo image-to-image with LoRA enables fast custom-trained model transformations.",
      tags: ["image", "transformation", "z-image", "turbo", "lora"],
      useCases: [
        "Transform images with custom Z-Image models",
        "Apply fast specialized modifications",
        "Create rapid custom edits",
        "Generate quick customized transformations",
        "Produce fast fine-tuned modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/z-image/turbo/inpaint": {
      className: "ZImageTurboInpaint",
      docstring:
        "Z-Image Turbo Inpaint fills masked regions in images quickly with contextually appropriate content.",
      tags: ["image", "inpainting", "z-image", "turbo", "fast"],
      useCases: [
        "Fill masked regions in images quickly",
        "Remove unwanted objects fast",
        "Repair image areas with turbo speed",
        "Generate quick inpainting results",
        "Produce rapid contextual fills"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/z-image/turbo/inpaint/lora": {
      className: "ZImageTurboInpaintLora",
      docstring:
        "Z-Image Turbo Inpaint with LoRA provides fast custom-trained inpainting for specialized tasks.",
      tags: ["image", "inpainting", "z-image", "turbo", "lora"],
      useCases: [
        "Inpaint with custom fast models",
        "Fill regions using specialized training",
        "Repair images with custom inpainting",
        "Generate quick custom fills",
        "Produce rapid specialized inpainting"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/z-image/turbo/controlnet": {
      className: "ZImageTurboControlnet",
      docstring:
        "Z-Image Turbo ControlNet provides fast controlled image generation with structural guidance.",
      tags: ["image", "controlnet", "z-image", "turbo", "controlled"],
      useCases: [
        "Generate images with fast structural control",
        "Apply quick controlled modifications",
        "Create rapid guided generations",
        "Transform images with fast ControlNet",
        "Produce speedy controlled outputs"
      ],
      basicFields: ["image", "prompt"]
    },

    "fal-ai/z-image/turbo/controlnet/lora": {
      className: "ZImageTurboControlnetLora",
      docstring:
        "Z-Image Turbo ControlNet with LoRA combines fast controlled generation with custom models.",
      tags: ["image", "controlnet", "z-image", "turbo", "lora"],
      useCases: [
        "Generate with fast custom ControlNet",
        "Apply quick specialized controlled generation",
        "Create rapid custom guided outputs",
        "Transform images with fast custom control",
        "Produce speedy fine-tuned controlled results"
      ],
      basicFields: ["image", "prompt"]
    },

    // Face Swap
    "half-moon-ai/ai-face-swap/faceswapimage": {
      className: "AiFaceSwapImage",
      docstring:
        "AI Face Swap replaces faces in images with source faces while maintaining natural appearance.",
      tags: ["image", "face-swap", "ai", "face-manipulation"],
      useCases: [
        "Swap faces between images",
        "Replace faces in photos",
        "Create face-swapped variations",
        "Generate face replacement results",
        "Produce face-substituted images"
      ],
      basicFields: ["image"]
    },

    // AI Home
    "half-moon-ai/ai-home/style": {
      className: "AiHomeStyle",
      docstring:
        "AI Home Style transforms interior spaces with different design styles and aesthetics.",
      tags: [
        "image",
        "interior-design",
        "style-transfer",
        "home",
        "decoration"
      ],
      useCases: [
        "Transform interior design styles",
        "Apply different home aesthetics",
        "Create styled room variations",
        "Generate interior design options",
        "Produce home styling transformations"
      ],
      basicFields: ["image", "prompt"]
    },

    "half-moon-ai/ai-home/edit": {
      className: "AiHomeEdit",
      docstring:
        "AI Home Edit modifies interior spaces with renovations, furniture changes, and design adjustments.",
      tags: ["image", "interior-design", "editing", "home", "renovation"],
      useCases: [
        "Edit interior spaces",
        "Modify room furniture and decor",
        "Create renovation visualizations",
        "Generate design modification options",
        "Produce home editing results"
      ],
      basicFields: ["image", "prompt"]
    },

    // AI Baby and Aging
    "half-moon-ai/ai-baby-and-aging-generator/single": {
      className: "AiBabyAndAgingGeneratorSingle",
      docstring:
        "AI Baby and Aging Generator Single shows age progression or regression for a single person.",
      tags: ["image", "aging", "age-progression", "face-manipulation"],
      useCases: [
        "Show age progression of person",
        "Generate younger or older versions",
        "Create aging visualizations",
        "Produce age transformation results",
        "Visualize person at different ages"
      ],
      basicFields: ["image"]
    },

    "half-moon-ai/ai-baby-and-aging-generator/multi": {
      className: "AiBabyAndAgingGeneratorMulti",
      docstring:
        "AI Baby and Aging Generator Multi shows age progression or regression for multiple people in one image.",
      tags: ["image", "aging", "age-progression", "multi-face"],
      useCases: [
        "Show age progression for multiple people",
        "Generate family aging visualizations",
        "Create multi-person aging results",
        "Produce group age transformations",
        "Visualize multiple people at different ages"
      ],
      basicFields: ["image"]
    },

    // Wan Image
    "wan/v2.6/image-to-image": {
      className: "WanV26ImageToImage",
      docstring:
        "Wan v2.6 image-to-image provides high-quality image transformations with advanced AI capabilities.",
      tags: ["image", "transformation", "wan", "v2.6", "quality"],
      useCases: [
        "Transform images with Wan v2.6",
        "Apply quality modifications to photos",
        "Create high-quality variations",
        "Generate advanced transformations",
        "Produce quality image modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    // StepX Edit
    "fal-ai/stepx-edit2": {
      className: "StepxEdit2",
      docstring:
        "StepX Edit 2 provides multi-step image editing with progressive refinement and control.",
      tags: ["image", "editing", "stepx", "progressive", "refinement"],
      useCases: [
        "Edit images with progressive steps",
        "Apply multi-stage modifications",
        "Create refined edits gradually",
        "Transform images with step control",
        "Produce progressively refined results"
      ],
      basicFields: ["image", "prompt"]
    },

    // Longcat Image
    "fal-ai/longcat-image/edit": {
      className: "LongcatImageEdit",
      docstring:
        "Longcat Image Edit transforms images with unique AI-powered modifications and creative control.",
      tags: ["image", "editing", "longcat", "creative"],
      useCases: [
        "Edit images with Longcat AI",
        "Apply creative modifications",
        "Create unique image variations",
        "Transform images creatively",
        "Produce artistic modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    // ByteDance SeeDream
    "fal-ai/bytedance/seedream/v4.5/edit": {
      className: "BytedanceSeedreamV45Edit",
      docstring:
        "ByteDance SeeDream v4.5 Edit provides advanced image editing with cutting-edge AI technology.",
      tags: ["image", "editing", "bytedance", "seedream", "v4.5"],
      useCases: [
        "Edit images with SeeDream v4.5",
        "Apply advanced modifications",
        "Create high-quality edits",
        "Transform images with latest tech",
        "Produce cutting-edge modifications"
      ],
      basicFields: ["image", "prompt"]
    },

    // Vidu
    "fal-ai/vidu/q2/reference-to-image": {
      className: "ViduQ2ReferenceToImage",
      docstring:
        "Vidu Q2 Reference-to-Image generates images based on reference images with style and content transfer.",
      tags: ["image", "generation", "vidu", "reference", "style-transfer"],
      useCases: [
        "Generate images from references",
        "Transfer style and content",
        "Create reference-based variations",
        "Transform using reference images",
        "Produce style-transferred results"
      ],
      basicFields: ["image", "prompt"]
    },

    // Kling Image
    "fal-ai/kling-image/o1": {
      className: "KlingImageO1",
      docstring:
        "Kling Image O1 provides advanced image generation and transformation with optimized quality.",
      tags: ["image", "generation", "kling", "o1", "optimized"],
      useCases: [
        "Generate images with Kling O1",
        "Transform images with optimization",
        "Create optimized quality results",
        "Produce advanced image generations",
        "Generate with balanced quality-speed"
      ],
      enumOverrides: {
        AspectRatio: "KlingImageO1AspectRatio"
      },
      basicFields: ["image", "prompt"]
    },

    "fal-ai/kling-image/o3/image-to-image": {
      className: "KlingImageO3ImageToImage",
      docstring:
        "Kling Image O3 transforms images with advanced quality controls and refined detail.",
      tags: [
        "image",
        "transformation",
        "kling",
        "o3",
        "image-to-image",
        "img2img"
      ],
      useCases: [
        "Transform images with Kling O3 quality",
        "Create refined image variations",
        "Apply style transfers with enhanced detail",
        "Generate high-fidelity image edits",
        "Produce consistent image transformations"
      ],
      enumOverrides: {
        AspectRatio: "KlingImageO3AspectRatio"
      },
      basicFields: ["images", "prompt", "resolution"]
    },

    "fal-ai/qwen-image-edit-2509-lora-gallery/shirt-design": {
      className: "QwenImageEdit2509LoraGalleryShirtDesign",
      docstring: "Qwen Image Edit 2509 Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-2509-lora-gallery/remove-lighting": {
      className: "QwenImageEdit2509LoraGalleryRemoveLighting",
      docstring: "Qwen Image Edit 2509 Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-2509-lora-gallery/remove-element": {
      className: "QwenImageEdit2509LoraGalleryRemoveElement",
      docstring: "Qwen Image Edit 2509 Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-2509-lora-gallery/lighting-restoration": {
      className: "QwenImageEdit2509LoraGalleryLightingRestoration",
      docstring: "Qwen Image Edit 2509 Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-2509-lora-gallery/integrate-product": {
      className: "QwenImageEdit2509LoraGalleryIntegrateProduct",
      docstring: "Qwen Image Edit 2509 Lora Gallery",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-2509-lora-gallery/group-photo": {
      className: "QwenImageEdit2509LoraGalleryGroupPhoto",
      docstring: "Qwen Image Edit 2509 Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-2509-lora-gallery/face-to-full-portrait": {
      className: "QwenImageEdit2509LoraGalleryFaceToFullPortrait",
      docstring: "Qwen Image Edit 2509 Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-2509-lora-gallery/add-background": {
      className: "QwenImageEdit2509LoraGalleryAddBackground",
      docstring: "Qwen Image Edit 2509 Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-2509-lora-gallery/next-scene": {
      className: "QwenImageEdit2509LoraGalleryNextScene",
      docstring: "Qwen Image Edit 2509 Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-2509-lora-gallery/multiple-angles": {
      className: "QwenImageEdit2509LoraGalleryMultipleAngles",
      docstring: "Qwen Image Edit 2509 Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-plus-lora-gallery/lighting-restoration": {
      className: "QwenImageEditPlusLoraGalleryLightingRestoration",
      docstring: "Qwen Image Edit Plus Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/moondream3-preview/segment": {
      className: "Moondream3PreviewSegment",
      docstring: "Moondream3 Preview [Segment]",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/flux-2-lora-gallery/apartment-staging": {
      className: "Flux2LoraGalleryApartmentStaging",
      docstring: "Flux 2 Lora Gallery",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "clarityai/crystal-upscaler": {
      className: "ClarityaiCrystalUpscaler",
      docstring: "Crystal Upscaler",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/chrono-edit-lora": {
      className: "ChronoEditLora",
      docstring: "Chrono Edit Lora",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/chrono-edit-lora-gallery/paintbrush": {
      className: "ChronoEditLoraGalleryPaintbrush",
      docstring: "Chrono Edit Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/chrono-edit-lora-gallery/upscaler": {
      className: "ChronoEditLoraGalleryUpscaler",
      docstring: "Chrono Edit Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/sam-3/image-rle": {
      className: "Sam3ImageRle",
      docstring: "Sam 3",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/sam-3/image": {
      className: "Sam3Image",
      docstring: "Segment Anything Model 3",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/gemini-3-pro-image-preview/edit": {
      className: "Gemini3ProImagePreviewEdit",
      docstring: "Gemini 3 Pro Image Preview",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/nano-banana-pro/edit": {
      className: "NanoBananaProEdit",
      docstring: "Nano Banana Pro",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-plus-lora-gallery/multiple-angles": {
      className: "QwenImageEditPlusLoraGalleryMultipleAngles",
      docstring: "Qwen Image Edit Plus Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-plus-lora-gallery/shirt-design": {
      className: "QwenImageEditPlusLoraGalleryShirtDesign",
      docstring: "Qwen Image Edit Plus Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-plus-lora-gallery/remove-lighting": {
      className: "QwenImageEditPlusLoraGalleryRemoveLighting",
      docstring: "Qwen Image Edit Plus Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-plus-lora-gallery/remove-element": {
      className: "QwenImageEditPlusLoraGalleryRemoveElement",
      docstring: "Qwen Image Edit Plus Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-plus-lora-gallery/next-scene": {
      className: "QwenImageEditPlusLoraGalleryNextScene",
      docstring: "Qwen Image Edit Plus Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-plus-lora-gallery/integrate-product": {
      className: "QwenImageEditPlusLoraGalleryIntegrateProduct",
      docstring: "Qwen Image Edit Plus Lora Gallery",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-plus-lora-gallery/group-photo": {
      className: "QwenImageEditPlusLoraGalleryGroupPhoto",
      docstring: "Qwen Image Edit Plus Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-plus-lora-gallery/face-to-full-portrait": {
      className: "QwenImageEditPlusLoraGalleryFaceToFullPortrait",
      docstring: "Qwen Image Edit Plus Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/qwen-image-edit-plus-lora-gallery/add-background": {
      className: "QwenImageEditPlusLoraGalleryAddBackground",
      docstring: "Qwen Image Edit Plus Lora Gallery",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/reve/fast/remix": {
      className: "ReveFastRemix",
      docstring: "Reve",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/reve/fast/edit": {
      className: "ReveFastEdit",
      docstring: "Reve",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/outpaint": {
      className: "ImageAppsV2Outpaint",
      docstring: "Image Outpaint",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-vision-upscaler": {
      className: "FluxVisionUpscaler",
      docstring: "Flux Vision Upscaler",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/emu-3.5-image/edit-image": {
      className: "Emu35ImageEditImage",
      docstring: "Emu 3.5 Image",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/chrono-edit": {
      className: "ChronoEdit",
      docstring: "Chrono Edit",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/gpt-image-1-mini/edit": {
      className: "GptImage1MiniEdit",
      docstring: "GPT Image 1 Mini",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/reve/remix": {
      className: "ReveRemix",
      docstring: "Reve",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/reve/edit": {
      className: "ReveEdit",
      docstring: "Reve",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image2pixel": {
      className: "Image2Pixel",
      docstring: "Image2Pixel",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/dreamomni2/edit": {
      className: "Dreamomni2Edit",
      docstring: "DreamOmni2",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/qwen-image-edit-plus-lora": {
      className: "QwenImageEditPlusLora",
      docstring: "Qwen Image Edit Plus Lora",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/lucidflux": {
      className: "Lucidflux",
      docstring: "Lucidflux",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/qwen-image-edit/image-to-image": {
      className: "QwenImageEditImageToImage",
      docstring: "Qwen Image Edit",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/wan-25-preview/image-to-image": {
      className: "Wan25PreviewImageToImage",
      docstring: "Wan 2.5 Image to Image",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/qwen-image-edit-plus": {
      className: "QwenImageEditPlus",
      docstring: "Qwen Image Edit Plus",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/seedvr/upscale/image": {
      className: "SeedvrUpscaleImage",
      docstring: "SeedVR2",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/product-holding": {
      className: "ImageAppsV2ProductHolding",
      docstring: "Product Holding",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/product-photography": {
      className: "ImageAppsV2ProductPhotography",
      docstring: "Product Photography",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/virtual-try-on": {
      className: "ImageAppsV2VirtualTryOn",
      docstring: "Virtual Try-on",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/texture-transform": {
      className: "ImageAppsV2TextureTransform",
      docstring: "Texture Transform",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/relighting": {
      className: "ImageAppsV2Relighting",
      docstring: "Relighting",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/style-transfer": {
      className: "ImageAppsV2StyleTransfer",
      docstring: "Style Transfer",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/photo-restoration": {
      className: "ImageAppsV2PhotoRestoration",
      docstring: "Photo Restoration",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/portrait-enhance": {
      className: "ImageAppsV2PortraitEnhance",
      docstring: "Portrait Enhance",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/photography-effects": {
      className: "ImageAppsV2PhotographyEffects",
      docstring: "Photography Effects",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/perspective": {
      className: "ImageAppsV2Perspective",
      docstring: "Perspective Change",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/object-removal": {
      className: "ImageAppsV2ObjectRemoval",
      docstring: "Object Removal",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/headshot-photo": {
      className: "ImageAppsV2HeadshotPhoto",
      docstring: "Headshot Generator",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/hair-change": {
      className: "ImageAppsV2HairChange",
      docstring: "Hair Change",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/expression-change": {
      className: "ImageAppsV2ExpressionChange",
      docstring: "Expression Change",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/city-teleport": {
      className: "ImageAppsV2CityTeleport",
      docstring: "City Teleport",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/age-modify": {
      className: "ImageAppsV2AgeModify",
      docstring: "Age Modify",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-apps-v2/makeup-application": {
      className: "ImageAppsV2MakeupApplication",
      docstring: "Makeup Changer",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/qwen-image-edit/inpaint": {
      className: "QwenImageEditInpaint",
      docstring: "Qwen Image Edit",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux/srpo/image-to-image": {
      className: "FluxSrpoImageToImage",
      docstring: "FLUX.1 SRPO [dev]",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-1/srpo/image-to-image": {
      className: "Flux1SrpoImageToImage",
      docstring: "FLUX.1 SRPO [dev]",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/qwen-image-edit-lora": {
      className: "QwenImageEditLora",
      docstring: "Qwen Image Edit Lora",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/vidu/reference-to-image": {
      className: "ViduReferenceToImage",
      docstring: "Vidu",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/bytedance/seedream/v4/edit": {
      className: "BytedanceSeedreamV4Edit",
      docstring: "Bytedance Seedream v4 Edit",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/wan/v2.2-a14b/image-to-image": {
      className: "WanV22A14BImageToImage",
      docstring: "Wan",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/uso": {
      className: "Uso",
      docstring: "Uso",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/gemini-25-flash-image/edit": {
      className: "Gemini25FlashImageEdit",
      docstring: "Gemini 2.5 Flash Image",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/qwen-image/image-to-image": {
      className: "QwenImageImageToImage",
      docstring: "Qwen Image",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "bria/reimagine/3.2": {
      className: "BriaReimagine32",
      docstring: "Reimagine",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/nano-banana/edit": {
      className: "NanoBananaEdit",
      docstring: "Nano Banana",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/nextstep-1": {
      className: "Nextstep1",
      docstring: "Nextstep 1",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/qwen-image-edit": {
      className: "QwenImageEdit",
      docstring: "Qwen Image Edit",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ideogram/character/edit": {
      className: "IdeogramCharacterEdit",
      docstring: "Ideogram V3 Character Edit",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ideogram/character": {
      className: "IdeogramCharacter",
      docstring: "Ideogram V3 Character",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ideogram/character/remix": {
      className: "IdeogramCharacterRemix",
      docstring: "Ideogram V3 Character Remix",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-krea-lora/inpainting": {
      className: "FluxKreaLoraInpainting",
      docstring: "FLUX.1 Krea [dev] Inpainting with LoRAs",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-krea-lora/image-to-image": {
      className: "FluxKreaLoraImageToImage",
      docstring: "FLUX.1 Krea [dev] with LoRAs",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux/krea/image-to-image": {
      className: "FluxKreaImageToImage",
      docstring: "FLUX.1 Krea [dev]",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux/krea/redux": {
      className: "FluxKreaRedux",
      docstring: "FLUX.1 Krea [dev] Redux",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-1/krea/image-to-image": {
      className: "Flux1KreaImageToImage",
      docstring: "FLUX.1 Krea [dev]",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-1/krea/redux": {
      className: "Flux1KreaRedux",
      docstring: "FLUX.1 Krea [dev] Redux",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-kontext-lora/inpaint": {
      className: "FluxKontextLoraInpaint",
      docstring: "Flux Kontext Lora",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/hunyuan_world": {
      className: "Hunyuan_World",
      docstring: "Hunyuan World",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/retouch": {
      className: "ImageEditingRetouch",
      docstring: "Image Editing",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/hidream-e1-1": {
      className: "HidreamE11",
      docstring: "Hidream E1 1",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/rife": {
      className: "Rife",
      docstring: "RIFE",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/film": {
      className: "Film",
      docstring: "FILM",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/calligrapher": {
      className: "Calligrapher",
      docstring: "Calligrapher",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/bria/reimagine": {
      className: "BriaReimagine",
      docstring: "Bria",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/realism": {
      className: "ImageEditingRealism",
      docstring: "Image Editing",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/vignette": {
      className: "PostProcessingVignette",
      docstring: "Post Processing",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/solarize": {
      className: "PostProcessingSolarize",
      docstring: "Post Processing",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/sharpen": {
      className: "PostProcessingSharpen",
      docstring: "Post Processing",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/parabolize": {
      className: "PostProcessingParabolize",
      docstring: "Post Processing",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/grain": {
      className: "PostProcessingGrain",
      docstring: "Post Processing",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/dodge-burn": {
      className: "PostProcessingDodgeBurn",
      docstring: "Post Processing",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/dissolve": {
      className: "PostProcessingDissolve",
      docstring: "Post Processing",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/desaturate": {
      className: "PostProcessingDesaturate",
      docstring: "Post Processing",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/color-tint": {
      className: "PostProcessingColorTint",
      docstring: "Post Processing",
      tags: [
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "professional"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/color-correction": {
      className: "PostProcessingColorCorrection",
      docstring:
        "Adjust color temperature, brightness, contrast, saturation, and gamma values for color correction.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/chromatic-aberration": {
      className: "PostProcessingChromaticAberration",
      docstring:
        "Create chromatic aberration by shifting red, green, and blue channels horizontally or vertically with customizable shift amounts.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing/blur": {
      className: "PostProcessingBlur",
      docstring:
        "Apply Gaussian or Kuwahara blur effects with adjustable radius and sigma parameters",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/youtube-thumbnails": {
      className: "ImageEditingYoutubeThumbnails",
      docstring: "Generate YouTube thumbnails with custom text",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/topaz/upscale/image": {
      className: "TopazUpscaleImage",
      docstring:
        "Use the powerful and accurate topaz image enhancer to enhance your images.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/broccoli-haircut": {
      className: "ImageEditingBroccoliHaircut",
      docstring:
        "Transform your character's hair into broccoli style while keeping the original characters likeness",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/wojak-style": {
      className: "ImageEditingWojakStyle",
      docstring:
        "Transform your photos into wojak style while keeping the original characters likeness",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/plushie-style": {
      className: "ImageEditingPlushieStyle",
      docstring:
        "Transform your photos into cool plushies while keeping the original characters likeness",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/flux-kontext-lora": {
      className: "FluxKontextLora",
      docstring:
        "Fast endpoint for the FLUX.1 Kontext [dev] model with LoRA support, enabling rapid and high-quality image editing using pre-trained LoRA adaptations for specific styles, brand identities, and product-specific outputs.",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/fashn/tryon/v1.6": {
      className: "FashnTryonV16",
      docstring:
        "FASHN v1.6 delivers precise virtual try-on capabilities, accurately rendering garment details like text and patterns at 864x1296 resolution from both on-model and flat-lay photo references.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/chain-of-zoom": {
      className: "ChainOfZoom",
      docstring:
        "Extreme Super-Resolution via Scale Autoregression and Preference Alignment",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/pasd": {
      className: "Pasd",
      docstring:
        "Pixel-Aware Diffusion Model for Realistic Image Super-Resolution and Personalized Stylization",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/object-removal/bbox": {
      className: "ObjectRemovalBbox",
      docstring:
        "Removes box-selected objects and their visual effects, seamlessly reconstructing the scene with contextually appropriate content.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/object-removal/mask": {
      className: "ObjectRemovalMask",
      docstring:
        "Removes mask-selected objects and their visual effects, seamlessly reconstructing the scene with contextually appropriate content.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/object-removal": {
      className: "ObjectRemoval",
      docstring:
        "Removes objects and their visual effects using natural language, replacing them with contextually appropriate content",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/recraft/vectorize": {
      className: "RecraftVectorize",
      docstring:
        "Converts a given raster image to SVG format using Recraft model.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ffmpeg-api/extract-frame": {
      className: "FfmpegApiExtractFrame",
      docstring:
        "ffmpeg endpoint for first, middle and last frame extraction from videos",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/luma-photon/flash/modify": {
      className: "LumaPhotonFlashModify",
      docstring:
        "Edit images from your prompts using Luma Photon. Photon is the most creative, personalizable, and intelligent visual models for creatives, bringing a step-function change in the cost of high-quality image generation.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/luma-photon/modify": {
      className: "LumaPhotonModify",
      docstring:
        "Edit images from your prompts using Luma Photon. Photon is the most creative, personalizable, and intelligent visual models for creatives, bringing a step-function change in the cost of high-quality image generation.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/reframe": {
      className: "ImageEditingReframe",
      docstring:
        "The reframe endpoint intelligently adjusts an image's aspect ratio while preserving the main subject's position, composition, pose, and perspective",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/baby-version": {
      className: "ImageEditingBabyVersion",
      docstring:
        "Transform any person into their baby version, while preserving the original pose and expression with childlike features.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/luma-photon/flash/reframe": {
      className: "LumaPhotonFlashReframe",
      docstring:
        "This advanced tool intelligently expands your visuals, seamlessly blending new content to enhance creativity and adaptability, offering unmatched speed and quality for creators at a fraction of the cost.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/luma-photon/reframe": {
      className: "LumaPhotonReframe",
      docstring:
        "Extend and reframe images with Luma Photon Reframe. This advanced tool intelligently expands your visuals, seamlessly blending new content to enhance creativity and adaptability, offering unmatched personalization and quality for creators at a fraction of the cost.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-1/schnell/redux": {
      className: "Flux1SchnellRedux",
      docstring:
        "FLUX.1 [schnell] Redux is a high-performance endpoint for the FLUX.1 [schnell] model that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities. ",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-1/dev/redux": {
      className: "Flux1DevRedux",
      docstring:
        "FLUX.1 [dev] Redux is a high-performance endpoint for the FLUX.1 [dev] model that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-1/dev/image-to-image": {
      className: "Flux1DevImageToImage",
      docstring:
        "FLUX.1 [dev] is a 12 billion parameter flow transformer that generates high-quality images from text. It is suitable for personal and commercial use. ",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/text-removal": {
      className: "ImageEditingTextRemoval",
      docstring:
        "Remove all text and writing from images while preserving the background and natural appearance.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/photo-restoration": {
      className: "ImageEditingPhotoRestoration",
      docstring:
        "Restore and enhance old or damaged photos by removing imperfections, adding color while preserving the original character and details of the image.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/weather-effect": {
      className: "ImageEditingWeatherEffect",
      docstring:
        "Add realistic weather effects like snowfall, rain, or fog to your photos while maintaining the scene's mood.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/time-of-day": {
      className: "ImageEditingTimeOfDay",
      docstring:
        "Transform your photos to any time of day, from golden hour to midnight, with appropriate lighting and atmosphere.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/style-transfer": {
      className: "ImageEditingStyleTransfer",
      docstring:
        "Transform your photos into artistic masterpieces inspired by famous styles like Van Gogh's Starry Night or any artistic style you choose.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/scene-composition": {
      className: "ImageEditingSceneComposition",
      docstring:
        "Place your subject in any scene you imagine, from enchanted forests to urban settings, with professional composition and lighting",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/professional-photo": {
      className: "ImageEditingProfessionalPhoto",
      docstring:
        "Turn your casual photos into stunning professional studio portraits with perfect lighting and high-end photography style.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/object-removal": {
      className: "ImageEditingObjectRemoval",
      docstring:
        "Remove unwanted objects or people from your photos while seamlessly blending the background.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/hair-change": {
      className: "ImageEditingHairChange",
      docstring:
        "Experiment with different hairstyles, from bald to any style you can imagine, while maintaining natural lighting and realistic results.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/face-enhancement": {
      className: "ImageEditingFaceEnhancement",
      docstring:
        "Enhance facial features with professional retouching while maintaining a natural, realistic look",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/expression-change": {
      className: "ImageEditingExpressionChange",
      docstring:
        "Change facial expressions in photos to any emotion you desire, from smiles to serious looks.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/color-correction": {
      className: "ImageEditingColorCorrection",
      docstring:
        "Perfect your photos with professional color grading, balanced tones, and vibrant yet natural colors",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/cartoonify": {
      className: "ImageEditingCartoonify",
      docstring:
        "Transform your photos into vibrant cool cartoons with bold outlines and rich colors.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/background-change": {
      className: "ImageEditingBackgroundChange",
      docstring:
        "Replace your photo's background with any scene you desire, from beach sunsets to urban landscapes, with perfect lighting and shadows",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-editing/age-progression": {
      className: "ImageEditingAgeProgression",
      docstring:
        "See how you or others might look at different ages, from younger to older, while preserving core facial features.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-pro/kontext/max/multi": {
      className: "FluxProKontextMaxMulti",
      docstring:
        "Experimental version of FLUX.1 Kontext [max] with multi image handling capabilities",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-pro/kontext/multi": {
      className: "FluxProKontextMulti",
      docstring:
        "Experimental version of FLUX.1 Kontext [pro] with multi image handling capabilities",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-pro/kontext/max": {
      className: "FluxProKontextMax",
      docstring:
        "FLUX.1 Kontext [max] is a model with greatly improved prompt adherence and typography generation meet premium consistency for editing without compromise on speed.   ",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-kontext/dev": {
      className: "FluxKontextDev",
      docstring: "Frontier image editing model.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/bagel/edit": {
      className: "BagelEdit",
      docstring:
        "Bagel is a 7B parameter multimodal model from Bytedance-Seed that can generate both images and text.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "smoretalk-ai/rembg-enhance": {
      className: "SmoretalkAiRembgEnhance",
      docstring:
        "Rembg-enhance is optimized for 2D vector images, 3D graphics, and photos by leveraging matting technology.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/recraft/upscale/creative": {
      className: "RecraftUpscaleCreative",
      docstring:
        "Enhances a given raster image using the 'creative upscale' tool, increasing image resolution, making the image sharper and cleaner.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/recraft/upscale/crisp": {
      className: "RecraftUpscaleCrisp",
      docstring:
        "Enhances a given raster image using 'crisp upscale' tool, boosting resolution with a focus on refining small details and faces.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/minimax/image-01/subject-reference": {
      className: "MinimaxImage01SubjectReference",
      docstring:
        "Generate images from text and a reference image using MiniMax Image-01 for consistent character appearance.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/hidream-i1-full/image-to-image": {
      className: "HidreamI1FullImageToImage",
      docstring:
        "HiDream-I1 full is a new open-source image generative foundation model with 17B parameters that achieves state-of-the-art image generation quality within seconds.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ideogram/v3/reframe": {
      className: "IdeogramV3Reframe",
      docstring:
        "Extend existing images with Ideogram V3's reframe feature. Create expanded versions and adaptations while preserving main image and adding new creative directions through prompt guidance.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ideogram/v3/replace-background": {
      className: "IdeogramV3ReplaceBackground",
      docstring:
        "Replace backgrounds existing images with Ideogram V3's replace background feature. Create variations and adaptations while preserving core elements and adding new creative directions through prompt guidance.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ideogram/v3/remix": {
      className: "IdeogramV3Remix",
      docstring:
        "Reimagine existing images with Ideogram V3's remix feature. Create variations and adaptations while preserving core elements and adding new creative directions through prompt guidance.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/step1x-edit": {
      className: "Step1xEdit",
      docstring:
        "Step1X-Edit transforms your photos with simple instructions into stunning, professional-quality edits—rivaling top proprietary tools.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image2svg": {
      className: "Image2svg",
      docstring:
        "Image2SVG transforms raster images into clean vector graphics, preserving visual quality while enabling scalable, customizable SVG outputs with precise control over detail levels.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/uno": {
      className: "Uno",
      docstring:
        "An AI model that transforms input images into new ones based on text prompts, blending reference visuals with your creative directions.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/gpt-image-1/edit-image": {
      className: "GptImage1EditImage",
      docstring:
        "OpenAI's latest image generation and editing model: gpt-1-image.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "rundiffusion-fal/juggernaut-flux-lora/inpainting": {
      className: "RundiffusionFalJuggernautFluxLoraInpainting",
      docstring:
        "Juggernaut Base Flux LoRA Inpainting by RunDiffusion is a drop-in replacement for Flux [Dev] inpainting that delivers sharper details, richer colors, and enhanced realism to all your LoRAs and LyCORIS with full compatibility.",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/fashn/tryon/v1.5": {
      className: "FashnTryonV15",
      docstring:
        "FASHN v1.5 delivers precise virtual try-on capabilities, accurately rendering garment details like text and patterns at 576x864 resolution from both on-model and flat-lay photo references.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/plushify": {
      className: "Plushify",
      docstring: "Turn any image into a cute plushie!",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/instant-character": {
      className: "InstantCharacter",
      docstring:
        "InstantCharacter creates high-quality, consistent characters from text prompts, supporting diverse poses, styles, and appearances with strong identity control.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/cartoonify": {
      className: "Cartoonify",
      docstring:
        "Transform images into 3D cartoon artwork using an AI model that applies cartoon stylization while preserving the original image's composition and details.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/finegrain-eraser/mask": {
      className: "FinegrainEraserMask",
      docstring:
        "Finegrain Eraser removes any object selected with a mask—along with its shadows, reflections, and lighting artifacts—seamlessly reconstructing the scene with contextually accurate content.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/finegrain-eraser/bbox": {
      className: "FinegrainEraserBbox",
      docstring:
        "Finegrain Eraser removes any object selected with a bounding box—along with its shadows, reflections, and lighting artifacts—seamlessly reconstructing the scene with contextually accurate content.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/finegrain-eraser": {
      className: "FinegrainEraser",
      docstring:
        "Finegrain Eraser removes objects—along with their shadows, reflections, and lighting artifacts—using only natural language, seamlessly filling the scene with contextually accurate content.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/star-vector": {
      className: "StarVector",
      docstring:
        "AI vectorization model that transforms raster images into scalable SVG graphics, preserving visual details while enabling infinite scaling and easy editing capabilities.  ",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ghiblify": {
      className: "Ghiblify",
      docstring:
        "Reimagine and transform your ordinary photos into enchanting Studio Ghibli style artwork",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/thera": {
      className: "Thera",
      docstring:
        "Fix low resolution images with fast speed and quality of thera.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/mix-dehaze-net": {
      className: "MixDehazeNet",
      docstring:
        "An advanced dehaze model to remove atmospheric haze, restoring clarity and detail in images through intelligent neural network processing.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/gemini-flash-edit": {
      className: "GeminiFlashEdit",
      docstring:
        "Gemini Flash Edit is a model that can edit single image using a text prompt and a reference image.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/gemini-flash-edit/multi": {
      className: "GeminiFlashEditMulti",
      docstring:
        "Gemini Flash Edit Multi Image is a model that can edit multiple images using a text prompt and a reference image.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/invisible-watermark": {
      className: "InvisibleWatermark",
      docstring:
        "Invisible Watermark is a model that can add an invisible watermark to an image.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "rundiffusion-fal/juggernaut-flux/base/image-to-image": {
      className: "RundiffusionFalJuggernautFluxBaseImageToImage",
      docstring:
        "Juggernaut Base Flux by RunDiffusion is a drop-in replacement for Flux [Dev] that delivers sharper details, richer colors, and enhanced realism, while instantly boosting LoRAs and LyCORIS with full compatibility.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "rundiffusion-fal/juggernaut-flux/pro/image-to-image": {
      className: "RundiffusionFalJuggernautFluxProImageToImage",
      docstring:
        "Juggernaut Pro Flux by RunDiffusion is the flagship Juggernaut model rivaling some of the most advanced image models available, often surpassing them in realism. It combines Juggernaut Base with RunDiffusion Photo and features enhancements like reduced background blurriness.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/docres/dewarp": {
      className: "DocresDewarp",
      docstring:
        "Enhance wraped, folded documents with the superior quality of docres for sharper, clearer results.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/docres": {
      className: "Docres",
      docstring:
        "Enhance low-resolution, blur, shadowed documents with the superior quality of docres for sharper, clearer results.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/swin2sr": {
      className: "Swin2sr",
      docstring:
        "Enhance low-resolution images with the superior quality of Swin2SR for sharper, clearer results.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ideogram/v2a/remix": {
      className: "IdeogramV2aRemix",
      docstring:
        "Create variations of existing images with Ideogram V2A Remix while maintaining creative control through prompt guidance.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ideogram/v2a/turbo/remix": {
      className: "IdeogramV2aTurboRemix",
      docstring:
        "Rapidly create image variations with Ideogram V2A Turbo Remix. Fast and efficient reimagining of existing images while maintaining creative control through prompt guidance.",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/evf-sam": {
      className: "EvfSam",
      docstring:
        "EVF-SAM2 combines natural language understanding with advanced segmentation capabilities, allowing you to precisely mask image regions using intuitive positive and negative text prompts.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ddcolor": {
      className: "Ddcolor",
      docstring:
        "Bring colors into old or new black and white photos with DDColor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/sam2/auto-segment": {
      className: "Sam2AutoSegment",
      docstring:
        "SAM 2 is a model for segmenting images automatically. It can return individual masks or a single mask for the entire image.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/drct-super-resolution": {
      className: "DrctSuperResolution",
      docstring: "Upscale your images with DRCT-Super-Resolution.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/nafnet/deblur": {
      className: "NafnetDeblur",
      docstring:
        "Use NAFNet to fix issues like blurriness and noise in your images. This model specializes in image restoration and can help enhance the overall quality of your photography.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/nafnet/denoise": {
      className: "NafnetDenoise",
      docstring:
        "Use NAFNet to fix issues like blurriness and noise in your images. This model specializes in image restoration and can help enhance the overall quality of your photography.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/post-processing": {
      className: "PostProcessing",
      docstring:
        "Post Processing is an endpoint that can enhance images using a variety of techniques including grain, blur, sharpen, and more.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flowedit": {
      className: "Flowedit",
      docstring:
        "The model provides you high quality image editing capabilities.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ben/v2/image": {
      className: "BenV2Image",
      docstring: "A fast and high quality model for image background removal.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-control-lora-canny/image-to-image": {
      className: "FluxControlLoraCannyImageToImage",
      docstring:
        "FLUX Control LoRA Canny is a high-performance endpoint that uses a control image using a Canny edge map to transfer structure to the generated image and another initial image to guide color.",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-control-lora-depth/image-to-image": {
      className: "FluxControlLoraDepthImageToImage",
      docstring:
        "FLUX Control LoRA Depth is a high-performance endpoint that uses a control image using a depth map to transfer structure to the generated image and another initial image to guide color.",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ideogram/upscale": {
      className: "IdeogramUpscale",
      docstring:
        "Ideogram Upscale enhances the resolution of the reference image by up to 2X and might enhance the reference image too. Optionally refine outputs with a prompt for guided improvements.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/kling/v1-5/kolors-virtual-try-on": {
      className: "KlingV15KolorsVirtualTryOn",
      docstring:
        "Kling Kolors Virtual TryOn v1.5 is a high quality image based Try-On endpoint which can be used for commercial try on.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },

    "fal-ai/flux-lora-canny": {
      className: "FluxLoraCanny",
      docstring:
        "Utilize Flux.1 [dev] Controlnet to generate high-quality images with precise control over composition, style, and structure through advanced edge detection and guidance mechanisms.",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-pro/v1/fill-finetuned": {
      className: "FluxProV1FillFinetuned",
      docstring:
        "FLUX.1 [pro] Fill Fine-tuned is a high-performance endpoint for the FLUX.1 [pro] model with a fine-tuned LoRA that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/moondream-next/detection": {
      className: "MoondreamNextDetection",
      docstring:
        "MoonDreamNext Detection is a multimodal vision-language model for gaze detection, bbox detection, point detection, and more.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/bria/eraser": {
      className: "BriaEraserV2",
      docstring:
        "Bria Eraser enables precise removal of unwanted objects from images while maintaining high-quality outputs. Trained exclusively on licensed data for safe and risk-free commercial use. Access the model's source code and weights: https://bria.ai/contact-us",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/bria/expand": {
      className: "BriaExpand",
      docstring:
        "Bria Expand expands images beyond their borders in high quality. Trained exclusively on licensed data for safe and risk-free commercial use. Access the model's source code and weights: https://bria.ai/contact-us",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/bria/genfill": {
      className: "BriaGenfill",
      docstring:
        "Bria GenFill enables high-quality object addition or visual transformation. Trained exclusively on licensed data for safe and risk-free commercial use. Access the model's source code and weights: https://bria.ai/contact-us",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/bria/product-shot": {
      className: "BriaProductShot",
      docstring:
        "Place any product in any scenery with just a prompt or reference image while maintaining high integrity of the product. Trained exclusively on licensed data for safe and risk-free commercial use and optimized for eCommerce.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/bria/background/remove": {
      className: "BriaBackgroundRemove",
      docstring:
        "Bria RMBG 2.0 enables seamless removal of backgrounds from images, ideal for professional editing tasks. Trained exclusively on licensed data for safe and risk-free commercial use. Model weights for commercial use are available here: https://share-eu1.hsforms.com/2GLpEVQqJTI2Lj7AMYwgfIwf4e04",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/bria/background/replace": {
      className: "BriaBackgroundReplaceV2",
      docstring:
        "Bria Background Replace allows for efficient swapping of backgrounds in images via text prompts or reference image, delivering realistic and polished results. Trained exclusively on licensed data for safe and risk-free commercial use ",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-lora-fill": {
      className: "FluxLoraFill",
      docstring:
        "FLUX.1 [dev] Fill is a high-performance endpoint for the FLUX.1 [pro] model that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities.",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/cat-vton": {
      className: "CatVton",
      docstring: "Image based high quality Virtual Try-On",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/leffa/pose-transfer": {
      className: "LeffaPoseTransfer",
      docstring:
        "Leffa Pose Transfer is an endpoint for changing pose of an image with a reference image.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/leffa/virtual-tryon": {
      className: "LeffaVirtualTryon",
      docstring:
        "Leffa Virtual TryOn is a high quality image based Try-On endpoint which can be used for commercial try on.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ideogram/v2/turbo/edit": {
      className: "IdeogramV2TurboEdit",
      docstring:
        "Edit images faster with Ideogram V2 Turbo. Quick modifications and adjustments while preserving the high-quality standards and realistic outputs of Ideogram.",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ideogram/v2/turbo/remix": {
      className: "IdeogramV2TurboRemix",
      docstring:
        "Rapidly create image variations with Ideogram V2 Turbo Remix. Fast and efficient reimagining of existing images while maintaining creative control through prompt guidance.",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-pro/v1.1/redux": {
      className: "FluxProV11Redux",
      docstring:
        "FLUX1.1 [pro] Redux is a high-performance endpoint for the FLUX1.1 [pro] model that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-lora-depth": {
      className: "FluxLoraDepth",
      docstring:
        "Generate high-quality images from depth maps using Flux.1 [dev] depth estimation model. The model produces accurate depth representations for scene understanding and 3D visualization.",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-pro/v1.1-ultra/redux": {
      className: "FluxProV11UltraRedux",
      docstring:
        "FLUX1.1 [pro] ultra Redux is a high-performance endpoint for the FLUX1.1 [pro] model that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/iclight-v2": {
      className: "IclightV2",
      docstring:
        "An endpoint for re-lighting photos and changing their backgrounds per a given description",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-differential-diffusion": {
      className: "FluxDifferentialDiffusion",
      docstring:
        "FLUX.1 Differential Diffusion is a rapid endpoint that enables swift, granular control over image transformations through change maps, delivering fast and precise region-specific modifications while maintaining FLUX.1 [dev]'s high-quality output.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-pulid": {
      className: "FluxPulid",
      docstring:
        "An endpoint for personalized image generation using Flux as per given description.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/birefnet/v2": {
      className: "BirefnetV2",
      docstring:
        "bilateral reference framework (BiRefNet) for high-resolution dichotomous image segmentation (DIS)",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/live-portrait/image": {
      className: "LivePortraitImage",
      docstring: "Transfer expression from a video to a portrait.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-general/rf-inversion": {
      className: "FluxGeneralRfInversion",
      docstring:
        "A general purpose endpoint for the FLUX.1 [dev] model, implementing the RF-Inversion pipeline. This can be used to edit a reference image based on a prompt.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-preprocessors/hed": {
      className: "ImagePreprocessorsHed",
      docstring: "Holistically-Nested Edge Detection (HED) preprocessor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-preprocessors/depth-anything/v2": {
      className: "ImagePreprocessorsDepthAnythingV2",
      docstring: "Depth Anything v2 preprocessor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-preprocessors/scribble": {
      className: "ImagePreprocessorsScribble",
      docstring: "Scribble preprocessor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-preprocessors/mlsd": {
      className: "ImagePreprocessorsMlsd",
      docstring: "M-LSD line segment detection preprocessor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-preprocessors/sam": {
      className: "ImagePreprocessorsSam",
      docstring: "Segment Anything Model (SAM) preprocessor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-preprocessors/midas": {
      className: "ImagePreprocessorsMidas",
      docstring: "MiDaS depth estimation preprocessor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-preprocessors/teed": {
      className: "ImagePreprocessorsTeed",
      docstring: "TEED (Temporal Edge Enhancement Detection) preprocessor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-preprocessors/lineart": {
      className: "ImagePreprocessorsLineart",
      docstring: "Line art preprocessor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-preprocessors/zoe": {
      className: "ImagePreprocessorsZoe",
      docstring: "ZoeDepth preprocessor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/image-preprocessors/pidi": {
      className: "ImagePreprocessorsPidi",
      docstring: "PIDI (Pidinet) preprocessor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/sam2/image": {
      className: "Sam2Image",
      docstring:
        "SAM 2 is a model for segmenting images and videos in real-time.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-general/inpainting": {
      className: "FluxGeneralInpainting",
      docstring:
        "FLUX General Inpainting is a versatile endpoint that enables precise image editing and completion, supporting multiple AI extensions including LoRA, ControlNet, and IP-Adapter for enhanced control over inpainting results and sophisticated image modifications.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-general/image-to-image": {
      className: "FluxGeneralImageToImage",
      docstring:
        "FLUX General Image-to-Image is a versatile endpoint that transforms existing images with support for LoRA, ControlNet, and IP-Adapter extensions, enabling precise control over style transfer, modifications, and artistic variations through multiple guidance methods.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-general/differential-diffusion": {
      className: "FluxGeneralDifferentialDiffusion",
      docstring:
        "A specialized FLUX endpoint combining differential diffusion control with LoRA, ControlNet, and IP-Adapter support, enabling precise, region-specific image transformations through customizable change maps.",
      tags: ["flux", "editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/flux-lora/image-to-image": {
      className: "FluxLoraImageToImage",
      docstring:
        "FLUX LoRA Image-to-Image is a high-performance endpoint that transforms existing images using FLUX models, leveraging LoRA adaptations to enable rapid and precise image style transfer, modifications, and artistic variations.",
      tags: [
        "flux",
        "editing",
        "transformation",
        "image-to-image",
        "img2img",
        "lora"
      ],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/sdxl-controlnet-union/inpainting": {
      className: "SdxlControlnetUnionInpainting",
      docstring: "An efficent SDXL multi-controlnet inpainting model.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/sdxl-controlnet-union/image-to-image": {
      className: "SdxlControlnetUnionImageToImage",
      docstring: "An efficent SDXL multi-controlnet image-to-image model.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/era-3d": {
      className: "Era3d",
      docstring: "A powerful image to novel multiview model with normals.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/florence-2-large/dense-region-caption": {
      className: "Florence2LargeDenseRegionCaption",
      docstring:
        "Florence-2 is an advanced vision foundation model that uses a prompt-based approach to handle a wide range of vision and vision-language tasks",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/florence-2-large/referring-expression-segmentation": {
      className: "Florence2LargeReferringExpressionSegmentation",
      docstring:
        "Florence-2 is an advanced vision foundation model that uses a prompt-based approach to handle a wide range of vision and vision-language tasks",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/florence-2-large/object-detection": {
      className: "Florence2LargeObjectDetection",
      docstring:
        "Florence-2 is an advanced vision foundation model that uses a prompt-based approach to handle a wide range of vision and vision-language tasks",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/florence-2-large/open-vocabulary-detection": {
      className: "Florence2LargeOpenVocabularyDetection",
      docstring:
        "Florence-2 is an advanced vision foundation model that uses a prompt-based approach to handle a wide range of vision and vision-language tasks",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/florence-2-large/caption-to-phrase-grounding": {
      className: "Florence2LargeCaptionToPhraseGrounding",
      docstring:
        "Florence-2 is an advanced vision foundation model that uses a prompt-based approach to handle a wide range of vision and vision-language tasks",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/florence-2-large/region-proposal": {
      className: "Florence2LargeRegionProposal",
      docstring:
        "Florence-2 is an advanced vision foundation model that uses a prompt-based approach to handle a wide range of vision and vision-language tasks",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/florence-2-large/ocr-with-region": {
      className: "Florence2LargeOcrWithRegion",
      docstring:
        "Florence-2 is an advanced vision foundation model that uses a prompt-based approach to handle a wide range of vision and vision-language tasks",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/florence-2-large/region-to-segmentation": {
      className: "Florence2LargeRegionToSegmentation",
      docstring:
        "Florence-2 is an advanced vision foundation model that uses a prompt-based approach to handle a wide range of vision and vision-language tasks",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/stable-diffusion-v3-medium/image-to-image": {
      className: "StableDiffusionV3MediumImageToImage",
      docstring:
        "Stable Diffusion 3 Medium (Image to Image) is a Multimodal Diffusion Transformer (MMDiT) model that improves image quality, typography, prompt understanding, and efficiency.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/dwpose": {
      className: "Dwpose",
      docstring: "Predict poses from images.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/sd15-depth-controlnet": {
      className: "Sd15DepthControlnet",
      docstring: "SD 1.5 ControlNet",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/omni-zero": {
      className: "OmniZero",
      docstring: "Any pose, any style, any identity",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/hyper-sdxl/image-to-image": {
      className: "HyperSdxlImageToImage",
      docstring: "Hyper-charge SDXL's performance and creativity.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/hyper-sdxl/inpainting": {
      className: "HyperSdxlInpainting",
      docstring: "Hyper-charge SDXL's performance and creativity.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/ip-adapter-face-id": {
      className: "IpAdapterFaceId",
      docstring: "High quality zero-shot personalization",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/lora/inpaint": {
      className: "LoraInpaint",
      docstring:
        "Run Any Stable Diffusion model with customizable LoRA weights.",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/lora/image-to-image": {
      className: "LoraImageToImage",
      docstring:
        "Run Any Stable Diffusion model with customizable LoRA weights.",
      tags: ["editing", "transformation", "image-to-image", "img2img", "lora"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/fast-sdxl/image-to-image": {
      className: "FastSdxlImageToImage",
      docstring: "Run SDXL at the speed of light",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/fast-sdxl/inpainting": {
      className: "FastSdxlInpainting",
      docstring: "Run SDXL at the speed of light",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/face-to-sticker": {
      className: "FaceToSticker",
      docstring: "Create stickers from faces.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/photomaker": {
      className: "Photomaker",
      docstring: "Customizing Realistic Human Photos via Stacked ID Embedding",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/creative-upscaler": {
      className: "CreativeUpscaler",
      docstring: "Create creative upscaled images.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/playground-v25/image-to-image": {
      className: "PlaygroundV25ImageToImage",
      docstring: "State-of-the-art open-source model in aesthetic quality",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/fast-lightning-sdxl/image-to-image": {
      className: "FastLightningSdxlImageToImage",
      docstring: "Run SDXL at the speed of light",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/fast-lightning-sdxl/inpainting": {
      className: "FastLightningSdxlInpainting",
      docstring: "Run SDXL at the speed of light",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/playground-v25/inpainting": {
      className: "PlaygroundV25Inpainting",
      docstring: "State-of-the-art open-source model in aesthetic quality",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/fast-lcm-diffusion/inpainting": {
      className: "FastLcmDiffusionInpainting",
      docstring: "Run SDXL at the speed of light",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/fast-lcm-diffusion/image-to-image": {
      className: "FastLcmDiffusionImageToImage",
      docstring: "Run SDXL at the speed of light",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/retoucher": {
      className: "Retoucher",
      docstring:
        "Automatically retouches faces to smooth skin and remove blemishes.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/imageutils/depth": {
      className: "ImageutilsDepth",
      docstring: "Create depth maps using Midas depth estimation.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/imageutils/marigold-depth": {
      className: "ImageutilsMarigoldDepth",
      docstring: "Create depth maps using Marigold depth estimation.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/pulid": {
      className: "Pulid",
      docstring: "Tuning-free ID customization.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/fast-sdxl-controlnet-canny/image-to-image": {
      className: "FastSdxlControlnetCannyImageToImage",
      docstring: "Generate Images with ControlNet.",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/fast-sdxl-controlnet-canny/inpainting": {
      className: "FastSdxlControlnetCannyInpainting",
      docstring: "Generate Images with ControlNet.",
      tags: ["editing", "transformation", "image-to-image", "img2img", "fast"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/lcm-sd15-i2i": {
      className: "LcmSd15I2i",
      docstring:
        "Produce high-quality images with minimal inference steps. Optimized for 512x512 input image size.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/inpaint": {
      className: "Inpaint",
      docstring: "Inpaint images with SD and SDXL",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/esrgan": {
      className: "Esrgan",
      docstring: "Upscale images by a given factor.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/imageutils/rembg": {
      className: "ImageutilsRembg",
      docstring: "Remove the background from an image.",
      tags: ["editing", "transformation", "image-to-image", "img2img"],
      useCases: [
        "Professional photo editing and enhancement",
        "Creative image transformations",
        "Batch image processing workflows",
        "Product photography refinement",
        "Automated image optimization"
      ]
    },
    "fal-ai/nano-banana-2/edit": {
      className: "NanoBanana2Edit",
      docstring: "Edit images with Nano Banana 2.",
      tags: ["editing", "image-to-image", "img2img", "nano-banana"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/flux-2-pro/edit": {
      className: "Flux2ProEdit",
      docstring: "Edit images with FLUX.2 Pro.",
      tags: ["editing", "image-to-image", "img2img", "flux", "flux-2"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "openai/gpt-image-2/edit": {
      className: "OpenaiGptImage2Edit",
      docstring: "Edit images with OpenAI GPT Image 2.",
      tags: ["editing", "image-to-image", "img2img", "openai", "gpt-image"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/bytedance/seedream/v5/lite/edit": {
      className: "BytedanceSeedreamV5LiteEdit",
      docstring: "Edit images with ByteDance Seedream v5 Lite.",
      tags: ["editing", "image-to-image", "img2img", "seedream", "bytedance"],
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
