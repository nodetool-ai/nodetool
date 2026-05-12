import { describe, expect, it } from "vitest";
import { KieSchemaFetcher } from "../src/schema-fetcher.js";
import { KieSchemaParser } from "../src/schema-parser.js";

const seedanceDocs = `# Bytedance Seedance 2.0

\`\`\`yaml
openapi: 3.0.1
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Bytedance Seedance 2.0
      operationId: bytedance-seedance-2
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - bytedance/seedance-2
                  default: bytedance/seedance-2
                input:
                  type: object
                  properties:
                    prompt:
                      type: string
                      description: The text prompt used to generate the video.
                      minLength: 3
                    first_frame_url:
                      type: string
                      description: First frame image url or asset://{assetId}
                    last_frame_url:
                      type: string
                      description: End frame image url or asset://{assetId}
                    reference_image_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: Enter a list of image URLs or asset://{assetId}.
                      maxItems: 9
                    reference_video_urls :
                      type: array
                      items:
                        type: string
                        format: uri
                      description: Enter a list of video URLs or asset://{assetId}.
                      maxItems: 3
                    reference_audio_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: Enter a list of audio URLs or asset://{assetId}.
                      maxItems: 3
                    return_last_frame:
                      type: boolean
                      deprecated: true
                    generate_audio:
                      type: boolean
                      default: true
                    resolution:
                      type: string
                      enum:
                        - 480p
                        - 720p
                        - 1080p
                      default: 720p
                    duration:
                      type: integer
                      default: 5
                    nsfw_checker:
                      type: boolean
                      default: false
\`\`\`
`;

const sunoDocs = `# Generate Music

\`\`\`yaml
openapi: 3.0.1
paths:
  /api/v1/generate:
    post:
      summary: Generate Music
      operationId: generate-music
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - prompt
                - customMode
              properties:
                prompt:
                  type: string
                  description: Music description.
                customMode:
                  type: boolean
                  description: Advanced mode.
                instrumental:
                  type: boolean
                  description: Instrumental only.
                model:
                  type: string
                  enum:
                    - V4
                    - V5
                  default: V5
                callBackUrl:
                  type: string
                  format: uri
\`\`\`
`;

describe("KieSchemaFetcher", () => {
  it("extracts English API docs entries from llms.txt", () => {
    const fetcher = new KieSchemaFetcher();
    const entries = fetcher.parseLlmsEntries(`## Docs
- [Quickstart](https://docs.kie.ai/quickstart.md):

## API Docs
- Video Models > Bytedance [bytedance-seedance-2](https://docs.kie.ai/market/bytedance/seedance-2.md): ## Query Task Status
- Video Models > Bytedance [中文](https://docs.kie.ai/cn/market/bytedance/seedance-2.md): ## 查询任务状态
`);

    expect(entries).toEqual([
      {
        category: "Video Models > Bytedance",
        title: "bytedance-seedance-2",
        url: "https://docs.kie.ai/market/bytedance/seedance-2.md",
        summary: "## Query Task Status"
      }
    ]);
  });
});

describe("KieSchemaParser", () => {
  it("maps KIE OpenAPI media URL fields to AssetRef handles", () => {
    const parser = new KieSchemaParser();
    const node = parser.parse(seedanceDocs, {
      category: "Video Models > Bytedance",
      title: "bytedance-seedance-2",
      url: "https://docs.kie.ai/market/bytedance/seedance-2.md",
      summary: "Seedance 2"
    });

    expect(node).toMatchObject({
      className: "BytedanceSeedance2",
      modelId: "bytedance/seedance-2",
      outputType: "video",
      fields: expect.arrayContaining([
        expect.objectContaining({ name: "first_frame", type: "image" }),
        expect.objectContaining({ name: "last_frame", type: "image" }),
        expect.objectContaining({ name: "reference_images", type: "list[image]" }),
        expect.objectContaining({ name: "reference_videos", type: "list[video]" }),
        expect.objectContaining({ name: "reference_audios", type: "list[audio]" }),
        expect.objectContaining({
          name: "resolution",
          type: "enum",
          values: ["480p", "720p", "1080p"]
        }),
        expect.objectContaining({ name: "nsfw_checker", type: "bool", default: false })
      ]),
      uploads: expect.arrayContaining([
        expect.objectContaining({ field: "first_frame", kind: "image", paramName: "first_frame_url" }),
        expect.objectContaining({ field: "last_frame", kind: "image", paramName: "last_frame_url" }),
        expect.objectContaining({
          field: "reference_images",
          kind: "image",
          isList: true,
          paramName: "reference_image_urls"
        }),
        expect.objectContaining({
          field: "reference_videos",
          kind: "video",
          isList: true,
          paramName: "reference_video_urls"
        }),
        expect.objectContaining({
          field: "reference_audios",
          kind: "audio",
          isList: true,
          paramName: "reference_audio_urls"
        })
      ])
    });
    expect(node?.fields.some((field) => field.name === "return_last_frame")).toBe(false);
  });

  it("maps direct Suno endpoints to audio useSuno configs", () => {
    const parser = new KieSchemaParser();
    const node = parser.parse(sunoDocs, {
      category: "Suno API > Music Generation",
      title: "Generate Music",
      url: "https://docs.kie.ai/suno-api/generate-music.md",
      summary: "Generate music"
    });

    expect(node).toMatchObject({
      className: "GenerateMusic",
      modelId: "generate-music",
      outputType: "audio",
      useSuno: true,
      sunoEndpoint: "/api/v1/generate",
      fields: expect.arrayContaining([
        expect.objectContaining({ name: "prompt", type: "str" }),
        expect.objectContaining({ name: "customMode", type: "bool" }),
        expect.objectContaining({ name: "model", type: "enum", values: ["V4", "V5"] })
      ])
    });
    expect(node?.fields.some((field) => field.name === "callBackUrl")).toBe(false);
  });
});
