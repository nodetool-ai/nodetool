import type { ModuleConfig } from "../types.js";

export const videoConfig: ModuleConfig = {
  "moduleName": "video",
  "defaultPollInterval": 8000,
  "defaultMaxAttempts": 450,
  "nodes": [
    {
      "className": "GrokImagineTextToVideo",
      "modelId": "grok-imagine/text-to-video",
      "title": "Grok Imagine Text to Video",
      "description": "Grok Imagine Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt describing the desired video motion. Required field. - Should be detailed and specific about the desired visual motion - Describe movement, action sequences, camera work, and timing - Include details about subjects, environments, and motion dynamics - Maximum length: 5000 characters - Supports English language prompts",
          "required": true
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "2:3",
          "title": "Aspect Ratio",
          "description": "Specifies the width-to-height ratio of the generated video. Controls the aspect ratio of the output. - **2:3**: Portrait orientation (vertical) - **3:2**: Landscape orientation (horizontal) - **1:1**: Square format - **16:9**: Wide screen format - **9:16**: Tall screen format Default: 2:3",
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
          "name": "mode",
          "type": "enum",
          "default": "normal",
          "title": "Mode",
          "description": "Specifies the generation mode affecting the style and intensity of motion. - **fun**: More creative and playful interpretation - **normal**: Balanced approach with good motion quality - **spicy**: More dynamic and intense motion effects Default: normal",
          "required": false,
          "values": [
            "fun",
            "normal",
            "spicy"
          ]
        },
        {
          "name": "duration",
          "type": "float",
          "default": 0,
          "title": "Duration",
          "description": "The duration of the generated video (in seconds) (6-30). (Minimum: 6, Maximum: 30, Step: 1)",
          "required": false,
          "min": 6,
          "max": 30
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "480p",
          "title": "Resolution",
          "description": "The resolution of the generated video.",
          "required": false,
          "values": [
            "480p",
            "720p"
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
      "className": "GrokImagineImageToVideo",
      "modelId": "grok-imagine/image-to-video",
      "title": "Grok Imagine Image to Video",
      "description": "Grok Imagine Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Provide an external image URL as a reference for video generation. Up to 7 images are supported. Do not use it simultaneously with task_id. In your prompt, reference an uploaded image by typing @image(n) followed by a space (for example: @image1 a sunset over the ocean). - Supports JPEG, PNG, and WEBP formats - Maximum file size for each image: 10MB - The Spicy mode is not available when using external images - The array can contain a maximum of seven URLs",
          "required": false,
          "max": 7
        },
        {
          "name": "task_id",
          "type": "str",
          "default": "",
          "title": "Task Id",
          "description": "Task ID from a previously generated Grok image. Use with index to select a specific image. Do not use with image_urls. - Use task ID from grok-imagine/text-to-image generations - Supports all modes including Spicy - Maximum length: 100 characters",
          "required": false,
          "max": 100
        },
        {
          "name": "index",
          "type": "int",
          "default": 0,
          "title": "Index",
          "description": "When using task_id, specify which image to use (Grok generates 6 images per task). Only works with task_id. - 0-based index (0-5) - Ignored if image_urls is provided - Default: 0",
          "required": false,
          "min": 0,
          "max": 5
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt describing the desired video motion. Optional field. - Should be detailed and specific about the desired visual motion - Describe movement, action sequences, camera work, and timing - Include details about subjects, environments, and motion dynamics - Maximum length: 5000 characters - Supports English language prompts",
          "required": false
        },
        {
          "name": "mode",
          "type": "enum",
          "default": "normal",
          "title": "Mode",
          "description": "Specifies the generation mode affecting the style and intensity of motion. Note: Spicy mode is not available for external image inputs. - **fun**: More creative and playful interpretation - **normal**: Balanced approach with good motion quality - **spicy**: More dynamic and intense motion effects (not available for external images) Default: normal",
          "required": false,
          "values": [
            "fun",
            "normal",
            "spicy"
          ]
        },
        {
          "name": "duration",
          "type": "str",
          "default": "",
          "title": "Duration",
          "description": "The duration of the generated video (in seconds) (6-30). (Minimum: 6, Maximum: 30, Step: 1)",
          "required": false,
          "min": 6,
          "max": 30
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "480p",
          "title": "Resolution",
          "description": "The resolution of the generated video.",
          "required": false,
          "values": [
            "480p",
            "720p"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Image ratio selection only applies to multi-image generation mode. In single-image mode, the video width and height are referenced to the image width and height.",
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
      "className": "GrokImagineUpscale",
      "modelId": "grok-imagine/upscale",
      "title": "Grok Imagine - Video Upscale",
      "description": "Grok Imagine - Video Upscale via Kie.ai.\n\n    kie, video, ai\n\n    Grok Imagine - Video Upscale",
      "outputType": "video",
      "fields": [
        {
          "name": "task_id",
          "type": "str",
          "default": "",
          "title": "Task Id",
          "description": "Task ID from a previously successful video generation task. Required field. - Must be from a Kie AI video generation model (e.g., grok-imagine/text-to-video) - The original video generation must have completed successfully - Only Kie AI–generated task IDs are supported",
          "required": true,
          "max": 100
        }
      ],
      "validation": [
        {
          "field": "task_id",
          "rule": "not_empty",
          "message": "Task Id is required"
        }
      ]
    },
    {
      "className": "GrokImagineExtend",
      "modelId": "grok-imagine/extend",
      "title": "Grok Imagine - Video Extend",
      "description": "Grok Imagine - Video Extend via Kie.ai.\n\n    kie, video, ai\n\n    Grok Imagine - Video Extend",
      "outputType": "video",
      "fields": [
        {
          "name": "task_id",
          "type": "str",
          "default": "",
          "title": "Task Id",
          "description": "Task ID from a previously successful video generation task. Required field. - Must be from a Kie AI video generation model (e.g., grok-imagine/text-to-video) - The original video generation must have completed successfully - Only Kie AI–generated task IDs are supported",
          "required": true,
          "max": 100
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text instructions describing the required movement of the video. Required field. - Provide a detailed description of how you would like the video to expand and continue. - You can specify camera movements, scene changes, object actions, etc. - The more specific the prompt words are, the more likely the generated effect will match your expectations. - Supports input in both Chinese and English.",
          "required": true
        },
        {
          "name": "extend_at",
          "type": "str",
          "default": "",
          "title": "Extend At",
          "description": "The starting position of the video extension. Optional field.",
          "required": true
        },
        {
          "name": "extend_times",
          "type": "enum",
          "default": "6",
          "title": "Extend Times",
          "description": "Duration of video extension (in seconds). Required field. - `6`: Expand 6 seconds of video content - `10`: Expand 10 seconds of video content - The longer the extension duration, the longer the time required for generation - Select the appropriate duration based on the complexity of the scene",
          "required": true,
          "values": [
            "6",
            "10"
          ]
        }
      ],
      "validation": [
        {
          "field": "task_id",
          "rule": "not_empty",
          "message": "Task Id is required"
        },
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "extend_at",
          "rule": "not_empty",
          "message": "Extend At is required"
        },
        {
          "field": "extend_times",
          "rule": "not_empty",
          "message": "Extend Times is required"
        }
      ]
    },
    {
      "className": "Kling26TextToVideo",
      "modelId": "kling-2.6/text-to-video",
      "title": "Kling 2.6 Text to Video",
      "description": "Kling 2.6 Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt for video generation (maximum length: 1000 characters)",
          "required": true,
          "max": 1000
        },
        {
          "name": "sound",
          "type": "bool",
          "default": false,
          "title": "Sound",
          "description": "This parameter specifies whether the generated video contains sound (boolean: true/false)",
          "required": true
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "This parameter defines the video aspect ratio",
          "required": true,
          "values": [
            "1:1",
            "16:9",
            "9:16"
          ]
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "Video duration (unit: seconds)",
          "required": true,
          "values": [
            "5",
            "10"
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
          "field": "duration",
          "rule": "not_empty",
          "message": "Duration is required"
        }
      ]
    },
    {
      "className": "Kling26ImageToVideo",
      "modelId": "kling-2.6/image-to-video",
      "title": "Kling 2.6 Image to Video",
      "description": "Kling 2.6 Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt for video generation (maximum length: 1000 characters)",
          "required": true,
          "max": 1000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Image URLs for video generation. (Uploaded file URLs, not file content; supported types: image/jpeg, image/png; maximum file size: 10.0MB)",
          "required": true,
          "max": 1
        },
        {
          "name": "sound",
          "type": "bool",
          "default": false,
          "title": "Sound",
          "description": "This parameter specifies whether the generated video contains sound (boolean: true/false)",
          "required": true
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "Video duration (unit: seconds)",
          "required": true,
          "values": [
            "5",
            "10"
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
        },
        {
          "field": "duration",
          "rule": "not_empty",
          "message": "Duration is required"
        }
      ]
    },
    {
      "className": "KlingV21MasterImageToVideo",
      "modelId": "kling/v2-1-master-image-to-video",
      "title": "Kling - V2.5 Turbo Image to Video Pro",
      "description": "Kling - V2.5 Turbo Image to Video Pro via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt describing the video to generate (Max length: 2500 characters)",
          "required": true,
          "max": 2500
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
          "description": "URL of the image to be used for the video (File URL after upload, not file content; Accepted types: image/jpeg, image/png; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Negative prompt to exclude certain elements from the video (Max length: 500 characters)",
          "required": false,
          "max": 500
        },
        {
          "name": "cfg_scale",
          "type": "float",
          "default": 0.5,
          "title": "Cfg Scale",
          "description": "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt (Min: 0, Max: 1, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 0,
          "max": 1
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
      "className": "KlingV25TurboTextToVideoPro",
      "modelId": "kling/v2-5-turbo-text-to-video-pro",
      "title": "Kling - V2.5 Turbo Text to Video Pro",
      "description": "Kling - V2.5 Turbo Text to Video Pro via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text description of the video you want to generate (Max length: 2500 characters)",
          "required": true,
          "max": 2500
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated video frame",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Things to avoid in the generated video (Max length: 2500 characters)",
          "required": false,
          "max": 2500
        },
        {
          "name": "cfg_scale",
          "type": "float",
          "default": 0.5,
          "title": "Cfg Scale",
          "description": "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt (Min: 0, Max: 1, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 0,
          "max": 1
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
      "className": "KlingAiAvatarStandard",
      "modelId": "kling/ai-avatar-standard",
      "title": "Kling AI Avatar Standard",
      "description": "Kling AI Avatar Standard via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
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
          "description": "The URL of the image to use as your avatar (File URL after upload, not file content; Accepted types: image/jpeg, image/png; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "audio",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Audio",
          "description": "The URL of the audio file (must be the URL of the uploaded file, not the file content; supported formats: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/mp4, audio/ogg; audio size is limited to 100M, and the duration cannot exceed 5 minutes)",
          "required": true
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to use for the video generation (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        },
        {
          "field": "audio",
          "kind": "audio",
          "paramName": "audio_url"
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
      "className": "KlingAiAvatarPro",
      "modelId": "kling/ai-avatar-pro",
      "title": "Kling AI Avatar Pro",
      "description": "Kling AI Avatar Pro via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
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
          "description": "The URL of the image to use as your avatar (File URL after upload, not file content; Accepted types: image/jpeg, image/png; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "audio",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Audio",
          "description": "The URL of the audio file (must be the URL of the uploaded file, not the file content; supported formats: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/mp4, audio/ogg; audio size is limited to 100M, and the duration cannot exceed 5 minutes)",
          "required": true
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The prompt to use for the video generation (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        },
        {
          "field": "audio",
          "kind": "audio",
          "paramName": "audio_url"
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
      "className": "KlingV21MasterImageToVideo2",
      "modelId": "kling/v2-1-master-image-to-video",
      "title": "Kling V2.1 Master Image to Video",
      "description": "Kling V2.1 Master Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt describing the video to generate (Max length: 5000 characters)",
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
          "description": "URL of the image to be used for the video (File URL after upload, not file content; Accepted types: image/jpeg, image/png; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Negative prompt to exclude certain elements from the video (Max length: 500 characters)",
          "required": false,
          "max": 500
        },
        {
          "name": "cfg_scale",
          "type": "float",
          "default": 0.5,
          "title": "Cfg Scale",
          "description": "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt (Min: 0, Max: 1, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 0,
          "max": 1
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
      "className": "KlingV21MasterTextToVideo",
      "modelId": "kling/v2-1-master-text-to-video",
      "title": "Kling V2.1 Master Text to Video",
      "description": "Kling V2.1 Master Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt describing the video you want to generate (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated video frame",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Elements to avoid in the generated video (Max length: 500 characters)",
          "required": false,
          "max": 500
        },
        {
          "name": "cfg_scale",
          "type": "float",
          "default": 0.5,
          "title": "Cfg Scale",
          "description": "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt (Min: 0, Max: 1, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 0,
          "max": 1
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
      "className": "KlingV21Pro",
      "modelId": "kling/v2-1-pro",
      "title": "Kling V2.1 Pro",
      "description": "Kling V2.1 Pro via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt describing the video to generate (Max length: 5000 characters)",
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
          "description": "URL of the image to be used for the video (File URL after upload, not file content; Accepted types: image/jpeg, image/png; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Terms to avoid in the generated video (Max length: 500 characters)",
          "required": false,
          "max": 500
        },
        {
          "name": "cfg_scale",
          "type": "float",
          "default": 0.5,
          "title": "Cfg Scale",
          "description": "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt (Min: 0, Max: 1, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "tail_image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Tail Image",
          "description": "URL of the image to be used for the end of the video (File URL after upload, not file content; Accepted types: image/jpeg, image/png; Max size: 10.0MB)",
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
          "field": "tail_image",
          "kind": "image",
          "paramName": "tail_image_url"
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
      "className": "KlingV21Standard",
      "modelId": "kling/v2-1-standard",
      "title": "Kling V2.1 Standard",
      "description": "Kling V2.1 Standard via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt describing the desired video content (Max length: 5000 characters)",
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
          "description": "URL of the image to be used for the video (File URL after upload, not file content; Accepted types: image/jpeg, image/png; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Description of elements to avoid in the generated video (Max length: 500 characters)",
          "required": false,
          "max": 500
        },
        {
          "name": "cfg_scale",
          "type": "float",
          "default": 0.5,
          "title": "Cfg Scale",
          "description": "The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt (Min: 0, Max: 1, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 0,
          "max": 1
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
      "className": "Kling26MotionControl",
      "modelId": "kling-2.6/motion-control",
      "title": "Kling 2.6 motion-control",
      "description": "Kling 2.6 motion-control via Kie.ai.\n\n    kie, video, ai\n\n    ## File Upload Requirements",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A text description of the desired output. Maximum length is 2500 characters. (Max length: 2500 characters)",
          "required": false,
          "max": 2500
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "An array containing a single image URL. The photo must clearly show the subject's head, shoulders, and torso. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/jpg; Max size: 10.0MB,size needs to be greater than 300px, aspect ratio 2:5 to 5:2.)",
          "required": true,
          "max": 1
        },
        {
          "name": "videos",
          "type": "list[video]",
          "default": [],
          "title": "Videos",
          "description": "An array containing a single video URL. The duration must be between 3 to 30 seconds, and the video must clearly show the subject's head, shoulders, and torso. (File URL after upload, not file content; Accepted types: video/mp4, video/quicktime, video/x-matroska; Max size: 100.0MB)",
          "required": true,
          "min": 3,
          "max": 1
        },
        {
          "name": "character_orientation",
          "type": "enum",
          "default": "video",
          "title": "Character Orientation",
          "description": "Generate the orientation of the characters in the video. 'image': same orientation as the person in the picture (max 10s video). 'video': consistent with the orientation of the characters in the video (max 30s video).",
          "required": true,
          "values": [
            "image",
            "video"
          ]
        },
        {
          "name": "mode",
          "type": "enum",
          "default": "720p",
          "title": "Mode",
          "description": "Output resolution mode. Use 'std' for 720p or 'pro' for 1080p.",
          "required": true,
          "values": [
            "720p",
            "1080p"
          ]
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "input_urls"
        },
        {
          "field": "videos",
          "kind": "video",
          "isList": true,
          "paramName": "video_urls"
        }
      ],
      "validation": [
        {
          "field": "character_orientation",
          "rule": "not_empty",
          "message": "Character Orientation is required"
        },
        {
          "field": "mode",
          "rule": "not_empty",
          "message": "Mode is required"
        }
      ]
    },
    {
      "className": "Kling30MotionControl",
      "modelId": "kling-3.0/motion-control",
      "title": "Kling-3.0 motion-control",
      "description": "Kling-3.0 motion-control via Kie.ai.\n\n    kie, video, ai\n\n    ## File Upload Requirements",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "(Optional) Text prompt words, used to guide the generation of animation content. Can be empty or 0 - 2500 characters long.",
          "required": false
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "(Required) Include a URL of an image",
          "required": true
        },
        {
          "name": "videos",
          "type": "list[video]",
          "default": [],
          "title": "Videos",
          "description": "(Required) Include a video URL",
          "required": true
        },
        {
          "name": "mode",
          "type": "str",
          "default": "",
          "title": "Mode",
          "description": "(Optional) Video Quality Mode. std: Standard Mode (720p). pro: Professional Mode (1080p)",
          "required": false
        },
        {
          "name": "character_orientation",
          "type": "str",
          "default": "",
          "title": "Character Orientation",
          "description": "(Optional) Reference source for character orientation. video: Refer to video (recommended); image: Refer to image. Default value: video",
          "required": false
        },
        {
          "name": "background_source",
          "type": "str",
          "default": "",
          "title": "Background Source",
          "description": "(Optional) Background source. input_video: Use video background; input_image: Use image background. Default value: input_video",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "input_urls"
        },
        {
          "field": "videos",
          "kind": "video",
          "isList": true,
          "paramName": "video_urls"
        }
      ]
    },
    {
      "className": "BytedanceSeedance2",
      "modelId": "bytedance/seedance-2",
      "title": "bytedance-seedance-2",
      "description": "bytedance-seedance-2 via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to generate the video. Required field. (Min length: 3, Max length: 20000 characters)",
          "required": false,
          "min": 3,
          "max": 20000
        },
        {
          "name": "first_frame",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "First Frame",
          "description": "First frame image url or asset://{assetId} (for example: asset://asset-20260404242101-76djj)",
          "required": false
        },
        {
          "name": "last_frame",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Last Frame",
          "description": "End frame image url or asset://{assetId} (for example: asset://asset-20260404242101-76djj)",
          "required": false
        },
        {
          "name": "reference_images",
          "type": "list[image]",
          "default": [],
          "title": "Reference Images",
          "description": "Enter a list of image URLs or asset://{assetId} (for example: asset://asset-20260404242101-76djj). Single image requirements: Format: jpeg, png, webp, bmp, tiff, gif. Aspect ratio (width/height): (0.4, 2.5) Width and height (px): (300, 6000) Size: Single image less than 30 MB. Maximum number of files: The sum of the number of frames at the beginning and end must not exceed 9..",
          "required": false,
          "max": 9
        },
        {
          "name": "reference_videos",
          "type": "list[video]",
          "default": [],
          "title": "Reference Videos",
          "description": "Enter a list of video URLs or asset://{assetId} (for example: asset://asset-20260404242101-76djj) . Single video requirements: Video format: mp4, mov. Resolution: 480p, 720p Duration: Single video duration [2, 15] s, maximum 3 reference videos, total duration of all videos not exceeding 15 seconds. Dimensions: Aspect ratio (width/height): [0.4, 2.5] Width/height (px): [300, 6000] Total pixels: [640×640=409600, 834×1112=927408], i.e., the product of width and height must meet the range requirement of [409600, 927408]. Size: Single video not exceeding 50 MB. Frame rate (FPS): [24, 60]",
          "required": false,
          "min": 2,
          "max": 3
        },
        {
          "name": "reference_audios",
          "type": "list[audio]",
          "default": [],
          "title": "Reference Audios",
          "description": "Enter a list of audio URLs or asset://{assetId} (for example: asset://asset-20260404242101-76djj) . Single audio requirements: Format: wav, mp3 Duration: Single audio duration [2, 15] s, maximum 3 reference audios, total duration of all audios not exceeding 15 s. Size: Single audio file size not exceeding 15 MB.",
          "required": false,
          "min": 2,
          "max": 3
        },
        {
          "name": "generate_audio",
          "type": "bool",
          "default": true,
          "title": "Generate Audio",
          "description": "Whether to generate audio for the video. - **true**: Generate with audio (higher cost) - **false**: Generate without audio Note: Enabling audio will increase the generation cost",
          "required": false
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution - 480p for faster generation, 720p for balance, 1080p for High-quality video",
          "required": false,
          "values": [
            "480p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Video aspect ratio configuration. Required field.",
          "required": false,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "21:9",
            "adaptive"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Video duration in 4-15 seconds.",
          "required": false,
          "min": 4,
          "max": 15
        },
        {
          "name": "web_search",
          "type": "bool",
          "default": false,
          "title": "Web Search",
          "description": "Use online search",
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
          "field": "first_frame",
          "kind": "image",
          "paramName": "first_frame_url"
        },
        {
          "field": "last_frame",
          "kind": "image",
          "paramName": "last_frame_url"
        },
        {
          "field": "reference_images",
          "kind": "image",
          "isList": true,
          "paramName": "reference_image_urls"
        },
        {
          "field": "reference_videos",
          "kind": "video",
          "isList": true,
          "paramName": "reference_video_urls"
        },
        {
          "field": "reference_audios",
          "kind": "audio",
          "isList": true,
          "paramName": "reference_audio_urls"
        }
      ]
    },
    {
      "className": "BytedanceSeedance2Fast",
      "modelId": "bytedance/seedance-2-fast",
      "title": "Bytedance Seedance 2.0 Fast",
      "description": "Bytedance Seedance 2.0 Fast via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to generate the video. Required field. (Min length: 3, Max length: 20000 characters)",
          "required": false,
          "min": 3,
          "max": 20000
        },
        {
          "name": "first_frame",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "First Frame",
          "description": "First frame image url or asset://{assetId} (for example: asset://asset-20260404242101-76djj)",
          "required": false
        },
        {
          "name": "last_frame",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Last Frame",
          "description": "End frame image url or asset://{assetId} (for example: asset://asset-20260404242101-76djj)",
          "required": false
        },
        {
          "name": "reference_images",
          "type": "list[image]",
          "default": [],
          "title": "Reference Images",
          "description": "Enter a list of image URLs or asset://{assetId} (for example: asset://asset-20260404242101-76djj). Single image requirements: Format: jpeg, png, webp, bmp, tiff, gif. Aspect ratio (width/height): (0.4, 2.5) Width and height (px): (300, 6000) Size: Single image less than 30 MB. Maximum number of files: The sum of the number of frames at the beginning and end must not exceed 9..",
          "required": false,
          "max": 9
        },
        {
          "name": "reference_videos",
          "type": "list[video]",
          "default": [],
          "title": "Reference Videos",
          "description": "Enter a list of video URLs or asset://{assetId} (for example: asset://asset-20260404242101-76djj). Single video requirements: Video format: mp4, mov. Resolution: 480p, 720p Duration: Single video duration [2, 15] s, maximum 3 reference videos, total duration of all videos not exceeding 15 seconds. Dimensions: Aspect ratio (width/height): [0.4, 2.5] Width/height (px): [300, 6000] Total pixels: [640×640=409600, 834×1112=927408], i.e., the product of width and height must meet the range requirement of [409600, 927408]. Size: Single video not exceeding 50 MB. Frame rate (FPS): [24, 60]",
          "required": false,
          "min": 2,
          "max": 3
        },
        {
          "name": "reference_audios",
          "type": "list[audio]",
          "default": [],
          "title": "Reference Audios",
          "description": "Enter a list of audio URLs or asset://{assetId} (for example: asset://asset-20260404242101-76djj). Single audio requirements: Format: wav, mp3 Duration: Single audio duration [2, 15] s, maximum 3 reference audios, total duration of all audios not exceeding 15 s. Size: Single audio file size not exceeding 15 MB.",
          "required": false,
          "min": 2,
          "max": 3
        },
        {
          "name": "generate_audio",
          "type": "bool",
          "default": true,
          "title": "Generate Audio",
          "description": "Whether to generate audio for the video. - **true**: Generate with audio - **false**: Generate without audio Note: Enabling audio will increase the generation cost",
          "required": false
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution - 480p for faster generation, 720p for balance",
          "required": false,
          "values": [
            "480p",
            "720p"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Video aspect ratio configuration. Required field.",
          "required": false,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "21:9",
            "adaptive"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Video duration in 4-15 seconds.",
          "required": false,
          "min": 4,
          "max": 15
        },
        {
          "name": "web_search",
          "type": "bool",
          "default": false,
          "title": "Web Search",
          "description": "Use online search",
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
          "field": "first_frame",
          "kind": "image",
          "paramName": "first_frame_url"
        },
        {
          "field": "last_frame",
          "kind": "image",
          "paramName": "last_frame_url"
        },
        {
          "field": "reference_images",
          "kind": "image",
          "isList": true,
          "paramName": "reference_image_urls"
        },
        {
          "field": "reference_videos",
          "kind": "video",
          "isList": true,
          "paramName": "reference_video_urls"
        },
        {
          "field": "reference_audios",
          "kind": "audio",
          "isList": true,
          "paramName": "reference_audio_urls"
        }
      ]
    },
    {
      "className": "BytedanceSeedance15Pro",
      "modelId": "bytedance/seedance-1.5-pro",
      "title": "Bytedance Seedance 1.5 Pro",
      "description": "Bytedance Seedance 1.5 Pro via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to generate the video. Required field. (Min length: 3, Max length: 2500 characters)",
          "required": true,
          "min": 3,
          "max": 2500
        },
        {
          "name": "videos",
          "type": "list[video]",
          "default": [],
          "title": "Videos",
          "description": "URLs of input images for image-to-video generation. Optional field. - Accepts 0-2 images - If not provided, the model will perform text-to-video generation - File URLs after upload, not file content - Accepted types: image/jpeg, image/png, image/webp - Max size per image: 10.0MB",
          "required": false,
          "max": 2
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "1:1",
          "title": "Aspect Ratio",
          "description": "Video aspect ratio configuration. Required field.",
          "required": true,
          "values": [
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "21:9"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution - 480p for faster generation, 720p for balance, 1080p for higher quality",
          "required": false,
          "values": [
            "480p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "",
          "title": "Duration",
          "description": "Duration of the video in seconds",
          "required": true,
          "values": [
            "4",
            "8",
            "12"
          ]
        },
        {
          "name": "fixed_lens",
          "type": "bool",
          "default": false,
          "title": "Fixed Lens",
          "description": "Seedance adds dynamic camera movement. Enable this feature to lock the camera for stable, static shots. - **true**: Lock camera for static shots - **false**: Allow dynamic camera movement",
          "required": false
        },
        {
          "name": "generate_audio",
          "type": "bool",
          "default": false,
          "title": "Generate Audio",
          "description": "Whether to generate audio for the video. - **true**: Generate with audio (higher cost) - **false**: Generate without audio Note: Enabling audio will increase the generation cost",
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
          "field": "videos",
          "kind": "video",
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
          "field": "duration",
          "rule": "not_empty",
          "message": "Duration is required"
        }
      ]
    },
    {
      "className": "BytedanceV1ProFastImageToVideo",
      "modelId": "bytedance/v1-pro-fast-image-to-video",
      "title": "Bytedance V1 Pro Fast Image to Video",
      "description": "Bytedance V1 Pro Fast Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to generate the video (Max length: 10000 characters)",
          "required": true,
          "max": 10000
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
          "description": "The URL of the image used to generate video (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution - 480p for faster generation, 720p for balance, 1080p for higher quality",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "Duration of the video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
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
      "className": "BytedanceV1ProImageToVideo",
      "modelId": "bytedance/v1-pro-image-to-video",
      "title": "Bytedance V1 Pro Image to Video",
      "description": "Bytedance V1 Pro Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using bytedance/v1-pro-image-to-video",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to generate the video (Max length: 10000 characters)",
          "required": true,
          "max": 10000
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
          "description": "The URL of the image used to generate video (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution - 480p for faster generation, 720p for balance, 1080p for higher quality",
          "required": false,
          "values": [
            "480p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "Duration of the video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "camera_fixed",
          "type": "bool",
          "default": false,
          "title": "Camera Fixed",
          "description": "Whether to fix the camera position (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "seed",
          "type": "float",
          "default": -1,
          "title": "Seed",
          "description": "Random seed to control video generation. Use -1 for random. (Min: -1, Max: 2147483647, Step: 1) (step: 1)",
          "required": false,
          "min": -1,
          "max": 2147483647
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
      "className": "BytedanceV1ProTextToVideo",
      "modelId": "bytedance/v1-pro-text-to-video",
      "title": "Bytedance - V1 Pro Text to Video",
      "description": "Bytedance - V1 Pro Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using bytedance/v1-pro-text-to-video",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to generate the video (Max length: 10000 characters)",
          "required": true,
          "max": 10000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated video",
          "required": false,
          "values": [
            "21:9",
            "16:9",
            "4:3",
            "1:1",
            "3:4",
            "9:16"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution - 480p for faster generation, 720p for balance, 1080p for higher quality",
          "required": false,
          "values": [
            "480p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "Duration of the video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "camera_fixed",
          "type": "bool",
          "default": false,
          "title": "Camera Fixed",
          "description": "Whether to fix the camera position (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "seed",
          "type": "float",
          "default": -1,
          "title": "Seed",
          "description": "Random seed to control video generation. Use -1 for random. (Min: -1, Max: 2147483647, Step: 1) (step: 1)",
          "required": false,
          "min": -1,
          "max": 2147483647
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
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "BytedanceV1LiteImageToVideo",
      "modelId": "bytedance/v1-lite-image-to-video",
      "title": "Bytedance - V1 Lite Image to Video",
      "description": "Bytedance - V1 Lite Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using bytedance/v1-lite-image-to-video",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to generate the video (Max length: 10000 characters)",
          "required": true,
          "max": 10000
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
          "description": "The URL of the image used to generate video (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution - 480p for faster generation, 720p for higher quality",
          "required": false,
          "values": [
            "480p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "Duration of the video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "camera_fixed",
          "type": "bool",
          "default": false,
          "title": "Camera Fixed",
          "description": "Whether to fix the camera position (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "seed",
          "type": "float",
          "default": -1,
          "title": "Seed",
          "description": "Random seed to control video generation. Use -1 for random. (Min: -1, Max: 2147483647, Step: 1) (step: 1)",
          "required": false,
          "min": -1,
          "max": 2147483647
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
          "name": "end_image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "End Image",
          "description": "The URL of the image the video ends with. Defaults to None. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
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
        },
        {
          "field": "end_image",
          "kind": "image",
          "paramName": "end_image_url"
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
      "className": "BytedanceV1LiteTextToVideo",
      "modelId": "bytedance/v1-lite-text-to-video",
      "title": "Bytedance - V1 Lite Text to Video",
      "description": "Bytedance - V1 Lite Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using bytedance/v1-lite-text-to-video",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to generate the video (Max length: 10000 characters)",
          "required": true,
          "max": 10000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated video",
          "required": false,
          "values": [
            "16:9",
            "4:3",
            "1:1",
            "3:4",
            "9:16",
            "9:21"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution - 480p for faster generation, 720p for higher quality",
          "required": false,
          "values": [
            "480p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "Duration of the video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "camera_fixed",
          "type": "bool",
          "default": false,
          "title": "Camera Fixed",
          "description": "Whether to fix the camera position (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed to control video generation. Use -1 for random.",
          "required": false
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
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "Hailuo23ImageToVideoPro",
      "modelId": "hailuo/2-3-image-to-video-pro",
      "title": "Hailuo 2.3 Pro Image to Video",
      "description": "Hailuo 2.3 Pro Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using hailuo/2-3-image-to-video-pro",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt describing the desired video animation (Max length: 5000 characters)",
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
          "description": "Input image to animate (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "6",
          "title": "Duration",
          "description": "The duration of the video in seconds. 10 seconds videos are not supported for 1080p resolution.",
          "required": false,
          "values": [
            "6",
            "10"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "768P",
          "title": "Resolution",
          "description": "The resolution of the generated video.",
          "required": false,
          "values": [
            "768P",
            "1080P"
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
      "className": "Hailuo23ImageToVideoStandard",
      "modelId": "hailuo/2-3-image-to-video-standard",
      "title": "Hailuo 2.3 Standard Image to Video",
      "description": "Hailuo 2.3 Standard Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using hailuo/2-3-image-to-video-standard",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt describing the desired video animation (Max length: 5000 characters)",
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
          "description": "Input image to animate (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "6",
          "title": "Duration",
          "description": "The duration of the video in seconds. 10 seconds videos are not supported for 1080p resolution.",
          "required": false,
          "values": [
            "6",
            "10"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "768P",
          "title": "Resolution",
          "description": "The resolution of the generated video.",
          "required": false,
          "values": [
            "768P",
            "1080P"
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
      "className": "Hailuo02TextToVideoPro",
      "modelId": "hailuo/02-text-to-video-pro",
      "title": "Hailuo Pro Text to Video",
      "description": "Hailuo Pro Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using hailuo/02-text-to-video-pro",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt for video generation (Max length: 1500 characters)",
          "required": true,
          "max": 1500
        },
        {
          "name": "prompt_optimizer",
          "type": "bool",
          "default": false,
          "title": "Prompt Optimizer",
          "description": "Whether to use the model's prompt optimizer (Boolean value (true/false))",
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
      "className": "Hailuo02ImageToVideoPro",
      "modelId": "hailuo/02-image-to-video-pro",
      "title": "Hailuo Pro Image to Video",
      "description": "Hailuo Pro Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using hailuo/02-image-to-video-pro",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt describing the desired video animation (Max length: 1500 characters)",
          "required": true,
          "max": 1500
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
          "description": "Input image to animate (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "end_image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "End Image",
          "description": "Optional URL of the image to use as the last frame of the video (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": false
        },
        {
          "name": "prompt_optimizer",
          "type": "bool",
          "default": false,
          "title": "Prompt Optimizer",
          "description": "Whether to use the model's prompt optimizer (Boolean value (true/false))",
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
        },
        {
          "field": "end_image",
          "kind": "image",
          "paramName": "end_image_url"
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
      "className": "Hailuo02TextToVideoStandard",
      "modelId": "hailuo/02-text-to-video-standard",
      "title": "Hailuo Standard Text to Video",
      "description": "Hailuo Standard Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using hailuo/02-text-to-video-standard",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text description for video generation (Max length: 1500 characters)",
          "required": true,
          "max": 1500
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "6",
          "title": "Duration",
          "description": "The duration of the video in seconds. 10 seconds videos are not supported for 1080p resolution.",
          "required": false,
          "values": [
            "6",
            "10"
          ]
        },
        {
          "name": "prompt_optimizer",
          "type": "bool",
          "default": false,
          "title": "Prompt Optimizer",
          "description": "Whether to use the model's prompt optimizer (Boolean value (true/false))",
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
      "className": "Hailuo02ImageToVideoStandard",
      "modelId": "hailuo/02-image-to-video-standard",
      "title": "Hailuo Standard Image to Video",
      "description": "Hailuo Standard Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using hailuo/02-image-to-video-standard",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt describing the video to generate (Max length: 1500 characters)",
          "required": true,
          "max": 1500
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
          "description": "The URL of the image to use as the first frame of the video (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "end_image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "End Image",
          "description": "Optional URL of the image to use as the last frame of the video (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": false
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "10",
          "title": "Duration",
          "description": "The duration of the video in seconds. 10 seconds videos are not supported for 1080p resolution.",
          "required": false,
          "values": [
            "6",
            "10"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "768P",
          "title": "Resolution",
          "description": "The resolution of the generated video.",
          "required": false,
          "values": [
            "512P",
            "768P"
          ]
        },
        {
          "name": "prompt_optimizer",
          "type": "bool",
          "default": false,
          "title": "Prompt Optimizer",
          "description": "Whether to use the model's prompt optimizer (Boolean value (true/false))",
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
        },
        {
          "field": "end_image",
          "kind": "image",
          "paramName": "end_image_url"
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
      "className": "Wan22A14bImageToVideoTurbo",
      "modelId": "wan/2-2-a14b-image-to-video-turbo",
      "title": "Wan - Image to Video",
      "description": "Wan - Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    Transform images into dynamic videos powered by Wan's advanced AI model",
      "outputType": "video",
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
          "description": "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt to guide video generation. (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Resolution of the generated video (480p or 720p). Default value: \"720p\"",
          "required": false,
          "values": [
            "480p",
            "720p"
          ]
        },
        {
          "name": "enable_prompt_expansion",
          "type": "bool",
          "default": false,
          "title": "Enable Prompt Expansion",
          "description": "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning. (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "seed",
          "type": "float",
          "default": 0,
          "title": "Seed",
          "description": "Random seed for reproducibility. If None, a random seed is chosen. (Min: 0, Max: 2147483647, Step: 1) (step: 1)",
          "required": false,
          "min": 0,
          "max": 2147483647
        },
        {
          "name": "acceleration",
          "type": "enum",
          "default": "none",
          "title": "Acceleration",
          "description": "Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'none'. Default value: \"none\"",
          "required": false,
          "values": [
            "none",
            "regular"
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
      "className": "Wan22A14bSpeechToVideoTurbo",
      "modelId": "wan/2-2-a14b-speech-to-video-turbo",
      "title": "Wan - 2.2 A14B Speech to Video Turbo",
      "description": "Wan - 2.2 A14B Speech to Video Turbo via Kie.ai.\n\n    kie, video, ai\n\n    Generate videos using Wan's advanced AI model",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used for video generation (Max length: 5000 characters)",
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
          "description": "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "audio",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Audio",
          "description": "The URL of the audio file (File URL after upload, not file content; Accepted types: audio/mp3, audio/wav, audio/ogg, audio/m4a, audio/flac, audio/aac, audio/x-ms-wma, audio/mpeg; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "num_frames",
          "type": "float",
          "default": 80,
          "title": "Num Frames",
          "description": "Number of frames to generate. Must be between 40 to 120, (must be multiple of 4) (Min: 40, Max: 120, Step: 4) (step: 4)",
          "required": false,
          "min": 40,
          "max": 120
        },
        {
          "name": "frames_per_second",
          "type": "float",
          "default": 16,
          "title": "Frames Per Second",
          "description": "Frames per second of the generated video. Must be between 4 to 60. When using interpolation and adjust_fps_for_interpolation is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If adjust_fps_for_interpolation is set to false, this value will be used as-is (Min: 4, Max: 60, Step: 1) (step: 1)",
          "required": false,
          "min": 4,
          "max": 60
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "480p",
          "title": "Resolution",
          "description": "Resolution of the generated video (480p, 580p, or 720p)",
          "required": false,
          "values": [
            "480p",
            "580p",
            "720p"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Negative prompt for video generation (Max length: 500 characters)",
          "required": false,
          "max": 500
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed for reproducibility. If None, a random seed is chosen",
          "required": false
        },
        {
          "name": "num_inference_steps",
          "type": "float",
          "default": 27,
          "title": "Num Inference Steps",
          "description": "Number of inference steps for sampling. Higher values give better quality but take longer (Min: 2, Max: 40, Step: 1) (step: 1)",
          "required": false,
          "min": 2,
          "max": 40
        },
        {
          "name": "guidance_scale",
          "type": "float",
          "default": 3.5,
          "title": "Guidance Scale",
          "description": "Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality (Min: 1, Max: 10, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 1,
          "max": 10
        },
        {
          "name": "shift",
          "type": "float",
          "default": 5,
          "title": "Shift",
          "description": "Shift value for the video. Must be between 1.0 and 10.0 (Min: 1, Max: 10, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 1,
          "max": 10
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
        },
        {
          "field": "audio",
          "kind": "audio",
          "paramName": "audio_url"
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
      "className": "Wan22A14bTextToVideoTurbo",
      "modelId": "wan/2-2-a14b-text-to-video-turbo",
      "title": "Wan - Text to Video",
      "description": "Wan - Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    High-quality video generation from text descriptions powered by Wan's advanced AI model",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt to guide video generation. (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Resolution of the generated video (480p or 720p). Default value: \"720p\"",
          "required": false,
          "values": [
            "480p",
            "720p"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Aspect ratio of the generated video (16:9 or 9:16). Default value: \"16:9\"",
          "required": false,
          "values": [
            "16:9",
            "9:16"
          ]
        },
        {
          "name": "enable_prompt_expansion",
          "type": "bool",
          "default": false,
          "title": "Enable Prompt Expansion",
          "description": "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning. (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "seed",
          "type": "float",
          "default": 0,
          "title": "Seed",
          "description": "Random seed for reproducibility. If None, a random seed is chosen. (Min: 0, Max: 2147483647, Step: 1) (step: 1)",
          "required": false,
          "min": 0,
          "max": 2147483647
        },
        {
          "name": "acceleration",
          "type": "enum",
          "default": "none",
          "title": "Acceleration",
          "description": "Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'none'. Default value: \"none\"",
          "required": false,
          "values": [
            "none",
            "regular"
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
      "className": "Wan22AnimateMove",
      "modelId": "wan/2-2-animate-move",
      "title": "Wan - Animate Move",
      "description": "Wan - Animate Move via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using Wan's advanced AI model",
      "outputType": "video",
      "fields": [
        {
          "name": "video",
          "type": "video",
          "default": {
            "type": "video",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null,
            "duration": null,
            "format": null
          },
          "title": "Video",
          "description": "URL of the input video. (File URL after upload, not file content; Accepted types: video/mp4, video/quicktime, video/x-matroska; Max size: 10.0MB)",
          "required": true
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
          "description": "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "480p",
          "title": "Resolution",
          "description": "Resolution of the generated video (480p, 580p, or 720p).",
          "required": false,
          "values": [
            "480p",
            "580p",
            "720p"
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
          "field": "video",
          "kind": "video",
          "paramName": "video_url"
        },
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        }
      ]
    },
    {
      "className": "Wan22AnimateReplace",
      "modelId": "wan/2-2-animate-replace",
      "title": "Wan - Animate Replace",
      "description": "Wan - Animate Replace via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using Wan's advanced AI model",
      "outputType": "video",
      "fields": [
        {
          "name": "video",
          "type": "video",
          "default": {
            "type": "video",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null,
            "duration": null,
            "format": null
          },
          "title": "Video",
          "description": "URL of the input video. (File URL after upload, not file content; Accepted types: video/mp4, video/quicktime, video/x-matroska; Max size: 10.0MB)",
          "required": true
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
          "description": "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "480p",
          "title": "Resolution",
          "description": "Resolution of the generated video (480p, 580p, or 720p).",
          "required": false,
          "values": [
            "480p",
            "580p",
            "720p"
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
          "field": "video",
          "kind": "video",
          "paramName": "video_url"
        },
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        }
      ]
    },
    {
      "className": "Wan26ImageToVideo",
      "modelId": "wan/2-6-image-to-video",
      "title": "Wan 2.6 - Image to Video",
      "description": "Wan 2.6 - Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    Transform static images into dynamic videos powered by Wan's advanced AI model",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompts for video generation. Supports both Chinese and English, with a minimum of 2 characters and a maximum of 5,000 characters. (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Upload an image file to use as input for the API (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB),All images must be at least 256x256px.",
          "required": true,
          "max": 1
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds",
          "required": false,
          "values": [
            "5",
            "10",
            "15"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Video resolution tier",
          "required": false,
          "values": [
            "720p",
            "1080p"
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
        }
      ]
    },
    {
      "className": "Wan26TextToVideo",
      "modelId": "wan/2-6-text-to-video",
      "title": "Wan 2.6 - Text to Video",
      "description": "Wan 2.6 - Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    High-quality video generation from text descriptions powered by Wan's advanced AI model",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompts for video generation. Supports both Chinese and English, with a minimum of 1 characters and a maximum of 5,000 characters. (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds",
          "required": false,
          "values": [
            "5",
            "10",
            "15"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Video resolution tier",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Enabled by default in Playground. For API calls, you can turn it on or off based on your needs.",
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
      "className": "Wan26VideoToVideo",
      "modelId": "wan/2-6-video-to-video",
      "title": "Wan 2.6 - Video to Video",
      "description": "Wan 2.6 - Video to Video via Kie.ai.\n\n    kie, video, ai\n\n    Transform existing videos with new prompts using Wan's advanced AI model",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompts for video generation. Supports both Chinese and English, with a minimum of 2 characters and a maximum of 5,000 characters. (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "videos",
          "type": "list[video]",
          "default": [],
          "title": "Videos",
          "description": "The URL of the image used to generate video (File URL after upload, not file content; Accepted types: video/mp4, video/quicktime, video/x-matroska; Max size: 10.0MB)",
          "required": true,
          "max": 3
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Video resolution tier",
          "required": false,
          "values": [
            "720p",
            "1080p"
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
          "field": "videos",
          "kind": "video",
          "isList": true,
          "paramName": "video_urls"
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
      "className": "Wan26FlashImageToVideo",
      "modelId": "wan/2-6-flash-image-to-video",
      "title": "Wan - 2.6-flash-image-to-video",
      "description": "Wan - 2.6-flash-image-to-video via Kie.ai.\n\n    kie, video, ai\n\n    > Transform images into dynamic videos powered by Wan's advanced AI model",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompts for video generation. Supports both Chinese and English, with a minimum of 2 characters and a maximum of 5,000 characters. (Max length: 1500 characters)",
          "required": true,
          "max": 1500
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "A list of image URLs. All images must be at least 256x256px. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true,
          "max": 1
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds",
          "required": false,
          "values": [
            "5",
            "10",
            "15"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Video resolution tier",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "audio",
          "type": "bool",
          "default": false,
          "title": "Audio",
          "description": "Whether to generate video with audio. Audio directly affects the cost, as the pricing differs between videos with sound and silent videos. (Boolean value (true/false))",
          "required": true
        },
        {
          "name": "multi_shots",
          "type": "bool",
          "default": false,
          "title": "Multi Shots",
          "description": "The multi shots parameter controls the shot composition style during AI video generation, determining whether the generated video is a single continuous shot or multiple shots with transitions. (Boolean value (true/false))",
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
      "className": "Wan26FlashVideoToVideo",
      "modelId": "wan/2-6-flash-video-to-video",
      "title": "Wan - 2-6-flash-video-to-video",
      "description": "Wan - 2-6-flash-video-to-video via Kie.ai.\n\n    kie, video, ai\n\n    > Content generation using wan/2-6-flash-video-to-video",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompts for video generation. Supports both Chinese and English, with a minimum of 2 characters and a maximum of 5,000 characters. (Max length: 1500 characters)",
          "required": true,
          "max": 1500
        },
        {
          "name": "videos",
          "type": "list[video]",
          "default": [],
          "title": "Videos",
          "description": "The URL of the image used to generate video (File URL after upload, not file content; Accepted types: video/mp4, video/quicktime, video/x-matroska; Max size: 10.0MB)",
          "required": true,
          "max": 3
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds",
          "required": false,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Video resolution tier",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "audio",
          "type": "bool",
          "default": false,
          "title": "Audio",
          "description": "Whether to generate video with audio. Audio directly affects the cost, as the pricing differs between videos with sound and silent videos. (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "multi_shots",
          "type": "bool",
          "default": false,
          "title": "Multi Shots",
          "description": "The multi shots parameter controls the shot composition style during AI video generation, determining whether the generated video is a single continuous shot or multiple shots with transitions. (Boolean value (true/false))",
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
          "field": "videos",
          "kind": "video",
          "isList": true,
          "paramName": "video_urls"
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
      "className": "Wan25ImageToVideo",
      "modelId": "wan/2-5-image-to-video",
      "title": "Wan 2.5 - Image to Video",
      "description": "Wan 2.5 - Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    Video generation by wan/2-5-image-to-video",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt describing the desired video motion. Maximum length: 800 characters.",
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
          "description": "URL of the image to use as the first frame. Must be publicly accessible. - Please provide the URL of the uploaded file, not raw file content - Accepted types: `image/jpeg`, `image/png`, `image/webp` - Max size: 10.0MB",
          "required": true
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "",
          "title": "Duration",
          "description": "The duration of the generated video in seconds. - `5`: 5 seconds - `10`: 10 seconds",
          "required": true,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "",
          "title": "Resolution",
          "description": "Video resolution. Valid values: `720p`, `1080p`.",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Negative prompt used to describe content to avoid. Maximum length: 500 characters.",
          "required": false,
          "max": 500
        },
        {
          "name": "enable_prompt_expansion",
          "type": "bool",
          "default": false,
          "title": "Enable Prompt Expansion",
          "description": "Whether to enable prompt rewriting using LLM. - Boolean value: `true` / `false`",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed for reproducibility. If omitted, a random seed is chosen.",
          "required": false
        },
        {
          "name": "nsfw_checker",
          "type": "bool",
          "default": false,
          "title": "Nsfw Checker",
          "description": "Enabled by default in Playground. For API calls, you can turn it on or off based on your needs.",
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
        },
        {
          "field": "duration",
          "rule": "not_empty",
          "message": "Duration is required"
        }
      ]
    },
    {
      "className": "Wan25TextToVideo",
      "modelId": "wan/2-5-text-to-video",
      "title": "Wan 2.5 - Text to Video",
      "description": "Wan 2.5 - Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    Video generation by wan/2-5-text-to-video",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt for video generation. Supports Chinese and English. Maximum length: 800 characters.",
          "required": true,
          "max": 800
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "",
          "title": "Duration",
          "description": "The duration of the generated video in seconds. - `5`: 5 seconds - `10`: 10 seconds",
          "required": true,
          "values": [
            "5",
            "10"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated video. - `16:9`: Landscape - `9:16`: Portrait - `1:1`: Square",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "",
          "title": "Resolution",
          "description": "Video resolution tier. - `720p`: 720p - `1080p`: 1080p",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Negative prompt used to describe content to avoid. Maximum length: 500 characters.",
          "required": false,
          "max": 500
        },
        {
          "name": "enable_prompt_expansion",
          "type": "bool",
          "default": false,
          "title": "Enable Prompt Expansion",
          "description": "Whether to enable prompt rewriting using LLM. Improves results for short prompts but increases processing time. - Boolean value: `true` / `false`",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed for reproducibility. If omitted, a random seed is chosen.",
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
        },
        {
          "field": "duration",
          "rule": "not_empty",
          "message": "Duration is required"
        }
      ]
    },
    {
      "className": "Wan27TextToVideo",
      "modelId": "wan/2-7-text-to-video",
      "title": "Wan 2.7 - Text to Video",
      "description": "Wan 2.7 - Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Positive prompt. Minimum length: 1 character. Maximum length: 5000 characters.",
          "required": true,
          "min": 1,
          "max": 5000
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Negative prompt. Maximum length: 500 characters.",
          "required": false,
          "max": 500
        },
        {
          "name": "audio",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Audio",
          "description": "Optional custom audio URL.",
          "required": false
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Video resolution. - `720p`: 720p - `1080p`: 1080p",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Ratio",
          "description": "Video aspect ratio. - `16:9`: Landscape - `9:16`: Portrait - `1:1`: Square - `4:3`: Landscape 4:3 - `3:4`: Portrait 3:4",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1",
            "4:3",
            "3:4"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Video duration in seconds. - Minimum: `2` - Maximum: `15` - Default: `5`",
          "required": false,
          "min": 2,
          "max": 15
        },
        {
          "name": "prompt_extend",
          "type": "bool",
          "default": true,
          "title": "Prompt Extend",
          "description": "Whether to enable intelligent prompt rewriting. Default value: `true`.",
          "required": false
        },
        {
          "name": "watermark",
          "type": "bool",
          "default": false,
          "title": "Watermark",
          "description": "Whether to add an AI-generated watermark. Default value: `false`.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed. - Minimum: `0` - Maximum: `2147483647`",
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
          "field": "audio",
          "kind": "audio",
          "paramName": "audio_url"
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
      "className": "Wan27ImageToVideo",
      "modelId": "wan/2-7-image-to-video",
      "title": "Wan 2.7 - Image to Video",
      "description": "Wan 2.7 - Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Positive prompt. Maximum length: 5000 characters.",
          "required": true,
          "max": 5000
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Negative prompt. Maximum length: 500 characters.",
          "required": false,
          "max": 500
        },
        {
          "name": "first_frame",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "First Frame",
          "description": "First frame image URL.",
          "required": false
        },
        {
          "name": "last_frame",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Last Frame",
          "description": "Last frame image URL.",
          "required": false
        },
        {
          "name": "first_clip",
          "type": "video",
          "default": {
            "type": "video",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null,
            "duration": null,
            "format": null
          },
          "title": "First Clip",
          "description": "First clip video URL, used for video continuation.",
          "required": false
        },
        {
          "name": "driving_audio",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Driving Audio",
          "description": "Driving audio URL.",
          "required": false
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Video resolution. - `720p`: 720p - `1080p`: 1080p",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Total output video duration in seconds. - Minimum: `2` - Maximum: `15` - Default: `5`",
          "required": false,
          "min": 2,
          "max": 15
        },
        {
          "name": "prompt_extend",
          "type": "bool",
          "default": true,
          "title": "Prompt Extend",
          "description": "Whether to enable intelligent prompt rewriting. Default value: `true`.",
          "required": false
        },
        {
          "name": "watermark",
          "type": "bool",
          "default": false,
          "title": "Watermark",
          "description": "Whether to add an AI-generated watermark. Default value: `false`.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed. - Minimum: `0` - Maximum: `2147483647`",
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
          "field": "first_frame",
          "kind": "image",
          "paramName": "first_frame_url"
        },
        {
          "field": "last_frame",
          "kind": "image",
          "paramName": "last_frame_url"
        },
        {
          "field": "first_clip",
          "kind": "video",
          "paramName": "first_clip_url"
        },
        {
          "field": "driving_audio",
          "kind": "audio",
          "paramName": "driving_audio_url"
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
      "className": "Wan27Videoedit",
      "modelId": "wan/2-7-videoedit",
      "title": "Wan 2.7 - Video Edit",
      "description": "Wan 2.7 - Video Edit via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Optional text prompt describing the expected elements and visual features in the generated video. Supports Chinese and English. Maximum length: 5000 characters.",
          "required": false,
          "max": 5000
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Optional negative prompt describing content that should not appear in the video. Supports Chinese and English. Maximum length: 500 characters.",
          "required": false,
          "max": 500
        },
        {
          "name": "video",
          "type": "video",
          "default": {
            "type": "video",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null,
            "duration": null,
            "format": null
          },
          "title": "Video",
          "description": "URL of the source video to edit. Required. Only one video is supported. - Formats: `mp4`, `mov` - Duration: `2` to `10` seconds - Resolution: width and height range `[240,4096]` pixels - Aspect ratio: `1:8` to `8:1` - File size: up to `100MB` - Supports public `http/https` URLs or temporary `oss` URLs",
          "required": true,
          "min": 240,
          "max": 4096
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Output video resolution tier. `1080p` costs more than `720p`. Default value: `1080p`. - `720p`: 720p - `1080p`: 1080p",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "",
          "title": "Aspect Ratio",
          "description": "Output video aspect ratio. - If omitted: the output uses an aspect ratio close to the input video - If provided: the output uses the specified aspect ratio - Available values: `16:9`, `9:16`, `1:1`, `4:3`, `3:4`",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1",
            "4:3",
            "3:4"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 0,
          "title": "Duration",
          "description": "Output video duration in seconds. - Default `0` means using the full input video duration without truncation - If a value is provided, the output is clipped from second `0` to the specified length - Valid values are `0` or any integer in `[2,10]`",
          "required": false,
          "min": 0,
          "max": 10
        },
        {
          "name": "audio_setting",
          "type": "enum",
          "default": "auto",
          "title": "Audio Setting",
          "description": "Video audio setting. - `auto`: default, the model decides whether to regenerate audio based on the `prompt` - `origin`: force keeping the original input video audio",
          "required": false,
          "values": [
            "auto",
            "origin"
          ]
        },
        {
          "name": "prompt_extend",
          "type": "bool",
          "default": true,
          "title": "Prompt Extend",
          "description": "Whether to enable prompt rewriting. When enabled, the model expands the input prompt. This usually works better for short prompts but increases processing time.",
          "required": false
        },
        {
          "name": "watermark",
          "type": "bool",
          "default": false,
          "title": "Watermark",
          "description": "Whether to add a watermark. The watermark is placed in the lower-right corner of the video with the fixed text \"AI generated\".",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed. Range: `0-2147483647`. If omitted, the system generates one automatically.",
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
        },
        {
          "name": "reference_image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Reference Image",
          "description": "Optional reference image URL for character, clothing, or style guidance. - Formats: `JPEG`, `JPG`, `PNG` (no alpha channel), `BMP`, `WEBP` - Resolution: width and height range `[240,8000]` pixels - Aspect ratio: `1:8` to `8:1` - Supports public `http/https` URLs or temporary `oss` URLs",
          "required": false,
          "min": 240,
          "max": 8000
        }
      ],
      "uploads": [
        {
          "field": "video",
          "kind": "video",
          "paramName": "video_url"
        },
        {
          "field": "reference_image",
          "kind": "image",
          "paramName": "reference_image"
        }
      ]
    },
    {
      "className": "Wan27R2v",
      "modelId": "wan/2-7-r2v",
      "title": "Wan 2.7 - Reference to Video",
      "description": "Wan 2.7 - Reference to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt. Required. Describes the desired elements and visual features in the generated video. Supports Chinese and English. Maximum length: 5000 characters.",
          "required": true,
          "max": 5000
        },
        {
          "name": "negative_prompt",
          "type": "str",
          "default": "",
          "title": "Negative Prompt",
          "description": "Optional negative prompt describing what should not appear in the video. Supports Chinese and English. Maximum length: 500 characters.",
          "required": false,
          "max": 500
        },
        {
          "name": "reference_image",
          "type": "list[image]",
          "default": [],
          "title": "Reference Image",
          "description": "Array of reference image URLs. At least one of `reference_image` or `reference_video` must be provided. The total number of images and videos cannot exceed 5.",
          "required": false,
          "max": 5
        },
        {
          "name": "reference_video",
          "type": "list[video]",
          "default": [],
          "title": "Reference Video",
          "description": "Array of reference video URLs. At least one of `reference_image` or `reference_video` must be provided. The total number of images and videos cannot exceed 5.",
          "required": false,
          "max": 5
        },
        {
          "name": "first_frame",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "First Frame",
          "description": "First frame image URL. At most one image can be provided. If supplied, `aspect_ratio` is ignored and the output uses a ratio close to the first frame image.",
          "required": false
        },
        {
          "name": "reference_voice",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Reference Voice",
          "description": "Audio URL used to specify the voice timbre of the subject in the reference material. Rules: - If `reference_video` contains audio and `reference_voice` is not provided, the original video audio is used by default - If both `reference_video` and `reference_voice` are provided, `reference_voice` takes priority Audio limits: - Formats: `wav`, `mp3` - Duration: `1` to `10` seconds - File size: up to `15MB`",
          "required": false
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Output video resolution tier. Available values: `720p`, `1080p`. Default value: `1080p`.",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Output video aspect ratio. Effective logic: - If `first_frame` is not provided: the video is generated using the specified `aspect_ratio` - If `first_frame` is provided: `aspect_ratio` is ignored and the output uses a ratio close to the first frame image",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1",
            "4:3",
            "3:4"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Output video duration in seconds. Valid range is an integer from `2` to `10`. Default value: `5`.",
          "required": false,
          "min": 2,
          "max": 10
        },
        {
          "name": "prompt_extend",
          "type": "bool",
          "default": true,
          "title": "Prompt Extend",
          "description": "Whether to enable prompt rewriting. When enabled, the model expands the input prompt. This usually works better for short prompts but increases processing time.",
          "required": false
        },
        {
          "name": "watermark",
          "type": "bool",
          "default": false,
          "title": "Watermark",
          "description": "Whether to add a watermark. The watermark is placed in the lower-right corner of the video with the fixed text \"AI generated\".",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed. Range: `0-2147483647`. If omitted, the system generates one automatically.",
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
          "field": "reference_image",
          "kind": "image",
          "isList": true,
          "paramName": "reference_image"
        },
        {
          "field": "reference_video",
          "kind": "video",
          "isList": true,
          "paramName": "reference_video"
        },
        {
          "field": "first_frame",
          "kind": "image",
          "paramName": "first_frame"
        },
        {
          "field": "reference_voice",
          "kind": "audio",
          "paramName": "reference_voice"
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
      "className": "TopazVideoUpscale",
      "modelId": "topaz/video-upscale",
      "title": "Topaz - Video Upscale",
      "description": "Topaz - Video Upscale via Kie.ai.\n\n    kie, video, ai\n\n    Enhance video resolution and quality using advanced AI upscaling powered by Topaz",
      "outputType": "video",
      "fields": [
        {
          "name": "video",
          "type": "video",
          "default": {
            "type": "video",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null,
            "duration": null,
            "format": null
          },
          "title": "Video",
          "description": "URL of the video to upscale (File URL after upload, not file content; Accepted types: video/mp4, video/quicktime, video/x-matroska; Max size: 50.0MB)",
          "required": true
        },
        {
          "name": "upscale_factor",
          "type": "enum",
          "default": "2",
          "title": "Upscale Factor",
          "description": "Factor to upscale the video by (e.g. 2.0 doubles width and height)",
          "required": false,
          "values": [
            "1",
            "2",
            "4"
          ]
        }
      ],
      "uploads": [
        {
          "field": "video",
          "kind": "video",
          "paramName": "video_url"
        }
      ]
    },
    {
      "className": "InfinitalkFromAudio",
      "modelId": "infinitalk/from-audio",
      "title": "Infinitalk - From Audio",
      "description": "Infinitalk - From Audio via Kie.ai.\n\n    kie, video, ai\n\n    Content generation using infinitalk/from-audio",
      "outputType": "video",
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
          "description": "URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped. (File URL after upload, not file content; Accepted types: image/jpeg, image/png, image/webp; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "audio",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Audio",
          "description": "The URL of the audio file. (File URL after upload, not file content; Accepted types: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/mp4, audio/ogg; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt to guide video generation. (Max length: 5000 characters)",
          "required": true,
          "max": 5000
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "480p",
          "title": "Resolution",
          "description": "Resolution of the video to generate. Must be either 480p or 720p.",
          "required": false,
          "values": [
            "480p",
            "720p"
          ]
        },
        {
          "name": "seed",
          "type": "float",
          "default": 0,
          "title": "Seed",
          "description": "Random seed for reproducibility. Valid range is 10000 to 1000000.",
          "required": false,
          "min": 10000,
          "max": 1000000
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        },
        {
          "field": "audio",
          "kind": "audio",
          "paramName": "audio_url"
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
      "className": "HappyhorseTextToVideo",
      "modelId": "happyhorse/text-to-video",
      "title": "happyhorse-text-to-video",
      "description": "happyhorse-text-to-video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt describing the video to generate (any language). Max 5,000 non‑Chinese characters or 2,500 Chinese characters; extra content is truncated.",
          "required": true,
          "max": 5000
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Output video resolution. Valid values: 720P, 1080P (default).",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Output aspect ratio. Valid values: 16:9 (default), 9:16, 1:1, 4:3, 3:4.",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1",
            "4:3",
            "3:4"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Output duration in seconds (integer). Must be between 3 and 15. Defaults to 5.",
          "required": false,
          "min": 3,
          "max": 15
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed for reproducibility (if supported).",
          "required": false,
          "min": 0,
          "max": 2147483647
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
      "className": "HappyhorseImageToVideo",
      "modelId": "happyhorse/image-to-video",
      "title": "happyhorse-image-to-video",
      "description": "happyhorse-image-to-video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt describing the video to generate (any language). Max 5,000 non‑Chinese characters or 2,500 Chinese characters; extra content is truncated.",
          "required": false,
          "max": 5000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "First-frame image URL list. Exactly one image is required. Image constraints: Format: JPEG, JPG, PNG, WEBP. Resolution: Width and height must be at least 300 pixels. Aspect ratio: 1:2.5 to 2.5:1. File size: Up to 10 MB.",
          "required": false,
          "max": 1
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Output video resolution. Valid values: 720P, 1080P (default).",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Output duration in seconds. Must be between 3 and 15. Defaults to 5.",
          "required": false,
          "min": 3,
          "max": 15
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed for reproducibility (if supported).",
          "required": false,
          "min": 0,
          "max": 2147483647
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
      "className": "HappyhorseReferenceToVideo",
      "modelId": "happyhorse/reference-to-video",
      "title": "happyhorse/reference-to-video",
      "description": "happyhorse/reference-to-video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt describing the video to generate (any language). Max 5,000 non‑Chinese characters or 2,500 Chinese characters; extra content is truncated.",
          "required": true,
          "max": 5000
        },
        {
          "name": "reference_image",
          "type": "list[image]",
          "default": [],
          "title": "Reference Image",
          "description": "Reference image URL list. Provide 1–9 images. The order defines which image is character1, character2, etc. Image limits: Format: JPEG, JPG, PNG, and WEBP. Resolution: shortest side at least 400 px. 720P or higher recommended. Avoid small, blurry, or heavily compressed images, as they degrade output quality. File size: 10 MB maximum.",
          "required": true,
          "min": 1,
          "max": 9
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Output video resolution. Valid values: 720P, 1080P (default).",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Output aspect ratio. Valid values: 16:9 (default), 9:16, 1:1, 4:3, 3:4.",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1",
            "4:3",
            "3:4"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Output duration in seconds (integer). Must be between 3 and 15. Defaults to 5.",
          "required": false,
          "min": 3,
          "max": 15
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed for reproducibility (if supported).",
          "required": false,
          "min": 0,
          "max": 2147483647
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
      "className": "HappyhorseVideoEdit",
      "modelId": "happyhorse/video-edit",
      "title": "happyhorse/video-edit",
      "description": "happyhorse/video-edit via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Required edit instruction describing the intended change (e.g., style transfer / local replacement). Max 5,000 non‑Chinese characters or 2,500 Chinese characters; extra content is truncated.",
          "required": true,
          "max": 5000
        },
        {
          "name": "video",
          "type": "video",
          "default": {
            "type": "video",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null,
            "duration": null,
            "format": null
          },
          "title": "Video",
          "description": "Input video URL list. Exactly one video is required. Video requirements: Format: MP4, MOV (H.264 encoding recommended). Duration: 3–60 seconds. Resolution: the longer side must not exceed 2,160 px; the shorter side must be at least 320 px. Aspect ratio: 1:2.5–2.5:1. File size: up to 100 MB. Frame rate: greater than 8 fps.",
          "required": true
        },
        {
          "name": "reference_image",
          "type": "list[image]",
          "default": [],
          "title": "Reference Image",
          "description": "Optional reference image URL list (0–5). Image requirements: Format: JPEG, JPG, PNG, WEBP. Resolution: both width and height must be at least 300 px. Aspect ratio: 1:2.5–2.5:1. File size: up to 10 MB.",
          "required": false,
          "min": 0,
          "max": 5
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Output video resolution. Valid values: 720P, 1080P (default).",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "audio_setting",
          "type": "enum",
          "default": "auto",
          "title": "Audio Setting",
          "description": "Audio handling strategy for the output video.",
          "required": false,
          "values": [
            "auto",
            "origin"
          ]
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed for reproducibility (if supported).",
          "required": false,
          "min": 0,
          "max": 2147483647
        }
      ],
      "uploads": [
        {
          "field": "video",
          "kind": "video",
          "paramName": "video_url"
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
      "className": "GeminiOmniVideo",
      "modelId": "gemini-omni-video",
      "title": "Gemini Omni Video",
      "description": "Gemini Omni Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
      "outputType": "video",
      "moduleName": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Video prompt used to describe the target content, style, camera language, or character actions in the generated video.",
          "required": true,
          "max": 20000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Array of image URLs. You can provide one or more reference images for characters, scenes, styles, or storyboard guidance. Image limits: - Each file must be no larger than `20MB` - Use publicly accessible image URLs - Max 7 images",
          "required": false
        },
        {
          "name": "audio_ids",
          "type": "list[str]",
          "default": [],
          "title": "Audio Ids",
          "description": "Array of audio IDs generated by the `gemini-omni-audio` endpoint. Useful for narration, dialogue, music, or audio guidance in the generated video. Max 3 items.",
          "required": false
        },
        {
          "name": "video_list",
          "type": "video_clip_list",
          "default": [],
          "title": "Video List",
          "description": "Array of video clips. Each item defines a source video and the trim range to use during generation. Video limits: - Each file must be no larger than `100MB` - Video duration must not exceed `30s` - `ends` should be greater than `start` - The difference between the end time and the start time must not exceed `10s`. - Max 1 items. Equal 2 images",
          "required": false
        },
        {
          "name": "character_ids",
          "type": "list[str]",
          "default": [],
          "title": "Character Ids",
          "description": "An array of character IDs generated by the `gemini-omni-character` API. Used to provide character appearance, identity, or person references for the video. Each character_id uses 1 image slot. The base limit is 7 image slots; if video_list is also provided, video_list uses 2 image slots, so character_ids can contain up to 3 IDs.",
          "required": false
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "",
          "title": "Duration",
          "description": "The duration of the generated video in seconds. Available values are 4, 6, 8, and 10. When video input is provided, the output duration is determined by the model automatically. This duration parameter will not take effect.Note: when video input is provided, the output duration is determined by the model automatically. This duration parameter will not take effect.",
          "required": true,
          "values": [
            "4",
            "6",
            "8",
            "10"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated video. `16:9` is landscape, and `9:16` is portrait.",
          "required": false,
          "values": [
            "16:9",
            "9:16"
          ]
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed. Range: [0, 2147483647]. If not specified, the system generates a seed automatically. Fixing the seed can improve reproducibility, but results may still vary due to the model’s stochasticity.",
          "required": false,
          "min": 0,
          "max": 2147483647
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "The resolution of the generated video. Available values are 720p, 1080p, and 4k.",
          "required": false,
          "values": [
            "720p",
            "1080p",
            "4k"
          ]
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "isList": true,
          "paramName": "image_urls"
        },
        {
          "field": "video_list",
          "kind": "video",
          "isList": true,
          "isVideoClip": true,
          "paramName": "video_list"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "duration",
          "rule": "not_empty",
          "message": "Duration is required"
        }
      ]
    },
    {
      "className": "GeminiOmniAudio",
      "modelId": "gemini-omni-audio",
      "title": "Gemini Omni Audio",
      "description": "Gemini Omni Audio via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
      "outputType": "text",
      "moduleName": "video",
      "useOmniDirect": true,
      "submitEndpoint": "/api/v1/omni/audio/create",
      "responseIdKey": "audioId",
      "fields": [
        {
          "name": "audio_id",
          "type": "str",
          "default": "",
          "title": "Audio Id",
          "description": "Enum voice ID, used to select a preset voice character. achernar - female, soft, high pitch achird - male, friendly, mid pitch algenib - male, raspy, low pitch algieba - male, easygoing, mid-low pitch alnilam - male, steady, mid-low pitch aoede - female, brisk, mid pitch autonoe - female, bright, mid pitch callirrhoe - female, easygoing, mid pitch charon - male, intellectual, low pitch despina - female, smooth, mid pitch enceladus - male, breathy, low pitch erinome - female, clear, mid pitch fenrir - male, lively, younger pitch gacrux - female, mature, mid pitch iapetus - male, clear, mid-low pitch kore - female, capable, mid pitch laomedeia - female, cheerful, mid-high pitch leda - female, young, mid-high pitch orus - male, steady, mid-low pitch puck - male, cheerful, mid pitch pulcherrima - genderless, forward, mid-high pitch rasalgethi - male, intellectual, mid pitch sadachbia - male, vivid, low pitch sadaltager - male, knowledgeable, mid pitch schedar - male, smooth, mid-low pitch sulafat - female, warm, mid pitch umbriel - male, smooth, low pitch vindemiatrix - female, gentle, mid pitch zephyr - female, bright, mid-high pitch zubenelgenubi - male, casual, mid-low pitch",
          "required": true
        },
        {
          "name": "name",
          "type": "str",
          "default": "",
          "title": "Name",
          "description": "Voice name. Maximum length: `210` characters.",
          "required": true
        },
        {
          "name": "voice_description",
          "type": "str",
          "default": "",
          "title": "Voice Description",
          "description": "Voice characteristic description used to define timbre, style, speaking rate, emotion, and other traits. Maximum length: `20000` characters.",
          "required": false
        },
        {
          "name": "example_dialogue",
          "type": "str",
          "default": "",
          "title": "Example Dialogue",
          "description": "Example dialogue, such as \"Hello, I am Adam\". Maximum length: `120` characters.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "audio_id",
          "rule": "not_empty",
          "message": "Audio Id is required"
        },
        {
          "field": "name",
          "rule": "not_empty",
          "message": "Name is required"
        }
      ]
    },
    {
      "className": "GeminiOmniCharacter",
      "modelId": "gemini-omni-character",
      "title": "Gemini Omni Character",
      "description": "Gemini Omni Character via Kie.ai.\n\n    kie, video, ai\n\n    - `image_urls` supports only `1` image, and each image must be no larger than `20MB`",
      "outputType": "text",
      "moduleName": "video",
      "useOmniDirect": true,
      "submitEndpoint": "/api/v1/omni/character/create",
      "responseIdKey": "characterId",
      "fields": [
        {
          "name": "descriptions",
          "type": "str",
          "default": "",
          "title": "Descriptions",
          "description": "Character description used to define the appearance, identity, style, clothing, or personality of the character.",
          "required": true
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Array of character reference image URLs. Only `1` image is supported. Image limits: - Each image must be no larger than `20MB` - Use a publicly accessible image URL",
          "required": true,
          "max": 1
        },
        {
          "name": "audio_ids",
          "type": "list[str]",
          "default": [],
          "title": "Audio Ids",
          "description": "Array of audio IDs generated by the `gemini-omni-audio` endpoint. These can be used to provide voice traits, tone, or persona guidance for the character.",
          "required": false
        },
        {
          "name": "character_name",
          "type": "str",
          "default": "",
          "title": "Character Name",
          "description": "Character name",
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
          "field": "descriptions",
          "rule": "not_empty",
          "message": "Descriptions is required"
        }
      ]
    }
  ]
};
