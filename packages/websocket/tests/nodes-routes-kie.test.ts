import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import nodesRoutes from "../src/routes/nodes.js";

describe("Kie schema resolve route", () => {
  let app: FastifyInstance;
  const minimalDocs = "| **Format** | `bytedance/seedance-2` |";

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(nodesRoutes, { apiOptions: {} });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("resolves dynamic Kie schema from pasted docs", async () => {
    const docs = `# Seedance 2 API Documentation

## 1. Create Generation Task

### Model Parameter
| Property | Value | Description |
|----------|-------|-------------|
| **Format** | \`bytedance/seedance-2\` | The exact model identifier for this API |

### input Object Parameters

#### prompt
- **Type**: \`string\`
- **Required**: No
- **Description**: The text prompt or description for the video.

#### reference_image_urls
- **Type**: \`array\`
- **Required**: No
- **Description**: Please provide the URL of the uploaded file,A list of input image URLs.
- **Accepted File Types**: image/jpeg, image/png, image/webp, image/jpg

#### generate_audio
- **Type**: \`boolean\`
- **Required**: No
- **Description**: Whether to generate AI audio synchronized with the video.
- **Default Value**: \`true\`

#### resolution
- **Type**: \`string\`
- **Required**: No
- **Description**: The output video resolution.
- **Options**:
  - \`480p\`: 480p
  - \`720p\`: 720p
- **Default Value**: \`720p\`

#### duration
- **Type**: \`number\`
- **Required**: No
- **Description**: Video duration in seconds.
- **Range**: 4 - 15 (step: 1)
- **Default Value**: \`15\`
`;

    const res = await app.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      payload: { model_info: docs }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      model_id: "bytedance/seedance-2",
      dynamic_properties: {
        prompt: "",
        reference_images: [],
        generate_audio: true,
        resolution: "720p",
        duration: 15
      },
      dynamic_inputs: {
        prompt: {
          type: "str",
          type_args: [],
          optional: true,
          description: "The text prompt or description for the video."
        },
        reference_images: {
          type: "list",
          type_args: [{ type: "image", type_args: [] }],
          optional: true,
          description:
            "Please provide the URL of the uploaded file,A list of input image URLs."
        },
        generate_audio: {
          type: "bool",
          type_args: [],
          optional: true,
          description: "Whether to generate AI audio synchronized with the video.",
          default: true
        },
        resolution: {
          type: "str",
          type_args: [],
          optional: true,
          description: "The output video resolution.",
          default: "720p",
          values: ["480p", "720p"]
        },
        duration: {
          type: "float",
          type_args: [],
          optional: true,
          description: "Video duration in seconds.",
          default: 15,
          min: 4,
          max: 15
        }
      },
      dynamic_outputs: {
        video: {
          type: "video",
          type_args: [],
          optional: false
        }
      }
    });
  });

  it("accepts legacy body shapes for model_info", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      payload: { modelInfo: minimalDocs }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().model_id).toBe("bytedance/seedance-2");
  });

  it("maps Kie media URL arrays to media list handles", async () => {
    const docs = `# Seedance 2 API Documentation

### Model Parameter
| Property | Value | Description |
|----------|-------|-------------|
| **Format** | \`bytedance/seedance-2\` | The exact model identifier for this API |

### input Object Parameters

#### reference_image_urls
- **Type**: \`array\`
- **Required**: No
- **Description**: Please provide the URL of the uploaded file,A list of input image URLs.
- **Accepted File Types**: image/jpeg, image/png, image/webp, image/jpg
- **Default Value**: \`["https://example.com/image.png"]\`

#### reference_video_urls
- **Type**: \`array\`
- **Required**: No
- **Description**: Please provide the URL of the uploaded file,A list of input video URLs.
- **Accepted File Types**: video/mp4, video/quicktime, video/x-matroska
- **Default Value**: \`["https://example.com/video.mp4"]\`

#### reference_audio_urls
- **Type**: \`array\`
- **Required**: No
- **Description**: Please provide the URL of the uploaded file,A list of input audio URLs.
- **Accepted File Types**: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/mp4, audio/ogg
- **Default Value**: \`["https://example.com/audio.mp3"]\`
`;

    const res = await app.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      payload: { model_info: docs }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      dynamic_properties: {
        reference_images: [],
        reference_videos: [],
        reference_audios: []
      },
      dynamic_inputs: {
        reference_images: {
          type: "list",
          type_args: [{ type: "image", type_args: [] }]
        },
        reference_videos: {
          type: "list",
          type_args: [{ type: "video", type_args: [] }]
        },
        reference_audios: {
          type: "list",
          type_args: [{ type: "audio", type_args: [] }]
        }
      }
    });
    expect(res.json().dynamic_inputs.reference_images.default).toBeUndefined();
    expect(res.json().dynamic_inputs.reference_videos.default).toBeUndefined();
    expect(res.json().dynamic_inputs.reference_audios.default).toBeUndefined();
  });

  it("maps generic Kie input_urls image arrays to images", async () => {
    const docs = `# GPT Image 2 Image-to-Image API Documentation

### Model Parameter
| Property | Value | Description |
|----------|-------|-------------|
| **Format** | \`gpt-image-2-image\` | The exact model identifier for this API |

### input Object Parameters

#### prompt
- **Type**: \`string\`
- **Required**: Yes
- **Description**: Describe the image edits.

#### input_urls
- **Type**: \`array\`
- **Required**: No
- **Description**: Please provide the URL of the uploaded file,Input images to transform.
- **Accepted File Types**: image/jpeg, image/png, image/webp
- **Multiple Files**: Yes
- **Default Value**: \`[]\`
`;

    const res = await app.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      payload: { model_info: docs }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      model_id: "gpt-image-2-image",
      dynamic_properties: {
        images: []
      },
      dynamic_inputs: {
        images: {
          type: "list",
          type_args: [{ type: "image", type_args: [] }]
        }
      }
    });
    expect(res.json().dynamic_properties.input_urls).toBeUndefined();
    expect(res.json().dynamic_inputs.input_urls).toBeUndefined();
  });

  it("accepts JSON requests when the server parses bodies as raw buffers", async () => {
    const rawBodyApp = Fastify({ logger: false });
    rawBodyApp.removeAllContentTypeParsers();
    rawBodyApp.addContentTypeParser(
      "*",
      { parseAs: "buffer" },
      (_req, body, done) => done(null, body)
    );
    await rawBodyApp.register(nodesRoutes, { apiOptions: {} });
    await rawBodyApp.ready();

    const res = await rawBodyApp.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      headers: {
        "content-type": "application/json"
      },
      payload: JSON.stringify({ model_info: minimalDocs })
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().model_id).toBe("bytedance/seedance-2");

    await rawBodyApp.close();
  });

  it("resolves the provided Nano Banana Pro documentation", async () => {
    const docs = `# Nano Banana Pro API Documentation

> Generate content using the Nano Banana Pro model

## Overview

This document describes how to use the Nano Banana Pro model for content generation. The process consists of two steps:
1. Create a generation task
2. Query task status and results

## Authentication

All API requests require a Bearer Token in the request header:

\`\`\`
Authorization: Bearer YOUR_API_KEY
\`\`\`

Get API Key:
1. Visit [API Key Management Page](https://kie.ai/api-key) to get your API Key
2. Add to request header: \`Authorization: Bearer YOUR_API_KEY\`

---

## 1. Create Generation Task

### API Information
- **URL**: \`POST https://api.kie.ai/api/v1/jobs/createTask\`
- **Content-Type**: \`application/json\`

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| model | string | Yes | Model name, format: \`nano-banana-pro\` |
| input | object | Yes | Input parameters object |
| callBackUrl | string | No | Callback URL for task completion notifications. If provided, the system will send POST requests to this URL when the task completes (success or fail). If not provided, no callback notifications will be sent. Example: \`"https://your-domain.com/api/callback"\` |

### Model Parameter

The \`model\` parameter specifies which AI model to use for content generation.

| Property | Value | Description |
|----------|-------|-------------|
| **Format** | \`nano-banana-pro\` | The exact model identifier for this API |
| **Type** | string | Must be passed as a string value |
| **Required** | Yes | This parameter is mandatory for all requests |

> **Note**: The model parameter must match exactly as shown above. Different models have different capabilities and parameter requirements.

### Callback URL Parameter

The \`callBackUrl\` parameter allows you to receive automatic notifications when your task completes.

| Property | Value | Description |
|----------|-------|-------------|
| **Purpose** | Task completion notification | Receive real-time updates when your task finishes |
| **Method** | POST request | The system sends POST requests to your callback URL |
| **Timing** | When task completes | Notifications sent for both success and failure states |
| **Content** | Query Task API response | Callback content structure is identical to the Query Task API response |
| **Parameters** | Complete request data | The \`param\` field contains the complete Create Task request parameters, not just the input section |
| **Optional** | Yes | If not provided, no callback notifications will be sent |

**Important Notes:**
- The callback content structure is identical to the Query Task API response
- The \`param\` field contains the complete Create Task request parameters, not just the input section
- If \`callBackUrl\` is not provided, no callback notifications will be sent

### input Object Parameters

#### prompt
- **Type**: \`string\`
- **Required**: Yes
- **Description**: A text description of the image you want to generate
- **Max Length**: 20000 characters
- **Default Value**: \`"Comic poster: cool banana hero in shades leaps from sci-fi pad. Six panels: 1) 4K mountain landscape, 2) banana holds page of long multilingual text with auto translation, 3) Gemini 3 hologram for search/knowledge/reasoning, 4) camera UI sliders for angle focus color, 5) frame trio 1:1-9:16, 6) consistent banana poses. Footer shows Google icons. Tagline: Nano Banana Pro now on Kie AI."\`

#### image_input
- **Type**: \`array\`
- **Required**: No
- **Description**: Please provide the URL of the uploaded file,Input images to transform or use as reference (supports up to 8 images)
- **Max File Size**: 30MB
- **Accepted File Types**: image/jpeg, image/png, image/webp
- **Multiple Files**: Yes
- **Default Value**: \`[]\`

#### aspect_ratio
- **Type**: \`string\`
- **Required**: No
- **Description**: Aspect ratio of the generated image
- **Options**:
  - \`1:1\`: 1:1
  - \`2:3\`: 2:3
  - \`3:2\`: 3:2
  - \`3:4\`: 3:4
  - \`4:3\`: 4:3
  - \`4:5\`: 4:5
  - \`5:4\`: 5:4
  - \`9:16\`: 9:16
  - \`16:9\`: 16:9
  - \`21:9\`: 21:9
  - \`auto\`: Auto
- **Default Value**: \`"1:1"\`

#### resolution
- **Type**: \`string\`
- **Required**: No
- **Description**: Resolution of the generated image
- **Options**:
  - \`1K\`: 1K
  - \`2K\`: 2K
  - \`4K\`: 4K
- **Default Value**: \`"1K"\`

#### output_format
- **Type**: \`string\`
- **Required**: No
- **Description**: Format of the output image
- **Options**:
  - \`png\`: PNG
  - \`jpg\`: JPG
- **Default Value**: \`"png"\``;

    const res = await app.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      payload: { model_info: docs }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      model_id: "nano-banana-pro",
      dynamic_properties: {
        image_input: [],
        aspect_ratio: "1:1",
        resolution: "1K",
        output_format: "png"
      },
      dynamic_inputs: {
        prompt: {
          optional: false
        }
      },
      dynamic_outputs: {
        image: {
          type: "image"
        }
      }
    });
  });

  it("resolves gemini-omni-video params from embedded OpenAPI YAML", async () => {
    const docs = `# Gemini Omni Video

| **Format** | \`gemini-omni-video\` |

### input Object Parameters

#### prompt
- **Type**: \`string\`
- **Required**: Yes
- **Description**: Video prompt.

#### image_urls
- **Type**: \`array\`
- **Required**: No
- **Description**: Please provide the URL of the uploaded file,Upload an image file to use as input for the API
- **Accepted File Types**: image/jpeg, image/png, image/webp, image/jpg

\`\`\`yaml
openapi: 3.0.1
paths:
  /api/v1/jobs/createTask:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  enum:
                    - gemini-omni-video
                input:
                  type: object
                  required:
                    - prompt
                  properties:
                    prompt:
                      type: string
                    image_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                    audio_ids:
                      type: array
                      items:
                        type: string
                    video_list:
                      type: array
                      items:
                        type: object
                        properties:
                          url:
                            type: string
                            format: uri
                          start:
                            type: number
                          ends:
                            type: number
                    character_ids:
                      type: array
                      items:
                        type: string
\`\`\`
`;

    const res = await app.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      payload: { model_info: docs }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      model_id: "gemini-omni-video",
      dynamic_inputs: {
        video_list: {
          type: "list",
          type_args: [{ type: "video", type_args: [] }]
        },
        audio_ids: {
          type: "list",
          type_args: [{ type: "str", type_args: [] }]
        },
        character_ids: {
          type: "list",
          type_args: [{ type: "str", type_args: [] }]
        }
      },
      dynamic_outputs: {
        video: { type: "video" }
      }
    });
  });
});
