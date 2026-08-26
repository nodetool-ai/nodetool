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
    }
  ]
};
