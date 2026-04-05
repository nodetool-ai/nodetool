import type { ModuleConfig } from "../types.js";

export const imageConfig: ModuleConfig = {
  moduleName: "image",
  defaultPollInterval: 1500,
  defaultMaxAttempts: 200,
  nodes: [
    // -----------------------------------------------------------------------
    // 1. Flux2ProTextToImage
    // -----------------------------------------------------------------------
    {
      className: "Flux2ProTextToImage",
      modelId: "flux-2/pro-text-to-image",
      title: "Flux 2 Pro Text To Image",
      description:
        "Generate images using Black Forest Labs' Flux 2 Pro Text-to-Image model via Kie.ai.\n\n    kie, flux, flux-2, flux-pro, black-forest-labs, image generation, ai, text-to-image\n\n    Use cases:\n    - Generate high-quality artistic images from text\n    - Create professional visual content\n    - Generate images with fine detail and artistic style",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description:
            "The aspect ratio of the generated image. 'auto' matches the first input image ratio.",
          values: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "auto"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "1K",
          title: "Resolution",
          description: "Output image resolution.",
          values: ["1K", "2K"]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 2. Flux2ProImageToImage
    // -----------------------------------------------------------------------
    {
      className: "Flux2ProImageToImage",
      modelId: "flux-2/pro-image-to-image",
      title: "Flux 2 Pro Image To Image",
      description:
        "Generate images using Black Forest Labs' Flux 2 Pro Image-to-Image model via Kie.ai.\n\n    kie, flux, flux-2, flux-pro, black-forest-labs, image generation, ai, image-to-image\n\n    Use cases:\n    - Transform existing images with text prompts\n    - Apply artistic styles to photos\n    - Create variations of existing images\n    - Enhance and modify images",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing how to transform the image."
        },
        {
          name: "images",
          type: "list[image]",
          default: [],
          title: "Images",
          description: "Source images to transform (1-8 images supported)."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description:
            "The aspect ratio of the generated image. 'auto' matches the first input image ratio.",
          values: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "auto"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "1K",
          title: "Resolution",
          description: "Output image resolution.",
          values: ["1K", "2K"]
        }
      ],
      uploads: [
        {
          field: "images",
          kind: "image",
          isList: true,
          paramName: "input_urls"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 3. Flux2FlexTextToImage
    // -----------------------------------------------------------------------
    {
      className: "Flux2FlexTextToImage",
      modelId: "flux-2/flex-text-to-image",
      title: "Flux 2 Flex Text To Image",
      description:
        "Generate images using Black Forest Labs' Flux 2 Flex Text-to-Image model via Kie.ai.\n\n    kie, flux, flux-2, flux-flex, black-forest-labs, image generation, ai, text-to-image\n\n    Use cases:\n    - Generate high-quality images from text with flexible parameters\n    - Create professional visual content\n    - Generate images with fine detail and artistic style",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description:
            "The aspect ratio of the generated image. 'auto' matches the first input image ratio.",
          values: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "auto"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "1K",
          title: "Resolution",
          description: "Output image resolution.",
          values: ["1K", "2K"]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 4. Flux2FlexImageToImage
    // -----------------------------------------------------------------------
    {
      className: "Flux2FlexImageToImage",
      modelId: "flux-2/flex-image-to-image",
      title: "Flux 2 Flex Image To Image",
      description:
        "Generate images using Black Forest Labs' Flux 2 Flex Image-to-Image model via Kie.ai.\n\n    kie, flux, flux-2, flux-flex, black-forest-labs, image generation, ai, image-to-image\n\n    Use cases:\n    - Transform existing images with text prompts\n    - Apply artistic styles to photos\n    - Create variations of existing images\n    - Enhance and modify images",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing how to transform the image."
        },
        {
          name: "images",
          type: "list[image]",
          default: [],
          title: "Images",
          description: "Source images to transform (1-8 images supported)."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description:
            "The aspect ratio of the generated image. 'auto' matches the first input image ratio.",
          values: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "auto"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "1K",
          title: "Resolution",
          description: "Output image resolution.",
          values: ["1K", "2K"]
        }
      ],
      uploads: [
        {
          field: "images",
          kind: "image",
          isList: true,
          paramName: "input_urls"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 5. Seedream45TextToImage
    // -----------------------------------------------------------------------
    {
      className: "Seedream45TextToImage",
      modelId: "seedream/4.5-text-to-image",
      title: "Seedream 4.5 Text To Image",
      description:
        "Generate images using ByteDance's Seedream 4.5 Text-to-Image model via Kie.ai.\n\n    kie, seedream, bytedance, image generation, ai, text-to-image, 4k\n\n    Seedream 4.5 generates high-quality visuals up to 4K resolution with\n    improved detail fidelity, multi-image blending, and sharp text/face rendering.\n\n    Use cases:\n    - Generate creative and artistic images from text\n    - Create diverse visual content up to 4K\n    - Generate illustrations with unique styles",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        },
        {
          name: "quality",
          type: "enum",
          default: "basic",
          title: "Quality",
          description: "Basic outputs 2K images, while High outputs 4K images.",
          values: ["basic", "high"]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 6. Seedream45Edit
    // -----------------------------------------------------------------------
    {
      className: "Seedream45Edit",
      modelId: "seedream/4.5-edit",
      title: "Seedream 4.5 Edit",
      description:
        "Edit images using ByteDance's Seedream 4.5 Edit model via Kie.ai.\n\n    kie, seedream, bytedance, image editing, ai, image-to-image, 4k\n\n    Seedream 4.5 Edit allows you to modify existing images while maintaining\n    high quality and detail fidelity up to 4K resolution.\n\n    Use cases:\n    - Edit and enhance existing images\n    - Apply style changes to photos\n    - Modify specific regions of images\n    - Improve image quality and resolution",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing how to edit the image."
        },
        {
          name: "image_input",
          type: "list[image]",
          default: [],
          title: "Image Input",
          description: "The source images to edit."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the output image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        },
        {
          name: "quality",
          type: "enum",
          default: "basic",
          title: "Quality",
          description: "Basic outputs 2K images, while High outputs 4K images.",
          values: ["basic", "high"]
        }
      ],
      uploads: [
        {
          field: "image_input",
          kind: "image",
          isList: false,
          paramName: "image_url"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 7. ZImage
    // -----------------------------------------------------------------------
    {
      className: "ZImage",
      modelId: "z-image",
      title: "Z-Image Turbo",
      description:
        "Generate images using Alibaba's Z-Image Turbo model via Kie.ai.\n\n    kie, z-image, zimage, alibaba, image generation, ai, text-to-image, photorealistic\n\n    Z-Image Turbo produces realistic, detail-rich images with very low latency.\n    It supports bilingual text (English/Chinese) in images with sharp text rendering.\n\n    Use cases:\n    - Generate high-quality photorealistic images quickly\n    - Create images with embedded text (English/Chinese)\n    - Generate detailed illustrations with low latency\n    - Product visualizations",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 8. NanoBanana
    // -----------------------------------------------------------------------
    {
      className: "NanoBanana",
      modelId: "google/nano-banana",
      title: "Nano Banana",
      description:
        "Generate images using Google's Nano Banana model (Gemini 2.5) via Kie.ai.\n\n    kie, nano-banana, google, gemini, image generation, ai, text-to-image, fast",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "image_size",
          type: "enum",
          default: "1:1",
          title: "Image Size",
          description: "The size of the output image.",
          values: [
            "1:1",
            "9:16",
            "16:9",
            "3:4",
            "4:3",
            "3:2",
            "2:3",
            "5:4",
            "4:5",
            "21:9",
            "auto"
          ]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ],
      paramNames: {
        image_size: "aspect_ratio"
      }
    },

    // -----------------------------------------------------------------------
    // 9. NanoBananaPro
    // -----------------------------------------------------------------------
    {
      className: "NanoBananaPro",
      modelId: "nano-banana-pro",
      title: "Nano Banana Pro",
      description:
        "Generate images using Google's Nano Banana Pro model (Gemini 3.0) via Kie.ai.\n\n    kie, nano-banana-pro, google, gemini, image generation, ai, text-to-image, 4k, high-fidelity",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "image_input",
          type: "list[image]",
          default: [],
          title: "Image Input",
          description: "Optional image inputs for multimodal generation."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        },
        {
          name: "resolution",
          type: "enum",
          default: "2K",
          title: "Resolution",
          description: "Output image resolution.",
          values: ["1K", "2K", "4K"]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 10. FluxKontext
    // -----------------------------------------------------------------------
    {
      className: "FluxKontext",
      modelId: "flux-kontext/text-to-image",
      title: "Flux Kontext",
      description:
        "Generate images using Black Forest Labs' Flux Kontext model via Kie.ai.\n\n    kie, flux, flux-kontext, black-forest-labs, image generation, ai, text-to-image, editing\n\n    Flux Kontext supports Pro (speed-optimized) and Max (quality-focused) variants\n    with features like multiple aspect ratios, safety controls, and async processing.\n\n    Use cases:\n    - Generate high-quality artistic images\n    - Advanced image editing and generation\n    - Create professional visual content\n    - Generate images with fine detail and artistic style",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        },
        {
          name: "mode",
          type: "enum",
          default: "pro",
          title: "Mode",
          description: "Generation mode: 'pro' for speed, 'max' for quality.",
          values: ["pro", "max"]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 11. GrokImagineTextToImage
    // -----------------------------------------------------------------------
    {
      className: "GrokImagineTextToImage",
      modelId: "grok-imagine/text-to-image",
      title: "Grok Imagine Text To Image",
      description:
        "Generate images using xAI's Grok Imagine Text-to-Image model via Kie.ai.\n\n    kie, grok, xai, image generation, ai, text-to-image, multimodal\n\n    Grok Imagine is a multimodal generative model that can generate images\n    from text prompts.\n\n    Use cases:\n    - Generate images from text descriptions\n    - Create visual content with AI",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 12. GrokImagineUpscale
    // -----------------------------------------------------------------------
    {
      className: "GrokImagineUpscale",
      modelId: "grok-imagine/upscale",
      title: "Grok Imagine Upscale",
      description:
        "Upscale images using xAI's Grok Imagine Upscale model via Kie.ai.\n\n    kie, grok, xai, upscale, enhance, image, ai, super-resolution\n\n    Grok Imagine Upscale enhances and upscales images to higher resolutions\n    while maintaining quality and detail.\n\n    Constraints:\n    - Only images generated by Kie AI models (via Grok Imagine) are supported for upscaling.",
      outputType: "image",
      fields: [
        {
          name: "image",
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description:
            "The image to upscale. Must be an image previously generated by a Kie.ai node."
        }
      ],
      uploads: [
        {
          field: "image",
          kind: "image",
          paramName: "image_url"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 13. QwenTextToImage
    // -----------------------------------------------------------------------
    {
      className: "QwenTextToImage",
      modelId: "qwen/text-to-image",
      title: "Qwen Text To Image",
      description:
        "Generate images using Qwen's Text-to-Image model via Kie.ai.\n\n    kie, qwen, alibaba, image generation, ai, text-to-image\n\n    Qwen's text-to-image model generates high-quality images from text descriptions.\n\n    Use cases:\n    - Generate images from text descriptions\n    - Create artistic and realistic images\n    - Generate illustrations and artwork",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 14. QwenImageToImage
    // -----------------------------------------------------------------------
    {
      className: "QwenImageToImage",
      modelId: "qwen/image-to-image",
      title: "Qwen Image To Image",
      description:
        "Transform images using Qwen's Image-to-Image model via Kie.ai.\n\n    kie, qwen, alibaba, image transformation, ai, image-to-image\n\n    Qwen's image-to-image model transforms images based on text prompts\n    while preserving the overall structure and style.\n\n    Use cases:\n    - Transform images with text guidance\n    - Apply artistic styles to photos\n    - Create variations of existing images",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing how to transform the image."
        },
        {
          name: "image",
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The source image to transform."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the output image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        }
      ],
      uploads: [
        {
          field: "image",
          kind: "image",
          paramName: "image_url"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 15. TopazImageUpscale
    // -----------------------------------------------------------------------
    {
      className: "TopazImageUpscale",
      modelId: "topaz/image-upscale",
      title: "Topaz Image Upscale",
      description:
        "Upscale and enhance images using Topaz Labs AI via Kie.ai.\n\n    kie, topaz, upscale, enhance, image, ai, super-resolution\n\n    Topaz Image Upscale uses advanced AI models to enlarge images\n    while preserving and enhancing detail.\n\n    Use cases:\n    - Upscale low-resolution images\n    - Enhance image quality and detail\n    - Enlarge images for print or display",
      outputType: "image",
      fields: [
        {
          name: "image",
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to upscale."
        },
        {
          name: "upscale_factor",
          type: "enum",
          default: "2",
          title: "Upscale Factor",
          description: "The upscaling factor (2x or 4x).",
          values: ["2", "4"]
        }
      ],
      uploads: [
        {
          field: "image",
          kind: "image",
          paramName: "image_url"
        }
      ],
      paramNames: {
        upscale_factor: "scale_factor"
      }
    },

    // -----------------------------------------------------------------------
    // 16. RecraftRemoveBackground
    // -----------------------------------------------------------------------
    {
      className: "RecraftRemoveBackground",
      modelId: "recraft/remove-background",
      title: "Recraft Remove Background",
      description:
        "Remove background from images using Recraft's model via Kie.ai.\n\n    kie, recraft, remove-background, image processing, ai\n\n    Use cases:\n    - Automatically remove backgrounds from photos\n    - Create transparent PNGs for design work\n    - Isolate subjects in images",
      outputType: "image",
      fields: [
        {
          name: "image",
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to remove the background from."
        }
      ],
      uploads: [
        {
          field: "image",
          kind: "image",
          paramName: "image_url"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 17. IdeogramCharacter
    // -----------------------------------------------------------------------
    {
      className: "IdeogramCharacter",
      modelId: "ideogram/character",
      title: "Ideogram Character",
      description:
        "Generate character images using Ideogram via Kie.ai.\n\n    kie, ideogram, character, image generation, ai, character consistency\n\n    Ideogram Character generates images of characters in different settings while\n    maintaining character consistency using reference images and text prompts.\n\n    Use cases:\n    - Generate character images in various settings\n    - Maintain character consistency across images\n    - Create character portraits with specific backgrounds",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "Text description for the character image."
        },
        {
          name: "reference_images",
          type: "list[image]",
          default: [],
          title: "Reference Images",
          description: "Reference images for character guidance."
        },
        {
          name: "rendering_speed",
          type: "enum",
          default: "BALANCED",
          title: "Rendering Speed",
          description: "Rendering speed preference.",
          values: ["TURBO", "BALANCED", "QUALITY"]
        },
        {
          name: "style",
          type: "enum",
          default: "AUTO",
          title: "Style",
          description: "Generation style.",
          values: ["AUTO", "REALISTIC", "FICTION"]
        },
        {
          name: "expand_prompt",
          type: "bool",
          default: true,
          title: "Expand Prompt",
          description: "Whether to expand/augment the prompt."
        },
        {
          name: "image_size",
          type: "enum",
          default: "square_hd",
          title: "Image Size",
          description: "The size of the output image.",
          values: [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          name: "negative_prompt",
          type: "str",
          default: "",
          title: "Negative Prompt",
          description: "Undesired elements to exclude from the image."
        },
        {
          name: "seed",
          type: "int",
          default: 0,
          title: "Seed",
          description: "Random seed for generation.",
          min: 0
        }
      ],
      uploads: [
        {
          field: "reference_images",
          kind: "image",
          isList: true,
          paramName: "input_urls"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ],
      paramNames: {
        image_size: "aspect_ratio"
      }
    },

    // -----------------------------------------------------------------------
    // 18. IdeogramCharacterEdit
    // -----------------------------------------------------------------------
    {
      className: "IdeogramCharacterEdit",
      modelId: "ideogram/character-edit",
      title: "Ideogram Character Edit",
      description:
        "Edit masked character images using Ideogram via Kie.ai.\n\n    kie, ideogram, character-edit, image editing, ai, inpainting\n\n    Ideogram Character Edit allows you to fill masked parts of character images\n    while maintaining character consistency using reference images and text prompts.\n\n    Use cases:\n    - Edit specific parts of character images\n    - Fill masked areas with new content\n    - Maintain character consistency during edits",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "Text description for the masked area."
        },
        {
          name: "image",
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "Base image with masked area to fill."
        },
        {
          name: "mask",
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Mask",
          description: "Mask image indicating areas to edit."
        },
        {
          name: "reference_images",
          type: "list[image]",
          default: [],
          title: "Reference Images",
          description: "Reference images for character guidance."
        },
        {
          name: "rendering_speed",
          type: "enum",
          default: "BALANCED",
          title: "Rendering Speed",
          description: "Rendering speed preference.",
          values: ["TURBO", "BALANCED", "QUALITY"]
        },
        {
          name: "style",
          type: "enum",
          default: "AUTO",
          title: "Style",
          description: "Generation style.",
          values: ["AUTO", "REALISTIC", "FICTION"]
        },
        {
          name: "expand_prompt",
          type: "bool",
          default: true,
          title: "Expand Prompt",
          description: "Whether to expand/augment the prompt."
        },
        {
          name: "seed",
          type: "int",
          default: 0,
          title: "Seed",
          description: "Random seed for generation.",
          min: 0
        }
      ],
      uploads: [
        {
          field: "image",
          kind: "image",
          paramName: "image_url"
        },
        {
          field: "mask",
          kind: "image",
          paramName: "mask_url"
        },
        {
          field: "reference_images",
          kind: "image",
          isList: true,
          paramName: "reference_image_urls"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 19. IdeogramCharacterRemix
    // -----------------------------------------------------------------------
    {
      className: "IdeogramCharacterRemix",
      modelId: "ideogram/character-remix",
      title: "Ideogram Character Remix",
      description:
        "Remix characters in images using Ideogram via Kie.ai.\n\n    kie, ideogram, character-remix, image generation, ai, remix\n\n    Ideogram Character Remix allows you to remix images while maintaining character consistency\n    using reference images and text prompts.",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "Text description for remixing."
        },
        {
          name: "image",
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "Base image to remix."
        },
        {
          name: "reference_images",
          type: "list[image]",
          default: [],
          title: "Reference Images",
          description: "Reference images for character guidance."
        },
        {
          name: "rendering_speed",
          type: "enum",
          default: "BALANCED",
          title: "Rendering Speed",
          description: "Rendering speed preference.",
          values: ["TURBO", "BALANCED", "QUALITY"]
        },
        {
          name: "style",
          type: "enum",
          default: "AUTO",
          title: "Style",
          description: "Generation style.",
          values: ["AUTO", "GENERAL", "REALISTIC", "DESIGN"]
        },
        {
          name: "expand_prompt",
          type: "bool",
          default: true,
          title: "Expand Prompt",
          description: "Whether to expand/augment the prompt."
        },
        {
          name: "image_size",
          type: "enum",
          default: "square_hd",
          title: "Image Size",
          description: "The size of the output image.",
          values: [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          name: "strength",
          type: "float",
          default: 0.8,
          title: "Strength",
          description: "How strongly to apply the remix (0.0 to 1.0).",
          min: 0,
          max: 1
        },
        {
          name: "negative_prompt",
          type: "str",
          default: "",
          title: "Negative Prompt",
          description: "Undesired elements to exclude from the image."
        },
        {
          name: "additional_images",
          type: "list[image]",
          default: [],
          title: "Additional Images",
          description: "Additional image this."
        },
        {
          name: "reference_mask_urls",
          type: "str",
          default: "",
          title: "Reference Mask Urls",
          description: "URL(s) to masks for references (comma-separated)."
        }
      ],
      uploads: [
        {
          field: "image",
          kind: "image",
          paramName: "image_url"
        },
        {
          field: "reference_images",
          kind: "image",
          isList: true,
          paramName: "reference_image_urls"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 20. IdeogramV3Reframe
    // -----------------------------------------------------------------------
    {
      className: "IdeogramV3Reframe",
      modelId: "ideogram/v3-reframe",
      title: "Ideogram V3 Reframe",
      description:
        "Reframe images using Ideogram v3 via Kie.ai.\n\n    kie, ideogram, v3-reframe, image processing, ai, reframe\n\n    Use cases:\n    - Reframe and rescale existing images\n    - Change aspect ratio of images while maintaining quality",
      outputType: "image",
      fields: [
        {
          name: "image",
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "URL of the image to reframe."
        },
        {
          name: "image_size",
          type: "enum",
          default: "square_hd",
          title: "Image Size",
          description: "Output resolution preset.",
          values: [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          name: "rendering_speed",
          type: "enum",
          default: "BALANCED",
          title: "Rendering Speed",
          description: "Rendering speed preference.",
          values: ["TURBO", "BALANCED", "QUALITY"]
        },
        {
          name: "style",
          type: "enum",
          default: "AUTO",
          title: "Style",
          description: "Generation style.",
          values: ["AUTO", "GENERAL", "REALISTIC", "DESIGN"]
        },
        {
          name: "seed",
          type: "int",
          default: 0,
          title: "Seed",
          description: "RNG seed."
        }
      ],
      uploads: [
        {
          field: "image",
          kind: "image",
          paramName: "image_url"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 21. RecraftCrispUpscale
    // -----------------------------------------------------------------------
    {
      className: "RecraftCrispUpscale",
      modelId: "recraft/crisp-upscale",
      title: "Recraft Crisp Upscale",
      description:
        "Upscale images using Recraft's Crisp Upscale model via Kie.ai.\n\n    kie, recraft, crisp-upscale, upscale, ai",
      outputType: "image",
      fields: [
        {
          name: "image",
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to upscale."
        }
      ],
      uploads: [
        {
          field: "image",
          kind: "image",
          paramName: "image_url"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 22. Imagen4Fast
    // -----------------------------------------------------------------------
    {
      className: "Imagen4Fast",
      modelId: "google/imagen4-fast",
      title: "Imagen 4 Fast",
      description:
        "Generate images using Google's Imagen 4 Fast model via Kie.ai.\n\n    kie, google, imagen, imagen4, fast, image generation, ai",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "negative_prompt",
          type: "str",
          default: "",
          title: "Negative Prompt",
          description: "Undesired elements to exclude."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 23. Imagen4Ultra
    // -----------------------------------------------------------------------
    {
      className: "Imagen4Ultra",
      modelId: "google/imagen4-ultra",
      title: "Imagen 4 Ultra",
      description:
        "Generate images using Google's Imagen 4 Ultra model via Kie.ai.\n\n    kie, google, imagen, imagen4, ultra, image generation, ai",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "negative_prompt",
          type: "str",
          default: "",
          title: "Negative Prompt",
          description: "Undesired elements to exclude."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        },
        {
          name: "seed",
          type: "int",
          default: 0,
          title: "Seed",
          description: "RNG seed."
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 24. Imagen4
    // -----------------------------------------------------------------------
    {
      className: "Imagen4",
      modelId: "google/imagen4",
      title: "Imagen 4",
      description:
        "Generate images using Google's Imagen 4 model via Kie.ai.\n\n    kie, google, imagen, imagen4, image generation, ai",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "negative_prompt",
          type: "str",
          default: "",
          title: "Negative Prompt",
          description: "Undesired elements to exclude."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        },
        {
          name: "seed",
          type: "int",
          default: 0,
          title: "Seed",
          description: "RNG seed."
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 25. NanoBananaEdit
    // -----------------------------------------------------------------------
    {
      className: "NanoBananaEdit",
      modelId: "google/nano-banana-edit",
      title: "Nano Banana Edit",
      description:
        "Edit images using Google's Nano Banana model via Kie.ai.\n\n    kie, google, nano-banana, nano-banana-edit, image editing, ai",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "Text description of the changes to make."
        },
        {
          name: "image_input",
          type: "list[image]",
          default: [],
          title: "Image Input",
          description: "Images to edit."
        },
        {
          name: "image_size",
          type: "enum",
          default: "1:1",
          title: "Image Size",
          description: "The size of the output image.",
          values: [
            "1:1",
            "9:16",
            "16:9",
            "3:4",
            "4:3",
            "3:2",
            "2:3",
            "5:4",
            "4:5",
            "21:9",
            "auto"
          ]
        }
      ],
      uploads: [
        {
          field: "image_input",
          kind: "image",
          isList: false,
          paramName: "image_url"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 26. GPTImage4oTextToImage
    // -----------------------------------------------------------------------
    {
      className: "GPTImage4oTextToImage",
      modelId: "gpt-image-4o/text-to-image",
      title: "GPT 4o Image Text To Image",
      description:
        "Generate images using OpenAI's GPT-4o Image model via Kie.ai.\n\n    kie, openai, gpt-4o, 4o-image, image generation, ai, text-to-image\n\n    The GPT-Image-1 model (ChatGPT 4o Image) understands both text and visual\n    context, allowing precise image creation with accurate text rendering\n    and consistent styles.\n\n    Use cases:\n    - Generate high-quality images from text descriptions\n    - Create images with precise text rendering\n    - Generate design and marketing materials\n    - Produce creative visuals with strong instruction following",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "size",
          type: "enum",
          default: "1:1",
          title: "Size",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "3:2", "2:3"]
        },
        {
          name: "n_variants",
          type: "int",
          default: 1,
          title: "N Variants",
          description: "Number of image variants to generate (1, 2, or 4).",
          min: 1,
          max: 4
        },
        {
          name: "is_enhance",
          type: "bool",
          default: false,
          title: "Is Enhance",
          description: "Enable prompt enhancement for more refined effects."
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 27. GPTImage4oImageToImage
    // -----------------------------------------------------------------------
    {
      className: "GPTImage4oImageToImage",
      modelId: "gpt-image-4o/image-to-image",
      title: "GPT 4o Image Edit",
      description:
        "Edit images using OpenAI's GPT-4o Image model via Kie.ai.\n\n    kie, openai, gpt-4o, 4o-image, image editing, ai, image-to-image\n\n    The GPT-Image-1 model (ChatGPT 4o Image) enables precise image editing\n    with strong instruction following and accurate text rendering.\n\n    Use cases:\n    - Edit and transform existing images\n    - Apply specific modifications to images\n    - Add or modify text in images\n    - Create variations of existing visuals",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing how to edit the image."
        },
        {
          name: "images",
          type: "list[image]",
          default: [],
          title: "Images",
          description: "Input images to edit (supports up to 5 images)."
        },
        {
          name: "size",
          type: "enum",
          default: "1:1",
          title: "Size",
          description: "The aspect ratio of the output image.",
          values: ["1:1", "3:2", "2:3"]
        },
        {
          name: "n_variants",
          type: "int",
          default: 1,
          title: "N Variants",
          description: "Number of image variants to generate (1, 2, or 4).",
          min: 1,
          max: 4
        }
      ],
      uploads: [
        {
          field: "images",
          kind: "image",
          isList: true,
          paramName: "input_urls"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 28. GPTImage15TextToImage
    // -----------------------------------------------------------------------
    {
      className: "GPTImage15TextToImage",
      modelId: "gpt-image/1.5-text-to-image",
      title: "GPT Image 1.5 Text To Image",
      description:
        "Generate images using OpenAI's GPT Image 1.5 model via Kie.ai.\n\n    kie, openai, gpt-image-1.5, image generation, ai, text-to-image\n\n    GPT Image 1.5 is OpenAI's flagship image generation model for high-quality\n    image creation and precise image editing, with strong instruction following\n    and improved text rendering.\n\n    Use cases:\n    - Generate high-quality images from text descriptions\n    - Create images with excellent text rendering\n    - Generate professional marketing and design materials\n    - Produce creative visuals with precise control",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "2:3", "3:2"]
        },
        {
          name: "quality",
          type: "enum",
          default: "medium",
          title: "Quality",
          description:
            "Image quality setting. Medium = balanced, High = slow/detailed.",
          values: ["medium", "high"]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 29. GPTImage15ImageToImage
    // -----------------------------------------------------------------------
    {
      className: "GPTImage15ImageToImage",
      modelId: "gpt-image/1.5-image-to-image",
      title: "GPT Image 1.5 Edit",
      description:
        "Edit images using OpenAI's GPT Image 1.5 model via Kie.ai.\n\n    kie, openai, gpt-image-1.5, image editing, ai, image-to-image\n\n    GPT Image 1.5 enables precise image editing with strong instruction following\n    and improved text rendering capabilities.\n\n    Use cases:\n    - Edit and transform existing images\n    - Apply specific modifications with precise control\n    - Add or modify text in images accurately\n    - Create variations with high fidelity",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing how to edit the image."
        },
        {
          name: "images",
          type: "list[image]",
          default: [],
          title: "Images",
          description: "Input images to edit (supports up to 16 images)."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the output image.",
          values: ["1:1", "2:3", "3:2"]
        },
        {
          name: "quality",
          type: "enum",
          default: "medium",
          title: "Quality",
          description:
            "Image quality setting. Medium = balanced, High = slow/detailed.",
          values: ["medium", "high"]
        }
      ],
      uploads: [
        {
          field: "images",
          kind: "image",
          isList: true,
          paramName: "input_urls"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 30. IdeogramV3TextToImage
    // -----------------------------------------------------------------------
    {
      className: "IdeogramV3TextToImage",
      modelId: "ideogram/v3-text-to-image",
      title: "Ideogram V3 Text To Image",
      description:
        "Generate images using Ideogram V3 model via Kie.ai.\n\n    kie, ideogram, v3, image generation, ai, text-to-image\n\n    Ideogram V3 is the latest generation of Ideogram's image generation model,\n    offering text-to-image with improved consistency and creative control.\n\n    Use cases:\n    - Generate creative images from text descriptions\n    - Create images with excellent text rendering\n    - Produce artistic and design content",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "negative_prompt",
          type: "str",
          default: "",
          title: "Negative Prompt",
          description: "Elements to avoid in the generated image."
        },
        {
          name: "rendering_speed",
          type: "enum",
          default: "BALANCED",
          title: "Rendering Speed",
          description: "Rendering speed preference.",
          values: ["TURBO", "BALANCED", "QUALITY"]
        },
        {
          name: "style",
          type: "enum",
          default: "AUTO",
          title: "Style",
          description: "Generation style.",
          values: ["AUTO", "GENERAL", "REALISTIC", "DESIGN"]
        },
        {
          name: "image_size",
          type: "enum",
          default: "square",
          title: "Image Size",
          description: "The resolution of the generated image.",
          values: [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          name: "expand_prompt",
          type: "bool",
          default: true,
          title: "Expand Prompt",
          description: "Whether to expand/augment the prompt with MagicPrompt."
        },
        {
          name: "seed",
          type: "int",
          default: -1,
          title: "Seed",
          description:
            "Random seed for reproducible results. Use -1 for random."
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ],
      conditionalFields: [{ field: "negative_prompt", condition: "truthy" }]
    },

    // -----------------------------------------------------------------------
    // 31. IdeogramV3ImageToImage
    // -----------------------------------------------------------------------
    {
      className: "IdeogramV3ImageToImage",
      modelId: "ideogram/v3-edit",
      title: "Ideogram V3 Image To Image",
      description:
        "Edit images using Ideogram V3 model via Kie.ai.\n\n    kie, ideogram, v3, image editing, ai, image-to-image\n\n    Ideogram V3 offers image editing capabilities with improved consistency\n    and creative control.\n\n    Use cases:\n    - Edit and transform existing images\n    - Apply style changes while maintaining structure\n    - Create variations of existing images",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing how to transform the image."
        },
        {
          name: "image",
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The source image to transform."
        },
        {
          name: "negative_prompt",
          type: "str",
          default: "",
          title: "Negative Prompt",
          description: "Elements to avoid in the output."
        },
        {
          name: "rendering_speed",
          type: "enum",
          default: "BALANCED",
          title: "Rendering Speed",
          description: "Rendering speed preference.",
          values: ["TURBO", "BALANCED", "QUALITY"]
        },
        {
          name: "style",
          type: "enum",
          default: "AUTO",
          title: "Style",
          description: "Generation style.",
          values: ["AUTO", "GENERAL", "REALISTIC", "DESIGN"]
        },
        {
          name: "image_size",
          type: "enum",
          default: "square",
          title: "Image Size",
          description: "The resolution of the output image.",
          values: [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          name: "strength",
          type: "float",
          default: 0.5,
          title: "Strength",
          description:
            "Strength of the input image in the remix (0-1). Lower = more original preserved.",
          min: 0,
          max: 1
        },
        {
          name: "expand_prompt",
          type: "bool",
          default: true,
          title: "Expand Prompt",
          description: "Whether to expand/augment the prompt with MagicPrompt."
        },
        {
          name: "seed",
          type: "int",
          default: -1,
          title: "Seed",
          description:
            "Random seed for reproducible results. Use -1 for random."
        }
      ],
      uploads: [
        {
          field: "image",
          kind: "image",
          paramName: "image_url"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 32. Seedream40TextToImage
    // -----------------------------------------------------------------------
    {
      className: "Seedream40TextToImage",
      modelId: "bytedance/seedream-v4-text-to-image",
      title: "Seedream 4.0 Text To Image",
      description:
        "Generate images using ByteDance's Seedream 4.0 model via Kie.ai.\n\n    kie, seedream, bytedance, seedream-4, image generation, ai, text-to-image\n\n    Seedream 4.0 is ByteDance's image generation model that combines text-to-image\n    with batch consistency, high speed, and professional-quality outputs.\n\n    Use cases:\n    - Generate creative and artistic images from text\n    - Create professional visual content\n    - Produce consistent batch images",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing the image to generate."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the generated image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        },
        {
          name: "quality",
          type: "enum",
          default: "basic",
          title: "Quality",
          description: "Basic outputs 2K images, while High outputs 4K images.",
          values: ["basic", "high"]
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 33. Seedream40ImageToImage
    // -----------------------------------------------------------------------
    {
      className: "Seedream40ImageToImage",
      modelId: "bytedance/seedream-v4-edit",
      title: "Seedream 4.0 Edit",
      description:
        "Edit images using ByteDance's Seedream 4.0 model via Kie.ai.\n\n    kie, seedream, bytedance, seedream-4, image editing, ai, image-to-image\n\n    Seedream 4.0 offers image-to-image capabilities with batch consistency\n    and professional-quality outputs.\n\n    Use cases:\n    - Edit and transform existing images\n    - Apply style changes to photos\n    - Create variations of existing images",
      outputType: "image",
      fields: [
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "The text prompt describing how to transform the image."
        },
        {
          name: "image",
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The source image to transform."
        },
        {
          name: "aspect_ratio",
          type: "enum",
          default: "1:1",
          title: "Aspect Ratio",
          description: "The aspect ratio of the output image.",
          values: ["1:1", "16:9", "9:16", "4:3", "3:4"]
        },
        {
          name: "quality",
          type: "enum",
          default: "basic",
          title: "Quality",
          description: "Basic outputs 2K images, while High outputs 4K images.",
          values: ["basic", "high"]
        }
      ],
      uploads: [
        {
          field: "image",
          kind: "image",
          paramName: "image_url"
        }
      ],
      validation: [
        {
          field: "prompt",
          rule: "not_empty",
          message: "Prompt cannot be empty"
        }
      ]
    }
  ]
};
