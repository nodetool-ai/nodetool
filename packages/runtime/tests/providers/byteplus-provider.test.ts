import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BytePlusProvider } from "../../src/providers/byteplus-provider.js";
import { safeFetch } from "../../src/providers/safe-url.js";

vi.mock("../../src/generation-receipt.js", () => ({
  recordGenerationReceiptAsync: vi.fn(async () => {})
}));
vi.mock("../../src/providers/safe-url.js", () => ({
  safeFetch: vi.fn(async () => new Response(new Uint8Array([7, 8, 9])))
}));

const API = "https://ark.ap-southeast.bytepluses.com/api/v3";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70]);
const IMAGE_MODEL = { id: "seedream-4-5-251128", name: "Seedream 4.5", provider: "byteplus" as const };
const VIDEO_MODEL = { id: "dreamina-seedance-2-0-260128", name: "Seedance 2.0", provider: "byteplus" as const };

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function make(fetchFn: ReturnType<typeof vi.fn>, secrets: Record<string, string> = {}): BytePlusProvider {
  return new BytePlusProvider(
    { BYTEPLUS_ARK_API_KEY: "ark-test", ...secrets },
    { fetchFn: fetchFn as unknown as typeof fetch }
  );
}

function call(fetchMock: ReturnType<typeof vi.fn>, index: number): { url: string; init: RequestInit; body: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init, body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {} };
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error })
  );
  await vi.runAllTimersAsync();
  const result = await settled;
  if ("error" in result) throw result.error;
  return result.value;
}

describe("BytePlusProvider", () => {
  const savedBase = process.env["BYTEPLUS_ARK_BASE_URL"];
  beforeEach(() => {
    delete process.env["BYTEPLUS_ARK_BASE_URL"];
    vi.mocked(safeFetch).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    if (savedBase === undefined) delete process.env["BYTEPLUS_ARK_BASE_URL"];
    else process.env["BYTEPLUS_ARK_BASE_URL"] = savedBase;
  });

  it("requires an API key and reports its secret", () => {
    expect(() => new BytePlusProvider({})).toThrow("BYTEPLUS_ARK_API_KEY");
    expect(() => new BytePlusProvider({ BYTEPLUS_ARK_API_KEY: "  " })).toThrow("BYTEPLUS_ARK_API_KEY");
    expect(BytePlusProvider.requiredSecrets()).toEqual(["BYTEPLUS_ARK_API_KEY"]);
    const provider = make(vi.fn());
    expect(provider.provider).toBe("byteplus");
    expect(provider.getContainerEnv()).toEqual({ BYTEPLUS_ARK_API_KEY: "ark-test" });
  });

  it("honors a region base URL override and passes it to containers", async () => {
    const fetchMock = vi.fn(async () => reply({ object: "list", data: [] }));
    const provider = make(fetchMock, { BYTEPLUS_ARK_BASE_URL: "https://ark.eu-west.bytepluses.com/api/v3/" });
    await provider.getAvailableLanguageModels();
    expect(call(fetchMock, 0).url).toBe("https://ark.eu-west.bytepluses.com/api/v3/models");
    expect(provider.getContainerEnv()).toEqual({
      BYTEPLUS_ARK_API_KEY: "ark-test",
      BYTEPLUS_ARK_BASE_URL: "https://ark.eu-west.bytepluses.com/api/v3"
    });
  });

  it("lists text-output models from GET /models", async () => {
    // Row shape from the Ark Models API reference.
    const fetchMock = vi.fn(async () =>
      reply({
        object: "list",
        data: [
          {
            id: "seed-2-0-pro-260328",
            object: "model",
            name: "seed-2-0-pro",
            version: "260328",
            domain: "VLM",
            task_type: ["VisualQuestionAnswering", "TextGeneration"],
            modalities: { input_modalities: ["text", "image", "video"], output_modalities: ["text"] }
          },
          {
            id: "seedream-4-5-251128",
            object: "model",
            modalities: { input_modalities: ["text", "image"], output_modalities: ["image"] }
          },
          { id: "seed-1-6-250915", object: "model", task_type: ["TextGeneration"] },
          { id: "some-embedding", object: "model", task_type: ["Embedding"] }
        ]
      })
    );
    const models = await make(fetchMock).getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "seed-2-0-pro-260328", name: "seed-2-0-pro-260328", provider: "byteplus" },
      { id: "seed-1-6-250915", name: "seed-1-6-250915", provider: "byteplus" }
    ]);
    const { url, init } = call(fetchMock, 0);
    expect(url).toBe(`${API}/models`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ark-test");
  });

  it("falls back to the built-in Seed list when the listing fails", async () => {
    const fetchMock = vi.fn(async () => reply({ error: { code: "NotFound", message: "no" } }, 404));
    const models = await make(fetchMock).getAvailableLanguageModels();
    expect(models.map((model) => model.id)).toContain("dola-seed-2-1-turbo-260628");
    expect(models.every((model) => model.provider === "byteplus")).toBe(true);
  });

  it("advertises the Seedream and Seedance catalogs", async () => {
    const provider = make(vi.fn());
    const images = await provider.getAvailableImageModels();
    expect(images.map((model) => model.id)).toEqual([
      "dola-seedream-5-0-pro-260628",
      "seedream-5-0-260128",
      "seedream-5-0-lite-260128",
      "seedream-4-5-251128",
      "seedream-4-0-250828"
    ]);
    expect(images[0].resolutions).toEqual(["1K", "1.5K", "2K"]);

    const videos = await provider.getAvailableVideoModels();
    expect(videos.map((model) => model.id)).toEqual([
      "dreamina-seedance-2-5-260628",
      "dreamina-seedance-2-0-260128",
      "dreamina-seedance-2-0-fast-260128",
      "dreamina-seedance-2-0-mini-260615",
      "seedance-1-5-pro-251215",
      "seedance-1-0-pro-250528",
      "seedance-1-0-pro-fast-251015"
    ]);
    expect(videos[0].durations?.[0]).toBe(4);
    expect(videos[0].durations?.at(-1)).toBe(30);
    expect(videos[1].resolutions).toContain("4k");
    expect(videos[5].durations?.[0]).toBe(2);
    expect(videos[6].endFrame).toBe("none");
    expect(videos.every((model) => model.supportedTasks?.includes("image_to_video"))).toBe(true);
  });

  describe("images", () => {
    it("posts a Seedream text-to-image request and decodes b64_json", async () => {
      const fetchMock = vi.fn(async () =>
        reply({
          model: "seedream-4-5-251128",
          created: 1757321139,
          data: [{ b64_json: Buffer.from(PNG).toString("base64"), size: "2560x1440" }],
          usage: { generated_images: 1, output_tokens: 14400, total_tokens: 14400 }
        })
      );
      const bytes = await make(fetchMock).textToImage({
        model: IMAGE_MODEL,
        prompt: "a lighthouse",
        negativePrompt: "people",
        aspectRatio: "16:9"
      });
      expect(Array.from(bytes)).toEqual(Array.from(PNG));
      const { url, init, body } = call(fetchMock, 0);
      expect(url).toBe(`${API}/images/generations`);
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({ Authorization: "Bearer ark-test", "Content-Type": "application/json" });
      expect(body).toEqual({
        model: "seedream-4-5-251128",
        prompt: "a lighthouse\n\nDo not include: people",
        response_format: "b64_json",
        watermark: false,
        // 16:9 at the default 2K tier: about 2048 x 2048 pixels, in 16 px steps.
        size: "2736x1536"
      });
    });

    it("sizes requests by tier, explicit pixels, and the model's pixel floor", async () => {
      const ok = () => reply({ data: [{ b64_json: Buffer.from(PNG).toString("base64") }] });
      const fetchMock = vi.fn(async () => ok());
      const provider = make(fetchMock);
      await provider.textToImage({ model: IMAGE_MODEL, prompt: "p", resolution: "4K" });
      await provider.textToImage({ model: IMAGE_MODEL, prompt: "p", width: 3000, height: 2000 });
      await provider.textToImage({ model: IMAGE_MODEL, prompt: "p" });
      await provider.textToImage({
        model: { ...IMAGE_MODEL, id: "dola-seedream-5-0-pro-260628" },
        prompt: "p",
        aspectRatio: "1:1",
        resolution: "1K"
      });
      expect(call(fetchMock, 0).body.size).toBe("4K");
      expect(call(fetchMock, 1).body.size).toBe("3000x2000");
      expect(call(fetchMock, 2).body).not.toHaveProperty("size");
      expect(call(fetchMock, 3).body.size).toBe("1024x1024");
    });

    it("sends reference images as data URIs for image-to-image", async () => {
      const fetchMock = vi.fn(async () => reply({ data: [{ b64_json: Buffer.from(PNG).toString("base64") }] }));
      const provider = make(fetchMock);
      await provider.imageToImage([PNG], { model: IMAGE_MODEL, prompt: "make it night" });
      await provider.imageToImage([PNG, JPEG], { model: IMAGE_MODEL, prompt: "merge" });
      expect(call(fetchMock, 0).body.image).toBe(`data:image/png;base64,${Buffer.from(PNG).toString("base64")}`);
      expect(call(fetchMock, 1).body.image).toEqual([
        `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
        `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`
      ]);
    });

    it("rejects too many references and unknown models before calling Ark", async () => {
      const fetchMock = vi.fn();
      const provider = make(fetchMock);
      const pro = { ...IMAGE_MODEL, id: "dola-seedream-5-0-pro-260628" };
      await expect(provider.imageToImage(Array(11).fill(PNG), { model: pro, prompt: "p" })).rejects.toThrow("at most 10");
      await expect(provider.textToImage({ model: { ...IMAGE_MODEL, id: "nope" }, prompt: "p" })).rejects.toThrow(
        "Unknown BytePlus image model"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces Ark error bodies", async () => {
      const fetchMock = vi.fn(async () =>
        reply({ error: { code: "InvalidParameter", message: "size is invalid" } }, 400)
      );
      await expect(make(fetchMock).textToImage({ model: IMAGE_MODEL, prompt: "p" })).rejects.toThrow(
        "BytePlus image generation failed: InvalidParameter: size is invalid"
      );
      const perImage = vi.fn(async () =>
        reply({ data: [{ error: { code: "OutputImageSensitiveContentDetected", message: "blocked" } }] })
      );
      await expect(make(perImage).textToImage({ model: IMAGE_MODEL, prompt: "p" })).rejects.toThrow(
        "OutputImageSensitiveContentDetected: blocked"
      );
    });
  });

  describe("video", () => {
    it("creates a Seedance text-to-video task, polls it, and downloads the result", async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(reply({ id: "cgt-20260101-abc" }))
        .mockResolvedValueOnce(reply({ id: "cgt-20260101-abc", model: VIDEO_MODEL.id, status: "queued" }))
        .mockResolvedValueOnce(reply({ id: "cgt-20260101-abc", model: VIDEO_MODEL.id, status: "running" }))
        .mockResolvedValueOnce(
          reply({
            id: "cgt-20260101-abc",
            model: VIDEO_MODEL.id,
            status: "succeeded",
            content: { video_url: "https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/x.mp4" },
            usage: { completion_tokens: 108900, total_tokens: 108900 },
            created_at: 1767225600,
            updated_at: 1767225660
          })
        );
      const bytes = await settle(
        make(fetchMock).textToVideo({
          model: VIDEO_MODEL,
          prompt: "a cat surfing",
          aspectRatio: "16:9",
          resolution: "1080p",
          durationSeconds: 20,
          seed: 42
        })
      );
      expect(Array.from(bytes)).toEqual([7, 8, 9]);

      const create = call(fetchMock, 0);
      expect(create.url).toBe(`${API}/contents/generations/tasks`);
      expect(create.init.method).toBe("POST");
      expect(create.body).toEqual({
        model: VIDEO_MODEL.id,
        content: [{ type: "text", text: "a cat surfing" }],
        watermark: false,
        resolution: "1080p",
        ratio: "16:9",
        duration: 15
      });
      expect(call(fetchMock, 1).url).toBe(`${API}/contents/generations/tasks/cgt-20260101-abc`);
      expect(call(fetchMock, 1).init.method).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(vi.mocked(safeFetch).mock.calls[0][0]).toBe(
        "https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/x.mp4"
      );
    });

    it("sends first and last frames for image-to-video and seed only where documented", async () => {
      vi.useFakeTimers();
      const done = () => reply({ id: "t1", status: "succeeded", content: { video_url: "https://cdn.example/v.mp4" } });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(reply({ id: "t1" }))
        .mockResolvedValueOnce(done())
        .mockResolvedValueOnce(reply({ id: "t2" }))
        .mockResolvedValueOnce(done());
      const provider = make(fetchMock);
      await settle(
        provider.imageToVideo(PNG, {
          model: VIDEO_MODEL,
          prompt: "zoom out",
          endImage: JPEG,
          aspectRatio: "adaptive",
          resolution: "8k"
        })
      );
      expect(call(fetchMock, 0).body).toEqual({
        model: VIDEO_MODEL.id,
        content: [
          { type: "text", text: "zoom out" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}` }, role: "first_frame" },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}` }, role: "last_frame" }
        ],
        watermark: false,
        ratio: "adaptive"
      });

      await settle(
        provider.textToVideo({
          model: { ...VIDEO_MODEL, id: "seedance-1-0-pro-250528" },
          prompt: "p",
          aspectRatio: "adaptive",
          durationSeconds: 1,
          seed: 7
        })
      );
      // Seedance 1.0 refuses adaptive for text-to-video, takes 2-12 s, and takes a seed.
      expect(call(fetchMock, 2).body).toEqual({
        model: "seedance-1-0-pro-250528",
        content: [{ type: "text", text: "p" }],
        watermark: false,
        duration: 2,
        seed: 7
      });
    });

    it("refuses a last frame on Seedance 1.0 Pro Fast", async () => {
      const fetchMock = vi.fn();
      await expect(
        make(fetchMock).imageToVideo(PNG, {
          model: { ...VIDEO_MODEL, id: "seedance-1-0-pro-fast-251015" },
          endImage: PNG
        })
      ).rejects.toThrow("does not take a last frame");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reports a failed task with its error code", async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(reply({ id: "t3" }))
        .mockResolvedValueOnce(
          reply({ id: "t3", status: "failed", error: { code: "OutputVideoSensitiveContentDetected", message: "blocked" } })
        );
      await expect(settle(make(fetchMock).textToVideo({ model: VIDEO_MODEL, prompt: "p" }))).rejects.toThrow(
        "BytePlus video task t3 failed: OutputVideoSensitiveContentDetected: blocked"
      );
      expect(safeFetch).not.toHaveBeenCalled();
    });

    it("treats an expired task as terminal", async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(reply({ id: "t4" }))
        .mockResolvedValueOnce(reply({ id: "t4", status: "expired" }));
      await expect(settle(make(fetchMock).textToVideo({ model: VIDEO_MODEL, prompt: "p" }))).rejects.toThrow(
        "BytePlus video task t4 expired"
      );
    });

    it("does not retry a failed task creation", async () => {
      const fetchMock = vi.fn(async () =>
        reply({ error: { code: "InternalServiceError", message: "try later" } }, 500)
      );
      await expect(make(fetchMock).textToVideo({ model: VIDEO_MODEL, prompt: "p" })).rejects.toThrow(
        "BytePlus video task creation failed: InternalServiceError: try later"
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("times out a task that never settles", async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn(async (url: string) =>
        url.endsWith("/tasks") ? reply({ id: "t5" }) : reply({ id: "t5", status: "running" })
      );
      await expect(
        settle(make(fetchMock).textToVideo({ model: VIDEO_MODEL, prompt: "p", timeoutSeconds: 25 }))
      ).rejects.toThrow("timed out while running");
    });
  });
});
