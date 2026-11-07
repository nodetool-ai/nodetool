/**
 * Request parity for the KIE transport move (docs/plans/provider-endpoint-interface.md,
 * Testing strategy item 4). Each case runs a real manifest node and pins every
 * HTTP request that reaches the network boundary: uploads, the job submit, the
 * polls and the result download. The pinned requests were recorded from the
 * pack's own transport before it moved into `KieProvider`. The nodes now reach
 * KIE through a real `KieProvider` with `fetch` stubbed, and must send the same
 * endpoints and the same JSON.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KieProvider, ProcessingContext } from "@nodetool-ai/runtime";
import { createKieNodeClass } from "../src/kie-factory.js";
import type { KieManifestEntry } from "../src/kie-factory.js";

const MANIFEST = JSON.parse(
  readFileSync(new URL("../src/kie-manifest.json", import.meta.url), "utf8")
) as KieManifestEntry[];

const NOW = 1_700_000_000_000;
const UPLOADED = "https://kie.cdn.test/uploaded.bin";
const RESULT = "https://kie.cdn.test/result.png";
const SUNO_AUDIO = "https://kie.cdn.test/song.mp3";
// A valid 1×1 PNG, so the image output path can read its dimensions.
const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  )
);

interface RecordedRequest {
  method: string;
  url: string;
  authorization: string | null;
  json?: unknown;
  form?: Record<string, string>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function record(url: string, init: RequestInit | undefined): RecordedRequest {
  const entry: RecordedRequest = {
    method: (init?.method ?? "GET").toUpperCase(),
    url,
    authorization: new Headers(init?.headers).get("authorization")
  };
  if (init?.body instanceof FormData) {
    const form: Record<string, string> = {};
    for (const [key, value] of init.body.entries()) {
      form[key] = typeof value === "string" ? value : `file:${value.name}`;
    }
    entry.form = form;
  } else if (typeof init?.body === "string") {
    entry.json = JSON.parse(init.body);
  }
  return entry;
}

/** Answer every KIE endpoint the nodes reach, and log each request. */
function stubKie(): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push(record(url, init));
      if (url.includes("file-stream-upload")) {
        return json({ success: true, code: 200, data: { downloadUrl: UPLOADED } });
      }
      if (url.endsWith("/api/v1/jobs/createTask")) {
        return json({ code: 200, msg: "success", data: { taskId: "task-1" } });
      }
      if (url.includes("/api/v1/jobs/recordInfo")) {
        return json({
          code: 200,
          data: {
            taskId: "task-1",
            state: "success",
            creditsConsumed: 12,
            resultJson: JSON.stringify({ resultUrls: [RESULT] })
          }
        });
      }
      if (url.endsWith("/api/v1/generate")) {
        return json({ code: 200, data: { taskId: "suno-1" } });
      }
      if (url.includes("/api/v1/generate/record-info")) {
        return json({
          code: 200,
          data: {
            taskId: "suno-1",
            status: "SUCCESS",
            creditsConsumed: 6,
            response: { sunoData: [{ audioUrl: SUNO_AUDIO }] }
          }
        });
      }
      if (url.endsWith("/api/v1/omni/audio/create")) {
        return json({ code: 200, data: { audioId: "voice-1" } });
      }
      if (url === RESULT || url === SUNO_AUDIO) {
        return new Response(PNG, { status: 200 });
      }
      throw new Error(`unexpected request: ${url}`);
    })
  );
  return requests;
}

function manifestNode(modelId: string) {
  const spec = MANIFEST.find((entry) => entry.modelId === modelId);
  if (!spec) throw new Error(`${modelId} is not in the manifest`);
  const NodeClass = createKieNodeClass(spec);
  return new (NodeClass as new () => InstanceType<typeof NodeClass>)();
}

function kieContext(): ProcessingContext {
  const context = new ProcessingContext({ jobId: "job-1" });
  context.setProviderResolver(() => new KieProvider({ KIE_API_KEY: "kie-key" }));
  return context;
}

function assign(node: object, props: Record<string, unknown>): void {
  Object.assign(node, props);
}

const AUTH = "Bearer kie-key";
const recordInfo = (taskId: string): RecordedRequest => ({
  method: "GET",
  url: `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`,
  authorization: AUTH
});
const upload = (uploadPath: string, fileName: string): RecordedRequest => ({
  method: "POST",
  url: "https://kieai.redpandaai.co/api/file-stream-upload",
  authorization: AUTH,
  form: { file: `file:${fileName}`, uploadPath, fileName }
});
const download = (url: string): RecordedRequest => ({
  method: "GET",
  url,
  authorization: null
});

describe("KIE request parity", () => {
  const webhook = process.env.KIE_WEBHOOK_URL;

  beforeEach(() => {
    delete process.env.KIE_WEBHOOK_URL;
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    if (webhook === undefined) delete process.env.KIE_WEBHOOK_URL;
    else process.env.KIE_WEBHOOK_URL = webhook;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("image: Nano Banana Edit uploads its image and runs one job", async () => {
    const requests = stubKie();
    const node = manifestNode("google/nano-banana-edit");
    assign(node, {
      prompt: "a fox in the snow",
      images: [{ type: "image", uri: "", asset_id: null, data: PNG }],
      aspect_ratio: "16:9"
    });

    await node.process(kieContext());

    expect(requests).toEqual([
      upload("images/user-uploads", `upload-${NOW}.png`),
      {
        method: "POST",
        url: "https://api.kie.ai/api/v1/jobs/createTask",
        authorization: AUTH,
        json: {
          model: "google/nano-banana-edit",
          input: {
            prompt: "a fox in the snow",
            output_format: "png",
            aspect_ratio: "16:9",
            image_urls: [UPLOADED]
          }
        }
      },
      recordInfo("task-1"),
      recordInfo("task-1"),
      download(RESULT)
    ]);
  });

  it("video: Kling 2.6 image-to-video uploads its first frame and runs one job", async () => {
    const requests = stubKie();
    const node = manifestNode("kling-2.6/image-to-video");
    assign(node, {
      prompt: "the fox runs",
      images: [{ type: "image", uri: "", asset_id: null, data: PNG }],
      sound: true,
      duration: "10"
    });

    await node.process(kieContext());

    expect(requests).toEqual([
      upload("images/user-uploads", `upload-${NOW}.png`),
      {
        method: "POST",
        url: "https://api.kie.ai/api/v1/jobs/createTask",
        authorization: AUTH,
        json: {
          model: "kling-2.6/image-to-video",
          input: {
            prompt: "the fox runs",
            sound: true,
            duration: "10",
            image_urls: [UPLOADED]
          }
        }
      },
      recordInfo("task-1"),
      recordInfo("task-1"),
      download(RESULT)
    ]);
  });

  it("audio: ElevenLabs audio isolation uploads its audio and runs one job", async () => {
    const requests = stubKie();
    const node = manifestNode("elevenlabs/audio-isolation");
    assign(node, {
      audio: { type: "audio", uri: "", asset_id: null, data: new Uint8Array([1, 2, 3]) }
    });

    await node.process(kieContext());

    expect(requests).toEqual([
      upload("audio/user-uploads", `upload-${NOW}.mp3`),
      {
        method: "POST",
        url: "https://api.kie.ai/api/v1/jobs/createTask",
        authorization: AUTH,
        json: {
          model: "elevenlabs/audio-isolation",
          input: { audio_url: UPLOADED }
        }
      },
      recordInfo("task-1"),
      recordInfo("task-1"),
      download(RESULT)
    ]);
  });

  it("Suno: Generate Music posts to the Suno route and polls record-info", async () => {
    const requests = stubKie();
    const node = manifestNode("generate-music");
    assign(node, { prompt: "a sea shanty", model: "V5", title: "Shanty" });

    await node.process(kieContext());

    expect(requests).toEqual([
      {
        method: "POST",
        url: "https://api.kie.ai/api/v1/generate",
        authorization: AUTH,
        json: {
          prompt: "a sea shanty",
          title: "Shanty",
          customMode: false,
          instrumental: false,
          model: "V5",
          styleWeight: 0,
          weirdnessConstraint: 0,
          audioWeight: 0,
          variety: 1,
          duration: 20,
          lyrics: "",
          style: "",
          negativeTags: "",
          vocalGender: "",
          personaId: "",
          personaModel: "",
          callBackUrl: "https://nodetool.ai/kie-callback"
        }
      },
      {
        method: "GET",
        url: "https://api.kie.ai/api/v1/generate/record-info?taskId=suno-1",
        authorization: AUTH
      },
      download(SUNO_AUDIO)
    ]);
  });

  it("custom endpoint: Gemini Omni Audio posts once to its own endpoint", async () => {
    const requests = stubKie();
    const node = manifestNode("gemini-omni-audio");
    assign(node, { audio_id: "achernar", name: "Narrator" });

    const result = await node.process(kieContext());

    expect(result).toEqual({ output: "voice-1" });
    expect(requests).toEqual([
      {
        method: "POST",
        url: "https://api.kie.ai/api/v1/omni/audio/create",
        authorization: AUTH,
        json: {
          audio_id: "achernar",
          name: "Narrator",
          voice_description: "",
          example_dialogue: ""
        }
      }
    ]);
  });
});
