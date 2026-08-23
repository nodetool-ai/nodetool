import type { ModuleConfig } from "../types.js";

export const videoConfig: ModuleConfig = {
  "moduleName": "video",
  "defaultPollInterval": 8000,
  "defaultMaxAttempts": 450,
  "nodes": [
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
    }
  ]
};
