/**
 * Wire parity for the move from pack transport to `TopazProvider`
 * (docs/plans/provider-endpoint-interface.md, Testing item 4).
 *
 * The expected requests below were recorded from the pack's own transport
 * before the migration. The node now reaches Topaz through
 * `context.callProviderEndpoint` and the real provider, with `fetch` mocked,
 * and must send the same requests in the same order.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ProcessingContext, TopazProvider } from "@nodetool-ai/runtime";
import { generateMedia } from "@nodetool-ai/runtime/media/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import manifest from "../src/topaz-manifest.json";
import { createTopazNodeClass, type TopazManifestEntry } from "../src/topaz-factory.js";
import { probeVideoMetadata } from "../src/topaz-base.js";

interface WireRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A 1x1 PNG, so the result decodes like a real image. */
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  )
);

let dir = "";
let clip: Uint8Array;
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-topaz-parity-"));
  const file = path.join(dir, "clip.mov");
  await generateMedia({ outPath: file, video: { source: "testsrc2=size=160x90:rate=24:duration=1" } });
  clip = new Uint8Array(await fs.readFile(file));
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function spec(modelId: string): TopazManifestEntry {
  const entry = (manifest as TopazManifestEntry[]).find((candidate) => candidate.modelId === modelId);
  if (!entry) throw new Error(`${modelId} is missing from the manifest`);
  return entry;
}

async function bodyOf(body: BodyInit | null | undefined): Promise<unknown> {
  if (typeof body === "string") return JSON.parse(body);
  if (body instanceof Uint8Array) return new Uint8Array(body);
  if (body instanceof FormData) {
    const entries: unknown[] = [];
    for (const [name, value] of body.entries()) {
      entries.push(
        typeof value === "string"
          ? [name, value]
          : [name, { filename: value.name, type: value.type, bytes: [...new Uint8Array(await value.arrayBuffer())] }]
      );
    }
    return entries;
  }
  return body ?? null;
}

/** Answer the Topaz API by URL and record every request it receives. */
function mockTopaz(routes: Record<string, () => Response>): WireRequest[] {
  const requests: WireRequest[] = [];
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    requests.push({ method, url, headers, body: await bodyOf(init?.body) });
    const route = routes[`${method} ${url}`];
    if (!route) throw new Error(`unexpected fetch: ${method} ${url}`);
    return route();
  }) as typeof fetch;
  return requests;
}

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

function context(): ProcessingContext {
  const ctx = new ProcessingContext({ jobId: "job-1" });
  ctx.setProviderResolver(() => new TopazProvider({ TOPAZ_API_KEY: "tk" }));
  return ctx;
}

function node(entry: TopazManifestEntry, properties: Record<string, unknown>) {
  const Node = createTopazNodeClass(entry);
  return new Node(properties);
}

describe("Topaz wire parity", () => {
  it("sends the recorded requests for an image enhancement", async () => {
    const requests = mockTopaz({
      "POST https://api.topazlabs.com/image/v1/enhance/async": () => json({ process_id: "pid-1", eta: 3 }),
      "GET https://api.topazlabs.com/image/v1/status/pid-1": () => json({ status: "Completed" }),
      "GET https://api.topazlabs.com/image/v1/download/pid-1": () => json({ download_url: "https://cdn.topaz.example/result.png", expiry: 0 }),
      "GET https://cdn.topaz.example/result.png": () => new Response(PNG, { status: 200 })
    });
    const instance = node(spec("topaz/image/enhance"), {
      image: { type: "image", uri: "", data: PNG },
      model: "High Fidelity V2",
      output_width: 0,
      output_height: 512,
      face_enhancement: true
    });

    const out = await instance.process(context());

    expect(requests).toEqual([
      {
        method: "POST",
        url: "https://api.topazlabs.com/image/v1/enhance/async",
        headers: { "x-api-key": "tk" },
        body: [
          ["image", { filename: "input", type: "image/png", bytes: [...PNG] }],
          ["model", "High Fidelity V2"],
          ["output_height", "512"],
          ["output_format", "png"],
          ["crop_to_fill", "false"],
          ["face_enhancement", "true"],
          ["face_enhancement_strength", "0.8"],
          ["face_enhancement_creativity", "0.3"],
          ["sharpen", "0"],
          ["denoise", "0"],
          ["fix_compression", "0"],
          ["strength", "0"]
        ]
      },
      { method: "GET", url: "https://api.topazlabs.com/image/v1/status/pid-1", headers: { "x-api-key": "tk" }, body: null },
      { method: "GET", url: "https://api.topazlabs.com/image/v1/download/pid-1", headers: { "x-api-key": "tk" }, body: null },
      { method: "GET", url: "https://cdn.topaz.example/result.png", headers: {}, body: null }
    ]);
    expect(out.output).toMatchObject({ type: "image", data: Buffer.from(PNG).toString("base64"), mimeType: "image/png" });
  });

  it("sends the recorded requests for a video enhancement with a two-part upload", async () => {
    const requests = mockTopaz({
      "POST https://api.topazlabs.com/video/": () => json({ requestId: "req-1" }),
      "PATCH https://api.topazlabs.com/video/req-1/accept": () =>
        json({ uploadId: "up-1", urls: ["https://upload.topaz.example/p1", "https://upload.topaz.example/p2"] }),
      "PUT https://upload.topaz.example/p1": () => new Response(null, { status: 200, headers: { ETag: '"e1"' } }),
      "PUT https://upload.topaz.example/p2": () => new Response(null, { status: 200, headers: { ETag: '"e2"' } }),
      "PATCH https://api.topazlabs.com/video/req-1/complete-upload/": () => json({}),
      "GET https://api.topazlabs.com/video/req-1/status": () =>
        json({ status: "complete", download: { url: "https://cdn.topaz.example/result.mp4" } }),
      "GET https://cdn.topaz.example/result.mp4": () => new Response(Uint8Array.from([7, 7, 7]), { status: 200 })
    });
    const instance = node(spec("topaz/video/enhance"), {
      video: { type: "video", uri: "", data: clip, format: "mov" },
      model: "prob-4",
      details: 0.4,
      audio_mode: "none"
    });

    const out = await instance.process(context());

    const source = await probeVideoMetadata(clip, "mov");
    const half = Math.ceil(clip.byteLength / 2);
    expect(requests).toEqual([
      {
        method: "POST",
        url: "https://api.topazlabs.com/video/",
        headers: { "x-api-key": "tk", "content-type": "application/json" },
        body: {
          source,
          output: {
            resolution: { width: 160, height: 90 },
            frameRate: source.frameRate,
            container: "mp4",
            videoEncoder: "H264",
            dynamicCompressionLevel: "Mid",
            audioTransfer: "None"
          },
          filters: [{ model: "prob-4", videoType: "Progressive", auto: "Auto", details: 0.4 }]
        }
      },
      { method: "PATCH", url: "https://api.topazlabs.com/video/req-1/accept", headers: { "x-api-key": "tk" }, body: null },
      { method: "PUT", url: "https://upload.topaz.example/p1", headers: { "content-type": "video/quicktime" }, body: clip.slice(0, half) },
      { method: "PUT", url: "https://upload.topaz.example/p2", headers: { "content-type": "video/quicktime" }, body: clip.slice(half) },
      {
        method: "PATCH",
        url: "https://api.topazlabs.com/video/req-1/complete-upload/",
        headers: { "x-api-key": "tk", "content-type": "application/json" },
        body: { uploadId: "up-1", uploadResults: [{ partNum: 1, eTag: "e1" }, { partNum: 2, eTag: "e2" }] }
      },
      { method: "GET", url: "https://api.topazlabs.com/video/req-1/status", headers: { "x-api-key": "tk" }, body: null },
      { method: "GET", url: "https://cdn.topaz.example/result.mp4", headers: {}, body: null }
    ]);
    expect(out).toEqual({ output: { type: "video", uri: "", data: Buffer.from([7, 7, 7]).toString("base64") } });
  });
});
