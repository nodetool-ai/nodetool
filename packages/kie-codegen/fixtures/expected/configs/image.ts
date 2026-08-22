import type { ModuleConfig } from "../types.js";

export const imageConfig: ModuleConfig = {
  "moduleName": "image",
  "defaultPollInterval": 1500,
  "defaultMaxAttempts": 400,
  "nodes": [
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
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
          "paramName": "image_urls",
          "isList": true
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
