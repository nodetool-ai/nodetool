/**
 * KieProvider's endpoint surface: callEndpoint for the job API, Suno and
 * direct routes, uploadMedia, downloadMedia and fetchBillingCost. `fetch` is
 * stubbed at the provider boundary, so nothing reaches the network.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KieProvider } from "../../src/providers/kie-provider.js";
import {
  hasPendingWebhook,
  resolveWebhook
} from "../../src/providers/kie-webhook-registry.js";

interface Call {
  url: string;
  method: string;
  body?: unknown;
  form?: FormData;
}

type Reply = Response | ((call: Call) => Response | Promise<Response>);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Stub fetch with replies keyed by URL substring, in registration order. */
function stubFetch(routes: Array<[string, Reply | Reply[]]>): Call[] {
  const calls: Call[] = [];
  const queues = routes.map(([match, reply]) => ({
    match,
    replies: Array.isArray(reply) ? [...reply] : [reply],
    last: Array.isArray(reply) ? reply[reply.length - 1] : reply
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const call: Call = { url, method: (init?.method ?? "GET").toUpperCase() };
      if (init?.body instanceof FormData) call.form = init.body;
      else if (typeof init?.body === "string") call.body = JSON.parse(init.body);
      calls.push(call);
      const route = queues.find((q) => url.includes(q.match));
      if (!route) throw new Error(`unexpected request: ${url}`);
      const reply = route.replies.length > 1 ? route.replies.shift()! : route.last;
      return typeof reply === "function" ? reply(call) : reply.clone();
    })
  );
  return calls;
}

const recordInfo = (data: Record<string, unknown>): Response =>
  json({ code: 200, data });

const provider = (): KieProvider => new KieProvider({ KIE_API_KEY: "kie-key" });

describe("KieProvider endpoint calls", () => {
  const webhook = process.env.KIE_WEBHOOK_URL;

  beforeEach(() => {
    delete process.env.KIE_WEBHOOK_URL;
  });

  afterEach(() => {
    if (webhook === undefined) delete process.env.KIE_WEBHOOK_URL;
    else process.env.KIE_WEBHOOK_URL = webhook;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("supports endpoint calls", () => {
    expect(provider().supportsEndpointCalls()).toBe(true);
  });

  it("refuses to call without a key", async () => {
    const calls = stubFetch([]);
    await expect(
      new KieProvider({}).callEndpoint({ model: "m", input: {} })
    ).rejects.toThrow("KIE_API_KEY is not configured");
    expect(calls).toEqual([]);
  });

  describe("job API (no route)", () => {
    it("creates a task, polls recordInfo and returns a fresh recordInfo", async () => {
      const finished = {
        taskId: "task-1",
        state: "success",
        creditsConsumed: 12,
        resultJson: JSON.stringify({ resultUrls: ["https://cdn.kie.test/a.png"] })
      };
      const calls = stubFetch([
        ["/jobs/createTask", json({ code: 200, data: { taskId: "task-1" } })],
        [
          "/jobs/recordInfo",
          [recordInfo(finished), recordInfo({ ...finished, creditsConsumed: 99 })]
        ]
      ]);

      const result = await provider().callEndpoint({
        model: "unlisted/model",
        input: { prompt: "a fox" }
      });

      expect(calls.map((c) => [c.method, c.url])).toEqual([
        ["POST", "https://api.kie.ai/api/v1/jobs/createTask"],
        ["GET", "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task-1"],
        ["GET", "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task-1"]
      ]);
      expect(calls[0].body).toEqual({
        model: "unlisted/model",
        input: { prompt: "a fox" }
      });
      expect(result.requestId).toBe("task-1");
      // Credits come from the body that reported the terminal state, the
      // output from the recordInfo read after it.
      expect(result.metadata).toEqual({ creditsConsumed: 12 });
      expect(result.output).toMatchObject({ data: { creditsConsumed: 99 } });
    });

    it("keeps polling until a terminal synonym, at the manifest's interval", async () => {
      vi.useFakeTimers();
      const calls = stubFetch([
        ["/jobs/createTask", json({ code: 200, data: { taskId: "task-2" } })],
        [
          "/jobs/recordInfo",
          [
            recordInfo({ state: "generating" }),
            recordInfo({ state: "completed", creditsConsumed: "3" }),
            recordInfo({ state: "completed", resultJson: "{}" })
          ]
        ]
      ]);

      // google/nano-banana-edit polls every 1.5 s in the manifest.
      const pending = provider().callEndpoint({
        model: "google/nano-banana-edit",
        input: { prompt: "x" }
      });
      await vi.advanceTimersByTimeAsync(1499);
      expect(calls).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;

      expect(calls).toHaveLength(4);
      expect(result.metadata).toEqual({ creditsConsumed: 3 });
    });

    it("reports a failed task with its message and task id", async () => {
      stubFetch([
        ["/jobs/createTask", json({ code: 200, data: { taskId: "task-f" } })],
        ["/jobs/recordInfo", recordInfo({ state: "fail", failMsg: "Internal Error" })]
      ]);

      await expect(
        provider().callEndpoint({ model: "m", input: {} })
      ).rejects.toThrow("Task failed: Internal Error (taskId: task-f)");
    });

    it("fails on KIE's error envelope inside HTTP 200", async () => {
      stubFetch([
        ["/jobs/createTask", json({ code: 402, msg: "no credits" })]
      ]);

      await expect(
        provider().callEndpoint({ model: "m", input: {} })
      ).rejects.toThrow(/^Insufficient Credits/);
    });

    it("does not retry the job-creating POST", async () => {
      const calls = stubFetch([
        ["/jobs/createTask", json({ msg: "overloaded" }, 503)]
      ]);

      await expect(
        provider().callEndpoint({ model: "m", input: {} })
      ).rejects.toThrow("Submit failed: 503");
      expect(calls).toHaveLength(1);
    });

    it("reports a gateway page with its HTTP status", async () => {
      stubFetch([
        ["/jobs/createTask", new Response("<html>bad gateway</html>", { status: 502 })]
      ]);

      await expect(
        provider().callEndpoint({ model: "m", input: {} })
      ).rejects.toThrow("Kie submit failed: HTTP 502 <html>bad gateway</html>");
    });

    it("gives up after five failed polls instead of the whole budget", async () => {
      vi.useFakeTimers();
      const calls = stubFetch([
        ["/jobs/createTask", json({ code: 200, data: { taskId: "task-e" } })],
        ["/jobs/recordInfo", new Response("<html>down</html>", { status: 502 })]
      ]);

      const pending = provider().callEndpoint({ model: "m", input: {} });
      const settled = expect(pending).rejects.toThrow(
        "Poll failed 5x (HTTP 502): <html>down</html> (taskId: task-e)"
      );
      await vi.runAllTimersAsync();
      await settled;
      expect(calls.filter((c) => c.url.includes("recordInfo"))).toHaveLength(5);
    });

    it("stops before polling when the signal is already aborted", async () => {
      const calls = stubFetch([
        ["/jobs/createTask", json({ code: 200, data: { taskId: "task-c" } })],
        ["/jobs/recordInfo", recordInfo({ state: "generating" })]
      ]);
      const controller = new AbortController();
      controller.abort(new Error("Workflow cancelled"));

      await expect(
        provider().callEndpoint({
          model: "m",
          input: {},
          signal: controller.signal
        })
      ).rejects.toThrow("Workflow cancelled");
      expect(calls.filter((c) => c.url.includes("recordInfo"))).toEqual([]);
    });

    it("polls when KIE_WEBHOOK_URL is set but no callback secret is", async () => {
      process.env.KIE_WEBHOOK_URL = "https://hooks.example.com/";
      vi.stubEnv("KIE_WEBHOOK_SECRET", "");
      vi.stubEnv("SECRETS_MASTER_KEY", "");
      const calls = stubFetch([
        ["/jobs/createTask", json({ code: 200, data: { taskId: "task-p" } })],
        ["/jobs/recordInfo", recordInfo({ state: "success", creditsConsumed: 1 })]
      ]);
      await provider().callEndpoint({ model: "m", input: { prompt: "x" } });
      expect(calls[0].body).toEqual({ model: "m", input: { prompt: "x" } });
      expect(hasPendingWebhook("task-p")).toBe(false);
      vi.unstubAllEnvs();
    });

    it("waits for KIE's callback when KIE_WEBHOOK_URL is set", async () => {
      process.env.KIE_WEBHOOK_URL = "https://hooks.example.com/";
      vi.stubEnv("KIE_WEBHOOK_SECRET", "hook-secret");
      const token = createHmac("sha256", "hook-secret")
        .update("nodetool:kie-webhook:v1")
        .digest("hex");
      const calls = stubFetch([
        ["/jobs/createTask", json({ code: 200, data: { taskId: "task-w" } })],
        ["/jobs/recordInfo", recordInfo({ state: "success", creditsConsumed: 4 })]
      ]);

      const pending = provider().callEndpoint({ model: "m", input: { prompt: "x" } });
      await vi.waitFor(() => expect(hasPendingWebhook("task-w")).toBe(true));
      expect(calls[0].body).toEqual({
        model: "m",
        input: {
          prompt: "x",
          callBackUrl: `https://hooks.example.com/api/kie/webhook?token=${token}`
        }
      });
      resolveWebhook("task-w");
      const result = await pending;
      vi.unstubAllEnvs();

      expect(calls.map((c) => c.method)).toEqual(["POST", "GET", "GET"]);
      expect(result.metadata).toEqual({ creditsConsumed: 4 });
    });
  });

  describe("Suno route", () => {
    it("posts to the Suno path with the placeholder callback and polls record-info", async () => {
      const calls = stubFetch([
        ["/api/v1/generate/record-info", json({
          code: 200,
          data: {
            status: "SUCCESS",
            creditsConsumed: 6,
            response: { sunoData: [{ audioUrl: "https://cdn.kie.test/s.mp3" }] }
          }
        })],
        ["/api/v1/generate", json({ code: 200, data: { taskId: "suno-1" } })]
      ]);

      const result = await provider().callEndpoint({
        model: "generate-music",
        route: "suno:/api/v1/generate",
        input: { prompt: "a shanty", model: "V5" }
      });

      expect(calls.map((c) => [c.method, c.url])).toEqual([
        ["POST", "https://api.kie.ai/api/v1/generate"],
        ["GET", "https://api.kie.ai/api/v1/generate/record-info?taskId=suno-1"]
      ]);
      expect(calls[0].body).toEqual({
        prompt: "a shanty",
        model: "V5",
        callBackUrl: "https://nodetool.ai/kie-callback"
      });
      expect(result).toMatchObject({
        requestId: "suno-1",
        metadata: { creditsConsumed: 6 },
        output: { data: { status: "SUCCESS" } }
      });
    });

    it("keeps a callBackUrl the caller set", async () => {
      const calls = stubFetch([
        ["/record-info", json({ code: 200, data: { status: "SUCCESS" } })],
        ["/api/v1/lyrics", json({ code: 200, data: { taskId: "suno-2" } })]
      ]);

      await provider().callEndpoint({
        model: "generate-lyrics",
        route: "suno:/api/v1/lyrics",
        input: { prompt: "x", callBackUrl: "https://mine.example.com/cb" }
      });

      expect(calls[0].body).toEqual({
        prompt: "x",
        callBackUrl: "https://mine.example.com/cb"
      });
    });

    it("reports Suno's own failure words", async () => {
      stubFetch([
        ["/record-info", json({ code: 200, data: { status: "SENSITIVE_WORD_ERROR" } })],
        ["/api/v1/generate", json({ code: 200, data: { taskId: "suno-3" } })]
      ]);

      await expect(
        provider().callEndpoint({
          model: "generate-music",
          route: "suno:/api/v1/generate",
          input: {}
        })
      ).rejects.toThrow("Suno task failed: sensitive_word_error (taskId: suno-3)");
    });
  });

  describe("direct route", () => {
    it("posts the input once and returns the response body", async () => {
      const calls = stubFetch([
        ["/api/v1/omni/audio/create", json({ code: 200, data: { audioId: "voice-1" } })]
      ]);

      const result = await provider().callEndpoint({
        model: "gemini-omni-audio",
        route: "direct:/api/v1/omni/audio/create",
        input: { audio_id: "achernar", name: "Narrator" }
      });

      expect(calls).toEqual([
        {
          url: "https://api.kie.ai/api/v1/omni/audio/create",
          method: "POST",
          body: { audio_id: "achernar", name: "Narrator" }
        }
      ]);
      expect(result).toEqual({
        output: { code: 200, data: { audioId: "voice-1" } },
        requestId: null
      });
    });

    it("reports a non-OK response", async () => {
      stubFetch([["/api/v1/omni/character/create", json({ msg: "bad" }, 400)]]);

      await expect(
        provider().callEndpoint({
          model: "gemini-omni-character",
          route: "direct:/api/v1/omni/character/create",
          input: {}
        })
      ).rejects.toThrow('Omni submit failed: 400 {"msg":"bad"}');
    });
  });

  it.each([
    "jobs",
    "suno",
    "suno:",
    "custom:/api/v1/veo/generate",
    "direct:https://evil.example.com/x",
    "direct:/api/v1/../admin",
    "suno://api.kie.ai/api/v1/generate",
    "direct:/api/v2/omni",
    "direct:/api/v1/omni?x=1"
  ])("rejects the route %j without a request", async (route) => {
    const calls = stubFetch([]);
    await expect(
      provider().callEndpoint({ model: "m", route, input: {} })
    ).rejects.toThrow(`kie does not accept route "${route}"`);
    expect(calls).toEqual([]);
  });
});

describe("KieProvider.uploadMedia", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const uploaded = json({
    success: true,
    code: 200,
    data: { downloadUrl: "https://kie.cdn.test/u.bin" }
  });

  it.each([
    ["image/png", "images/user-uploads", "upload-1700000000000.png"],
    ["image/jpeg", "images/user-uploads", "upload-1700000000000.jpg"],
    ["audio/wav", "audio/user-uploads", "upload-1700000000000.mp3"],
    ["video/quicktime", "videos/user-uploads", "upload-1700000000000.mp4"]
  ])("uploads %s to %s as %s", async (mimeType, uploadPath, fileName) => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const calls = stubFetch([["file-stream-upload", uploaded]]);

    const url = await provider().uploadMedia({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType
    });

    expect(url).toBe("https://kie.cdn.test/u.bin");
    expect(calls[0].url).toBe("https://kieai.redpandaai.co/api/file-stream-upload");
    const form = calls[0].form!;
    expect(form.get("uploadPath")).toBe(uploadPath);
    expect(form.get("fileName")).toBe(fileName);
    const file = form.get("file") as File;
    expect(file.name).toBe(fileName);
    expect(file.type).toBe(mimeType);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("keeps a filename the caller gave", async () => {
    const calls = stubFetch([["file-stream-upload", uploaded]]);
    await provider().uploadMedia({
      bytes: new Uint8Array([1]),
      mimeType: "image/webp",
      filename: "frame.webp"
    });
    expect(calls[0].form!.get("fileName")).toBe("frame.webp");
  });

  it("refuses a file type KIE does not take", async () => {
    const calls = stubFetch([]);
    await expect(
      provider().uploadMedia({ bytes: new Uint8Array([1]), mimeType: "application/pdf" })
    ).rejects.toThrow("kie cannot upload application/pdf");
    expect(calls).toEqual([]);
  });

  it("reports a refused upload", async () => {
    stubFetch([["file-stream-upload", json({ success: false, msg: "too big" })]]);
    await expect(
      provider().uploadMedia({ bytes: new Uint8Array([1]), mimeType: "image/png" })
    ).rejects.toThrow('Upload failed: 200 {"success":false,"msg":"too big"}');
  });
});

describe("KieProvider.downloadMedia", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a 503 on a result that was already billed", async () => {
    vi.useFakeTimers();
    const calls = stubFetch([
      [
        "cdn.kie.test",
        [new Response("busy", { status: 503 }), new Response(new Uint8Array([9, 8]))]
      ]
    ]);

    const pending = provider().downloadMedia("https://cdn.kie.test/out.png");
    await vi.runAllTimersAsync();

    expect(await pending).toEqual(new Uint8Array([9, 8]));
    expect(calls).toHaveLength(2);
  });

  it("reports a final non-OK status", async () => {
    stubFetch([["cdn.kie.test", new Response("gone", { status: 404 })]]);
    await expect(
      provider().downloadMedia("https://cdn.kie.test/out.png")
    ).rejects.toThrow("kie media download failed: HTTP 404");
  });

  it("refuses a private address without sending a request", async () => {
    // The refusal is thrown inside the retried fetch, so it goes through the
    // same backoff as a network error before it surfaces.
    vi.useFakeTimers();
    const calls = stubFetch([]);
    const pending = provider().downloadMedia(
      "https://169.254.169.254/latest/meta-data"
    );
    const settled = expect(pending).rejects.toThrow();
    await vi.runAllTimersAsync();
    await settled;
    expect(calls).toEqual([]);
  });
});

describe("KieProvider.fetchBillingCost", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the credits KIE billed for a task", async () => {
    const calls = stubFetch([
      ["/jobs/recordInfo", recordInfo({ state: "success", creditsConsumed: 8 })]
    ]);

    expect(await provider().fetchBillingCost("task-9")).toEqual({ creditsConsumed: 8 });
    expect(calls[0].url).toBe(
      "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task-9"
    );
  });

  it("answers null when KIE reports no credits", async () => {
    stubFetch([["/jobs/recordInfo", recordInfo({ state: "generating" })]]);
    expect(await provider().fetchBillingCost("task-9")).toBeNull();
  });

  it("answers null without a key and sends nothing", async () => {
    const calls = stubFetch([]);
    expect(await new KieProvider({}).fetchBillingCost("task-9")).toBeNull();
    expect(calls).toEqual([]);
  });
});
