import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { ComfyCloudProvider, mp4DurationSeconds } from "../../src/providers/comfy-cloud-provider.js";
import {
  ComfyRouterClient,
  RouterArgsBuilder,
  findMedia,
  parseInputSchema
} from "../../src/providers/comfy-router.js";
import { COMFY_ROUTER_CATALOG } from "../../src/providers/comfy-router-catalog.js";
import { comfyGpuTemplateFits, listedComfyGpuTemplates } from "../../src/providers/comfy-gpu-models.js";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";

const BASE = "https://router.test";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 9, 9]);
const DATA_PNG = expect.stringMatching(/^data:image\/png;base64,/);

/** An OpenAPI document with one POST body, the shape the Router serves. */
function openapi(properties: Record<string, unknown>, required: string[] = []): unknown {
  return {
    openapi: "3.1.0",
    paths: {
      "/": {
        post: {
          requestBody: {
            content: { "application/json": { schema: { $ref: "#/components/schemas/Input" } } }
          }
        }
      }
    },
    components: { schemas: { Input: { type: "object", properties, required } } }
  };
}

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

/**
 * A fake Router: serves a schema per model, queues each submit, reports it
 * in progress once, then completes it with `result`.
 */
function fakeRouter(models: Record<string, { schema: unknown; result: unknown; contentType?: string }>, opts: { live?: string[]; failSubmit?: { status: number; body: unknown } } = {}) {
  const calls: Call[] = [];
  const polls = new Map<string, number>();
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  const fetchFn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    calls.push({ method, url, headers, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });

    if (url.startsWith("https://cdn.test/")) {
      return new Response(MP4, { headers: { "content-type": "video/mp4" } });
    }
    const u = new URL(url);
    if (u.pathname === "/v2/models") {
      return json({ data: (opts.live ?? Object.keys(models)).map((id) => ({ id })), has_more: false, limit: 100 });
    }
    const match = /^\/v2\/models\/([^/]+)\/([^/]+)(\/.*)?$/.exec(u.pathname);
    if (!match) return json({ detail: "not found", error_type: "model_not_found" }, 404);
    const id = `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`;
    const model = models[id];
    if (!model) return json({ detail: "not found", error_type: "model_not_found" }, 404);
    const rest = match[3] ?? "";
    if (rest === "/openapi.json") return json(model.schema);
    if (rest === "" && method === "POST") return json(model.result);
    if (rest === "/requests" && method === "POST") {
      if (opts.failSubmit) {
        const errorType = (opts.failSubmit.body as { error_type?: string }).error_type;
        return json(opts.failSubmit.body, opts.failSubmit.status, errorType ? { "x-comfy-error-type": errorType } : {});
      }
      return json({ request_id: "req-1", status: "IN_QUEUE", queue_position: 0 }, 201);
    }
    if (rest === "/requests/req-1/status") {
      const n = (polls.get(id) ?? 0) + 1;
      polls.set(id, n);
      return json({ request_id: "req-1", status: n > 1 ? "COMPLETED" : "IN_PROGRESS" }, 200, { "retry-after": "0" });
    }
    if (rest === "/requests/req-1") {
      if (model.contentType && !model.contentType.includes("json")) {
        return new Response(model.result as Uint8Array, { headers: { "content-type": model.contentType } });
      }
      return json(model.result, 200, { "x-comfy-credits-used": "12" });
    }
    if (rest === "/requests/req-1/cancel") return json({ status: "CANCELLATION_REQUESTED" }, 202);
    return json({ detail: "unexpected" }, 500);
  }) as typeof fetch;
  return { fetchFn, calls };
}

class TestProvider extends ComfyCloudProvider {
  constructor(private readonly fetchFn: typeof fetch) {
    super({ COMFY_API_KEY: "test-key" });
  }
  protected override createRouter(): ComfyRouterClient {
    return new ComfyRouterClient({ apiKey: "test-key", baseUrl: BASE, fetch: this.fetchFn, pollMs: 1 });
  }
}

const IMAGE_MODEL = { id: "bfl/flux-2-pro", name: "Flux 2 Pro", provider: PROVIDER_IDS.COMFY_CLOUD } as const;
const VIDEO_MODEL = { id: "kling/kling-v3", name: "Kling v3", provider: PROVIDER_IDS.COMFY_CLOUD } as const;

/** A real Router input schema, saved from `/v2/models/{id}/openapi.json`. */
function realSchema(id: string): unknown {
  const file = new URL(`../fixtures/comfy-router-schemas/${id.replace("/", "__")}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Run one call against a real schema and return the body it submitted. */
async function submittedBody(id: string, call: (p: TestProvider, model: { id: string; name: string; provider: "comfy_cloud" }) => Promise<unknown>, schemaId = id): Promise<Record<string, unknown>> {
  const { fetchFn, calls } = fakeRouter({ [id]: { schema: realSchema(schemaId), result: { image: "https://cdn.test/out.png", video: "https://cdn.test/out.mp4" } } });
  await call(new TestProvider(fetchFn), { id, name: id, provider: PROVIDER_IDS.COMFY_CLOUD });
  const submit = calls.find((c) => c.method === "POST" && c.url.endsWith("/requests"));
  return submit?.body as Record<string, unknown>;
}

describe("ComfyCloudProvider — metadata", () => {
  it("reports provider id and required secrets", () => {
    const p = new ComfyCloudProvider({ COMFY_API_KEY: "k" });
    expect(p.provider).toBe("comfy_cloud");
    expect(ComfyCloudProvider.requiredSecrets()).toEqual(["COMFY_API_KEY"]);
    expect(p.getContainerEnv()).toEqual({ COMFY_API_KEY: "k" });
  });

  it("fails with a pointer to the key page when no key is set", async () => {
    const p = new ComfyCloudProvider();
    await expect(
      p.textToImage({ model: { ...IMAGE_MODEL }, prompt: "x" })
    ).rejects.toThrow("platform.comfy.org");
  });
});

describe("ComfyCloudProvider — catalog", () => {
  it("lists every catalog kind, filtered by the live listing", async () => {
    const { fetchFn } = fakeRouter({}, { live: ["bfl/flux-2-pro", "veo/veo-3.1-generate-001", "elevenlabs/eleven_v3", "anthropic/claude-sonnet-5"] });
    const p = new TestProvider(fetchFn);
    expect((await p.getAvailableImageModels()).map((m) => m.id).filter((id) => !id.startsWith("comfyui-gpu/"))).toEqual([
      "comfyui-template/image_z_image_turbo",
      "comfyui-template/image_krea2_turbo_t2i_int8",
      "comfyui-template/image_moss_image_t2i",
      "comfyui-template/image_qwen_image_2_1_t2i",
      "bfl/flux-2-pro"
    ]);
    const video = await p.getAvailableVideoModels();
    expect(video.filter((model) => !model.id.startsWith("comfyui-gpu/"))).toEqual([
      // The pinned ComfyUI workflows are not Router models, so the listing never filters them.
      expect.objectContaining({ id: "comfyui-workflow/wan2.2-ti2v-5b", supportedTasks: ["image_to_video"] }),
      expect.objectContaining({ id: "comfyui-workflow/wan2.2-i2v-a14b" }),
      expect.objectContaining({ id: "comfyui-workflow/ltx-2.3-i2v" }),
      expect.objectContaining({ id: "comfyui-template/video_hunyuan_video_1.5_720p_t2v", supportedTasks: ["text_to_video"] }),
      expect.objectContaining({ id: "comfyui-template/video_wan2_2_14B_t2v", supportedTasks: ["text_to_video"] }),
      expect.objectContaining({ id: "veo/veo-3.1-generate-001", provider: "comfy_cloud", supportedTasks: ["text_to_video", "image_to_video"] })
    ]);
    expect((await p.getAvailableTTSModels()).map((m) => m.id).filter((id) => !id.startsWith("comfyui-gpu/"))).toEqual(["elevenlabs/eleven_v3"]);
    expect((await p.getAvailableLanguageModels()).map((m) => m.id).filter((id) => !id.startsWith("comfyui-gpu/"))).toEqual(["anthropic/claude-sonnet-5"]);
  });

  it("falls back to the whole snapshot when the listing cannot be read", async () => {
    const failing = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const p = new TestProvider(failing);
    const ids = (await p.getAvailableVideoModels()).map((m) => m.id);
    expect(ids).toContain("veo/veo-3.1-generate-001");
    expect(ids.length).toBe(COMFY_ROUTER_CATALOG.filter((e) => e.kind === "video").length + 5 + listedComfyGpuTemplates().filter((template) => template.kind === "video" && comfyGpuTemplateFits(template)).length);
  });

  it("offers GPU video templates only where callers can supply their media", () => {
    const fits = (task: string, inputs: { image: number; video: number; audio: number }) =>
      comfyGpuTemplateFits({ task, inputs } as Parameters<typeof comfyGpuTemplateFits>[0]);
    expect(fits("image_to_video", { image: 1, video: 0, audio: 0 })).toBe(true);
    expect(fits("image_to_video", { image: 2, video: 0, audio: 0 })).toBe(false);
    expect(fits("reference_to_video", { image: 3, video: 0, audio: 0 })).toBe(true);
    expect(fits("reference_to_video", { image: 1, video: 0, audio: 1 })).toBe(false);
    expect(fits("reference_to_video", { image: 0, video: 0, audio: 0 })).toBe(false);
    expect(fits("text_to_video", { image: 0, video: 0, audio: 0 })).toBe(true);
  });

  it("takes each model's tasks from its schema modalities", () => {
    const tasks = Object.fromEntries(COMFY_ROUTER_CATALOG.map((e) => [e.id, e.tasks]));
    expect(tasks["wan/wan2.7-i2v"]).toEqual(["image_to_video"]);
    expect(tasks["wan/wan2.7-t2v"]).toEqual(["text_to_video"]);
    expect(tasks["wan/wan2.7-r2v"]).toEqual(["reference_to_video"]);
    expect(tasks["runway/aleph2"]).toEqual(["video_to_video"]);
    expect(tasks["runway/gen4_turbo"]).toEqual(["image_to_video"]);
    expect(tasks["bfl/flux-2-pro"]).toEqual(["text_to_image", "image_to_image"]);
    // Text-only input: no image-to-image.
    expect(tasks["luma/photon-flash-1"]).toEqual(["text_to_image"]);
    // 3D output and mask-only editors have no NodeTool task.
    expect(tasks["meshy/meshy-6"]).toBeUndefined();
    expect(tasks["bria/image-edit-erase"]).toBeUndefined();
    // Reference-to-video, which ComfyUI's ByteDance2 and MiniMax H3 reference nodes offer.
    for (const id of ["byteplus/dreamina-seedance-2-5-260628", "byteplus/dreamina-seedance-2-0-mini", "minimax/minimax-h3"]) {
      expect(tasks[id]).toEqual(["text_to_video", "image_to_video", "reference_to_video"]);
    }
  });

  it("declares the media capabilities it implements", () => {
    const caps = new ComfyCloudProvider({ COMFY_API_KEY: "k" }).getCapabilities();
    for (const cap of ["text_to_image", "image_to_image", "text_to_video", "image_to_video", "text_to_speech", "generate_message"]) {
      expect(caps).toContain(cap);
    }
  });
});

describe("ComfyCloudProvider — generation through the queue", () => {
  it("textToImage builds the body from the schema and decodes base64 output", async () => {
    const { fetchFn, calls } = fakeRouter({
      "bfl/flux-2-pro": {
        schema: openapi({
          prompt: { type: "string" },
          aspect_ratio: { type: "string", enum: ["1:1", "16:9"] },
          seed: { type: "integer" },
          output_format: { type: "string", enum: ["png", "jpeg"], default: "png" }
        }, ["prompt", "output_format"]),
        result: { result: { sample_b64: Buffer.from(PNG).toString("base64").repeat(30) } }
      }
    });
    const p = new TestProvider(fetchFn);
    const bytes = await p.textToImage({ model: { ...IMAGE_MODEL }, prompt: "a red cube", aspectRatio: "16:9", seed: 7.6, guidanceScale: 3 });
    expect(bytes[0]).toBe(0x89);
    const submit = calls.find((c) => c.method === "POST")!;
    expect(submit.url).toBe(`${BASE}/v2/models/bfl/flux-2-pro/requests`);
    expect(submit.headers["X-API-Key"]).toBe("test-key");
    expect(submit.headers["Idempotency-Key"]).toBeTruthy();
    // Undeclared guidance is dropped, the integer seed is rounded, and the
    // required enum is filled from its default.
    expect(submit.body).toEqual({ prompt: "a red cube", aspect_ratio: "16:9", seed: 8, output_format: "png" });
  });

  it("imageToVideo sends the start frame as a data URI and downloads the video URL without the key", async () => {
    const { fetchFn, calls } = fakeRouter({
      "kling/kling-v3": {
        schema: openapi({
          prompt: { type: "string" },
          image_url: { type: "string", format: "uri" },
          duration: { type: "string", enum: ["5", "10"] }
        }, ["prompt", "image_url"]),
        result: { data: { task_result: { videos: [{ url: "https://cdn.test/out.mp4" }] } } }
      }
    });
    const p = new TestProvider(fetchFn);
    const video = await p.imageToVideo(PNG, { model: { ...VIDEO_MODEL }, prompt: "slow dolly in", durationSeconds: 5 });
    expect(Array.from(video)).toEqual(Array.from(MP4));
    const submit = calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(submit.duration).toBe("5");
    expect(String(submit.image_url)).toMatch(/^data:image\/png;base64,/);
    const download = calls.find((c) => c.url.startsWith("https://cdn.test/"))!;
    expect(download.headers["X-API-Key"]).toBeUndefined();
  });

  it("imageToVideo sends the end frame to the model's last-frame field", async () => {
    const { fetchFn, calls } = fakeRouter({
      "kling/kling-v3": {
        schema: openapi({
          prompt: { type: "string" },
          image_url: { type: "string", format: "uri" },
          tail_image_url: { type: "string", format: "uri" }
        }, ["prompt", "image_url"]),
        result: { video: "https://cdn.test/out.mp4" }
      }
    });
    await new TestProvider(fetchFn).imageToVideo(PNG, { model: { ...VIDEO_MODEL }, prompt: "transition", endImage: PNG });
    const submit = calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(String(submit.image_url)).toMatch(/^data:image\/png;base64,/);
    expect(String(submit.tail_image_url)).toMatch(/^data:image\/png;base64,/);
  });

  it("imageToVideo refuses an end frame the model cannot take", async () => {
    const { fetchFn, calls } = fakeRouter({
      "kling/kling-v3": {
        schema: openapi({ prompt: { type: "string" }, image_url: { type: "string", format: "uri" } }, ["prompt", "image_url"]),
        result: { video: "https://cdn.test/out.mp4" }
      }
    });
    await expect(
      new TestProvider(fetchFn).imageToVideo(PNG, { model: { ...VIDEO_MODEL }, prompt: "transition", endImage: PNG })
    ).rejects.toThrow("Comfy model kling/kling-v3 takes no end frame");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("MiniMax H3: the end frame as a last_frame content part, as MinimaxHailuo03FirstLastFrameNode sends it", async () => {
    const part = { type: "object", properties: { type: { type: "string" }, text: { type: "string" }, role: { type: "string" } } };
    const { fetchFn, calls } = fakeRouter({
      "minimax/minimax-h3": {
        schema: openapi({ content: { type: "array", items: part }, duration: { type: "integer" } }, ["content"]),
        result: { video: "https://cdn.test/out.mp4" }
      }
    });
    await new TestProvider(fetchFn).imageToVideo(PNG, {
      model: { id: "minimax/minimax-h3", name: "H3", provider: PROVIDER_IDS.COMFY_CLOUD }, prompt: "pan", endImage: PNG
    });
    const submit = calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect((submit.content as Array<{ role?: string }>).map((p) => p.role)).toEqual([undefined, "first_frame", "last_frame"]);
  });

  it("FLUX 3 video: the end frame as a second keyframe, as Flux3ImageToVideoNode spreads its keyframes", async () => {
    const id = "bfl/flux-3-video";
    const { fetchFn, calls } = fakeRouter({
      [id]: {
        schema: openapi({ prompt: { type: "string" }, mode: { type: "string" }, keyframes: {} }, ["prompt"]),
        result: { video: "https://cdn.test/out.mp4" }
      }
    });
    await new TestProvider(fetchFn).imageToVideo(PNG, { model: { id, name: id, provider: PROVIDER_IDS.COMFY_CLOUD }, prompt: "x", endImage: PNG });
    const submit = calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    const b64 = Buffer.from(PNG).toString("base64");
    expect(submit).toMatchObject({ mode: "i2v", keyframes: [b64, b64] });
  });

  it("imageToImage refuses extra images a single-image field cannot hold", async () => {
    const { fetchFn, calls } = fakeRouter({
      "bfl/flux-2-pro": { schema: openapi({ prompt: { type: "string" }, input_image: { type: "string" } }, ["prompt"]), result: {} }
    });
    await expect(
      new TestProvider(fetchFn).imageToImage([PNG, PNG, PNG], { model: { ...IMAGE_MODEL }, prompt: "x" })
    ).rejects.toThrow("takes one input image, not 3");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("videoToVideo and textToSpeech refuse reference media the model has no field for", async () => {
    const { fetchFn } = fakeRouter({
      "kling/kling-v3": { schema: openapi({ prompt: { type: "string" }, video_url: { type: "string" } }, ["video_url"]), result: {} },
      "elevenlabs/eleven_v4": { schema: openapi({ text: { type: "string" } }, ["text"]), result: {} }
    });
    const provider = new TestProvider(fetchFn);
    await expect(
      provider.videoToVideo(MP4, { model: { ...VIDEO_MODEL }, prompt: "x", referenceImages: [PNG] })
    ).rejects.toThrow("Comfy model kling/kling-v3 takes no reference images");
    await expect(
      provider.textToSpeechEncoded({ model: "elevenlabs/eleven_v4", text: "hi", referenceAudio: PNG })
    ).rejects.toThrow("Comfy model elevenlabs/eleven_v4 takes no reference audio");
  });

  it("referenceToVideo refuses references the model has no field for, instead of dropping them", async () => {
    const { fetchFn, calls } = fakeRouter({
      "kling/kling-v3": { schema: openapi({ prompt: { type: "string" } }, ["prompt"]), result: { video: "https://cdn.test/out.mp4" } }
    });
    const provider = new TestProvider(fetchFn);
    const params = { model: { ...VIDEO_MODEL }, prompt: "x" };
    await expect(provider.referenceToVideo({ images: [PNG], videos: [] }, params)).rejects.toThrow(
      "Comfy model kling/kling-v3 takes no reference images"
    );
    await expect(provider.referenceToVideo({ images: [], videos: [MP4] }, params)).rejects.toThrow("takes no reference videos");
    await expect(provider.referenceToVideo({ images: [], videos: [], audios: [PNG] }, params)).rejects.toThrow("takes no reference audio");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("reads a raw binary result", async () => {
    const { fetchFn } = fakeRouter({
      "elevenlabs/eleven_v3": {
        schema: openapi({ text: { type: "string" }, voice_id: { type: "string" } }, ["text"]),
        result: new Uint8Array([1, 2, 3]),
        contentType: "audio/mpeg"
      }
    });
    const p = new TestProvider(fetchFn);
    const audio = await p.textToSpeechEncoded({ model: "elevenlabs/eleven_v3", text: "hi", voice: "Rachel" });
    expect(audio).toEqual({ data: new Uint8Array([1, 2, 3]), mimeType: "audio/mpeg" });
  });

  it("names missing required fields instead of submitting", async () => {
    const { fetchFn, calls } = fakeRouter({
      "kling/kling-v3": { schema: openapi({ prompt: { type: "string" }, mask_url: { type: "string" } }, ["prompt", "mask_url"]), result: {} }
    });
    const p = new TestProvider(fetchFn);
    await expect(p.textToVideo({ model: { ...VIDEO_MODEL }, prompt: "x" })).rejects.toThrow("needs mask_url");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("surfaces Router errors with status, error_type and field detail", async () => {
    const { fetchFn } = fakeRouter(
      { "bfl/flux-2-pro": { schema: openapi({ prompt: { type: "string" } }), result: {} } },
      { failSubmit: { status: 422, body: { detail: [{ loc: ["body", "prompt"], msg: "too long", type: "value_error" }] } } }
    );
    const p = new TestProvider(fetchFn);
    await expect(p.textToImage({ model: { ...IMAGE_MODEL }, prompt: "x" })).rejects.toThrow("(HTTP 422): body.prompt: too long");
  });

  it("maps insufficient credits to a top-up hint", async () => {
    const { fetchFn } = fakeRouter(
      { "bfl/flux-2-pro": { schema: openapi({ prompt: { type: "string" } }), result: {} } },
      { failSubmit: { status: 402, body: { detail: "not funded", error_type: "insufficient_credits" } } }
    );
    const p = new TestProvider(fetchFn);
    await expect(p.textToImage({ model: { ...IMAGE_MODEL }, prompt: "x" })).rejects.toThrow(/insufficient_credits.*platform\.comfy\.org/);
  });

  it("falls back to the synchronous route when the queue is not enabled", async () => {
    const { fetchFn, calls } = fakeRouter(
      { "bfl/flux-2-pro": { schema: openapi({ prompt: { type: "string" } }), result: { url: "https://cdn.test/a.png" } } },
      { failSubmit: { status: 403, body: { detail: "queue off", error_type: "not_enabled" } } }
    );
    const p = new TestProvider(fetchFn);
    await p.textToImage({ model: { ...IMAGE_MODEL }, prompt: "x" });
    expect(calls.some((c) => c.method === "POST" && c.url === `${BASE}/v2/models/bfl/flux-2-pro`)).toBe(true);
  });

  it("cancels the queued request on abort", async () => {
    const { fetchFn, calls } = fakeRouter({
      "kling/kling-v3": { schema: openapi({ prompt: { type: "string" } }), result: {} }
    });
    const controller = new AbortController();
    const slow = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/status")) {
        controller.abort(new Error("stop"));
      }
      return fetchFn(input, init);
    }) as typeof fetch;
    const p = new TestProvider(slow);
    await expect(
      p.textToVideo({ model: { ...VIDEO_MODEL }, prompt: "x", signal: controller.signal })
    ).rejects.toThrow();
    expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/requests/req-1/cancel"))).toBe(true);
  });
});

describe("ComfyCloudProvider — chat", () => {
  it("speaks Anthropic Messages for anthropic/* and parses tool calls", async () => {
    const { fetchFn, calls } = fakeRouter({
      "anthropic/claude-sonnet-5": {
        schema: openapi({ messages: { type: "array" }, max_tokens: { type: "integer" }, system: { type: "string" }, tools: { type: "array" } }, ["messages", "max_tokens"]),
        result: {
          content: [
            { type: "text", text: "Checking." },
            { type: "tool_use", id: "tu_1", name: "lookup", input: { q: "x" } }
          ],
          usage: { input_tokens: 10, output_tokens: 4 }
        }
      }
    });
    const p = new TestProvider(fetchFn);
    const message = await p.generateMessage({
      model: "anthropic/claude-sonnet-5",
      messages: [{ role: "system", content: "Be brief." }, { role: "user", content: "hi" }],
      tools: [{ name: "lookup", description: "find", inputSchema: { type: "object" } }]
    });
    expect(message).toEqual({ role: "assistant", content: "Checking.", toolCalls: [{ id: "tu_1", name: "lookup", args: { q: "x" } }] });
    const body = calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(body.system).toBe("Be brief.");
    expect(body.messages).toEqual([{ role: "user", content: [{ type: "text", text: "hi" }] }]);
    expect(body.tools).toEqual([{ name: "lookup", description: "find", input_schema: { type: "object" } }]);
  });

  it("speaks OpenAI chat completions otherwise and streams one done chunk", async () => {
    const { fetchFn } = fakeRouter({
      "openai/gpt-5": {
        schema: openapi({ messages: { type: "array" }, model: { type: "string" } }, ["messages"]),
        result: { choices: [{ message: { role: "assistant", content: "Hello" } }], usage: { prompt_tokens: 5, completion_tokens: 1 } }
      }
    });
    const p = new TestProvider(fetchFn);
    const items: unknown[] = [];
    for await (const item of p.generateMessages({ model: "openai/gpt-5", messages: [{ role: "user", content: "hi" }] })) items.push(item);
    expect(items).toEqual([{ type: "chunk", content: "Hello", done: true }]);
  });
});

describe("ComfyCloudProvider — real Router schemas", () => {
  it("Veo: one Vertex instance with the prompt and a base64 start frame", async () => {
    const body = await submittedBody("veo/veo-3.1-generate-001", (p, model) =>
      p.imageToVideo(PNG, { model, prompt: "a fox", aspectRatio: "16:9", durationSeconds: 8 })
    );
    expect(body.instances).toEqual([
      { prompt: "a fox", image: { bytesBase64Encoded: Buffer.from(PNG).toString("base64"), mimeType: "image/png" } }
    ]);
    expect(body.parameters).toMatchObject({ aspectRatio: "16:9", durationSeconds: 8 });
  });

  it("Qwen image: a single user message in input.messages", async () => {
    const body = await submittedBody("qwen/qwen-image-3.0", (p, model) => p.textToImage({ model, prompt: "a leaf" }));
    expect(body.input).toEqual({ messages: [{ role: "user", content: [{ text: "a leaf" }] }] });
  });

  it("Qwen image edit: images then the prompt in one message, as the Qwen Image 3 Edit node sends them", async () => {
    const body = await submittedBody("qwen/qwen-image-3.0", (p, model) =>
      p.imageToImage([PNG, PNG], { model, prompt: "swap the hats" })
    );
    expect(body.input).toEqual({
      messages: [{ role: "user", content: [{ image: DATA_PNG }, { image: DATA_PNG }, { text: "swap the hats" }] }]
    });
  });

  it("Qwen image: size uses the width*height form the schema documents", async () => {
    const explicit = await submittedBody("qwen/qwen-image-3.0", (p, model) =>
      p.textToImage({ model, prompt: "a leaf", width: 1024, height: 768 })
    );
    expect(explicit.parameters).toMatchObject({ size: "1024*768" });
    const fromAspect = await submittedBody("qwen/qwen-image-3.0", (p, model) =>
      p.textToImage({ model, prompt: "a leaf", aspectRatio: "16:9" })
    );
    expect(fromAspect.parameters).toMatchObject({ size: "1536*864" });
  });

  it("Qwen image: fits a size into the pixel area the schema documents", async () => {
    const tooLarge = await submittedBody("qwen/qwen-image-3.0", (p, model) =>
      p.textToImage({ model, prompt: "a leaf", width: 3641, height: 2048 })
    );
    expect(tooLarge.parameters).toMatchObject({ size: "3413*1919" });
    const tooSmall = await submittedBody("qwen/qwen-image-3.0", (p, model) =>
      p.textToImage({ model, prompt: "a leaf", width: 256, height: 256 })
    );
    expect(tooSmall.parameters).toMatchObject({ size: "512*512" });
  });

  it("FLUX 3 image: sends the resolution spelling the schema documents", async () => {
    const body = await submittedBody("bfl/flux-3-image", (p, model) =>
      p.textToImage({ model, prompt: "a leaf", resolution: "2K", aspectRatio: "16:9" })
    );
    expect(body).toMatchObject({ prompt: "a leaf", resolution: "2k", aspect_ratio: "16:9" });
  });

  it("drops a resolution the model does not accept instead of failing the job", async () => {
    const body = await submittedBody("bfl/flux-3-image", (p, model) =>
      p.textToImage({ model, prompt: "a leaf", resolution: "8K" })
    );
    expect(body).not.toHaveProperty("resolution");
  });

  it("Wan 2.7: the start frame as a typed media item, with a billing resolution", async () => {
    const body = await submittedBody("wan/wan2.7-i2v", (p, model) =>
      p.imageToVideo(PNG, { model, prompt: "waves", durationSeconds: 5 })
    );
    const input = body.input as Record<string, unknown>;
    expect(input.prompt).toBe("waves");
    expect(input.img_url).toBeUndefined();
    expect(input.media).toEqual([{ type: "first_frame", url: expect.stringMatching(/^data:image\/png;base64,/) }]);
    expect(body.parameters).toMatchObject({ duration: 5, resolution: "720P" });
  });

  it("Seedance: prompt and first frame as content parts", async () => {
    const body = await submittedBody("byteplus/dreamina-seedance-2-0-260128", (p, model) =>
      p.imageToVideo(PNG, { model, prompt: "dolly in" })
    );
    expect(body.content).toEqual([
      { type: "text", text: "dolly in" },
      { type: "image_url", image_url: { url: expect.stringMatching(/^data:image\/png;base64,/) }, role: "first_frame" }
    ]);
  });

  // Every BytePlus video model shares one Router input schema, saved for 2.0.
  const SEEDANCE_SCHEMA = "byteplus/dreamina-seedance-2-0-260128";

  it("Seedance 2.5: the end frame as a last_frame content part, as ByteDance2FirstLastFrameNode sends it", async () => {
    const body = await submittedBody("byteplus/dreamina-seedance-2-5-260628", (p, model) =>
      p.imageToVideo(PNG, { model, prompt: "dolly in", endImage: PNG, aspectRatio: "16:9", durationSeconds: 5 })
    , SEEDANCE_SCHEMA);
    expect(body.content).toEqual([
      { type: "text", text: "dolly in" },
      { type: "image_url", image_url: { url: DATA_PNG }, role: "first_frame" },
      { type: "image_url", image_url: { url: DATA_PNG }, role: "last_frame" }
    ]);
    // 2.5 keeps the first frame's aspect ratio and refuses a concrete one.
    expect(body).toMatchObject({ ratio: "adaptive", duration: 5 });
  });

  it("Seedance 2.0: last_frame content part, and the requested ratio is kept", async () => {
    const body = await submittedBody(SEEDANCE_SCHEMA, (p, model) =>
      p.imageToVideo(PNG, { model, prompt: "dolly in", endImage: PNG, aspectRatio: "9:16" })
    );
    expect((body.content as Array<{ role?: string }>).map((part) => part.role)).toEqual([
      undefined, "first_frame", "last_frame"
    ]);
    expect(body.ratio).toBe("9:16");
  });

  it("Seedance 1.0 pro fast: refuses an end frame, which no first-last-frame node offers for it", async () => {
    const id = "byteplus/seedance-1-0-pro-fast-251015";
    const { fetchFn, calls } = fakeRouter({ [id]: { schema: realSchema(SEEDANCE_SCHEMA), result: { video: "https://cdn.test/out.mp4" } } });
    await expect(
      new TestProvider(fetchFn).imageToVideo(PNG, { model: { id, name: id, provider: PROVIDER_IDS.COMFY_CLOUD }, prompt: "x", endImage: PNG })
    ).rejects.toThrow(`Comfy model ${id} takes no end frame`);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("Seedance 2.x references: reference_image and reference_audio parts, as ByteDance2ReferenceNodeV2 sends them", async () => {
    const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    const body = await submittedBody("byteplus/dreamina-seedance-2-5-260628", (p, model) =>
      p.referenceToVideo({ images: [PNG, PNG], videos: [], audios: [WAV] }, { model, prompt: "the cat from image 1" })
    , SEEDANCE_SCHEMA);
    expect(body.content).toEqual([
      { type: "text", text: "the cat from image 1" },
      { type: "image_url", image_url: { url: DATA_PNG }, role: "reference_image" },
      { type: "image_url", image_url: { url: DATA_PNG }, role: "reference_image" },
      { type: "audio_url", audio_url: { url: expect.stringMatching(/^data:audio\/wav;base64,/) }, role: "reference_audio" }
    ]);
  });

  it("Seedance 2.x references: one reference image is not mistaken for a first frame", async () => {
    const body = await submittedBody(SEEDANCE_SCHEMA, (p, model) =>
      p.referenceToVideo({ images: [PNG], videos: [] }, { model, prompt: "x" })
    );
    expect((body.content as Array<{ role?: string }>)[1].role).toBe("reference_image");
  });

  it("Seedance 2.x references: refuses a reference video, which the Router takes only by URL", async () => {
    const { fetchFn, calls } = fakeRouter({ [SEEDANCE_SCHEMA]: { schema: realSchema(SEEDANCE_SCHEMA), result: { video: "https://cdn.test/out.mp4" } } });
    await expect(
      new TestProvider(fetchFn).referenceToVideo(
        { images: [PNG], videos: [MP4] },
        { model: { id: SEEDANCE_SCHEMA, name: "s", provider: PROVIDER_IDS.COMFY_CLOUD }, prompt: "x" }
      )
    ).rejects.toThrow("takes reference videos only as public URLs");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("Veo: the end frame as lastFrame in the instance, as Veo3FirstLastFrameNode sends it", async () => {
    const b64 = Buffer.from(PNG).toString("base64");
    const body = await submittedBody("veo/veo-3.1-generate-001", (p, model) =>
      p.imageToVideo(PNG, { model, prompt: "a fox", endImage: PNG, durationSeconds: 6 })
    );
    expect(body.instances).toEqual([
      {
        prompt: "a fox",
        image: { bytesBase64Encoded: b64, mimeType: "image/png" },
        lastFrame: { bytesBase64Encoded: b64, mimeType: "image/png" }
      }
    ]);
    expect(body.parameters).toMatchObject({ durationSeconds: 6 });
  });

  it("Veo: refuses a second start image instead of dropping it", async () => {
    const id = "veo/veo-3.1-generate-001";
    const { fetchFn } = fakeRouter({ [id]: { schema: realSchema(id), result: {} } });
    await expect(
      new TestProvider(fetchFn).imageToImage([PNG, PNG], { model: { id, name: id, provider: PROVIDER_IDS.COMFY_CLOUD }, prompt: "x" })
    ).rejects.toThrow("takes one input image, not 2");
  });

  it("Wan 2.7: the end frame as a last_frame media item, as the Wan 2.7 Image to Video node sends it", async () => {
    const body = await submittedBody("wan/wan2.7-i2v", (p, model) =>
      p.imageToVideo(PNG, { model, prompt: "waves", endImage: PNG })
    );
    expect((body.input as Record<string, unknown>).media).toEqual([
      { type: "first_frame", url: DATA_PNG },
      { type: "last_frame", url: DATA_PNG }
    ]);
  });

  it("Wan 3.0: last_frame media item; HappyHorse, which takes a first frame only, refuses one", async () => {
    const wan3 = await submittedBody("wan/wan3.0-video", (p, model) =>
      p.imageToVideo(PNG, { model, prompt: "waves", endImage: PNG })
    , "wan/wan2.7-i2v");
    expect(((wan3.input as Record<string, unknown>).media as Array<{ type: string }>).map((m) => m.type)).toEqual([
      "first_frame", "last_frame"
    ]);
    const id = "wan/happyhorse-1.1-i2v";
    const { fetchFn } = fakeRouter({ [id]: { schema: realSchema("wan/wan2.7-i2v"), result: {} } });
    await expect(
      new TestProvider(fetchFn).imageToVideo(PNG, { model: { id, name: id, provider: PROVIDER_IDS.COMFY_CLOUD }, prompt: "x", endImage: PNG })
    ).rejects.toThrow(`Comfy model ${id} takes no end frame`);
  });

  it("Gemini Interactions: a string input, or typed parts with an image", async () => {
    const id = "gemini-interactions/gemini-omni-1.1-flash";
    const text = await submittedBody(id, (p, model) => p.textToImage({ model, prompt: "a cat" }));
    expect(text.input).toBe("a cat");
    const edit = await submittedBody(id, (p, model) => p.imageToImage([PNG], { model, prompt: "make it blue" }));
    expect(edit.input).toEqual([
      { type: "text", text: "make it blue" },
      { type: "image", data: Buffer.from(PNG).toString("base64"), mime_type: "image/png" }
    ]);
  });

  it("ElevenLabs v4: one dialogue turn with a default voice", async () => {
    const id = "elevenlabs/eleven_v4";
    const { fetchFn, calls } = fakeRouter({ [id]: { schema: realSchema(id), result: new Uint8Array([1, 2, 3]), contentType: "audio/mpeg" } });
    const audio = await new TestProvider(fetchFn).textToSpeechEncoded({ model: id, text: "hello" });
    expect(audio?.mimeType).toBe("audio/mpeg");
    const submit = calls.find((c) => c.method === "POST" && c.url.endsWith("/requests"));
    expect((submit?.body as Record<string, unknown>).inputs).toEqual([{ text: "hello", voice_id: expect.any(String) }]);
  });
});

describe("ComfyCloudProvider — mislabelled output", () => {
  it("takes an mp4 stored under an image key when the task wants video", async () => {
    const { fetchFn } = fakeRouter({
      "kling/kling-v3": { schema: openapi({ prompt: { type: "string" } }), result: { images: [{ url: "https://cdn.test/clip" }] } }
    });
    const bytes = await new TestProvider(fetchFn).textToVideo({ model: { ...VIDEO_MODEL }, prompt: "x" });
    expect(Array.from(bytes)).toEqual(Array.from(MP4));
  });
});

describe("comfy-router helpers", () => {
  it("mp4DurationSeconds reads the movie header", () => {
    const mvhd = new Uint8Array(40);
    const view = new DataView(mvhd.buffer);
    mvhd.set([0x6d, 0x76, 0x68, 0x64], 4); // "mvhd", version 0 at offset 8
    view.setUint32(20, 1000); // timescale
    view.setUint32(24, 4500); // duration
    expect(mp4DurationSeconds(mvhd)).toBe(4.5);
    expect(mp4DurationSeconds(MP4)).toBeUndefined();
  });

  it("parseInputSchema resolves $ref, required and enums", () => {
    const schema = parseInputSchema(openapi({ a: { type: "integer" }, b: { enum: ["x"] } }, ["a"]));
    expect(schema.fields.get("a")).toMatchObject({ type: "integer", required: true });
    expect(schema.fields.get("b")).toMatchObject({ type: "enum", enum: ["x"], required: false });
  });

  it("an unauthored schema accepts any field", () => {
    const b = new RouterArgsBuilder(parseInputSchema({ "x-comfy-input-schema-authored": false }));
    b.setFirst(["prompt"], "p").set("anything", 1);
    expect(b.body).toEqual({ prompt: "p", anything: 1 });
  });

  it("findMedia finds URLs and data URIs with their kinds", () => {
    const found = findMedia({ images: ["https://x.test/a.png"], video: { url: "https://x.test/v?sig=1" }, inline: "data:audio/mpeg;base64,AAAA" });
    expect(found.map((f) => f.kind)).toEqual(["image", "video", "audio"]);
  });
});
