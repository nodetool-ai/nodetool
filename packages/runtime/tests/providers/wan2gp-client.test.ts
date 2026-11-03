import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Wan2GPClient,
  Wan2GPError,
  Wan2GPTimeoutError,
  parseWan2GPToolResult,
  wan2gpAudioFilename,
  wan2gpFirstGalleryItem,
  wan2gpImageFilename,
  wan2gpJobErrorMessage,
  wan2gpOrigin,
  wan2gpProgressFromJob,
  wan2gpTransferUrl,
  wan2gpVideoFilename
} from "../../src/providers/wan2gp-client.js";
import { FakeWan2GP, wan2gpFixture, wan2gpFixtureBytes } from "./wan2gp-fake-server.js";

let fake: FakeWan2GP;

beforeEach(async () => {
  fake = await new FakeWan2GP().start();
});

afterEach(async () => {
  await fake.stop();
});

describe("Wan2GPClient.connect", () => {
  it.each([false, true])("completes the MCP handshake (sse=%s) and carries the session id", async (sse) => {
    fake.sse = sse;
    const client = await Wan2GPClient.connect(fake.url);
    await client.getModelDefaults("t2v_2_2");
    await client.close();
    expect(fake.methods).toEqual(["initialize", "notifications/initialized", "tools/list", "tools/call"]);
    expect(fake.sessionHeaders).toEqual([undefined, "session-1", "session-1", "session-1"]);
    expect(fake.deletes).toBe(1);
  });

  it("sends the bearer token on MCP calls and transfers", async () => {
    fake.token = "s3cret";
    const client = await Wan2GPClient.connect(fake.url, { token: " s3cret " });
    await client.uploadMedia("image.png", wan2gpFixtureBytes("tiny.png"));
    await client.downloadMedia("visual:9f8e7d6c5b4a");
    await client.close();
    expect(fake.uploads).toHaveLength(1);
    expect(new Set(fake.authorizations)).toEqual(new Set(["Bearer s3cret"]));
  });

  it("names the token setting when the server refuses the request", async () => {
    fake.token = "s3cret";
    await expect(Wan2GPClient.connect(fake.url)).rejects.toThrow(/Set WAN2GP_MCP_TOKEN/);
    await expect(Wan2GPClient.connect(fake.url, { token: "wrong" })).rejects.toThrow(/HTTP 401/);
  });

  it("sends no Authorization header without a token", async () => {
    const client = await Wan2GPClient.connect(fake.url, { token: "  " });
    await client.close();
    expect(fake.authorizations.every((value) => value === undefined)).toBe(true);
  });

  it("refuses a server that speaks MCP API v1", async () => {
    fake.legacy = true;
    await expect(Wan2GPClient.connect(fake.url)).rejects.toThrow(/MCP API v1/);
  });

  it("names the server when nothing answers", async () => {
    const url = fake.url;
    await fake.stop();
    await expect(Wan2GPClient.connect(url)).rejects.toThrow(/Could not reach the Wan2GP server/);
    fake = await new FakeWan2GP().start();
  });

  it("rejects a non-HTTP URL and a URL with credentials", () => {
    expect(() => wan2gpOrigin("file:///etc/passwd")).toThrow(Wan2GPError);
    expect(() => wan2gpOrigin("http://user:pw@127.0.0.1:7866/mcp")).toThrow(/credentials/);
    expect(wan2gpOrigin("http://127.0.0.1:7866/mcp")).toBe("http://127.0.0.1:7866");
  });
});

describe("model search", () => {
  it("follows next_cursor across pages", async () => {
    const client = await Wan2GPClient.connect(fake.url);
    const rows = await client.searchAllModels("fastwan", { main_output: "video" }, 10);
    expect(rows.map((row) => row.model_type)).toEqual(["ovi_fastwan", "ovi_1_1_10s_fastwan"]);
    const searches = fake.calls.filter((call) => call.name === "wangp_models");
    expect(searches[0].args).toEqual({
      action: "search",
      arguments: { query: "fastwan", limit: 10, filters: { main_output: "video" } }
    });
    const cursor = (fake.modelPages[0].next_cursor as string);
    expect((searches[1].args.arguments as Record<string, unknown>).cursor).toBe(cursor);
    await client.close();
  });

  it("fills compact rows from each model's capabilities", async () => {
    fake.modelPages = [{ models: [{ model_type: "flux", name: "Flux" }], has_more: false }];
    const client = await Wan2GPClient.connect(fake.url);
    const rows = await client.searchAllModels();
    expect(rows[0].media_inputs).toBeDefined();
    expect(rows[0].capabilities).toContain("text_to_image");
    expect(fake.toolNames()).toEqual(["wangp_models", "wangp_model"]);
    await client.close();
  });

  it("stops at the limit", async () => {
    const client = await Wan2GPClient.connect(fake.url);
    expect(await client.searchAllModels("", {}, 1)).toHaveLength(1);
    await client.close();
  });

  it("reports a model without capabilities", async () => {
    const client = await Wan2GPClient.connect(fake.url);
    await expect(client.getModelCapabilities("missing")).rejects.toThrow(/Unknown model_type: missing/);
    await client.close();
  });
});

describe("transfers", () => {
  it("uploads gallery media and returns its media_id", async () => {
    const client = await Wan2GPClient.connect(fake.url);
    const png = wan2gpFixtureBytes("tiny.png");
    expect(await client.uploadMedia("image.png", png)).toBe("visual:0a1b2c3d4e5f");
    expect(fake.uploads[0].path).toBe("/wangp_api/gallery/upload/2f6c1d8a4b3e4f0a9c7d5e1b0a2f3c4d");
    expect(new Uint8Array(fake.uploads[0].body)).toEqual(png);
    await client.close();
  });

  it("refuses an extension the gallery does not accept before any call", async () => {
    const client = await Wan2GPClient.connect(fake.url);
    await expect(client.uploadMedia("notes.txt", new Uint8Array([1]))).rejects.toThrow(/\.txt/);
    expect(fake.calls).toEqual([]);
    await client.close();
  });

  it("uploads a custom file and returns the server path", async () => {
    const client = await Wan2GPClient.connect(fake.url);
    const path = await client.uploadFile("trajectory.npy", new Uint8Array([1, 2, 3]));
    expect(path).toBe("@documents/uploads/abc/trajectory.npy");
    expect(fake.calls[0].args).toEqual({
      action: "create_file_upload",
      arguments: { filename: "trajectory.npy", size_bytes: 3 }
    });
    await expect(client.uploadFile("dir/trajectory.npy", new Uint8Array([1]))).rejects.toThrow(/Invalid upload file name/);
    await expect(client.uploadFile("big.npy", new Uint8Array(2048))).rejects.toThrow(/1024 byte transfer limit/);
    await client.close();
  });

  it("downloads gallery media", async () => {
    const client = await Wan2GPClient.connect(fake.url);
    expect(await client.downloadMedia("visual:9f8e7d6c5b4a")).toEqual(wan2gpFixtureBytes("tiny.mp4"));
    await client.close();
  });

  it("refuses a download over the ticket's size", async () => {
    fake.downloadTicket = { ...fake.downloadTicket, size: 10 };
    const client = await Wan2GPClient.connect(fake.url);
    await expect(client.downloadMedia("visual:9f8e7d6c5b4a")).rejects.toThrow(/10 byte transfer limit/);
    await client.close();
  });

  it("refuses a download over the client's limit", async () => {
    fake.downloadTicket = { download_url: "/wangp_api/gallery/download/x" };
    const client = await Wan2GPClient.connect(fake.url, { maxTransferBytes: 100 });
    await expect(client.downloadMedia("visual:x")).rejects.toThrow(/100 byte transfer limit/);
    await client.close();
  });
});

describe("wan2gpTransferUrl", () => {
  const origin = "http://127.0.0.1:7866";
  const check = (ticket: unknown, key: "upload_url" | "download_url" = "download_url", method: "PUT" | "GET" = "GET") =>
    wan2gpTransferUrl(origin, ticket, key, method, 1000);

  it("resolves a relative ticket on the server origin", () => {
    const { url, limit } = check({ download_url: "/wangp_api/files/download/abc", size: 10 });
    expect(url.href).toBe("http://127.0.0.1:7866/wangp_api/files/download/abc");
    expect(limit).toBe(10);
    expect(check({ download_url: "wangp_api/gallery/download/abc" }).url.pathname).toBe("/wangp_api/gallery/download/abc");
  });

  it.each([
    ["an absolute URL", { download_url: "http://169.254.169.254/wangp_api/gallery/download/x" }, /relative URL/],
    ["a protocol-relative URL", { download_url: "//evil.test/wangp_api/gallery/download/x" }, /relative URL/],
    ["a dot-dot segment", { download_url: "/wangp_api/gallery/download/../../admin" }, /unsafe path/],
    ["a backslash", { download_url: "/wangp_api/gallery/download/a\\b" }, /unsafe path/],
    ["another route", { download_url: "/admin/x" }, /outside its transfer routes/],
    ["the bare prefix", { download_url: "/wangp_api/gallery/download/" }, /outside its transfer routes/],
    ["an upload route for a download", { download_url: "/wangp_api/gallery/upload/x" }, /outside its transfer routes/],
    ["a wrong method", { download_url: "/wangp_api/gallery/download/x", method: "PUT" }, /unexpected HTTP method/],
    ["a negative size", { download_url: "/wangp_api/gallery/download/x", size: -1 }, /negative/],
    ["a non-integer size", { download_url: "/wangp_api/gallery/download/x", size: "big" }, /invalid transfer ticket size/],
    ["not an object", "ticket", /invalid media transfer ticket/]
  ])("refuses %s", (_label, ticket, error) => {
    expect(() => check(ticket)).toThrow(error);
  });
});

describe("jobs", () => {
  it("submits with wait=false and returns the job id", async () => {
    const client = await Wan2GPClient.connect(fake.url);
    expect(await client.submit({ model_type: "t2v_2_2" })).toBe("3d9a1c0e5b7f4a2d8c6e0f1a2b3c4d5e");
    expect(fake.calls[0].args).toEqual({ settings: { model_type: "t2v_2_2" }, wait: false });
    await client.close();
  });

  it("explains a server without --mcp-async", async () => {
    fake.handlers.wangp_generate = () => {
      throw new Error("MCP asynchronous execution is disabled");
    };
    const client = await Wan2GPClient.connect(fake.url);
    await expect(client.submit({})).rejects.toThrow(/--mcp-async/);
    await client.close();
  });

  it("polls to the end and reports each new progress payload once", async () => {
    fake.jobs = [wan2gpFixture("job_running"), wan2gpFixture("job_running"), wan2gpFixture("job_done")];
    const client = await Wan2GPClient.connect(fake.url);
    const progress: unknown[] = [];
    const job = await client.pollUntilDone("job", { intervalMs: 1, onProgress: (p) => progress.push(p.progress) });
    expect(job.done).toBe(true);
    expect(progress).toEqual([40, 100]);
    await client.close();
  });

  it("cancels the remote job on timeout", async () => {
    fake.jobs = [wan2gpFixture("job_running")];
    const client = await Wan2GPClient.connect(fake.url);
    await expect(client.pollUntilDone("job-1", { intervalMs: 5, timeoutMs: 30 })).rejects.toThrow(Wan2GPTimeoutError);
    expect(fake.calls.at(-1)?.args).toEqual({ action: "cancel_job", arguments: { job_id: "job-1" } });
    await client.close();
  });

  it("cancels the remote job when the caller aborts", async () => {
    fake.jobs = [wan2gpFixture("job_running")];
    const client = await Wan2GPClient.connect(fake.url);
    const controller = new AbortController();
    const polling = client.pollUntilDone("job-2", { intervalMs: 1000, signal: controller.signal });
    setTimeout(() => controller.abort(new Error("stopped")), 50);
    await expect(polling).rejects.toThrow("stopped");
    expect(fake.toolNames().at(-1)).toBe("wangp_session:cancel_job");
    await client.close();
  });
});

describe("results", () => {
  it("parses structured content, a wrapped result and JSON text", () => {
    expect(parseWan2GPToolResult({ structuredContent: { a: 1 } }, "t")).toEqual({ a: 1 });
    expect(parseWan2GPToolResult({ structuredContent: { result: [1] } }, "t")).toEqual([1]);
    expect(parseWan2GPToolResult({ content: [{ type: "text", text: "{\"b\":2}" }] }, "t")).toEqual({ b: 2 });
    expect(() => parseWan2GPToolResult({ isError: true, content: [{ type: "text", text: " bad " }] }, "t")).toThrow("bad");
    expect(() => parseWan2GPToolResult({ content: [{ type: "text", text: "nope" }] }, "t")).toThrow(/not JSON/);
    expect(() => parseWan2GPToolResult({ content: [] }, "t")).toThrow(/no content/);
  });

  it("reads progress beside the job or from its events", () => {
    expect(wan2gpProgressFromJob({ progress: { progress: 5 } })).toEqual({ progress: 5 });
    expect(wan2gpProgressFromJob(wan2gpFixture("job_running"))?.current_step).toBe(12);
    expect(wan2gpProgressFromJob({ events: [] })).toBeNull();
  });

  it("returns the first gallery item or the job's errors", () => {
    expect(wan2gpFirstGalleryItem(wan2gpFixture("job_done"))).toEqual({
      media_id: "visual:9f8e7d6c5b4a",
      media_type: "video",
      filename: "clip_001.mp4"
    });
    expect(() => wan2gpFirstGalleryItem(wan2gpFixture("job_failed"))).toThrow("CUDA out of memory (stage: denoising)");
    expect(() =>
      wan2gpFirstGalleryItem({ result: { success: true, gallery_items: [], generated_files: ["/out/transcript.txt"] } })
    ).toThrow(/only transcript\.txt/);
    expect(wan2gpJobErrorMessage({ result: { cancelled: true } })).toMatch(/cancelled/);
  });

  it("refuses a world output and an unexpected media type", async () => {
    const client = await Wan2GPClient.connect(fake.url);
    const job = (mediaType: string) => ({
      result: { success: true, gallery_items: [{ media_id: "m", media_type: mediaType }] }
    });
    await expect(client.downloadFirstOutput(job("world"))).rejects.toThrow(/\.wgpworld/);
    await expect(client.downloadFirstOutput(job("image"), ["video"])).rejects.toThrow(/returned image output/);
    await client.close();
  });
});

describe("upload file names", () => {
  const bytes = (...parts: Array<number[] | string>) =>
    new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part)));

  it("matches the extension to the bytes", () => {
    expect(wan2gpImageFilename(wan2gpFixtureBytes("tiny.png"))).toBe("image.png");
    expect(wan2gpImageFilename(bytes([0xff, 0xd8, 0xff, 0]))).toBe("image.jpg");
    expect(wan2gpImageFilename(bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe("image.webp");
    expect(wan2gpImageFilename(bytes("MM", [0, 0x2a]))).toBe("image.tif");
    expect(wan2gpVideoFilename(wan2gpFixtureBytes("tiny.mp4"))).toBe("video.mp4");
    expect(wan2gpVideoFilename(bytes([0, 0, 0, 0], "ftypqt  "))).toBe("video.mov");
    expect(wan2gpVideoFilename(bytes([0x1a, 0x45, 0xdf, 0xa3]))).toBe("video.webm");
    expect(wan2gpAudioFilename(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBe("audio.wav");
    expect(wan2gpAudioFilename(bytes("OggS", [0, 0, 0, 0], "OpusHead"))).toBe("audio.opus");
    expect(wan2gpAudioFilename(bytes("ID3"))).toBe("audio.mp3");
    expect(wan2gpAudioFilename(bytes("fLaC"))).toBe("audio.flac");
  });
});
