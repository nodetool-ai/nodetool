/**
 * MuAPI contract suite: model discovery and both implemented capabilities,
 * against a mocked wire.
 *
 * These prove the provider's own rules — which payload MuAPI is sent, that the
 * job-creating POST is attempted once, that a result URL is screened and its
 * bytes are checked before they are handed back — not that a MuAPI endpoint
 * exists. Endpoint availability is not testable from here; the routes covered
 * are the two MuAPI documents as live.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { MuapiProvider } from "../../src/providers/muapi-provider.js";
import {
  MUAPI_MAX_OUTPUT_BYTES,
  MUAPI_MAX_UPLOAD_BYTES,
  muapiUploadImage,
  sanitizeMuapiText
} from "../../src/providers/muapi-transport.js";
import { runWithGenerationReceipt } from "../../src/generation-receipt.js";
import type { VideoModel } from "../../src/providers/types.js";

const API_KEY = "muapi-test-key";
const OUTPUT_URL = "https://cdn.muapi.ai/out/clip.mp4?sig=secret-token";

const videoModel = (id: string): VideoModel => ({ id, name: id, provider: "muapi" });

/** A minimal ISO-BMFF header, which is what the download sniffer reads. */
const MP4_BYTES = Uint8Array.from([
  0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 1
]);
/** A one-pixel-ish PNG header: enough for detectImageMime. */
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d
]);

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

interface WireOptions {
  capture?: { submitUrl?: string; submitBody?: Record<string, unknown>; uploadInit?: RequestInit };
  /** Status words returned before the terminal one, in order. */
  pending?: string[];
  terminal?: Record<string, unknown>;
  submitStatus?: number;
  downloadStatuses?: number[];
  downloadBytes?: Uint8Array;
  downloadHeaders?: Record<string, string>;
  outputUrl?: string;
  onPoll?: () => void;
}

function mockWire(opts: WireOptions = {}) {
  const outputUrl = opts.outputUrl ?? OUTPUT_URL;
  const counts = { submit: 0, poll: 0, upload: 0, download: 0 };
  const pending = [...(opts.pending ?? [])];
  const downloadStatuses = [...(opts.downloadStatuses ?? [])];

  global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/upload_file")) {
      counts.upload++;
      if (opts.capture) opts.capture.uploadInit = init;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ file_url: "https://files.muapi.ai/in.png" })
      } as Response;
    }
    if (u.includes("/predictions/")) {
      counts.poll++;
      opts.onPoll?.();
      const status = pending.shift();
      const body = status
        ? { status }
        : (opts.terminal ?? { status: "completed", outputs: [outputUrl], cost: 0.42 });
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify(body)
      } as Response;
    }
    if (u === outputUrl) {
      counts.download++;
      const status = downloadStatuses.shift() ?? 200;
      return {
        ok: status < 400,
        status,
        headers: new Headers(opts.downloadHeaders ?? {}),
        arrayBuffer: async () => (opts.downloadBytes ?? MP4_BYTES).buffer
      } as Response;
    }
    // Anything else is a submit.
    counts.submit++;
    if (opts.capture) {
      opts.capture.submitUrl = u;
      opts.capture.submitBody = JSON.parse(init!.body as string);
    }
    const status = opts.submitStatus ?? 200;
    return {
      ok: status < 400,
      status,
      headers: new Headers(),
      text: async () =>
        status < 400
          ? JSON.stringify({ request_id: "req-1" })
          : JSON.stringify({ error: `rejected key ${API_KEY}` })
    } as Response;
  }) as unknown as typeof fetch;

  return counts;
}

/** Poll instantly: the cadence is the provider's, the waiting is not the test's. */
const provider = (key: string = API_KEY): MuapiProvider =>
  new MuapiProvider({ MUAPI_API_KEY: key }, { pollIntervalMs: 0 });

describe("MuapiProvider model discovery", () => {
  it("lists the two live video routes with their option sets", async () => {
    const models = await provider().getAvailableVideoModels();
    expect(models.map((m) => m.id)).toEqual([
      "flux-3-text-to-video",
      "flux-3-image-to-video"
    ]);
    expect(models[0].supportedTasks).toEqual(["text_to_video"]);
    expect(models[1].supportedTasks).toEqual(["image_to_video"]);
    for (const model of models) {
      expect(model.provider).toBe("muapi");
      expect(model.resolutions).toContain("720p");
      expect(model.aspectRatios).toContain("16:9");
      expect(model.durations).toContain(5);
    }
  });

  it("offers no image models while the FLUX 3 image routes are coming soon", async () => {
    expect(await provider().getAvailableImageModels()).toEqual([]);
    await expect(
      provider().textToImage({ model: { id: "x", name: "x", provider: "muapi" }, prompt: "hi" })
    ).rejects.toThrow(/does not support textToImage/);
  });

  it("lists nothing without a key, so the picker cannot offer an unusable model", async () => {
    expect(await provider("").getAvailableVideoModels()).toEqual([]);
  });
});

describe("MuapiProvider.textToVideo", () => {
  it("maps canonical params onto MuAPI's payload and returns the clip", async () => {
    const capture: WireOptions["capture"] = {};
    mockWire({ capture });

    const bytes = await provider().textToVideo({
      model: videoModel("flux-3-text-to-video"),
      prompt: "  a kite over the sea  ",
      negativePrompt: "blur",
      aspectRatio: "9:16",
      resolution: "1080p",
      durationSeconds: 8,
      seed: 7
    } as never);

    expect(capture.submitUrl).toBe(
      "https://api.muapi.ai/api/v1/flux-3-text-to-video"
    );
    expect(capture.submitBody).toEqual({
      prompt: "a kite over the sea\n\nDo not include: blur",
      duration: 8,
      aspect_ratio: "9:16",
      resolution: "1080p",
      seed: 7
    });
    expect(Array.from(bytes)).toEqual(Array.from(MP4_BYTES));
  });

  it("clamps a duration outside the 4-10s window and converts frames", async () => {
    const capture: WireOptions["capture"] = {};
    mockWire({ capture });
    await provider().textToVideo({
      model: videoModel("flux-3-text-to-video"),
      prompt: "p",
      numFrames: 480
    } as never);
    expect(capture.submitBody?.duration).toBe(10);

    mockWire({ capture });
    await provider().textToVideo({
      model: videoModel("flux-3-text-to-video"),
      prompt: "p",
      durationSeconds: 1
    } as never);
    expect(capture.submitBody?.duration).toBe(4);
  });

  it("names the supported values instead of sending a 422", async () => {
    mockWire();
    await expect(
      provider().textToVideo({
        model: videoModel("flux-3-text-to-video"),
        prompt: "p",
        aspectRatio: "5:2"
      } as never)
    ).rejects.toThrow(/does not support aspect ratio "5:2"/);
  });

  it("refuses an empty prompt and a missing key before spending a request", async () => {
    const counts = mockWire();
    await expect(
      provider().textToVideo({ model: videoModel("flux-3-text-to-video"), prompt: "  " } as never)
    ).rejects.toThrow(/prompt cannot be empty/);
    await expect(
      provider("").textToVideo({ model: videoModel("flux-3-text-to-video"), prompt: "p" } as never)
    ).rejects.toThrow(/MUAPI_API_KEY is not configured/);
    expect(counts.submit).toBe(0);
  });

  it("records the request id and the reported cost on the generation receipt", async () => {
    mockWire();
    const { receipt } = await runWithGenerationReceipt(() =>
      provider().textToVideo({
        model: videoModel("flux-3-text-to-video"),
        prompt: "p"
      } as never)
    );
    expect(receipt).toEqual({ provider_request_id: "req-1", cost: 0.42 });
  });
});

describe("MuapiProvider.imageToVideo", () => {
  it("uploads the source image as multipart and references its URL", async () => {
    const capture: WireOptions["capture"] = {};
    const counts = mockWire({ capture });

    await provider().imageToVideo([PNG_BYTES], {
      model: videoModel("flux-3-image-to-video"),
      prompt: "pan right"
    } as never);

    expect(counts.upload).toBe(1);
    const form = capture.uploadInit?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const file = form.get("file") as File;
    expect(file.type).toBe("image/png");
    expect(capture.uploadInit?.method).toBe("POST");
    expect(
      (capture.uploadInit?.headers as Record<string, string>)["x-api-key"]
    ).toBe(API_KEY);
    expect(capture.submitBody?.images_list).toEqual([
      "https://files.muapi.ai/in.png"
    ]);
  });

  it("refuses a source image over the 10 MB limit without uploading", async () => {
    const counts = mockWire();
    const tooBig = new Uint8Array(MUAPI_MAX_UPLOAD_BYTES + 1);
    tooBig.set(PNG_BYTES);
    await expect(
      provider().imageToVideo([tooBig], {
        model: videoModel("flux-3-image-to-video"),
        prompt: "p"
      } as never)
    ).rejects.toThrow(
      new RegExp(`up to ${MUAPI_MAX_UPLOAD_BYTES} bytes`)
    );
    expect(counts.upload).toBe(0);
  });

  it("refuses a source that is not an image", async () => {
    const counts = mockWire();
    await expect(
      provider().imageToVideo([MP4_BYTES], {
        model: videoModel("flux-3-image-to-video"),
        prompt: "p"
      } as never)
    ).rejects.toThrow(/takes an image as the source frame, got video\/mp4/);
    expect(counts.upload).toBe(0);
  });

  it("refuses an empty image list", async () => {
    mockWire();
    await expect(
      provider().imageToVideo([new Uint8Array()], {
        model: videoModel("flux-3-image-to-video"),
        prompt: "p"
      } as never)
    ).rejects.toThrow(/image cannot be empty/);
  });

  it("rejects an upload URL that points at a private address", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ file_url: "http://169.254.169.254/latest" })
    })) as unknown as typeof fetch;

    await expect(muapiUploadImage(API_KEY, PNG_BYTES)).rejects.toThrow();
  });
});

describe("MuAPI transport rules", () => {
  it("attempts the job-creating POST exactly once on a 5xx", async () => {
    const counts = mockWire({ submitStatus: 503 });
    await expect(
      provider().textToVideo({ model: videoModel("flux-3-text-to-video"), prompt: "p" } as never)
    ).rejects.toThrow(/submit failed: 503/);
    expect(counts.submit).toBe(1);
  });

  it("keeps the api key out of a rejection message", async () => {
    mockWire({ submitStatus: 400 });
    await expect(
      provider().textToVideo({ model: videoModel("flux-3-text-to-video"), prompt: "p" } as never)
    ).rejects.toThrow(/<redacted-api-key>/);
  });

  it("redacts a signed URL's query string", () => {
    expect(
      sanitizeMuapiText("see https://cdn.muapi.ai/a.mp4?sig=abc now", API_KEY)
    ).toBe("see https://cdn.muapi.ai/a.mp4?<redacted> now");
  });

  it("polls until a terminal success, then downloads", async () => {
    const counts = mockWire({ pending: ["queued", "processing"] });
    await provider().textToVideo({
      model: videoModel("flux-3-text-to-video"),
      prompt: "p",
      timeoutSeconds: 30
    } as never);
    expect(counts.poll).toBe(3);
    expect(counts.download).toBe(1);
  });

  it("treats a result body that names an output URL as finished", async () => {
    // Without this, a completed job whose body omits the status word polls to
    // exhaustion and is reported as a timeout.
    const counts = mockWire({ terminal: { outputs: [OUTPUT_URL] } });
    await provider().textToVideo({
      model: videoModel("flux-3-text-to-video"),
      prompt: "p"
    } as never);
    expect(counts.poll).toBe(1);
  });

  it("reports MuAPI's `failure` status as a job failure, not a timeout", async () => {
    mockWire({ terminal: { status: "failure", error: "content policy" } });
    await expect(
      provider().textToVideo({ model: videoModel("flux-3-text-to-video"), prompt: "p" } as never)
    ).rejects.toThrow(/MuAPI generation failed: content policy/);
  });

  it("times out once the polling budget derived from timeoutSeconds runs out", async () => {
    mockWire({ pending: Array(20).fill("processing") });
    await expect(
      provider().textToVideo({
        model: videoModel("flux-3-text-to-video"),
        prompt: "p",
        // 5s budget at a 5s poll interval is a single attempt.
        timeoutSeconds: 5
      } as never)
    ).rejects.toThrow(/did not finish within 1 poll attempts/);
  });

  it("stops polling when the caller aborts", async () => {
    const controller = new AbortController();
    mockWire({
      pending: Array(20).fill("processing"),
      onPoll: () => controller.abort()
    });
    await expect(
      provider().textToVideo({
        model: videoModel("flux-3-text-to-video"),
        prompt: "p",
        signal: controller.signal
      } as never)
    ).rejects.toThrow();
  });

  it("retries a transient download failure rather than discarding a billed result", async () => {
    const counts = mockWire({ downloadStatuses: [503, 200] });
    const bytes = await provider().textToVideo({
      model: videoModel("flux-3-text-to-video"),
      prompt: "p"
    } as never);
    expect(counts.download).toBe(2);
    expect(bytes.length).toBe(MP4_BYTES.length);
  });

  it("refuses a result URL pointing at a private address", async () => {
    mockWire({
      terminal: { status: "completed", outputs: ["http://127.0.0.1:8080/x.mp4"] },
      outputUrl: "http://127.0.0.1:8080/x.mp4"
    });
    await expect(
      provider().textToVideo({ model: videoModel("flux-3-text-to-video"), prompt: "p" } as never)
    ).rejects.toThrow();
  });

  it("refuses a result that redirects into a private address", async () => {
    // A predicate on the first URL is not enough — only the protected fetch
    // re-checks each hop, which is what this pins. The rejection is thrown, so
    // the download's retry budget runs first; fake timers skip its backoff.
    mockWire({
      downloadStatuses: [302, 302, 302, 302, 302, 302],
      downloadHeaders: { location: "http://169.254.169.254/latest/meta-data" }
    });
    vi.useFakeTimers();
    const assertion = expect(
      provider().textToVideo({ model: videoModel("flux-3-text-to-video"), prompt: "p" } as never)
    ).rejects.toThrow(/Refusing to fetch unsafe URL/);
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
  });

  it("refuses an oversized result", async () => {
    mockWire({
      downloadHeaders: {
        "content-length": String(MUAPI_MAX_OUTPUT_BYTES + 1)
      }
    });
    await expect(
      provider().textToVideo({ model: videoModel("flux-3-text-to-video"), prompt: "p" } as never)
    ).rejects.toThrow(new RegExp(`exceeds the ${MUAPI_MAX_OUTPUT_BYTES} byte limit`));
  });

  it("refuses a result whose bytes are not video", async () => {
    mockWire({ downloadBytes: PNG_BYTES });
    await expect(
      provider().textToVideo({ model: videoModel("flux-3-text-to-video"), prompt: "p" } as never)
    ).rejects.toThrow(/returned image\/png where video bytes were expected/);
  });

  it("refuses a result body with no output URL", async () => {
    mockWire({ terminal: { status: "completed" } });
    await expect(
      provider().textToVideo({ model: videoModel("flux-3-text-to-video"), prompt: "p" } as never)
    ).rejects.toThrow(/carried no output URL/);
  });
});
