import type { ModuleConfig } from "../types.js";

export const imageConfig: ModuleConfig = {
  "moduleName": "image",
  "defaultPollInterval": 1500,
  "defaultMaxAttempts": 400,
  "nodes": [
    {
      "className": "BytedanceSeedream",
      "modelId": "bytedance/seedream",
      "title": "Seedream3.0 - Text to Image",
      "description": "Seedream3.0 - Text to Image via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by Seedream3.0",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to generate the image (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "square_hd",
          "title": "Image Size",
          "description": "Select description",
          "required": false,
          "values": [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          "name": "guidance_scale",
          "type": "float",
          "default": 2.5,
          "title": "Guidance Scale",
          "description": "Controls how closely the output image aligns with the input prompt. Higher values mean stronger prompt correlation. (Min: 1, Max: 10, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 1,
          "max": 10
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed to control the stochasticity of image generation.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "BytedanceSeedreamV4TextToImage",
      "modelId": "bytedance/seedream-v4-text-to-image",
      "title": "Seedream4.0 - Text to Image",
      "description": "Seedream4.0 - Text to Image via Kie.ai.\n\n    kie, image, ai\n\n    High-quality photorealistic image generation powered by Seedream4.0's advanced AI model",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to generate the image (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "square_hd",
          "title": "Image Size",
          "description": "The size of the generated image.",
          "required": false,
          "values": [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_3_2",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_3_2",
            "landscape_16_9",
            "landscape_21_9"
          ]
        },
        {
          "name": "image_resolution",
          "type": "enum",
          "default": "1K",
          "title": "Image Resolution",
          "description": "Final image resolution is determined by combining image_size (aspect ratio) and image_resolution (pixel scale). For example, choosing 4:3 + 4K gives 4096 × 3072px",
          "required": false,
          "values": [
            "1K",
            "2K",
            "4K"
          ]
        },
        {
          "name": "max_images",
          "type": "float",
          "default": 1,
          "title": "Max Images",
          "description": "Set this value (1–6) to cap how many images a single generation run can produce in one set—because they’re created in one shot rather than separate requests, you must also state the exact number you want in the prompt so both settings align. (Min: 1, Max: 6, Step: 1) (step: 1)",
          "required": false,
          "min": 1,
          "max": 6
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed to control the stochasticity of image generation",
          "required": false
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "BytedanceSeedreamV4Edit",
      "modelId": "bytedance/seedream-v4-edit",
      "title": "Seedream4.0 - Edit",
      "description": "Seedream4.0 - Edit via Kie.ai.\n\n    kie, image, ai\n\n    Image editing by Seedream4.0",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to edit the image (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "List of URLs of input images for editing. Presently, up to 10 image inputs are allowed. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true,
          "max": 10
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "square_hd",
          "title": "Image Size",
          "description": "The size of the generated image.",
          "required": false,
          "values": [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_3_2",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_3_2",
            "landscape_16_9",
            "landscape_21_9"
          ]
        },
        {
          "name": "image_resolution",
          "type": "enum",
          "default": "1K",
          "title": "Image Resolution",
          "description": "Final image resolution is determined by combining image_size (aspect ratio) and image_resolution (pixel scale). For example, choosing 4:3 + 4K gives 4096 × 3072px",
          "required": false,
          "values": [
            "1K",
            "2K",
            "4K"
          ]
        },
        {
          "name": "max_images",
          "type": "float",
          "default": 1,
          "title": "Max Images",
          "description": "Set this value (1–6) to cap how many images a single generation run can produce in one set—because they’re created in one shot rather than separate requests, you must also state the exact number you want in the prompt so both settings align. (Min: 1, Max: 6, Step: 1) (step: 1)",
          "required": false,
          "min": 1,
          "max": 6
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed to control the stochasticity of image generation.",
          "required": false
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "image_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "Seedream45TextToImage",
      "modelId": "seedream/4.5-text-to-image",
      "title": "Seedream4.5 - Text to Image",
      "description": "Seedream4.5 - Text to Image via Kie.ai.\n\n    kie, image, ai\n\n    High-quality photorealistic image generation powered by Seedream's advanced AI model",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A text description of the image you want to generate (Max length: 3000 characters)",
          "required": true,
          "max": 3000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Width-height ratio of the image, determining its visual form.",
          "required": true,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "2:3",
            "3:2",
            "21:9"
          ]
        },
        {
          "name": "quality",
          "type": "enum",
          "default": "basic",
          "title": "Quality",
          "description": "Basic outputs 2K images, while High outputs 4K images.",
          "required": true,
          "values": [
            "basic",
            "high"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        },
        {
          "field": "quality",
          "rule": "not_empty",
          "message": "Quality is required"
        }
      ]
    },
    {
      "className": "Seedream45Edit",
      "modelId": "seedream/4.5-edit",
      "title": "Seedream4.5 - Edit",
      "description": "Seedream4.5 - Edit via Kie.ai.\n\n    kie, image, ai\n\n    Image editing by Seedream4.5",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A text description of the image you want to generate (Max length: 3000 characters)",
          "required": true,
          "max": 3000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Upload an image file to use as input for the API (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true,
          "max": 14
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Width-height ratio of the image, determining its visual form.",
          "required": true,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "2:3",
            "3:2",
            "21:9"
          ]
        },
        {
          "name": "quality",
          "type": "enum",
          "default": "basic",
          "title": "Quality",
          "description": "Basic outputs 2K images, while High outputs 4K images.",
          "required": true,
          "values": [
            "basic",
            "high"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "image_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        },
        {
          "field": "quality",
          "rule": "not_empty",
          "message": "Quality is required"
        }
      ]
    },
    {
      "className": "Seedream5LiteTextToImage",
      "modelId": "seedream/5-lite-text-to-image",
      "title": "Seedream5.0 Lite - Text to Image",
      "description": "Seedream5.0 Lite - Text to Image via Kie.ai.\n\n    kie, image, ai\n\n    High-quality photorealistic image generation powered by Seedream's advanced AI model",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A text description of the image you want to generate (Max length: 3-3000 characters)",
          "required": true,
          "min": 3,
          "max": 3000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Width-height ratio of the image, determining its visual form.",
          "required": true,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "2:3",
            "3:2",
            "21:9"
          ]
        },
        {
          "name": "quality",
          "type": "enum",
          "default": "basic",
          "title": "Quality",
          "description": "Basic outputs 2K images, while High outputs 4K images.",
          "required": true,
          "values": [
            "basic",
            "high"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        },
        {
          "field": "quality",
          "rule": "not_empty",
          "message": "Quality is required"
        }
      ]
    },
    {
      "className": "Seedream5LiteImageToImage",
      "modelId": "seedream/5-lite-image-to-image",
      "title": "Seedream5.0 Lite - Image to Image",
      "description": "Seedream5.0 Lite - Image to Image via Kie.ai.\n\n    kie, image, ai\n\n    High-quality photorealistic image generation powered by Seedream's advanced AI model",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A text description of the image you want to generate (Max length: 3-3000 characters)",
          "required": true,
          "min": 3,
          "max": 3000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Upload an image file to use as input for the API (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true,
          "max": 14
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Width-height ratio of the image, determining its visual form.",
          "required": true,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "2:3",
            "3:2",
            "21:9"
          ]
        },
        {
          "name": "quality",
          "type": "enum",
          "default": "basic",
          "title": "Quality",
          "description": "Basic outputs 2K images, while High outputs 4K images.",
          "required": true,
          "values": [
            "basic",
            "high"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "image_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        },
        {
          "field": "quality",
          "rule": "not_empty",
          "message": "Quality is required"
        }
      ]
    },
    {
      "className": "ZImage",
      "modelId": "z-image",
      "title": "Z-Image",
      "description": "Z-Image via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by z-image",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A text description of the image you want to generate (Max length: 1000 characters)",
          "required": true,
          "max": 1000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Aspect ratio for the generated image. Select 'auto' to match the first input image ratio (requires input image).",
          "required": true,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        }
      ]
    },
    {
      "className": "GoogleNanoBanana2",
      "modelId": "nano-banana-2",
      "title": "Google - Nano Banana 2",
      "description": "Google - Nano Banana 2 via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by Nano Banana 2",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A text description of the image you want to generate (Max length: 20000 characters)",
          "required": true,
          "max": 20000
        },
        {
          "name": "image_input",
          "type": "list[image]",
          "default": [],
          "title": "Image Input",
          "description": "Input images to transform or use as reference (supports up to 14 images) (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 30.0MB)",
          "required": false,
          "max": 14
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "auto",
          "title": "Aspect Ratio",
          "description": "Aspect ratio of the generated image",
          "required": false,
          "values": [
            "1:1",
            "1:4",
            "1:8",
            "2:3",
            "3:2",
            "3:4",
            "4:1",
            "4:3",
            "4:5",
            "5:4",
            "8:1",
            "9:16",
            "16:9",
            "21:9",
            "auto"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1K",
          "title": "Resolution",
          "description": "Resolution of the generated image",
          "required": false,
          "values": [
            "1K",
            "2K",
            "4K"
          ]
        },
        {
          "name": "output_format",
          "type": "enum",
          "default": "jpg",
          "title": "Output Format",
          "description": "Format of the output image",
          "required": false,
          "values": [
            "png",
            "jpg"
          ]
        }
      ],
      "uploads": [
        {
          "field": "image_input",
          "kind": "image",
          "isList": true,
          "paramName": "image_input"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "GoogleImagen4Fast",
      "modelId": "google/imagen4-fast",
      "title": "Google - imagen4-fast",
      "description": "Google - imagen4-fast via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by Google imagen4-fast",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt describing what you want to see (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "A description of what to discourage in the generated images (Max length: 5000 characters)",
          "required": false,
          "max": 5000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated image",
          "required": false,
          "values": [
            "1:1",
            "16:9",
            "9:16",
            "3:4",
            "4:3"
          ]
        },
        {
          "name": "num_images",
          "type": "enum",
          "default": "1",
          "title": "Num Images",
          "description": "Select description",
          "required": false,
          "values": [
            "1",
            "2",
            "3",
            "4"
          ]
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed for reproducible generation",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "GoogleImagen4Ultra",
      "modelId": "google/imagen4-ultra",
      "title": "Google - imagen4-ultra",
      "description": "Google - imagen4-ultra via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by Google imagen4-ultra",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt describing what you want to see (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "A description of what to discourage in the generated images (Max length: 5000 characters)",
          "required": false,
          "max": 5000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated image",
          "required": false,
          "values": [
            "1:1",
            "16:9",
            "9:16",
            "3:4",
            "4:3"
          ]
        },
        {
          "name": "seed",
          "type": "str",
          "default": "",
          "title": "Seed",
          "description": "Random seed for reproducible generation (Max length: 500 characters)",
          "required": false,
          "max": 500
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "GoogleImagen4",
      "modelId": "google/imagen4",
      "title": "Google - imagen4",
      "description": "Google - imagen4 via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by Google imagen4",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt describing what you want to see (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "A description of what to discourage in the generated images (Max length: 5000 characters)",
          "required": false,
          "max": 5000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated image",
          "required": false,
          "values": [
            "1:1",
            "16:9",
            "9:16",
            "3:4",
            "4:3"
          ]
        },
        {
          "name": "seed",
          "type": "str",
          "default": "",
          "title": "Seed",
          "description": "Random seed for reproducible generation (Max length: 500 characters)",
          "required": false,
          "max": 500
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "GoogleNanoBananaEdit",
      "modelId": "google/nano-banana-edit",
      "title": "Google - Nano Banana Edit",
      "description": "Google - Nano Banana Edit via Kie.ai.\n\n    kie, image, ai\n\n    Image editing using Google's Nano Banana Edit model",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt for image editing (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "List of URLs of input images for editing,up to 10 images. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true,
          "max": 10
        },
        {
          "name": "output_format",
          "type": "enum",
          "default": "png",
          "title": "Output Format",
          "description": "Output format for the images",
          "required": false,
          "values": [
            "png",
            "jpeg"
          ]
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "1:1",
          "title": "Image Size",
          "description": "Radio description",
          "required": false,
          "values": [
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
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "image_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "GoogleNanoBanana",
      "modelId": "google/nano-banana",
      "title": "Google - Nano Banana",
      "description": "Google - Nano Banana via Kie.ai.\n\n    kie, image, ai\n\n    Content generation using google/nano-banana",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt for image generation (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "output_format",
          "type": "enum",
          "default": "png",
          "title": "Output Format",
          "description": "Output format for the images",
          "required": false,
          "values": [
            "png",
            "jpeg"
          ]
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "1:1",
          "title": "Image Size",
          "description": "Radio description",
          "required": false,
          "values": [
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
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "NanoBananaPro",
      "modelId": "nano-banana-pro",
      "title": "Google - Nano Banana Pro",
      "description": "Google - Nano Banana Pro via Kie.ai.\n\n    kie, image, ai\n\n    Image generation using Google's Pro Image to Image model",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A text description of the image you want to generate (Max length: 10000 characters)",
          "required": true,
          "max": 10000
        },
        {
          "name": "image_input",
          "type": "list[image]",
          "default": [],
          "title": "Image Input",
          "description": "Input images to transform or use as reference (supports up to 8 images) (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 30.0MB)",
          "required": false,
          "max": 8
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Aspect ratio of the generated image",
          "required": false,
          "values": [
            "1:1",
            "2:3",
            "3:2",
            "3:4",
            "4:3",
            "4:5",
            "5:4",
            "9:16",
            "16:9",
            "21:9",
            "auto"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1K",
          "title": "Resolution",
          "description": "Resolution of the generated image",
          "required": false,
          "values": [
            "1K",
            "2K",
            "4K"
          ]
        },
        {
          "name": "output_format",
          "type": "enum",
          "default": "png",
          "title": "Output Format",
          "description": "Format of the output image",
          "required": false,
          "values": [
            "png",
            "jpg"
          ]
        }
      ],
      "uploads": [
        {
          "field": "image_input",
          "kind": "image",
          "isList": true,
          "paramName": "image_input"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "Flux2ProImageToImage",
      "modelId": "flux-2/pro-image-to-image",
      "title": "Flux-2 - Pro Image to Image",
      "description": "Flux-2 - Pro Image to Image via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by flux-2/pro-image-to-image",
      "outputType": "image",
      "fields": [
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Input reference images (1-8 images). (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true,
          "max": 8
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Must be between 3 and 5000 characters. (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Aspect ratio for the generated image. Select 'auto' to match the first input image ratio (requires input image).",
          "required": true,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "3:2",
            "2:3",
            "auto"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1K",
          "title": "Resolution",
          "description": "Output image resolution.",
          "required": true,
          "values": [
            "1K",
            "2K"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "input_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        },
        {
          "field": "resolution",
          "rule": "not_empty",
          "message": "Resolution is required"
        }
      ]
    },
    {
      "className": "Flux2ProTextToImage",
      "modelId": "flux-2/pro-text-to-image",
      "title": "Flux-2 - Pro Text to Image",
      "description": "Flux-2 - Pro Text to Image via Kie.ai.\n\n    kie, image, ai\n\n    High-quality photorealistic image generation powered by Flux-2's advanced AI model",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Must be between 3 and 5000 characters. (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Aspect ratio for the generated image. Select 'auto' to match the first input image ratio (requires input image).",
          "required": true,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "3:2",
            "2:3"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1K",
          "title": "Resolution",
          "description": "Output image resolution.",
          "required": true,
          "values": [
            "1K",
            "2K"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        },
        {
          "field": "resolution",
          "rule": "not_empty",
          "message": "Resolution is required"
        }
      ]
    },
    {
      "className": "Flux2FlexImageToImage",
      "modelId": "flux-2/flex-image-to-image",
      "title": "Flux-2 - Image to Image",
      "description": "Flux-2 - Image to Image via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by flux-2/flex-image-to-image",
      "outputType": "image",
      "fields": [
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Input reference images (1-8 images). (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true,
          "max": 8
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Must be between 3 and 5000 characters. (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Aspect ratio for the generated image. Select 'auto' to match the first input image ratio (requires input image).",
          "required": true,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "3:2",
            "2:3",
            "auto"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1K",
          "title": "Resolution",
          "description": "Output image resolution.",
          "required": true,
          "values": [
            "1K",
            "2K"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "input_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        },
        {
          "field": "resolution",
          "rule": "not_empty",
          "message": "Resolution is required"
        }
      ]
    },
    {
      "className": "Flux2FlexTextToImage",
      "modelId": "flux-2/flex-text-to-image",
      "title": "Flux-2 - Text to Image",
      "description": "Flux-2 - Text to Image via Kie.ai.\n\n    kie, image, ai\n\n    High-quality photorealistic image generation powered by Flux-2's advanced AI model",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Generation prompt, length must be between 3-5000 characters. (Maximum length: 5000 characters)",
          "required": true,
          "min": 3,
          "max": 5000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Aspect ratio of the generated image. When `auto` is selected, it will match the ratio of the first input image (requires input image to be provided).",
          "required": true,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "3:2",
            "2:3"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1K",
          "title": "Resolution",
          "description": "Output image resolution.",
          "required": true,
          "values": [
            "1K",
            "2K"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        },
        {
          "field": "resolution",
          "rule": "not_empty",
          "message": "Resolution is required"
        }
      ]
    },
    {
      "className": "GrokImagineTextToImage",
      "modelId": "grok-imagine/text-to-image",
      "title": "Grok Imagine - Text to Image",
      "description": "Grok Imagine - Text to Image via Kie.ai.\n\n    kie, image, ai\n\n    ## Query Task Status",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt describing the desired image. Required field. - Should be detailed and specific about the desired visual elements - Describe composition, style, lighting, mood, and other visual details - Maximum length: 5000 characters - Supports English language prompts",
          "required": true
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "",
          "title": "Aspect Ratio",
          "description": "Specifies the width-to-height ratio of the generated image. Controls the aspect ratio of the output. - **2:3**: Portrait orientation (vertical) - **3:2**: Landscape orientation (horizontal) - **1:1**: Square format - **16:9**: Wide screen format - **9:16**: Tall screen format Default: 1:1",
          "required": false,
          "values": [
            "2:3",
            "3:2",
            "1:1",
            "16:9",
            "9:16"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        },
        {
          "name": "enable_pro",
          "type": "bool",
          "default": false,
          "title": "Enable Pro",
          "description": "Controls the request processing strategy. - `false`: Corresponds to **speed mode**. The system prioritizes response time and throughput, suitable for latency-sensitive scenarios. - `true`: Corresponds to **quality mode**. The system prioritizes processing quality and precision, suitable for scenarios requiring higher accuracy.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "GrokImagineImageToImage",
      "modelId": "grok-imagine/image-to-image",
      "title": "Grok Imagine - image to image",
      "description": "Grok Imagine - image to image via Kie.ai.\n\n    kie, image, ai\n\n    Content generation using grok-imagine/image-to-image",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A text description specifying the desired content or style of the generated image. (Max length: 390000 characters)",
          "required": false,
          "max": 390000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "An array containing up to 1 URL string pointing to reference images. (Use file URLs after upload, not raw file content. Accepted types: image/jpeg, image/png, image/webp. Max size: 10.0MB per image.) In your prompt, reference the uploaded image by typing @image(n) followed by a space (for example: @image1 a sunset over the ocean).",
          "required": true,
          "max": 5
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "image_urls"
        }
      ]
    },
    {
      "className": "GptImage15TextToImage",
      "modelId": "gpt-image/1.5-text-to-image",
      "title": "GPT Image-1.5 - Text to Image",
      "description": "GPT Image-1.5 - Text to Image via Kie.ai.\n\n    kie, image, ai\n\n    ## Overview",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A text description of the image you want to generate",
          "required": true
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Width-height ratio of the image, determining its visual form.",
          "required": true,
          "values": [
            "1:1",
            "2:3",
            "3:2"
          ]
        },
        {
          "name": "quality",
          "type": "enum",
          "default": "medium",
          "title": "Quality",
          "description": "Quality: medium=balanced, high=slow/detailed.",
          "required": true,
          "values": [
            "medium",
            "high"
          ]
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        },
        {
          "field": "quality",
          "rule": "not_empty",
          "message": "Quality is required"
        }
      ]
    },
    {
      "className": "GptImage15ImageToImage",
      "modelId": "gpt-image/1.5-image-to-image",
      "title": "GPT Image-1.5 - Image to Image",
      "description": "GPT Image-1.5 - Image to Image via Kie.ai.\n\n    kie, image, ai\n\n    ## Overview",
      "outputType": "image",
      "fields": [
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Upload an image file to use as input for the API (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true,
          "max": 16
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A text description of the image you want to generate",
          "required": true
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "3:2",
          "title": "Aspect Ratio",
          "description": "Width-height ratio of the image, determining its visual form.",
          "required": true,
          "values": [
            "1:1",
            "2:3",
            "3:2"
          ]
        },
        {
          "name": "quality",
          "type": "enum",
          "default": "medium",
          "title": "Quality",
          "description": "Quality: medium=balanced, high=slow/detailed.",
          "required": true,
          "values": [
            "medium",
            "high"
          ]
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "input_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        },
        {
          "field": "quality",
          "rule": "not_empty",
          "message": "Quality is required"
        }
      ]
    },
    {
      "className": "GptImage2TextToImage",
      "modelId": "gpt-image-2-text-to-image",
      "title": "GPT Image-2 - Text to Image",
      "description": "GPT Image-2 - Text to Image via Kie.ai.\n\n    kie, image, ai\n\n    ## Create Task",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt. Required, maximum 20,000 characters.",
          "required": true,
          "min": 1,
          "max": 20000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated image is set to auto by default.",
          "required": false,
          "values": [
            "auto",
            "1:1",
            "9:16",
            "16:9",
            "4:3",
            "3:4"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "",
          "title": "Resolution",
          "description": "Image resolution: Note: Images with a 1:1 aspect ratio cannot be converted to 4K images. Images with the aspect ratio set to \"auto\" or without a specified aspect ratio parameter will only be converted to 1K images; otherwise, the task will fail to create.",
          "required": false,
          "values": [
            "1K",
            "2K",
            "4K"
          ]
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "GptImage2ImageToImage",
      "modelId": "gpt-image-2-image-to-image",
      "title": "GPT Image 2 - Image To Image",
      "description": "GPT Image 2 - Image To Image via Kie.ai.\n\n    kie, image, ai\n\n    ## Create Task",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompts, up to 20,000 characters.",
          "required": true
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Array of input image URLs.",
          "required": true,
          "max": 16
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated image is set to auto by default.",
          "required": false,
          "values": [
            "auto",
            "1:1",
            "9:16",
            "16:9",
            "4:3",
            "3:4"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "",
          "title": "Resolution",
          "description": "Image resolution: Note: Images with a 1:1 aspect ratio cannot be converted to 4K images. Images with the aspect ratio set to \"auto\" or without a specified aspect ratio parameter will only be converted to 1K images; otherwise, the task will fail to create.",
          "required": false,
          "values": [
            "1K",
            "2K",
            "4K"
          ]
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "input_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "TopazImageUpscale",
      "modelId": "topaz/image-upscale",
      "title": "Topaz - Image Upscale",
      "description": "Topaz - Image Upscale via Kie.ai.\n\n    kie, image, ai\n\n    Enhance image resolution and quality using advanced AI upscaling powered by Topaz",
      "outputType": "image",
      "fields": [
        {
          "name": "image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "Url of the image to be upscaled (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "upscale_factor",
          "type": "enum",
          "default": "2",
          "title": "Upscale Factor",
          "description": "Factor to upscale the video by (e.g. 2.0 doubles width and height)",
          "required": true,
          "values": [
            "1",
            "2",
            "4",
            "8"
          ]
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        }
      ],
      "validation": [
        {
          "field": "upscale_factor",
          "rule": "not_empty",
          "message": "Upscale Factor is required"
        }
      ]
    },
    {
      "className": "RecraftRemoveBackground",
      "modelId": "recraft/remove-background",
      "title": "Recraft - Remove Background",
      "description": "Recraft - Remove Background via Kie.ai.\n\n    kie, image, ai\n\n    remove background by recraft/remove-background",
      "outputType": "image",
      "fields": [
        {
          "name": "image",
          "type": "str",
          "default": "",
          "title": "Image",
          "description": "Image to remove background from. Supported formats: PNG, JPG, WEBP. Max 5MB, max 16MP, max dimension 4096px, min dimension 256px. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 5.0MB)",
          "required": true
        }
      ],
      "validation": [
        {
          "field": "image",
          "rule": "not_empty",
          "message": "Image is required"
        }
      ]
    },
    {
      "className": "RecraftCrispUpscale",
      "modelId": "recraft/crisp-upscale",
      "title": "Recraft - Crisp Upscale",
      "description": "Recraft - Crisp Upscale via Kie.ai.\n\n    kie, image, ai\n\n    Enhance image resolution and quality using advanced AI upscaling powered by Recraft",
      "outputType": "image",
      "fields": [
        {
          "name": "image",
          "type": "str",
          "default": "",
          "title": "Image",
          "description": "Image to upscale (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        }
      ],
      "validation": [
        {
          "field": "image",
          "rule": "not_empty",
          "message": "Image is required"
        }
      ]
    },
    {
      "className": "IdeogramCharacterEdit",
      "modelId": "ideogram/character-edit",
      "title": "Ideogram - Character Edit",
      "description": "Ideogram - Character Edit via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by ideogram/character-edit",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to fill the masked part of the image. (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image URL to generate an image from. Needs to match the dimensions of the mask. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "mask",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Mask",
          "description": "The mask URL to inpaint the image. Needs to match the dimensions of the input image. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "reference_images",
          "type": "list[image]",
          "default": [],
          "title": "Reference Images",
          "description": "A set of images to use as character references. Currently only 1 image is supported, rest will be ignored. (maximum total size 10MB across all character references). The images should be in JPEG, PNG or WebP format (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "rendering_speed",
          "type": "enum",
          "default": "BALANCED",
          "title": "Rendering Speed",
          "description": "The rendering speed to use. Default value: \"BALANCED\"",
          "required": false,
          "values": [
            "TURBO",
            "BALANCED",
            "QUALITY"
          ]
        },
        {
          "name": "style",
          "type": "enum",
          "default": "AUTO",
          "title": "Style",
          "description": "The style type to generate with. Cannot be used with style_codes. Default value: \"AUTO\"",
          "required": false,
          "values": [
            "AUTO",
            "REALISTIC",
            "FICTION"
          ]
        },
        {
          "name": "expand_prompt",
          "type": "bool",
          "default": false,
          "title": "Expand Prompt",
          "description": "Determine if MagicPrompt should be used in generating the request or not. Default value: true (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "num_images",
          "type": "enum",
          "default": "1",
          "title": "Num Images",
          "description": "Select description",
          "required": false,
          "values": [
            "1",
            "2",
            "3",
            "4"
          ]
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Seed for the random number generator",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        },
        {
          "field": "mask",
          "kind": "image",
          "paramName": "mask_url"
        },
        {
          "field": "reference_images",
          "kind": "image",
          "isList": true,
          "paramName": "reference_image_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "IdeogramCharacterRemix",
      "modelId": "ideogram/character-remix",
      "title": "Ideogram - Character Remix",
      "description": "Ideogram - Character Remix via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by ideogram/character-remix",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to remix the image with (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image URL to remix (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "reference_images",
          "type": "list[image]",
          "default": [],
          "title": "Reference Images",
          "description": "A set of images to use as character references. Currently only 1 image is supported, rest will be ignored. (maximum total size 10MB across all character references). The images should be in JPEG, PNG or WebP format (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "rendering_speed",
          "type": "enum",
          "default": "BALANCED",
          "title": "Rendering Speed",
          "description": "The rendering speed to use. Default value: \"BALANCED\"",
          "required": false,
          "values": [
            "TURBO",
            "BALANCED",
            "QUALITY"
          ]
        },
        {
          "name": "style",
          "type": "enum",
          "default": "AUTO",
          "title": "Style",
          "description": "The style type to generate with. Cannot be used with style_codes. Default value: \"AUTO\"",
          "required": false,
          "values": [
            "AUTO",
            "REALISTIC",
            "FICTION"
          ]
        },
        {
          "name": "expand_prompt",
          "type": "bool",
          "default": false,
          "title": "Expand Prompt",
          "description": "Determine if MagicPrompt should be used in generating the request or not. Default value: true (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "square_hd",
          "title": "Image Size",
          "description": "Select description",
          "required": false,
          "values": [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          "name": "num_images",
          "type": "enum",
          "default": "1",
          "title": "Num Images",
          "description": "Select description",
          "required": false,
          "values": [
            "1",
            "2",
            "3",
            "4"
          ]
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Seed for the random number generator",
          "required": false
        },
        {
          "name": "strength",
          "type": "float",
          "default": 0.8,
          "title": "Strength",
          "description": "Strength of the input image in the remix Default value: 0.8 (Min: 0.1, Max: 1, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 0.1,
          "max": 1
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Description of what to exclude from an image. Descriptions in the prompt take precedence to descriptions in the negative prompt. Default value: \"\" (Max length: 500 characters)",
          "required": false,
          "max": 500
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "A set of images to use as style references (maximum total size 10MB across all style references). The images should be in JPEG, PNG or WebP format (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": false
        },
        {
          "name": "reference_mask_urls",
          "type": "str",
          "default": "",
          "title": "Reference Mask Urls",
          "description": "A set of masks to apply to the character references. Currently only 1 mask is supported, rest will be ignored. (maximum total size 10MB across all character references). The masks should be in JPEG, PNG or WebP format (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        },
        {
          "field": "reference_images",
          "kind": "image",
          "isList": true,
          "paramName": "reference_image_urls"
        },
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "image_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "IdeogramCharacter",
      "modelId": "ideogram/character",
      "title": "Ideogram - Character",
      "description": "Ideogram - Character via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by ideogram/character",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to fill the masked part of the image. (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "reference_images",
          "type": "list[image]",
          "default": [],
          "title": "Reference Images",
          "description": "A set of images to use as character references. Currently only 1 image is supported, rest will be ignored. (maximum total size 10MB across all character references). The images should be in JPEG, PNG or WebP format (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "rendering_speed",
          "type": "enum",
          "default": "BALANCED",
          "title": "Rendering Speed",
          "description": "The rendering speed to use. Default value: \"BALANCED\"",
          "required": false,
          "values": [
            "TURBO",
            "BALANCED",
            "QUALITY"
          ]
        },
        {
          "name": "style",
          "type": "enum",
          "default": "AUTO",
          "title": "Style",
          "description": "The style type to generate with. Cannot be used with style_codes. Default value: \"AUTO\"",
          "required": false,
          "values": [
            "AUTO",
            "REALISTIC",
            "FICTION"
          ]
        },
        {
          "name": "expand_prompt",
          "type": "bool",
          "default": false,
          "title": "Expand Prompt",
          "description": "Determine if MagicPrompt should be used in generating the request or not. Default value: true (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "num_images",
          "type": "enum",
          "default": "1",
          "title": "Num Images",
          "description": "Select description",
          "required": false,
          "values": [
            "1",
            "2",
            "3",
            "4"
          ]
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "square_hd",
          "title": "Image Size",
          "description": "The resolution of the generated image Default value: square_hd",
          "required": false,
          "values": [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Seed for the random number generator",
          "required": false
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Description of what to exclude from an image. Descriptions in the prompt take precedence to descriptions in the negative prompt. Default value: \"\" (Max length: 5000 characters)",
          "required": false,
          "max": 5000
        }
      ],
      "uploads": [
        {
          "field": "reference_images",
          "kind": "image",
          "isList": true,
          "paramName": "reference_image_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "IdeogramV3TextToImage",
      "modelId": "ideogram/v3-text-to-image",
      "title": "Ideogram V3 Text to Image",
      "description": "Ideogram V3 Text to Image via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by ideogram/v3-text-to-image",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Description of the image to generate. Maximum length: 5000 characters.",
          "required": true,
          "max": 5000
        },
        {
          "name": "rendering_speed",
          "type": "enum",
          "default": "",
          "title": "Rendering Speed",
          "description": "The rendering speed to use. - `TURBO`: Turbo - `BALANCED`: Balanced - `QUALITY`: Quality",
          "required": false,
          "values": [
            "TURBO",
            "BALANCED",
            "QUALITY"
          ]
        },
        {
          "name": "style",
          "type": "enum",
          "default": "",
          "title": "Style",
          "description": "The style type to generate with. Cannot be used together with `style_codes`. - `AUTO`: Auto - `GENERAL`: General - `REALISTIC`: Realistic - `DESIGN`: Design",
          "required": false,
          "values": [
            "AUTO",
            "GENERAL",
            "REALISTIC",
            "DESIGN"
          ]
        },
        {
          "name": "expand_prompt",
          "type": "bool",
          "default": false,
          "title": "Expand Prompt",
          "description": "Determines whether MagicPrompt should be used to enhance the generation request. - Boolean value: `true` / `false`",
          "required": false
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "",
          "title": "Image Size",
          "description": "The resolution of the generated image. - `square`: Square - `square_hd`: Square HD - `portrait_4_3`: Portrait 3:4 - `portrait_16_9`: Portrait 9:16 - `landscape_4_3`: Landscape 4:3 - `landscape_16_9`: Landscape 16:9",
          "required": false,
          "values": [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Seed for the random number generator.",
          "required": false
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Description of what to exclude from the generated image. If the positive prompt conflicts with the negative prompt, the positive prompt takes precedence. Maximum length: 5000 characters.",
          "required": false,
          "max": 5000
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "IdeogramV3Edit",
      "modelId": "ideogram/v3-edit",
      "title": "Ideogram V3 Edit",
      "description": "Ideogram V3 Edit via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by ideogram/v3-edit",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to fill the masked part of the image. Maximum length: 5000 characters.",
          "required": true,
          "max": 5000
        },
        {
          "name": "image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image URL to generate an image from. Needs to match the dimensions of the mask. - Please provide the URL of the uploaded file, not raw file content - Accepted types: `image/jpeg`, `image/png`, `image/webp` - Max size: 10.0MB",
          "required": true
        },
        {
          "name": "mask",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Mask",
          "description": "The mask URL to inpaint the image. Needs to match the dimensions of the input image. - Please provide the URL of the uploaded file, not raw file content - Accepted types: `image/jpeg`, `image/png`, `image/webp` - Max size: 10.0MB",
          "required": true
        },
        {
          "name": "rendering_speed",
          "type": "enum",
          "default": "BALANCED",
          "title": "Rendering Speed",
          "description": "The rendering speed to use. Default value: `BALANCED`. - `TURBO`: Turbo - `BALANCED`: Balanced - `QUALITY`: Quality",
          "required": false,
          "values": [
            "TURBO",
            "BALANCED",
            "QUALITY"
          ]
        },
        {
          "name": "expand_prompt",
          "type": "bool",
          "default": true,
          "title": "Expand Prompt",
          "description": "Determine if MagicPrompt should be used in generating the request or not. Default value: `true`. - Boolean value: `true` / `false`",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Seed for the random number generator.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        },
        {
          "field": "mask",
          "kind": "image",
          "paramName": "mask_url"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "IdeogramV3Remix",
      "modelId": "ideogram/v3-remix",
      "title": "Ideogram V3 Remix",
      "description": "Ideogram V3 Remix via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by ideogram/v3-remix",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to remix the image with. Maximum length: 5000 characters.",
          "required": true,
          "max": 5000
        },
        {
          "name": "image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image URL to remix. - Please provide the URL of the uploaded file, not raw file content - Accepted types: `image/jpeg`, `image/png`, `image/webp` - Max size: 10.0MB",
          "required": true
        },
        {
          "name": "rendering_speed",
          "type": "enum",
          "default": "",
          "title": "Rendering Speed",
          "description": "The rendering speed to use. - `TURBO`: Turbo - `BALANCED`: Balanced - `QUALITY`: Quality",
          "required": false,
          "values": [
            "TURBO",
            "BALANCED",
            "QUALITY"
          ]
        },
        {
          "name": "style",
          "type": "enum",
          "default": "",
          "title": "Style",
          "description": "The style type to generate with. Cannot be used together with `style_codes`. - `AUTO`: Auto - `GENERAL`: General - `REALISTIC`: Realistic - `DESIGN`: Design",
          "required": false,
          "values": [
            "AUTO",
            "GENERAL",
            "REALISTIC",
            "DESIGN"
          ]
        },
        {
          "name": "expand_prompt",
          "type": "bool",
          "default": false,
          "title": "Expand Prompt",
          "description": "Determine if MagicPrompt should be used in generating the request or not. - Boolean value: `true` / `false`",
          "required": false
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "",
          "title": "Image Size",
          "description": "The resolution of the generated image. - `square`: Square - `square_hd`: Square HD - `portrait_4_3`: Portrait 3:4 - `portrait_16_9`: Portrait 9:16 - `landscape_4_3`: Landscape 4:3 - `landscape_16_9`: Landscape 16:9",
          "required": false,
          "values": [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          "name": "num_images",
          "type": "enum",
          "default": "",
          "title": "Num Images",
          "description": "Number of images to generate. - `1`: 1 image - `2`: 2 images - `3`: 3 images - `4`: 4 images",
          "required": false,
          "values": [
            "1",
            "2",
            "3",
            "4"
          ]
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Seed for the random number generator.",
          "required": false
        },
        {
          "name": "strength",
          "type": "float",
          "default": 0,
          "title": "Strength",
          "description": "Strength of the input image in the remix. - Minimum: `0.01` - Maximum: `1` - Step: `0.01`",
          "required": false,
          "min": 0.01,
          "max": 1
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Description of what to exclude from the generated image. If the positive prompt conflicts with the negative prompt, the positive prompt takes precedence. Maximum length: 5000 characters.",
          "required": false,
          "max": 5000
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "QwenTextToImage",
      "modelId": "qwen/text-to-image",
      "title": "Qwen - Text to Image",
      "description": "Qwen - Text to Image via Kie.ai.\n\n    kie, image, ai\n\n    High-quality photorealistic image generation powered by Qwen's advanced AI model",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to generate the image with (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "square_hd",
          "title": "Image Size",
          "description": "The size of the generated image",
          "required": false,
          "values": [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          "name": "num_inference_steps",
          "type": "float",
          "default": 30,
          "title": "Num Inference Steps",
          "description": "The number of inference steps to perform (Min: 2, Max: 250, Step: 1) (step: 1)",
          "required": false,
          "min": 2,
          "max": 250
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "The same seed and the same prompt given to the same version of the model will output the same image every time",
          "required": false
        },
        {
          "name": "guidance_scale",
          "type": "float",
          "default": 2.5,
          "title": "Guidance Scale",
          "description": "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you (Min: 0, Max: 20, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 0,
          "max": 20
        },
        {
          "name": "enable_safety_checker",
          "type": "bool",
          "default": false,
          "title": "Enable Safety Checker",
          "description": "The safety checker is always enabled in Playground. It can only be disabled by setting false through the API. (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "output_format",
          "type": "enum",
          "default": "png",
          "title": "Output Format",
          "description": "The format of the generated image",
          "required": false,
          "values": [
            "png",
            "jpeg"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "The negative prompt for the generation (Max length: 500 characters)",
          "required": false,
          "max": 500
        },
        {
          "name": "acceleration",
          "type": "enum",
          "default": "none",
          "title": "Acceleration",
          "description": "Acceleration level for image generation. Options: 'none', 'regular', 'high'. Higher acceleration increases speed. 'regular' balances speed and quality. 'high' is recommended for images without text",
          "required": false,
          "values": [
            "none",
            "regular",
            "high"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "QwenImageToImage",
      "modelId": "qwen/image-to-image",
      "title": "Qwen - Image to Image",
      "description": "Qwen - Image to Image via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by Qwen's advanced AI model",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to generate the image with (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The reference image to guide the generation (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "strength",
          "type": "float",
          "default": 0.8,
          "title": "Strength",
          "description": "Denoising strength. 1.0 = fully remake; 0.0 = preserve original (Min: 0, Max: 1, Step: 0.01) (step: 0.01)",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "output_format",
          "type": "enum",
          "default": "png",
          "title": "Output Format",
          "description": "The format of the generated image",
          "required": false,
          "values": [
            "png",
            "jpeg"
          ]
        },
        {
          "name": "acceleration",
          "type": "enum",
          "default": "none",
          "title": "Acceleration",
          "description": "Acceleration level for image generation. Options: 'none', 'regular', 'high'. Higher acceleration increases speed. 'regular' balances speed and quality. 'high' is recommended for images without text",
          "required": false,
          "values": [
            "none",
            "regular",
            "high"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "The negative prompt for the generation (Max length: 500 characters)",
          "required": false,
          "max": 500
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "The same seed and the same prompt given to the same version of the model will output the same image every time",
          "required": false
        },
        {
          "name": "num_inference_steps",
          "type": "float",
          "default": 30,
          "title": "Num Inference Steps",
          "description": "The number of inference steps to perform (Min: 2, Max: 250, Step: 1) (step: 1)",
          "required": false,
          "min": 2,
          "max": 250
        },
        {
          "name": "guidance_scale",
          "type": "float",
          "default": 2.5,
          "title": "Guidance Scale",
          "description": "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you (Min: 0, Max: 20, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 0,
          "max": 20
        },
        {
          "name": "enable_safety_checker",
          "type": "bool",
          "default": false,
          "title": "Enable Safety Checker",
          "description": "The safety checker is always enabled in Playground. It can only be disabled by setting false through the API. (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "QwenImageEdit",
      "modelId": "qwen/image-edit",
      "title": "Qwen - Image Edit",
      "description": "Qwen - Image Edit via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by qwen/image-edit",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to generate the image with (Max length: 2000 characters)",
          "required": true,
          "max": 2000
        },
        {
          "name": "image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The URL of the image to edit. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "acceleration",
          "type": "enum",
          "default": "none",
          "title": "Acceleration",
          "description": "Acceleration level for image generation. Options: 'none', 'regular'. Higher acceleration increases speed. 'regular' balances speed and quality. Default value: \"none\"",
          "required": false,
          "values": [
            "none",
            "regular",
            "high"
          ]
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "landscape_4_3",
          "title": "Image Size",
          "description": "The size of the generated image. Default value: landscape_4_3",
          "required": false,
          "values": [
            "square",
            "square_hd",
            "portrait_4_3",
            "portrait_16_9",
            "landscape_4_3",
            "landscape_16_9"
          ]
        },
        {
          "name": "num_inference_steps",
          "type": "float",
          "default": 25,
          "title": "Num Inference Steps",
          "description": "The number of inference steps to perform. Default value: 30 (Min: 2, Max: 49, Step: 1) (step: 1)",
          "required": false,
          "min": 2,
          "max": 49
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "The same seed and the same prompt given to the same version of the model will output the same image every time.",
          "required": false
        },
        {
          "name": "guidance_scale",
          "type": "float",
          "default": 4,
          "title": "Guidance Scale",
          "description": "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you. Default value: 4 (Min: 0, Max: 20, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 0,
          "max": 20
        },
        {
          "name": "sync_mode",
          "type": "bool",
          "default": false,
          "title": "Sync Mode",
          "description": "If set to true, the function will wait for the image to be generated and uploaded before returning the response. This will increase the latency of the function but it allows you to get the image directly in the response without going through the CDN. (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "num_images",
          "type": "enum",
          "default": "",
          "title": "Num Images",
          "description": "num_images",
          "required": false,
          "values": [
            "1",
            "2",
            "3",
            "4"
          ]
        },
        {
          "name": "enable_safety_checker",
          "type": "bool",
          "default": false,
          "title": "Enable Safety Checker",
          "description": "If set to true, the safety checker will be enabled. Default value: true (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "output_format",
          "type": "enum",
          "default": "png",
          "title": "Output Format",
          "description": "The format of the generated image. Default value: \"png\"",
          "required": false,
          "values": [
            "jpeg",
            "png"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "The negative prompt for the generation Default value: \" \" (Max length: 500 characters)",
          "required": false,
          "max": 500
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "Qwen2ImageEdit",
      "modelId": "qwen2/image-edit",
      "title": "Qwen2 - Image Edit",
      "description": "Qwen2 - Image Edit via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by qwen2/image-edit",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to generate the image with (Max length: 800 characters)",
          "required": true,
          "max": 800
        },
        {
          "name": "image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The URL of the image to edit. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "16:9",
          "title": "Image Size",
          "description": "The size of the generated image. Default value: 16:9",
          "required": false,
          "values": [
            "1:1",
            "2:3",
            "3:2",
            "3:4",
            "4:3",
            "9:16",
            "16:9",
            "21:9"
          ]
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "The same seed and the same prompt given to the same version of the model will output the same image every time.",
          "required": false
        },
        {
          "name": "output_format",
          "type": "enum",
          "default": "png",
          "title": "Output Format",
          "description": "The format of the generated image. Default value: \"png\"",
          "required": false,
          "values": [
            "jpeg",
            "png"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "Qwen2TextToImage",
      "modelId": "qwen2/image-edit",
      "title": "Qwen2 - Text To Image",
      "description": "Qwen2 - Text To Image via Kie.ai.\n\n    kie, image, ai\n\n    Image generation by qwen2/text-to-image",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to generate the image with (Max length: 800 characters)",
          "required": true,
          "max": 800
        },
        {
          "name": "image_size",
          "type": "enum",
          "default": "16:9",
          "title": "Image Size",
          "description": "The size of the generated image. Default value: 16:9",
          "required": false,
          "values": [
            "1:1",
            "3:4",
            "4:3",
            "9:16",
            "16:9"
          ]
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "The same seed and the same prompt given to the same version of the model will output the same image every time.",
          "required": false
        },
        {
          "name": "output_format",
          "type": "enum",
          "default": "png",
          "title": "Output Format",
          "description": "The format of the generated image. Default value: \"png\"",
          "required": false,
          "values": [
            "jpeg",
            "png"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "Wan27Image",
      "modelId": "wan/2-7-image",
      "title": "Wan 2.7 Image",
      "description": "Wan 2.7 Image via Kie.ai.\n\n    kie, image, ai\n\n    Based on wan/2-7-image, image generation and editing are achieved.",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Prompt for image generation or editing. This field supports both Chinese and English, with a maximum length of 5000 characters as per Alibaba Cloud documentation.",
          "required": true,
          "max": 5000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "(Optional) Array of input image URLs. The current project uses `input_urls` as a wrapper field.",
          "required": false,
          "max": 9
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "",
          "title": "Aspect Ratio",
          "description": "(Optional) Output aspect ratio when no image input is provided.",
          "required": false,
          "values": [
            "1:1",
            "16:9",
            "4:3",
            "21:9",
            "3:4",
            "9:16",
            "8:1",
            "1:8"
          ]
        },
        {
          "name": "enable_sequential",
          "type": "bool",
          "default": false,
          "title": "Enable Sequential",
          "description": "Whether to enable sequential/group image mode. Default is false.",
          "required": false
        },
        {
          "name": "n",
          "type": "int",
          "default": 0,
          "title": "N",
          "description": "Number of images to generate. Range is 1-4 when `enable_sequential=false` (default: 4); range is 1-12 when `enable_sequential=true` (default: 12).",
          "required": false,
          "min": 1,
          "max": 4
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "2K",
          "title": "Resolution",
          "description": "Output resolution. The current project uses `resolution` as a wrapper field corresponding to the underlying resolution parameter.",
          "required": false,
          "values": [
            "1K",
            "2K",
            "4K"
          ]
        },
        {
          "name": "thinking_mode",
          "type": "bool",
          "default": false,
          "title": "Thinking Mode",
          "description": "Whether to enable thinking mode. Only available when `enable_sequential=false` and `input_urls` is empty; the frontend will automatically disable it in other cases.",
          "required": false
        },
        {
          "name": "color_palette",
          "type": "list[image]",
          "default": [],
          "title": "Color Palette",
          "description": "(Optional) Custom color theme. Only available when `enable_sequential=false`. Requires 3-10 colors, 8 recommended.",
          "required": false,
          "min": 3,
          "max": 10
        },
        {
          "name": "bbox_list",
          "type": "list[image]",
          "default": [],
          "title": "Bbox List",
          "description": "(Optional) Interactive editing bounding box areas. The outer list length should match `input_urls`; maximum 2 boxes per image; single box format is `[x1, y1, x2, y2]`.",
          "required": false
        },
        {
          "name": "watermark",
          "type": "bool",
          "default": false,
          "title": "Watermark",
          "description": "Whether to add watermark.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed, range 0-2147483647.",
          "required": false,
          "min": 0,
          "max": 2147483647
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "input_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "Wan27ImagePro",
      "modelId": "wan/2-7-image-pro",
      "title": "Wan 2.7 Image Pro",
      "description": "Wan 2.7 Image Pro via Kie.ai.\n\n    kie, image, ai\n\n    Based on wan/2-7-image-pro, image generation and editing are achieved.",
      "outputType": "image",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Prompt for image generation or editing. This field supports both Chinese and English, with a maximum length of 5000 characters as per Alibaba Cloud documentation.",
          "required": true,
          "max": 5000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "(Optional) Array of input image URLs. The current project uses `input_urls` as a wrapper field.",
          "required": false,
          "max": 9
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "",
          "title": "Aspect Ratio",
          "description": "(Optional) Output aspect ratio when no image input is provided.",
          "required": false,
          "values": [
            "1:1",
            "16:9",
            "4:3",
            "21:9",
            "3:4",
            "9:16",
            "8:1",
            "1:8"
          ]
        },
        {
          "name": "enable_sequential",
          "type": "bool",
          "default": false,
          "title": "Enable Sequential",
          "description": "Whether to enable sequential/group image mode. Default is false.",
          "required": false
        },
        {
          "name": "n",
          "type": "int",
          "default": 0,
          "title": "N",
          "description": "Number of images to generate. Range is 1-4 when `enable_sequential=false` (default: 4); range is 1-12 when `enable_sequential=true` (default: 12).",
          "required": false,
          "min": 1,
          "max": 4
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "2K",
          "title": "Resolution",
          "description": "Output resolution. The current project uses `resolution` as a wrapper field corresponding to the underlying resolution parameter.(4K generation is available only for text-to-image in Standard Mode)",
          "required": false,
          "values": [
            "1K",
            "2K",
            "4K"
          ]
        },
        {
          "name": "thinking_mode",
          "type": "bool",
          "default": false,
          "title": "Thinking Mode",
          "description": "Whether to enable thinking mode. Only available when `enable_sequential=false` and `input_urls` is empty; the frontend will automatically disable it in other cases.",
          "required": false
        },
        {
          "name": "color_palette",
          "type": "list[image]",
          "default": [],
          "title": "Color Palette",
          "description": "(Optional) Custom color theme. Only available when `enable_sequential=false`. Requires 3-10 colors, 8 recommended.",
          "required": false,
          "min": 3,
          "max": 10
        },
        {
          "name": "bbox_list",
          "type": "list[image]",
          "default": [],
          "title": "Bbox List",
          "description": "(Optional) Interactive editing bounding box areas. The outer list length should match `input_urls`; maximum 2 boxes per image; single box format is `[x1, y1, x2, y2]`.",
          "required": false
        },
        {
          "name": "watermark",
          "type": "bool",
          "default": false,
          "title": "Watermark",
          "description": "Whether to add watermark.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed, range 0-2147483647.",
          "required": false,
          "min": 0,
          "max": 2147483647
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "input_urls"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    }
  ]
};
