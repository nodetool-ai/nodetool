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
  readBodyWithLimit,
  readMuapiCost,
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

/** One-chunk body stream, as a real fetch would hand back. */
function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}

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
        : (opts.terminal ?? {
            status: "completed",
            outputs: [outputUrl],
            // The shape MuAPI documents: the charge is nested, not scalar.
            cost: { amount_usd: 0.42 }
          });
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
      const payload = opts.downloadBytes ?? MP4_BYTES;
      return {
        ok: status < 400,
        status,
        headers: new Headers(opts.downloadHeaders ?? {}),
        // A real download is streamed, so the mock is too — the size ceiling is
        // enforced chunk by chunk and would go untested against a whole buffer.
        // Rejecting here pins that: buffering the result first fails the suite.
        body: streamOf(payload),
        arrayBuffer: async () => {
          throw new Error("the download must read the body as a stream");
        }
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
      // The routes document 720p/1080p and 5-20s; offering anything else puts a
      // value in the picker that comes back a 422.
      expect(model.resolutions).toEqual(["720p", "1080p"]);
      expect(model.aspectRatios).toContain("16:9");
      expect(model.durations).toContain(5);
      expect(model.durations).toContain(20);
      expect(model.durations).not.toContain(4);
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

  it("passes a duration inside the 5-20s window through, and converts frames", async () => {
    const capture: WireOptions["capture"] = {};
    mockWire({ capture });
    // 480 frames at 24fps is 20s — the top of the window, not a clamp target.
    await provider().textToVideo({
      model: videoModel("flux-3-text-to-video"),
      prompt: "p",
      numFrames: 480
    } as never);
    expect(capture.submitBody?.duration).toBe(20);

    mockWire({ capture });
    await provider().textToVideo({
      model: videoModel("flux-3-text-to-video"),
      prompt: "p",
      durationSeconds: 15
    } as never);
    expect(capture.submitBody?.duration).toBe(15);
  });

  it("clamps a duration outside the 5-20s window", async () => {
    const capture: WireOptions["capture"] = {};
    mockWire({ capture });
    await provider().textToVideo({
      model: videoModel("flux-3-text-to-video"),
      prompt: "p",
      durationSeconds: 1
    } as never);
    expect(capture.submitBody?.duration).toBe(5);

    mockWire({ capture });
    await provider().textToVideo({
      model: videoModel("flux-3-text-to-video"),
      prompt: "p",
      durationSeconds: 90
    } as never);
    expect(capture.submitBody?.duration).toBe(20);
  });

  it("refuses a resolution the routes do not document", async () => {
    mockWire();
    await expect(
      provider().textToVideo({
        model: videoModel("flux-3-text-to-video"),
        prompt: "p",
        resolution: "480p"
      } as never)
    ).rejects.toThrow(/does not support resolution "480p"/);
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

  it("leaves the receipt unpriced when the result reports no charge", async () => {
    mockWire({ terminal: { status: "completed", outputs: [OUTPUT_URL] } });
    const { receipt } = await runWithGenerationReceipt(() =>
      provider().textToVideo({
        model: videoModel("flux-3-text-to-video"),
        prompt: "p"
      } as never)
    );
    expect(receipt).toEqual({ provider_request_id: "req-1" });
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
    // The route names its source frame `image_url`; anything else submits a
    // job with no image at all.
    expect(capture.submitBody?.image_url).toBe("https://files.muapi.ai/in.png");
    expect(capture.submitBody).not.toHaveProperty("images_list");
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

  it("reads the charge out of MuAPI's nested cost object", () => {
    expect(readMuapiCost({ cost: { amount_usd: 0.42, currency: "USD" } })).toBe(
      0.42
    );
    expect(readMuapiCost({ cost: "0.31" })).toBe(0.31);
    expect(readMuapiCost({ credits_used: 12 })).toBe(12);
    expect(readMuapiCost({ cost: { currency: "USD" } })).toBeNull();
    expect(readMuapiCost({ status: "completed" })).toBeNull();
  });

  it("stops reading a body once it crosses the limit, without buffering it", async () => {
    let cancelled = false;
    let emitted = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        emitted++;
        if (emitted > 100) return controller.close();
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelled = true;
      }
    });

    await expect(
      readBodyWithLimit({ body: stream } as Response, 20, "too large")
    ).rejects.toThrow("too large");
    // 8-byte chunks against a 20-byte limit: it gives up around the third, and
    // the point is that it never walks the remaining 800 bytes.
    expect(emitted).toBeLessThan(6);
    expect(cancelled).toBe(true);
  });

  it("returns a body that stays under the limit", async () => {
    const response = { body: streamOf(MP4_BYTES) } as Response;
    const bytes = await readBodyWithLimit(response, 1024, "too large");
    expect(Array.from(bytes)).toEqual(Array.from(MP4_BYTES));
  });

  it("refuses a result body with no output URL", async () => {
    mockWire({ terminal: { status: "completed" } });
    await expect(
      provider().textToVideo({ model: videoModel("flux-3-text-to-video"), prompt: "p" } as never)
    ).rejects.toThrow(/carried no output URL/);
  });
});
