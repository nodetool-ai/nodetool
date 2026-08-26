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
            "720p",
            "1080p"
          ]
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
          "description": "Provide an external image URL as a reference for video generation. Up to 7 images are supported. Do not use it simultaneously with task_id. In your prompt, reference an uploaded image by typing @image(n) followed by a space (for example: @image1 a sunset over the ocean). - Supports JPEG, PNG, and WEBP formats - Maximum file size for each image: 10MB - The Spicy mode is not available when using external images - The array can contain a maximum of seven URLs - Only one is supported when the resolution is 1080p.",
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
            "720p",
            "1080p"
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "paramName": "image_urls",
          "isList": true
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
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video generation resolution.",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
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
          "type": "float",
          "default": 2,
          "title": "Extend At",
          "description": "The starting position of the video extension. Optional field.",
          "required": true,
          "min": 2
        },
        {
          "name": "extend_times",
          "type": "float",
          "default": 0,
          "title": "Extend Times",
          "description": "Duration of video extension (in seconds). Required field. - `6`: Expand 6 seconds of video content - `10`: Expand 10 seconds of video content - The longer the extension duration, the longer the time required for generation - Select the appropriate duration based on the complexity of the scene",
          "required": true
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
        }
      ]
    },
    {
      "className": "GrokImagineVideo15PreviewCreateTask",
      "modelId": "grok-imagine-video-1-5-preview",
      "title": "Grok Imagine Video 1.5 Preview",
      "description": "Grok Imagine Video 1.5 Preview via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Prompt for video generation. Maximum length: 4096 characters.",
          "required": false,
          "max": 4096
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Upload image files to be used as API input. Supported file types: image/jpeg, image/png, image/webp, image/jpg. Maximum file size: 20MB. Supports multi-file upload, up to 7 file.Only one is supported when the resolution is 1080p.",
          "required": false,
          "max": 7
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "auto",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the video. This parameter is invalid if it is a single image.",
          "required": false,
          "values": [
            "1:1",
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
          "default": "480p",
          "title": "Resolution",
          "description": "Resolution for video generation.",
          "required": false,
          "values": [
            "480p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 8,
          "title": "Duration",
          "description": "Video duration in seconds. Range: [1, 15]. Default: 8. Minimum: 1. Maximum: 15. Step: 1.",
          "required": false,
          "min": 1,
          "max": 15
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
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "paramName": "image_urls",
          "isList": true
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
          "paramName": "image_urls",
          "isList": true
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
          "description": "Tail frame image of video (File URL after upload, not file content; Accepted types: image/jpeg, image/png; Max size: 10.0MB)",
          "required": false
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
          "description": "An array containing a single video URL. The duration must be between 3 to 30 seconds, and the video must clearly show the subject's head, shoulders, and torso. (File URL after upload, not file content; Accepted types: video/mp4, video/quicktime; Max size: 100.0MB)",
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
          "paramName": "input_urls",
          "isList": true
        },
        {
          "field": "videos",
          "kind": "video",
          "paramName": "video_urls",
          "isList": true
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
          "paramName": "input_urls",
          "isList": true
        },
        {
          "field": "videos",
          "kind": "video",
          "paramName": "video_urls",
          "isList": true
        }
      ]
    },
    {
      "className": "Kling30",
      "modelId": "kling-3.0/video",
      "title": "Kling 3.0",
      "description": "Kling 3.0 via Kie.ai.\n\n    kie, video, ai\n\n    Generate high-quality videos with advanced multi-shot capabilities and element references using Kling 3.0 AI",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Video generation prompt. Takes effect when multi_shots is false.",
          "required": true
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "First and last frame image URLs. Required when elements are referenced in the prompt (using @element_name syntax). When multi_shots is false: if length is 2, index 0 is the first frame and index 1 is the last frame; if length is 1, the array item serves as the first frame. When multi_shots is true: only the first frame is supported.",
          "required": false
        },
        {
          "name": "sound",
          "type": "bool",
          "default": false,
          "title": "Sound",
          "description": "Whether to enable sound effects. true enables sound effects, false disables them. When multi_shots is true, this field defaults to true.",
          "required": true
        },
        {
          "name": "duration",
          "type": "enum",
          "default": "5",
          "title": "Duration",
          "description": "Total video duration in seconds. Integer value, range: 3 to 15.",
          "required": true,
          "values": [
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10",
            "11",
            "12",
            "13",
            "14",
            "15"
          ],
          "min": 3,
          "max": 15
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Video aspect ratio. Options: 16:9, 9:16, 1:1. When image_urls(first and last frame images) is provided, this parameter is optional and the aspect ratio will be automatically adapted based on the uploaded images.",
          "required": true,
          "values": [
            "16:9",
            "9:16",
            "1:1"
          ]
        },
        {
          "name": "mode",
          "type": "enum",
          "default": "pro",
          "title": "Mode",
          "description": "Generation mode. std has standard resolution, pro has higher resolution, 4K has 4K resolution. Resolution mapping: - **std mode**: 16:9 (1280×720), 9:16 (720×1280), 1:1 (720×720) - **pro mode**: 16:9 (1920×1080), 9:16 (1080×1920), 1:1 (1080×1080) - **4K mode**: 16:9 (3840×2160), 9:16 (2160×3840), 1:1 (2160×2160)",
          "required": true,
          "values": [
            "std",
            "pro",
            "4K"
          ]
        },
        {
          "name": "multi_shots",
          "type": "bool",
          "default": false,
          "title": "Multi Shots",
          "description": "Whether to use multi-shot mode. true enables multi-shot mode, false enables single-shot mode.",
          "required": true
        },
        {
          "name": "multi_prompt",
          "type": "list[dict]",
          "default": [],
          "title": "Multi Prompt",
          "description": "Shot prompts. Takes effect when multi_shots is true. Used to describe the text and duration of each shot. Supports up to 5 shots. Each shot duration is 1-12 seconds. If you need to use elements, add them after the prompt.",
          "required": true,
          "min": 1,
          "max": 12
        },
        {
          "name": "kling_elements",
          "type": "list[dict]",
          "default": [],
          "title": "Kling Elements",
          "description": "Referenced elements. Detailed information about elements referenced in the prompt. A single task can reference a maximum of three elements.",
          "required": false,
          "max": 3
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
        },
        {
          "field": "duration",
          "rule": "not_empty",
          "message": "Duration is required"
        },
        {
          "field": "aspect_ratio",
          "rule": "not_empty",
          "message": "Aspect Ratio is required"
        },
        {
          "field": "mode",
          "rule": "not_empty",
          "message": "Mode is required"
        }
      ]
    },
    {
      "className": "KlingV3TurboTextToVideo",
      "modelId": "kling/v3-turbo-text-to-video",
      "title": "Kling - V3 Turbo Text to Video",
      "description": "Kling - V3 Turbo Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
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
          "type": "str",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds Optional duration: 3s - 15s",
          "required": true
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "The aspect ratio of the generated video frame",
          "required": true,
          "values": [
            "1:1",
            "9:16",
            "16:9"
          ]
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Resolution of the generated video (720p or 1080p)",
          "required": true,
          "values": [
            "720p",
            "1080p"
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
          "field": "duration",
          "rule": "not_empty",
          "message": "Duration is required"
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
      "className": "KlingV3TurboImageToVideo",
      "modelId": "kling/v3-turbo-image-to-video",
      "title": "Kling - V3 Turbo Image to Video",
      "description": "Kling - V3 Turbo Image to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
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
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "URL of the image to be used for the video (File URL after upload, not file content; Accepted types: image/jpeg, image/png; Max size: 10.0MB)",
          "required": true
        },
        {
          "name": "duration",
          "type": "str",
          "default": "5",
          "title": "Duration",
          "description": "The duration of the generated video in seconds Optional duration: 3s - 15s",
          "required": true
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Resolution of the generated video (720p or 1080p)",
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
          "paramName": "image_urls",
          "isList": true
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
        },
        {
          "field": "resolution",
          "rule": "not_empty",
          "message": "Resolution is required"
        }
      ]
    },
    {
      "className": "Kling30OmniReferenceToVideo",
      "modelId": "kling-3.0-omni/reference-to-video",
      "title": "Kling 3.0 Omni Reference To Video",
      "description": "Kling 3.0 Omni Reference To Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Video description. It must not be empty after leading and trailing whitespace is removed. Maximum length: 3,072 characters.",
          "required": true,
          "min": 1,
          "max": 3072
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Array of reference image URLs. The maximum number of images depends on the number and types of reference subjects. When there is no reference video and only multi-image subjects are used, the combined number of reference images and multi-image subjects must not exceed 7. When there is no reference video and both video character and multi-image subjects are used, the combined number of reference images and multi-image subjects must not exceed 4. HTTP, HTTPS, and OSS URLs are supported. Images must be in JPG, JPEG, or PNG format; each file must not exceed 50 MB; both width and height must be at least 300 px; and the aspect ratio must be between 0.4 and 2.5.",
          "required": true,
          "max": 7
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Total video duration in seconds. Optional; the default is 5 seconds. Supports integer values from 3 to 15.",
          "required": false,
          "min": 3,
          "max": 15
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution. `720p` outputs a 720p video, `1080p` outputs a 1080p video, and `4k` outputs a 4K video.",
          "required": false,
          "values": [
            "720p",
            "1080p",
            "4k"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "When no video is provided, `16:9`, `9:16`, and `1:1` are supported.",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1"
          ]
        },
        {
          "name": "audio",
          "type": "bool",
          "default": false,
          "title": "Audio",
          "description": "Whether to enable audio. When no video is provided, both `true` and `false` are supported.",
          "required": false
        },
        {
          "name": "customize_multi_shots",
          "type": "bool",
          "default": false,
          "title": "Customize Multi Shots",
          "description": "Whether to enable multiple shots. Both `true` and `false` are supported.",
          "required": false
        },
        {
          "name": "prefer_multi_shots",
          "type": "bool",
          "default": false,
          "title": "Prefer Multi Shots",
          "description": "Whether to enable intelligent shot planning. This field is mutually exclusive with `customize_multi_shots`.",
          "required": false
        },
        {
          "name": "multi_prompt",
          "type": "list[dict]",
          "default": [],
          "title": "Multi Prompt",
          "description": "List of custom shots. When `customize_multi_shots=true`, this field is required, must not be empty, and may contain up to 6 shots. When `customize_multi_shots=false`, it must be an empty array or omitted.",
          "required": false,
          "min": 1,
          "max": 6
        },
        {
          "name": "elements",
          "type": "list[dict]",
          "default": [],
          "title": "Elements",
          "description": "List of one-time subject assets. The default is an empty array. The number of subjects is jointly limited by the reference images, reference video, and subject types. When there is no reference video and only multi-image subjects are used, the combined number of reference images and multi-image subjects must not exceed 7. When there is no reference video and only video character subjects are used, the number of video character subjects must not exceed 3. When there is no reference video and both video character and multi-image subjects are used, the number of video character subjects must not exceed 3, and the combined number of reference images and multi-image subjects must not exceed 4.",
          "required": false
        },
        {
          "name": "videos",
          "type": "list[video]",
          "default": [],
          "title": "Videos",
          "description": "Array of video URLs. Exactly 1 video is required. HTTP, HTTPS, and OSS URLs are supported. Videos must be in MP4 or MOV format; each file must not exceed 200 MB; duration must be between 3 and 15.5 seconds; width and height must each be between 700 and 4,553 px; total pixels must not exceed 8,294,400; the aspect ratio must be between 0.4 and 2; and the frame rate must be between 24 and 60 fps.",
          "required": false,
          "min": 1,
          "max": 1
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "paramName": "image_urls",
          "isList": true
        },
        {
          "field": "videos",
          "kind": "video",
          "paramName": "video_urls",
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
    },
    {
      "className": "Kling30OmniTransformation",
      "modelId": "kling-3.0-omni/transformation",
      "title": "Kling 3.0 Omni Transformation",
      "description": "Kling 3.0 Omni Transformation via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Video description. It must not be empty after leading and trailing whitespace is removed. Maximum length: 3,072 characters.",
          "required": false,
          "min": 1,
          "max": 3072
        },
        {
          "name": "videos",
          "type": "list[video]",
          "default": [],
          "title": "Videos",
          "description": "Array of video URLs. Exactly 1 video is required. HTTP, HTTPS, and OSS URLs are supported. Videos must be in MP4 or MOV format; each file must not exceed 200 MB; duration must be between 3 and 15.5 seconds; width and height must each be between 700 and 4,553 px; total pixels must not exceed 8,294,400; the aspect ratio must be between 0.4 and 2; and the frame rate must be between 24 and 60 fps.",
          "required": false,
          "min": 1,
          "max": 1
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Array of image URLs. The maximum number of images depends on the number and types of reference subjects. When using only multi-image subjects, the combined number of reference images and multi-image subjects must not exceed 4. Video character subjects cannot be used together with multi-image subjects or reference images. HTTP, HTTPS, and OSS URLs are supported. Images must be in JPG, JPEG, or PNG format; each file must not exceed 50 MB; both width and height must be at least 300 px; and the aspect ratio must be between 0.4 and 2.5.",
          "required": false,
          "max": 4
        },
        {
          "name": "duration",
          "type": "str",
          "default": "",
          "title": "Duration",
          "description": "Video duration. This field may be configured when using a video with images.",
          "required": false
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution. `720p` outputs a 720p video, `1080p` outputs a 1080p video, and `4k` outputs a 4K video.",
          "required": false,
          "values": [
            "720p",
            "1080p",
            "4k"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Video aspect ratio. Only `auto` can be used with video-only input. When using a video with images, `16:9`, `9:16`, and `1:1` are supported; `auto` is not supported.",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1",
            "auto"
          ]
        },
        {
          "name": "audio",
          "type": "bool",
          "default": false,
          "title": "Audio",
          "description": "Whether to enable audio.",
          "required": false
        },
        {
          "name": "elements",
          "type": "list[dict]",
          "default": [],
          "title": "Elements",
          "description": "List of one-time subject assets. The default is an empty array. When using only multi-image subjects, up to 7 subjects can be uploaded. When using only video character subjects, the number of video character subjects must not exceed 3. When using both video character and multi-image subjects, the number of video character subjects must not exceed 3, and the number of multi-image subjects must not exceed 4.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "videos",
          "kind": "video",
          "paramName": "video_urls",
          "isList": true
        },
        {
          "field": "images",
          "kind": "image",
          "paramName": "image_urls",
          "isList": true
        }
      ]
    },
    {
      "className": "Kling30OmniImageToVideo",
      "modelId": "kling-3.0-omni/image-to-video",
      "title": "Kling 3.0 Omni  Image To Video",
      "description": "Kling 3.0 Omni  Image To Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Video description. It must not be empty after leading and trailing whitespace is removed. Maximum length: 3,072 characters.",
          "required": true,
          "min": 3,
          "max": 3072
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Array of first-frame image URLs. Exactly 1 image is required. HTTP, HTTPS, and OSS URLs are supported. Images must be in JPG, JPEG, or PNG format; each file must not exceed 50 MB; both width and height must be at least 300 px; and the aspect ratio must be between 0.4 and 2.5.",
          "required": true,
          "min": 1,
          "max": 1
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Total video duration in seconds. Optional; the default is 5 seconds. Supports integer values from 3 to 15.",
          "required": false,
          "min": 3,
          "max": 15
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution. `720p` outputs a 720p video, `1080p` outputs a 1080p video, and `4k` outputs a 4K video.",
          "required": false,
          "values": [
            "720p",
            "1080p",
            "4k"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "auto",
          "title": "Aspect Ratio",
          "description": "Video aspect ratio. `16:9`, `9:16`, and `1:1` can be selected only when custom multi-shot mode is enabled through `customize_multi_shots`; otherwise, use `auto`.",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1",
            "auto"
          ]
        },
        {
          "name": "audio",
          "type": "bool",
          "default": false,
          "title": "Audio",
          "description": "Whether to enable audio. Passing this value explicitly is recommended. `true` enables audio; `false` disables audio.",
          "required": false
        },
        {
          "name": "customize_multi_shots",
          "type": "bool",
          "default": false,
          "title": "Customize Multi Shots",
          "description": "Whether to enable multiple shots. Passing this value explicitly is recommended.",
          "required": false
        },
        {
          "name": "prefer_multi_shots",
          "type": "bool",
          "default": false,
          "title": "Prefer Multi Shots",
          "description": "Whether to enable intelligent shot planning. This field is mutually exclusive with `customize_multi_shots`.",
          "required": false
        },
        {
          "name": "multi_prompt",
          "type": "list[dict]",
          "default": [],
          "title": "Multi Prompt",
          "description": "List of custom shots. When `customize_multi_shots=true`, this field is required and may contain up to 6 shots. When `customize_multi_shots=false`, it must be an empty array or omitted.",
          "required": false,
          "min": 1,
          "max": 6
        },
        {
          "name": "elements",
          "type": "list[dict]",
          "default": [],
          "title": "Elements",
          "description": "List of one-time subject assets. The default is an empty array, with up to 3 subjects. The subject is automatically identified as a multi-image subject or video character subject based on `element_input_urls`.",
          "required": false,
          "max": 3
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
    },
    {
      "className": "Kling30OmniTextToVideo",
      "modelId": "kling-3.0-omni/text-to-video",
      "title": "Kling 3.0 Omni Text to Video",
      "description": "Kling 3.0 Omni Text to Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text description of the video. It must not be empty after leading and trailing whitespace is removed, and must not exceed 3,072 characters.",
          "required": true,
          "min": 1,
          "max": 3072
        },
        {
          "name": "customize_multi_shots",
          "type": "bool",
          "default": true,
          "title": "Customize Multi Shots",
          "description": "Whether to enable multi-shot mode. Explicitly specifying this value is recommended. `true` enables multiple shots; `false` uses a single shot.",
          "required": false
        },
        {
          "name": "prefer_multi_shots",
          "type": "bool",
          "default": false,
          "title": "Prefer Multi Shots",
          "description": "Whether to enable intelligent shot planning. This field is mutually exclusive with `customize_multi_shots`. Both fields may be `false`, but they cannot both be `true`.",
          "required": false
        },
        {
          "name": "multi_prompt",
          "type": "list[dict]",
          "default": [],
          "title": "Multi Prompt",
          "description": "List of custom shots. When `customize_multi_shots` is `true`, this field is required, must not be empty, and supports up to 6 shots. When `customize_multi_shots` is `false`, it must be an empty array or omitted.",
          "required": false,
          "max": 6
        },
        {
          "name": "elements",
          "type": "list[dict]",
          "default": [],
          "title": "Elements",
          "description": "List of one-time subject assets. The default is an empty array. When using only multi-image subjects, up to 7 subjects can be uploaded. When using only video character subjects, the number of video character subjects must not exceed 3. When using both video character and multi-image subjects, the number of video character subjects must not exceed 3, and the number of multi-image subjects must not exceed 4.",
          "required": false
        },
        {
          "name": "audio",
          "type": "bool",
          "default": false,
          "title": "Audio",
          "description": "Whether to add audio to the generated video. `true` enables audio; `false` disables audio.",
          "required": false
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Resolution of the generated video. Available values are `720p` (outputs a 720p video), `1080p` (outputs a 1080p video), and `4k` (outputs a 4K video).",
          "required": false,
          "values": [
            "720p",
            "1080p",
            "4k"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Aspect ratio of the generated video. Supported values are `16:9`, `9:16`, and `1:1`.",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Total video duration in seconds. The supported range is 3 to 15 seconds, and the default is 5 seconds.",
          "required": false,
          "min": 3,
          "max": 15
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
          "description": "Whether to generate audio for the video. - **true**: Generate with audio - **false**: Generate without audio",
          "required": false
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "720p",
          "title": "Resolution",
          "description": "Video resolution - 480p for faster generation, 720p for balance, 1080p for High-quality video, 4K Ultra-High Definition, delivering perfect visual details.",
          "required": false,
          "values": [
            "480p",
            "720p",
            "1080p",
            "4k"
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "paramName": "reference_image_urls",
          "isList": true
        },
        {
          "field": "reference_videos",
          "kind": "video",
          "paramName": "reference_video_urls",
          "isList": true
        },
        {
          "field": "reference_audios",
          "kind": "audio",
          "paramName": "reference_audio_urls",
          "isList": true
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
          "description": "Whether to generate audio for the video. - **true**: Generate with audio - **false**: Generate without audio",
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
          "description": "Use online search. (Web search only can be used in the scene of t2v)",
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
          "paramName": "reference_image_urls",
          "isList": true
        },
        {
          "field": "reference_videos",
          "kind": "video",
          "paramName": "reference_video_urls",
          "isList": true
        },
        {
          "field": "reference_audios",
          "kind": "audio",
          "paramName": "reference_audio_urls",
          "isList": true
        }
      ]
    },
    {
      "className": "BytedanceSeedance2Mini",
      "modelId": "bytedance/seedance-2-mini",
      "title": "Bytedance Seedance 2.0 Mini",
      "description": "Bytedance Seedance 2.0 Mini via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
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
          "description": "Whether to generate audio for the video. - **true**: Generate with audio - **false**: Generate without audio",
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
          "description": "Use online search. (Web search only can be used in the scene of t2v)",
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
          "paramName": "reference_image_urls",
          "isList": true
        },
        {
          "field": "reference_videos",
          "kind": "video",
          "paramName": "reference_video_urls",
          "isList": true
        },
        {
          "field": "reference_audios",
          "kind": "audio",
          "paramName": "reference_audio_urls",
          "isList": true
        }
      ]
    },
    {
      "className": "BytedanceSeedance25",
      "modelId": "bytedance/seedance-2-5",
      "title": "Bytedance Seedance 2.5",
      "description": "Bytedance Seedance 2.5 via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "The text prompt used to generate the video.. ( Max length: 30000 characters)",
          "required": false,
          "max": 30000
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
          "description": "First frame image url or asset://{assetId} (for example: asset://asset-20260404242101-76djj) Cannot be used simultaneously with reference_image_urls, reference_video_urls, or reference_audio_urls.",
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
          "description": "End frame image url or asset://{assetId} (for example: asset://asset-20260404242101-76djj) last_frame_url cannot be passed alone; first_frame_url must be provided together with it.",
          "required": false
        },
        {
          "name": "reference_images",
          "type": "list[image]",
          "default": [],
          "title": "Reference Images",
          "description": "Enter a list of image URLs or asset://{assetId} (for example: asset://asset-20260404242101-76djj). Single image requirements: Format: jpeg, png, webp, bmp, tiff, gif. Aspect ratio (width/height): (0.4, 2.5) Width and height (px): (300, 6000) Size: Single image less than 30 MB. Maximum number of files: The sum of the number of frames at the beginning and end must not exceed 30. Mutually exclusive with the first/last-frame scenario;",
          "required": false,
          "max": 30
        },
        {
          "name": "reference_videos",
          "type": "list[video]",
          "default": [],
          "title": "Reference Videos",
          "description": "Enter a list of video URLs or asset://{assetId} (for example: asset://asset-20260404242101-76djj) . Single video requirements: Video format: mp4, mov. Resolution: 480p, 720p Dimensions: Aspect ratio (width/height): [0.4, 2.5] Width/height (px): [300, 6000] Total pixels: [640×640=409600, 834×1112=927408], i.e., the product of width and height must meet the range requirement of [409600, 927408]. Size: Single video not exceeding 200 MB. Frame rate (FPS): [24, 60] Single video duration: [2, 30] seconds; Mutually exclusive with the first/last-frame scenario; Total duration of reference videos must not exceed 30 seconds.",
          "required": false,
          "min": 409600,
          "max": 10
        },
        {
          "name": "reference_audios",
          "type": "list[audio]",
          "default": [],
          "title": "Reference Audios",
          "description": "Enter a list of audio URLs or asset://{assetId} (for example: asset://asset-20260404242101-76djj) . Single audio requirements: Format: wav, mp3 Size: Single audio file size not exceeding 15 MB. Single audio duration: [2, 30] seconds; Mutually exclusive with the first/last-frame scenario; Total duration of reference videos must not exceed 30 seconds.",
          "required": false,
          "min": 2,
          "max": 10
        },
        {
          "name": "return_last_frame",
          "type": "bool",
          "default": false,
          "title": "Return Last Frame",
          "description": "Whether to return the last frame of the video. When draft=true, this parameter cannot be set to true.",
          "required": false
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
          "description": "Video resolution - 480p for faster generation, 720p for balance.",
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
          "default": "adaptive",
          "title": "Aspect Ratio",
          "description": "Video aspect ratio configuration.",
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
          "description": "Video duration in 4-30 seconds. Special values -1: Pass -1 for automatic duration selection — the model picks a suitable duration itself (for video-editing tasks, it matches the input video's length; for other task types, it selects within the valid range), instead of you specifying an exact value.",
          "required": false,
          "min": 4,
          "max": 30
        },
        {
          "name": "output_format",
          "type": "enum",
          "default": "mp4",
          "title": "Output Format",
          "description": "Video output format.",
          "required": false,
          "values": [
            "mp4",
            "mov"
          ]
        },
        {
          "name": "web_search",
          "type": "bool",
          "default": false,
          "title": "Web Search",
          "description": "Enable online search.",
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
          "paramName": "reference_image_urls",
          "isList": true
        },
        {
          "field": "reference_videos",
          "kind": "video",
          "paramName": "reference_video_urls",
          "isList": true
        },
        {
          "field": "reference_audios",
          "kind": "audio",
          "paramName": "reference_audio_urls",
          "isList": true
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
          "description": "The text prompt used to generate the video. Required field. (Min length: 3, Max length: 20000 characters)",
          "required": true,
          "min": 3,
          "max": 20000
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
          "type": "float",
          "default": 0,
          "title": "Duration",
          "description": "Duration of the video in seconds,Optional range 4-12 s",
          "required": true,
          "min": 4,
          "max": 12
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "videos",
          "kind": "video",
          "paramName": "input_urls",
          "isList": true
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
      "title": "Wan - 2.2 A14B Image to Video Turbo",
      "description": "Wan - 2.2 A14B Image to Video Turbo via Kie.ai.\n\n    kie, video, ai\n\n    Transform images into dynamic videos powered by Wan's advanced AI model",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
      "title": "Wan - 2.2 A14B Text to Video Turbo",
      "description": "Wan - 2.2 A14B Text to Video Turbo via Kie.ai.\n\n    kie, video, ai\n\n    High-quality video generation from text descriptions powered by Wan's advanced AI model",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "name": "multi_shots",
          "type": "bool",
          "default": false,
          "title": "Multi Shots",
          "description": "The multi shots parameter controls the shot composition style during AI video generation, determining whether the generated video is a single continuous shot or multiple shots with transitions.",
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
          "name": "multi_shots",
          "type": "bool",
          "default": false,
          "title": "Multi Shots",
          "description": "The multi shots parameter controls the shot composition style during AI video generation, determining whether the generated video is a single continuous shot or multiple shots with transitions.",
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
          "name": "multi_shots",
          "type": "bool",
          "default": false,
          "title": "Multi Shots",
          "description": "The multi shots parameter controls the shot composition style during AI video generation, determining whether the generated video is a single continuous shot or multiple shots with transitions.",
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
      "uploads": [
        {
          "field": "videos",
          "kind": "video",
          "paramName": "video_urls",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
          "required": false
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "videos",
          "kind": "video",
          "paramName": "video_urls",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
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
          "description": "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "reference_image",
          "kind": "image",
          "paramName": "reference_image",
          "isList": true
        },
        {
          "field": "reference_video",
          "kind": "video",
          "paramName": "reference_video",
          "isList": true
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
      "className": "Wan30Video",
      "modelId": "wan/3-0-video",
      "title": "Wan 3.0 - Video",
      "description": "Wan 3.0 - Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt, supporting both Chinese and English. Up to 20,000 characters; excess characters will be truncated automatically. Required for text-to-video generation; for other modes, it is recommended to provide it together with media. In reference mode, use Image1/Video1/Audio1 to reference the provided media.",
          "required": false,
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
          "description": "URL of the first-frame image. Up to 1 image, used strictly as the first frame of the video. Used for first-frame-to-video / first-and-last-frame-to-video generation. Cannot be provided together with `reference_*_urls`. Formats: JPEG/JPG, PNG (transparency not supported), BMP, WEBP; each side [240, 8000] px; aspect ratio ≤ 8:1; ≤ 20MB.",
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
          "description": "URL of the first-frame image. Up to 1 image, used strictly as the first frame of the video. Used for first-frame-to-video / first-and-last-frame-to-video generation. Cannot be provided together with `reference_*_urls`. Formats: JPEG/JPG, PNG (transparency not supported), BMP, WEBP; each side [240, 8000] px; aspect ratio ≤ 8:1; ≤ 20MB.",
          "required": false
        },
        {
          "name": "reference_images",
          "type": "list[image]",
          "default": [],
          "title": "Reference Images",
          "description": "Reference images for the all-purpose reference mode, with up to 10 images. Correspond to Image1, Image2, … in the prompt according to array order. Specifications are the same as `first_frame_url`. Cannot be provided together with the first-frame/last-frame parameters.",
          "required": false,
          "max": 10
        },
        {
          "name": "reference_videos",
          "type": "list[video]",
          "default": [],
          "title": "Reference Videos",
          "description": "Reference videos for the all-purpose reference mode, with up to 5 clips. Each clip must be 1–15 seconds, with a total duration ≤ 15 seconds. Correspond to Video1, Video2, … according to array order. Formats: mp4, mov; each side [240, 4096] px; aspect ratio ≤ 8:1; each file ≤ 100MB. There is an additional constraint on the output side: the input video duration + `duration` must not exceed 30 seconds.",
          "required": false,
          "max": 5
        },
        {
          "name": "reference_audios",
          "type": "list[audio]",
          "default": [],
          "title": "Reference Audios",
          "description": "Reference audio for the all-purpose reference mode, with up to 5 clips. Each clip must be 1–15 seconds, with a total duration ≤ 15 seconds. Correspond to Audio1, Audio2, … according to array order. Formats: wav, mp3; ≤ 15MB. Audio should not be used alone as the only media input; pairing it with an image or video is still recommended.",
          "required": false,
          "max": 5
        },
        {
          "name": "reference_file_urls",
          "type": "list[str]",
          "default": [],
          "title": "Reference File Urls",
          "description": "File-to-video generation. Up to 1 file. Cannot be provided together with `reference_link_urls`, or with the first-frame/last-frame parameters. Formats: docx/doc/xlsx/xls/pptx/ppt/pdf/txt/key/pages/numbers/md; ≤ 100MB; pdf/docx/ppt/key/pages, etc. ≤ 50 pages.",
          "required": false,
          "max": 1
        },
        {
          "name": "reference_link_urls",
          "type": "list[str]",
          "default": [],
          "title": "Reference Link Urls",
          "description": "Link-to-video generation. Up to 1 publicly accessible webpage that does not require login. Cannot be provided together with `reference_file_urls`, or with the first-frame/last-frame parameters.",
          "required": false,
          "max": 1
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080P",
          "title": "Resolution",
          "description": "Output resolution. Default: **1080P**.",
          "required": false,
          "values": [
            "480P",
            "720P",
            "1080P"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "adaptive",
          "title": "Aspect Ratio",
          "description": "Output aspect ratio. `adaptive` (default) automatically selects the ratio based on the input media and intent.",
          "required": false,
          "values": [
            "adaptive",
            "16:9",
            "4:3",
            "1:1",
            "3:4",
            "9:16"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Output video duration in seconds. Default: 5. Without video input, the range is [2, 30]. With reference videos: input video duration + output duration ≤ 30. Pass `-1` to use an intelligent duration determined by the model.",
          "required": false,
          "min": 2,
          "max": 30
        },
        {
          "name": "audio",
          "type": "bool",
          "default": true,
          "title": "Audio",
          "description": "Whether the output video includes an audio track. Default: true.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed used to reproduce results. If omitted, a random seed will be used.",
          "required": false,
          "min": 0,
          "max": 2147483647
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
          "paramName": "reference_image_urls",
          "isList": true
        },
        {
          "field": "reference_videos",
          "kind": "video",
          "paramName": "reference_video_urls",
          "isList": true
        },
        {
          "field": "reference_audios",
          "kind": "audio",
          "paramName": "reference_audio_urls",
          "isList": true
        }
      ]
    },
    {
      "className": "Wan30PrimeVideo",
      "modelId": "wan/3-0-video-prime",
      "title": "Wan 3.0 - Video Prime",
      "description": "Wan 3.0 - Video Prime via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text prompt. Chinese and English are supported. Up to 20,000 characters; excess characters are truncated automatically. Required for text-to-video; for other modes, it is recommended to provide it together with media. In reference mode, use Image1/Video1/Audio1 to reference the provided materials.",
          "required": false,
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
          "description": "URL of the first-frame image. Up to 1 image, used strictly as the first frame of the video. Used for first-frame-to-video or first-and-last-frame-to-video generation. Cannot be provided together with `reference_*_urls`. Formats: JPEG/JPG, PNG (transparency not supported), BMP, WEBP; each side [240, 8000] px; aspect ratio ≤ 8:1; ≤ 20MB.",
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
          "description": "URL of the first-frame image. Up to 1 image, used strictly as the first frame of the video. Used for first-frame-to-video or first-and-last-frame-to-video generation. Cannot be provided together with `reference_*_urls`. Formats: JPEG/JPG, PNG (transparency not supported), BMP, WEBP; each side [240, 8000] px; aspect ratio ≤ 8:1; ≤ 20MB.",
          "required": false
        },
        {
          "name": "reference_images",
          "type": "list[image]",
          "default": [],
          "title": "Reference Images",
          "description": "Reference images for all-purpose reference mode. Up to 10 images. Correspond to Image1, Image2, and so on in the prompt according to array order. Same specifications as `first_frame_url`. Cannot be provided together with the first-frame or last-frame image.",
          "required": false,
          "max": 10
        },
        {
          "name": "reference_videos",
          "type": "list[video]",
          "default": [],
          "title": "Reference Videos",
          "description": "Reference videos for all-purpose reference mode. Up to 5 videos. Each video must be 1–15s, with a combined duration of ≤ 15s. Correspond to Video1, Video2, and so on according to array order. Formats: mp4, mov; each side [240, 4096] px; aspect ratio ≤ 8:1; each file ≤ 100MB. There is an additional output-side limit: the input video duration plus `duration` cannot exceed 30 seconds.",
          "required": false,
          "max": 5
        },
        {
          "name": "reference_audios",
          "type": "list[audio]",
          "default": [],
          "title": "Reference Audios",
          "description": "Reference audio files for all-purpose reference mode. Up to 5 audio files. Each file must be 1–15s, with a combined duration of ≤ 15s. Correspond to Audio1, Audio2, and so on according to array order. Formats: wav, mp3; ≤ 15MB. Even when used as the only media input, it is still recommended to provide an image or video together with it.",
          "required": false,
          "max": 5
        },
        {
          "name": "reference_file_urls",
          "type": "list[str]",
          "default": [],
          "title": "Reference File Urls",
          "description": "File-to-video generation. Up to 1 file. Cannot be provided together with `reference_link_urls`, or with the first-frame/last-frame image. Formats: docx/doc/xlsx/xls/pptx/ppt/pdf/txt/key/pages/numbers/md; ≤ 100MB; pdf/docx/ppt/key/pages, etc. ≤ 50 pages.",
          "required": false,
          "max": 1
        },
        {
          "name": "reference_link_urls",
          "type": "list[str]",
          "default": [],
          "title": "Reference Link Urls",
          "description": "Link-to-video generation. Up to 1 publicly accessible webpage that does not require login. Cannot be provided together with `reference_file_urls`, or with the first-frame/last-frame image.",
          "required": false,
          "max": 1
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080P",
          "title": "Resolution",
          "description": "Output resolution level. Default: **1080P**.",
          "required": false,
          "values": [
            "480P",
            "720P",
            "1080P"
          ]
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "adaptive",
          "title": "Aspect Ratio",
          "description": "Output aspect ratio. `adaptive` (default) automatically selects the aspect ratio based on the input materials and intent.",
          "required": false,
          "values": [
            "adaptive",
            "16:9",
            "4:3",
            "1:1",
            "3:4",
            "9:16"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Output video duration in seconds. Default: 5. When there is no video input, the value must be within [2, 30]. When reference videos are provided: input video duration plus output duration ≤ 30. Pass `-1` to use an intelligent duration determined by the model.",
          "required": false
        },
        {
          "name": "audio",
          "type": "bool",
          "default": true,
          "title": "Audio",
          "description": "Whether the output video includes an audio track. Default: true.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed used to reproduce results. If omitted, a random seed is used.",
          "required": false,
          "min": 0,
          "max": 2147483647
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
          "paramName": "reference_image_urls",
          "isList": true
        },
        {
          "field": "reference_videos",
          "kind": "video",
          "paramName": "reference_video_urls",
          "isList": true
        },
        {
          "field": "reference_audios",
          "kind": "audio",
          "paramName": "reference_audio_urls",
          "isList": true
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
      "className": "PixverseV6TextToVideo",
      "modelId": "pixverse-v6/text-to-video",
      "title": "PixVerse V6 Text-to-Video",
      "description": "PixVerse V6 Text-to-Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Generate prompt, cannot be empty, length is limited to 3-5000 characters.",
          "required": true,
          "min": 3,
          "max": 5000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Output video aspect ratio. This parameter is supported in text-to-video and Fusion multi-reference image-to-video modes.",
          "required": true,
          "values": [
            "16:9",
            "4:3",
            "1:1",
            "3:4",
            "9:16",
            "2:3",
            "3:2",
            "21:9"
          ]
        },
        {
          "name": "quality",
          "type": "enum",
          "default": "720p",
          "title": "Quality",
          "description": "Output video resolution. Supports 360p, 540p, 720p, and 1080p.",
          "required": true,
          "values": [
            "360p",
            "540p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Output video duration in seconds. PixVerse V6 supports 1–15 seconds.",
          "required": true,
          "min": 1,
          "max": 15
        },
        {
          "name": "generate_audio_switch",
          "type": "bool",
          "default": false,
          "title": "Generate Audio Switch",
          "description": "Whether to generate audio synchronized with the video content.",
          "required": false
        },
        {
          "name": "generate_multi_clip_switch",
          "type": "bool",
          "default": false,
          "title": "Generate Multi Clip Switch",
          "description": "Whether to generate a multi-clip video.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed, value range is 0–2147483647. Using the same parameters and seed helps improve result reproducibility.",
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
      "className": "PixverseV6ImageToVideo",
      "modelId": "pixverse-v6/image-to-video",
      "title": "PixVerse V6 Image-to-Video",
      "description": "PixVerse V6 Image-to-Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Generate prompt, cannot be empty, length is limited to 3-5000 characters.",
          "required": true,
          "min": 3,
          "max": 5000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "Image URLs, supports up to 2 images, single image size not exceeding 20 MB. Supports HTTP, HTTPS, and OSS addresses. Supported image formats include JPG, JPEG, PNG, and WebP.",
          "required": true
        },
        {
          "name": "quality",
          "type": "enum",
          "default": "720p",
          "title": "Quality",
          "description": "Output video resolution. Supports 360p, 540p, 720p, and 1080p.",
          "required": true,
          "values": [
            "360p",
            "540p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Generated video duration in seconds, ranging from 1 to 15. Required when template_id is not passed; if template_id is passed, the video duration is fixed by the selected template, please do not pass this parameter at the same time.",
          "required": true,
          "min": 1,
          "max": 15
        },
        {
          "name": "generate_audio_switch",
          "type": "bool",
          "default": false,
          "title": "Generate Audio Switch",
          "description": "Whether to generate audio synchronized with the video content.",
          "required": false
        },
        {
          "name": "generate_multi_clip_switch",
          "type": "bool",
          "default": false,
          "title": "Generate Multi Clip Switch",
          "description": "Whether to generate a multi-clip video.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed, value range is 0-2147483647. Using the same parameters and seed helps improve result reproducibility.",
          "required": false,
          "min": 0,
          "max": 2147483647
        },
        {
          "name": "template_id",
          "type": "enum",
          "default": "",
          "title": "Template Id",
          "description": "Used to select a PixVerse video effect template. Please pass in the corresponding template_id. Once a template_id is provided, the video duration is fixed by the selected template, so duration cannot be set at the same time. effect_type indicates the number of images required by the selected template. Please upload the specified number of images accordingly. To preview the template effect, open https://static.aiquickdraw.com/tools/example/<template_id>.mp4 in a browser and replace <template_id> with the actual template ID. For example:https://static.aiquickdraw.com/tools/example/412736208886848.mp4. Available template list: 412736208886848 - Dive into the deep blue of love - Let every kiss turn into a dream. - effect_type: 2 411563216524736 - Skyline Track Flag - Unwavering. Next is the city-level entrance effect. - effect_type: 1 411316927927040 - Vibe Copines - Capture this vibe with tungtung. - effect_type: 1 411174903569216 - Crowd Focus - First person: The camera caught you - upload a selfie or group photo to become the focus of the audience - effect_type: 1 410999246341952 - Poke my little cutie - Pinch this little guy and watch it get cutely angry. - effect_type: 1 408891141511104 - Today is my birthday - Yes, I know you don't know me, but today is my birthday - effect_type: 1 410317363057408 - Mini Football Hero - Turn any photo into a mini chibi football hero and compete with giant players in a cinematic hyper-realistic stadium. - effect_type: 1 410285445698304 - Magma Rise - Rise from the ashes. Fight fire with fire. - effect_type: 1 410133101388544 - Cyber Armor: Reborn in the Rain 🌧️⚡ - Shatter the storm. Awaken the body of steel within. - effect_type: 1 409899296377728 - Product Landmark - Upload your product and turn it into a building! - effect_type: 1 408897485909952 - Mini Football Pitch - Upload your product and create a mini football pitch inside it! - effect_type: 1 408869061406656 - A kick through the world - Upload your product and let it shine on the night of the grand annual global competition! - effect_type: 1 408661207662528 - Small Town Footballer - Upload your product and enjoy the moment of victory! - effect_type: 1 409767750265728 - Crowned God in One Battle - You unexpectedly became the MVP of the game. - effect_type: 1 409766559675264 - Thriller Dance Steps - Upload a photo and watch it turn into an iconic viral dance trend! - effect_type: 1 409589071559552 - Dai Dai Dance - Vibe cheering dance template. A front-facing photo to easily join the dance floor clip. - effect_type: 1 407804339389760 - Fluffy Chef - Upload your product and cook in the fluffy kitchen - effect_type: 1 407658863287616 - Summer Postcard - Upload your product and join the summer special! - effect_type: 1 407474361215744 - Inhaled into Product Universe - Upload your product and enter the product universe! - effect_type: 1 407473438360320 - Fluffy Factory - Upload your product to make it in the fluffy factory - effect_type: 1 407467702283008 - Surfing Summer - Upload your product photo and start surfing! - effect_type: 1 385844572217469 - Love Launcher - A Valentine's Day moment in one shot. - effect_type: 1 406428904874432 - Kitty Shop - Upload your product image and let the cute cat transform into your street vendor! - effect_type: 1 406423682060736 - Courtyard Makeover Party - Upload your courtyard and give it a magical makeover! - effect_type: 1 406411724685760 - Ski Joy - Upload a photo of your pet, toy or product and let it embark on a fun skiing adventure. - effect_type: 1 406372274350528 - Nail Lab - Upload your nail photos and let our exclusive manicurists create exquisite nails for you. - effect_type: 1 406218913317312 - Rhythm Dash - Hit the beat, take off the crown. Welcome to the perfect score frenzy. - effect_type: 1 406218479198656 - Screen Killer King - The court needs a hero. So, you break through the screen. - effect_type: 1 406064763308480 - Dynamic Football Poster - From selfie to jersey photo (single and multiplayer) - effect_type: 1 406413607395776 - Football Live King! - The moment you score a wonderful goal, super sports car gifts pour down. - effect_type: 1 405662117814720 - Trophy Breakthrough - Upload your photo, transform into a champion football player, break through the screen and win the trophy! - effect_type: 1 406014934000064 - Post-match Sharp Comment - If the microphone is handed to you after the game, what would you say? - effect_type: 1 405658369331648 - Stadium Legend - Run, celebrate, create a legendary football moment. - effect_type: 1 405321470423488 - Step by Step - Step by step, shining with confidence - effect_type: 1 405175211454656 - Superstar Lobby - Welcome to your championship season. - effect_type: 1 404955806201792 - Post-match Sharp Comment 2 - If it's your turn for a post-match interview, what would you say about this game? - effect_type: 1 404820147974080 - Top of the World - Hold the trophy high and become the well-deserved hero of the football feast. - effect_type: 2 398980393937856 - The Last Hug - The last hug before the tsunami comes. - effect_type: 2 403916646846400 - My Future has Infinite Possibilities - Embrace your infinite potential and shine your future. - effect_type: 1 403739217192896 - Apex Dance - Flat rhythm, decadent chaotic dance steps - effect_type: 1 403560060358144 - Idol Ending Shot - One look up is a million direct shots. - effect_type: 1 403556618212098 - MotoGP Live - Live an unchoreographed moment. - effect_type: 1 398965022284579 - Knee Slide - Celebrate the victory with an iconic and energetic knee slide goal. - effect_type: 1 402201060373270 - Tunnel to Captain - Transform from an ordinary girl to a legendary football captain in a cinematic stadium journey. - effect_type: 1 403085292466285 - Golden Field Breaker - He is not on the list, but he still controls the scene. - effect_type: 1 402061828030966 - Trophy Celebration - Have you always wanted a huge trophy? Here, you can at least get it digitally. - effect_type: 1 402888569901524 - Jump into the Crowd 2 - Jump into the crowd - effect_type: 1 402155676592228 - World Champion Lift - You are the captain, lifting the trophy of victory. Mountains of people, golden ribbons, pure victory. - effect_type: 1 402047865383360 - Sideline Ball Boy - Experience the game from a unique perspective on the sidelines. Feel the excitement of the game as a young talent ready to participate. - effect_type: 1 402046136040202 - Epic Save - Become a legendary goalkeeper. Catch the ball in a stunning flying save. - effect_type: 1",
          "required": false,
          "values": [
            "412736208886848",
            "411563216524736",
            "411316927927040",
            "411174903569216",
            "410999246341952",
            "408891141511104",
            "410317363057408",
            "410285445698304",
            "410133101388544",
            "409899296377728",
            "408897485909952",
            "408869061406656",
            "408661207662528",
            "409767750265728",
            "409766559675264",
            "409589071559552",
            "407804339389760",
            "407658863287616",
            "407474361215744",
            "407473438360320",
            "407467702283008",
            "385844572217469",
            "406428904874432",
            "406423682060736",
            "406411724685760",
            "406372274350528",
            "406218913317312",
            "406218479198656",
            "406064763308480",
            "406413607395776",
            "405662117814720",
            "406014934000064",
            "405658369331648",
            "405321470423488",
            "405175211454656",
            "404955806201792",
            "404820147974080",
            "398980393937856",
            "403916646846400",
            "403739217192896",
            "403560060358144",
            "403556618212098",
            "398965022284579",
            "402201060373270",
            "403085292466285",
            "402061828030966",
            "402888569901524",
            "402155676592228",
            "402047865383360",
            "402046136040202"
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
        },
        {
          "field": "quality",
          "rule": "not_empty",
          "message": "Quality is required"
        }
      ]
    },
    {
      "className": "PixverseV6FirstLastFrameTransition",
      "modelId": "pixverse-v6/transition",
      "title": "PixVerse V6 First & Last Frame Transition",
      "description": "PixVerse V6 First & Last Frame Transition via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Generate prompt, cannot be empty, length is limited to 3-5000 characters.",
          "required": true,
          "min": 3,
          "max": 5000
        },
        {
          "name": "first_frame_image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "First Frame Image",
          "description": "First frame image URL. Supports HTTP, HTTPS, and OSS addresses; supported image formats include JPG, JPEG, PNG, and WebP; the size of a single image file must not exceed 20 MB",
          "required": true
        },
        {
          "name": "last_frame_image",
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Last Frame Image",
          "description": "Last frame image URL. Supports HTTP, HTTPS, and OSS addresses; supported image formats include JPG, JPEG, PNG, and WebP; the size of a single image file must not exceed 20 MB",
          "required": true
        },
        {
          "name": "quality",
          "type": "enum",
          "default": "720p",
          "title": "Quality",
          "description": "Output video resolution. Supports 360p, 540p, 720p, and 1080p.",
          "required": true,
          "values": [
            "360p",
            "540p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Output video duration in seconds. PixVerse V6 supports 1–15 seconds.",
          "required": true,
          "min": 1,
          "max": 15
        },
        {
          "name": "generate_audio_switch",
          "type": "bool",
          "default": false,
          "title": "Generate Audio Switch",
          "description": "Whether to generate audio synchronized with the video content.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed, value range is 0–2147483647. Using the same parameters and seed helps improve result reproducibility.",
          "required": false,
          "min": 0,
          "max": 2147483647
        }
      ],
      "uploads": [
        {
          "field": "first_frame_image",
          "kind": "image",
          "paramName": "first_frame_image_url"
        },
        {
          "field": "last_frame_image",
          "kind": "image",
          "paramName": "last_frame_image_url"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "quality",
          "rule": "not_empty",
          "message": "Quality is required"
        }
      ]
    },
    {
      "className": "PixverseV6VideoExtension",
      "modelId": "pixverse-v6/extend",
      "title": "PixVerse V6 Video Extension",
      "description": "PixVerse V6 Video Extension via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Generate prompt, cannot be empty, length is limited to 3-5000 characters.",
          "required": true,
          "min": 3,
          "max": 5000
        },
        {
          "name": "duration",
          "type": "int",
          "default": 0,
          "title": "Duration",
          "description": "Generated video duration in seconds. Current validation range is 1-15.",
          "required": true,
          "min": 1,
          "max": 15
        },
        {
          "name": "quality",
          "type": "enum",
          "default": "",
          "title": "Quality",
          "description": "Resolution.",
          "required": true,
          "values": [
            "360p",
            "540p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "generate_audio_switch",
          "type": "bool",
          "default": false,
          "title": "Generate Audio Switch",
          "description": "Whether to generate audio.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed, optional. Range 0-2147483647.",
          "required": false,
          "min": 0,
          "max": 2147483647
        },
        {
          "name": "taskId",
          "type": "str",
          "default": "",
          "title": "Task Id",
          "description": "The taskId of the parent video task to be extended. The parent task must belong to the current user, be undeleted, and have a status of success. KIE does not accept official source_video_id/video_id. Please be aware that video_url and taskId are mutually exclusive — only one parameter may be submitted.",
          "required": true
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
          "description": "To extend the video, please supply the URL. Please be aware that video_url and taskId are mutually exclusive — only one parameter may be submitted.",
          "required": false
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
        },
        {
          "field": "quality",
          "rule": "not_empty",
          "message": "Quality is required"
        },
        {
          "field": "taskId",
          "rule": "not_empty",
          "message": "Task Id is required"
        }
      ]
    },
    {
      "className": "PixverseV6FusionReferenceToVideo",
      "modelId": "pixverse-v6/reference-to-video",
      "title": "PixVerse V6 Fusion / Reference-to-Video",
      "description": "PixVerse V6 Fusion / Reference-to-Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Generate prompt, cannot be empty, length is limited to 3-5000 characters.",
          "required": true,
          "min": 3,
          "max": 5000
        },
        {
          "name": "image_references",
          "type": "list[dict]",
          "default": [],
          "title": "Image References",
          "description": "Fusion multi-reference image list. `ref_name` must be unique within the same list. You can reference the reference object in the prompt via `@ref_name`.",
          "required": true,
          "min": 1,
          "max": 7
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "16:9",
          "title": "Aspect Ratio",
          "description": "Output video aspect ratio. Supported in text-to-video and Fusion multi-reference image to video modes.",
          "required": true,
          "values": [
            "16:9",
            "4:3",
            "1:1",
            "3:4",
            "9:16",
            "2:3",
            "3:2",
            "21:9"
          ]
        },
        {
          "name": "quality",
          "type": "enum",
          "default": "720p",
          "title": "Quality",
          "description": "Output video resolution. Supports 360p, 540p, 720p, and 1080p.",
          "required": true,
          "values": [
            "360p",
            "540p",
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 5,
          "title": "Duration",
          "description": "Output video duration, in seconds.",
          "required": true,
          "min": 1,
          "max": 15
        },
        {
          "name": "generate_audio_switch",
          "type": "bool",
          "default": false,
          "title": "Generate Audio Switch",
          "description": "Whether to generate audio synchronized with the video content.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": 0,
          "title": "Seed",
          "description": "Random seed, value range is 0-2147483647. Using the same parameters and seed helps improve the reproducibility of the results.",
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
      "className": "MinimaxH3TextToVideo",
      "modelId": "minimax-h3/text-to-video",
      "title": "MiniMax H3 Text-to-Video",
      "description": "MiniMax H3 Text-to-Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Video generation prompt, length is between 1 and 7000 characters.",
          "required": true,
          "min": 1,
          "max": 7000
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "",
          "title": "Aspect Ratio",
          "description": "Video aspect ratio. Required for text-to-video, adaptive is not supported.",
          "required": true,
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
          "name": "duration",
          "type": "int",
          "default": 6,
          "title": "Duration",
          "description": "Generated video duration, supports integer values from 4 to 15 seconds.",
          "required": true,
          "min": 4,
          "max": 15
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "2K",
          "title": "Resolution",
          "description": "Video resolution.",
          "required": false,
          "values": [
            "768P",
            "2K"
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
        }
      ]
    },
    {
      "className": "MinimaxH3ImageToVideo",
      "modelId": "minimax-h3/image-to-video",
      "title": "MiniMax H3 Image-to-Video",
      "description": "MiniMax H3 Image-to-Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Video generation prompt, length is between 1 and 7000 characters.",
          "required": true,
          "min": 1,
          "max": 7000
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
          "description": "First frame image URL. Note: Either first_frame_url or last_frame_url must be provided. Supports HTTP, HTTPS, and OSS addresses; supports JPG, JPEG, PNG, WEBP, HEIC, HEIF formats; single image size not exceeding 30 MB, image side length between 256 and 5760 pixels, aspect ratio between 0.4 and 2.5.",
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
          "description": "Last frame image URL. Note: Either first_frame_url or last_frame_url must be provided. Image restrictions are the same as first_frame_url.",
          "required": false
        },
        {
          "name": "duration",
          "type": "int",
          "default": 6,
          "title": "Duration",
          "description": "Generated video duration, supporting integer values from 4 to 15 seconds.",
          "required": true,
          "min": 4,
          "max": 15
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "2K",
          "title": "Resolution",
          "description": "Video resolution.",
          "required": false,
          "values": [
            "768P",
            "2K"
          ]
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
      "className": "MinimaxH3ReferenceToVideo",
      "modelId": "minimax-h3/reference-to-video",
      "title": "MiniMax H3 Reference-to-Video",
      "description": "MiniMax H3 Reference-to-Video via Kie.ai.\n\n    kie, video, ai\n\n    ## Query Task Status",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Video generation prompt, length is between 1 and 7000 characters.",
          "required": true,
          "min": 1,
          "max": 7000
        },
        {
          "name": "reference_images",
          "type": "list[image]",
          "default": [],
          "title": "Reference Images",
          "description": "Array of reference image URLs. Supports up to 9 images. Supports HTTP, HTTPS, and OSS addresses; supported image formats include JPG, JPEG, PNG, WEBP, HEIC, and HEIF; a single image size cannot exceed 30 MB; the side length of the image must be between 256 and 5760 pixels, and the aspect ratio must be between 0.4 and 2.5.",
          "required": false,
          "max": 9
        },
        {
          "name": "reference_videos",
          "type": "list[video]",
          "default": [],
          "title": "Reference Videos",
          "description": "Array of reference video URLs. Supports up to 3 videos. Supports MP4, MOV; video encoding supports H.264, H.265, audio encoding supports AAC, MP3; a single file size cannot exceed 50 MB; the duration of a single segment is 2 to 15 seconds, and the total duration of all reference videos cannot exceed 15 seconds; the video side length must be between 256 and 5760 pixels, the aspect ratio must be between 0.4 and 2.5, and the frame rate must be between 23.976 and 60.",
          "required": false,
          "min": 2,
          "max": 3
        },
        {
          "name": "reference_audios",
          "type": "list[audio]",
          "default": [],
          "title": "Reference Audios",
          "description": "Array of reference audio URLs. Supports up to 3 audios. Supports WAV, MP3; a single file size cannot exceed 15 MB; the duration of a single segment is 2 to 15 seconds, and the total duration of all reference audios cannot exceed 15 seconds. reference_audio cannot be used alone, it must be accompanied by reference_image or reference_video.",
          "required": false,
          "min": 2,
          "max": 3
        },
        {
          "name": "aspect_ratio",
          "type": "enum",
          "default": "adaptive",
          "title": "Aspect Ratio",
          "description": "Video aspect ratio. The default is adaptive, or a specific ratio can be specified.",
          "required": false,
          "values": [
            "adaptive",
            "21:9",
            "16:9",
            "4:3",
            "1:1",
            "3:4",
            "9:16"
          ]
        },
        {
          "name": "duration",
          "type": "int",
          "default": 6,
          "title": "Duration",
          "description": "The duration of the generated video, supporting integer values from 4 to 15 seconds.",
          "required": true,
          "min": 4,
          "max": 15
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "2K",
          "title": "Resolution",
          "description": "Video resolution.",
          "required": false,
          "values": [
            "768P",
            "2K"
          ]
        }
      ],
      "uploads": [
        {
          "field": "reference_images",
          "kind": "image",
          "paramName": "reference_image_urls",
          "isList": true
        },
        {
          "field": "reference_videos",
          "kind": "video",
          "paramName": "reference_video_urls",
          "isList": true
        },
        {
          "field": "reference_audios",
          "kind": "audio",
          "paramName": "reference_audio_urls",
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
          "paramName": "image_urls",
          "isList": true
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
      "uploads": [
        {
          "field": "reference_image",
          "kind": "image",
          "paramName": "reference_image",
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
        },
        {
          "field": "reference_image",
          "kind": "image",
          "paramName": "reference_image",
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
    },
    {
      "className": "Happyhorse11ImageToVideo",
      "modelId": "happyhorse-1-1/image-to-video",
      "title": "HappyHorse-1-1 image-to-video",
      "description": "HappyHorse-1-1 image-to-video via Kie.ai.\n\n    kie, video, ai\n\n    HappyHorse-1-1 image-to-video",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Describes the video content to generate. Supports any language. Maximum: 5,000 non-Chinese characters or 2,500 Chinese",
          "required": false,
          "max": 5000
        },
        {
          "name": "images",
          "type": "list[image]",
          "default": [],
          "title": "Images",
          "description": "The URL of the first frame image. Image constraints: 1. Formats: JPEG, JPG, PNG, WEBP. 2. Resolution: Width and height must both be at least 300 pixels. 3. Aspect ratio: Between 1:2.5 and 2.5:1. 4. File size: Up to 20 MB.",
          "required": true,
          "max": 1
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "The resolution of the generated video. Options: 720p; 1080p",
          "required": false,
          "values": [
            "720p",
            "1080p"
          ]
        },
        {
          "name": "duration",
          "type": "float",
          "default": 5,
          "title": "Duration",
          "description": "The duration of the generated video, in seconds. The value must be an integer in the range [3, 15]. Default: 5",
          "required": false,
          "min": 3,
          "max": 15
        }
      ],
      "uploads": [
        {
          "field": "images",
          "kind": "image",
          "paramName": "image_urls",
          "isList": true
        }
      ]
    },
    {
      "className": "Happyhorse11TextToVideo",
      "modelId": "happyhorse-1-1/text-to-video",
      "title": "HappyHorse-1-1 text-to-video",
      "description": "HappyHorse-1-1 text-to-video via Kie.ai.\n\n    kie, video, ai\n\n    HappyHorse-1-1 text-to-video",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Text description of the video to generate. Supports any language. Maximum 5,000 non-Chinese characters or 2,500 Chinese",
          "required": true,
          "max": 4999
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "Output video resolution. Options: 720p; 1080p",
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
          "description": "Output video aspect ratio. Options: 16:9; 9:16; 1:1; 4:3; 3:4; 4:5; 5:4; 9:21; 21:9",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "1:1",
            "4:3",
            "3:4",
            "4:5",
            "5:4",
            "9:21",
            "21:9"
          ]
        },
        {
          "name": "duration",
          "type": "float",
          "default": 5,
          "title": "Duration",
          "description": "Output video duration in seconds.",
          "required": false,
          "min": 3,
          "max": 15
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
      "className": "Happyhorse11ReferenceToVideo",
      "modelId": "happyhorse-1-1/reference-to-video",
      "title": "HappyHorse-1-1 reference-to-video",
      "description": "HappyHorse-1-1 reference-to-video via Kie.ai.\n\n    kie, video, ai\n\n    HappyHorse-1-1 reference-to-video",
      "outputType": "video",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A description of the desired elements and visual style for the generated video. Input in any language is supported. The length is limited to 5,000 non-Chinese characters or 2,500 Chinese characters. Content exceeding this limit is automatically truncated. Image referencing: In the prompt, use \"[Image 1]\" and \"[Image 2]\" to refer to the corresponding reference image in the media array. The order must be consistent with the order in the media array. When using a reference, specify the object in the image, such as \"the woman in a red qipao in [Image 1]\".",
          "required": true,
          "min": 5,
          "max": 5000
        },
        {
          "name": "reference_image",
          "type": "list[image]",
          "default": [],
          "title": "Reference Image",
          "description": "The URL of a reference image. Image requirements: 1. Formats: JPEG, JPG, PNG, WEBP. 2. Resolution: The shortest side must be at least 400 pixels. A clear image with a resolution of 720P or higher is recommended. Avoid using images that are too small, blurry, or overly compressed, as this can degrade the output quality. 3. Maximum file size: 20 MB.",
          "required": true,
          "max": 9
        },
        {
          "name": "resolution",
          "type": "enum",
          "default": "1080p",
          "title": "Resolution",
          "description": "The resolution tier of the generated video. Options: 720p; 1080p",
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
          "description": "The aspect ratio of the generated video. Options: 16:9; 9:16; 3:4; 4:3; 4:5; 5:4; 1:1; 9:21; 21:9",
          "required": false,
          "values": [
            "16:9",
            "9:16",
            "3:4",
            "4:3",
            "4:5",
            "5:4",
            "1:1",
            "9:21",
            "21:9"
          ]
        },
        {
          "name": "duration",
          "type": "float",
          "default": 5,
          "title": "Duration",
          "description": "The duration of the generated video, in seconds. Value range: An integer from 3 to 15.",
          "required": false,
          "min": 3,
          "max": 15
        }
      ],
      "uploads": [
        {
          "field": "reference_image",
          "kind": "image",
          "paramName": "reference_image",
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
          "type": "list[video]",
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
          "paramName": "image_urls",
          "isList": true
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
          "paramName": "image_urls",
          "isList": true
        }
      ],
      "validation": [
        {
          "field": "descriptions",
          "rule": "not_empty",
          "message": "Descriptions is required"
        }
      ]
    },
    {
      "className": "Omnihuman15",
      "modelId": "omnihuman-1-5",
      "title": "Omnihuman 1.5",
      "description": "Omnihuman 1.5 via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
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
          "description": "Portrait image URL. Supports any aspect ratio with subjects including people, pets, anime, etc. Accepted file types: image/jpeg, image/png, image/webp. Max file size: 10MB.",
          "required": true
        },
        {
          "name": "mask_url",
          "type": "list[image]",
          "default": [],
          "title": "Mask Url",
          "description": "Optional mask image URL(s). To have a specific subject in the image speak, use 'Subject Detection' to get the corresponding mask image and pass it as input. Accepted file types: image/jpeg, image/png, image/webp. Max file size: 10MB. Multiple file upload is supported, up to 5 files.",
          "required": false,
          "max": 5
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
          "description": "Audio URL. Duration must be less than 60 seconds (recommended 15 seconds or less; exceeding this will cause quality degradation). Accepted file types: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/ogg, audio/mp4. Max file size: 10MB.",
          "required": true
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Optional prompt text. Limited to Chinese, English, Japanese, Korean, Spanish, and Indonesian. Recommended 300 characters or less. Maximum length: 1000 characters.",
          "required": false,
          "max": 300
        },
        {
          "name": "output_resolution",
          "type": "enum",
          "default": "1080",
          "title": "Output Resolution",
          "description": "Output video resolution. - `720`: 720P - `1080`: 1080P (default)",
          "required": false,
          "values": [
            "720",
            "1080"
          ]
        },
        {
          "name": "pe_fast_mode",
          "type": "bool",
          "default": false,
          "title": "Pe Fast Mode",
          "description": "Fast mode. Sacrifices some quality to speed up generation. Default value: `false`.",
          "required": false
        },
        {
          "name": "seed",
          "type": "int",
          "default": -1,
          "title": "Seed",
          "description": "Random seed. Default is `-1` (random). When using the same positive integer and keeping all other parameters identical, the result will be highly consistent.",
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
          "field": "mask_url",
          "kind": "image",
          "paramName": "mask_url",
          "isList": true
        },
        {
          "field": "audio",
          "kind": "audio",
          "paramName": "audio_url"
        }
      ]
    },
    {
      "className": "Omnihuman15HumanIdentification",
      "modelId": "omnihuman-1-5/human-identification",
      "title": "Omnihuman 1.5 Human Identification",
      "description": "Omnihuman 1.5 Human Identification via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
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
          "description": "Portrait image URL. Requirements: JPG/PNG/JPEG format, less than 5MB, resolution under 4096x4096. Recommended: single person facing forward, with the face occupying a large proportion of the image. Accepted file types: image/jpeg, image/png, image/jpg. Max file size: 5MB.",
          "required": true
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        }
      ]
    },
    {
      "className": "Omnihuman15SubjectDetection",
      "modelId": "omnihuman-1-5/subject-detection",
      "title": "OmniHuman 1.5 Subject Detection",
      "description": "OmniHuman 1.5 Subject Detection via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
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
          "description": "Portrait image URL. Supports detection of up to 5 subjects in the image. Accepted file types: image/jpeg, image/png, image/jpg. Max file size: 5MB.",
          "required": true
        }
      ],
      "uploads": [
        {
          "field": "image",
          "kind": "image",
          "paramName": "image_url"
        }
      ]
    },
    {
      "className": "VolcengineVideoToVideoLipSync",
      "modelId": "volcengine/video-to-video-lip-sync",
      "title": "Volcengine video to video lip sync",
      "description": "Volcengine video to video lip sync via Kie.ai.\n\n    kie, video, ai\n\n    ## Create Task",
      "outputType": "video",
      "fields": [
        {
          "name": "mode",
          "type": "enum",
          "default": "",
          "title": "Mode",
          "description": "Service mode for lip-sync generation. - `lite`: For single-person frontal videos. Faster processing. - `basic`: For single-person complex scenes. Supports scene segmentation and speaker identification.",
          "required": true,
          "values": [
            "lite",
            "basic"
          ]
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
          "description": "Video URL. Supported resolution: 360p–1080p. Videos above 1080p will be compressed to 1080p, while videos below 360p are not supported. Supported formats: MOV, MP4, HDR. Recommended codec: H.264. Other formats/codecs may be transcoded. Max file size: 500 MB. Bitrate: 1–30 Mbps. Frame rate: 24–60 fps.",
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
          "description": "Target pure vocal audio URL; used to drive video lip movements. Accepted file types: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/mp4, audio/ogg. Max file size: 10MB.",
          "required": true
        },
        {
          "name": "separate_vocal",
          "type": "bool",
          "default": false,
          "title": "Separate Vocal",
          "description": "Enable vocal separation to suppress background noise. Default value: `false`.",
          "required": false
        },
        {
          "name": "open_scenedet",
          "type": "bool",
          "default": false,
          "title": "Open Scenedet",
          "description": "Whether to enable scene segmentation and speaker identification. Supported only in Basic mode. Default value: `false`.",
          "required": false
        },
        {
          "name": "align_audio",
          "type": "bool",
          "default": true,
          "title": "Align Audio",
          "description": "Supported in Lite mode. Whether to loop the video when the audio is longer than the video. Default value: `true`.",
          "required": false
        },
        {
          "name": "align_audio_reverse",
          "type": "bool",
          "default": false,
          "title": "Align Audio Reverse",
          "description": "Supported in Lite mode. Whether to loop the video in reverse (backward). Requires `align_audio` to be set to `true`. Default value: `false`.",
          "required": false
        },
        {
          "name": "templ_start_seconds",
          "type": "float",
          "default": 0,
          "title": "Templ Start Seconds",
          "description": "Supported in Lite mode. Start time of the template video, in seconds. Default value: `0`.",
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
          "field": "audio",
          "kind": "audio",
          "paramName": "audio_url"
        }
      ],
      "validation": [
        {
          "field": "mode",
          "rule": "not_empty",
          "message": "Mode is required"
        }
      ]
    }
  ]
};
