/**
 * Wire parity for the move from pack transport to `AtlasCloudProvider`
 * (docs/plans/provider-endpoint-interface.md, Testing item 4).
 *
 * The expected requests below were recorded from the pack's own transport
 * before the migration. The node now reaches AtlasCloud through
 * `context.callProviderEndpoint` and the real provider, with `fetch` mocked,
 * and must send the same requests in the same order.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AtlasCloudProvider, ProcessingContext } from "@nodetool-ai/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAtlasNodeClass, type AtlasManifestEntry } from "../src/atlascloud-factory.js";

interface WireRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

const manifest = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/atlascloud-manifest.json"), "utf8")
) as AtlasManifestEntry[];

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

function spec(modelId: string): AtlasManifestEntry {
  const entry = manifest.find((candidate) => candidate.modelId === modelId);
  if (!entry) throw new Error(`${modelId} is missing from the manifest`);
  return entry;
}

async function bodyOf(body: BodyInit | null | undefined): Promise<unknown> {
  if (typeof body === "string") return JSON.parse(body);
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

/** Answer the AtlasCloud API by URL and record every request it receives. */
function mockAtlas(routes: Record<string, () => Response>): WireRequest[] {
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

function context(): { ctx: ProcessingContext; store: ReturnType<typeof vi.fn> } {
  const store = vi.fn(async (key: string) => `memory://${key}`);
  const storage = { store, retrieve: async () => null, delete: async () => undefined, list: async () => ({ entries: [] }) };
  const ctx = new ProcessingContext({ jobId: "job-1", storage: storage as never });
  ctx.setProviderResolver(() => new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "ak" }));
  return { ctx, store };
}

function node(entry: AtlasManifestEntry, properties: Record<string, unknown>) {
  // No webhook URL: the run polls, as it does on a server without a public address.
  vi.stubEnv("NODETOOL_PUBLIC_URL", "");
  const Node = createAtlasNodeClass(entry);
  return new Node(properties);
}

const API_HEADERS = { authorization: "Bearer ak", "content-type": "application/json" };

describe("AtlasCloud wire parity", () => {
  it("sends the recorded requests for an image edit with an inline and a public reference", async () => {
    const requests = mockAtlas({
      "POST https://api.atlascloud.ai/api/v1/model/generateImage": () => json({ data: { id: "pred-img" } }),
      "GET https://api.atlascloud.ai/api/v1/model/prediction/pred-img": () =>
        json({ data: { status: "completed", outputs: ["https://cdn.atlas.example/out.png"] } }),
      "GET https://cdn.atlas.example/out.png": () => new Response(Uint8Array.from([7, 8]), { status: 200 })
    });
    const { ctx, store } = context();
    const instance = node(spec("bytedance/seedream-v5.0-lite/edit"), {
      prompt: "Make it winter",
      images: [
        { type: "image", uri: "", data: Uint8Array.from([1, 2, 3]), mime_type: "image/png" },
        { type: "image", uri: "https://public.example/ref.jpg" }
      ]
    });

    const out = await instance.process(ctx);

    expect(requests).toEqual([
      {
        method: "POST",
        url: "https://api.atlascloud.ai/api/v1/model/generateImage",
        headers: API_HEADERS,
        body: {
          model: "bytedance/seedream-v5.0-lite/edit",
          prompt: "Make it winter",
          images: ["data:image/png;base64,AQID", "https://public.example/ref.jpg"],
          size: "2048*2048",
          output_format: "jpeg"
        }
      },
      { method: "GET", url: "https://api.atlascloud.ai/api/v1/model/prediction/pred-img", headers: API_HEADERS, body: null },
      { method: "GET", url: "https://cdn.atlas.example/out.png", headers: {}, body: null }
    ]);
    expect(store).toHaveBeenCalledWith(expect.stringMatching(/^atlascloud-image-\d+\.jpg$/), Uint8Array.from([7, 8]), "image/jpeg");
    expect((out.output as { type: string }).type).toBe("image");
  });

  it("sends the recorded requests for a video edit with an uploaded source video", async () => {
    const requests = mockAtlas({
      "POST https://api.atlascloud.ai/api/v1/model/uploadMedia": () =>
        json({ data: { download_url: "https://uploads.atlas.example/input-video.mp4" } }),
      "POST https://api.atlascloud.ai/api/v1/model/generateVideo": () => json({ data: { id: "pred-vid" } }),
      "GET https://api.atlascloud.ai/api/v1/model/prediction/pred-vid": () =>
        json({ data: { status: "succeeded", outputs: [{ url: "https://cdn.atlas.example/out.mp4" }] } }),
      "GET https://cdn.atlas.example/out.mp4": () => new Response(Uint8Array.from([9]), { status: 200 })
    });
    const { ctx, store } = context();
    const instance = node(spec("google/gemini-omni-1.1-flash/video-edit"), {
      prompt: "Turn day into night",
      video: { type: "video", uri: "", data: Uint8Array.from([4, 5, 6]), mime_type: "video/mp4" },
      reference_images: [{ type: "image", uri: "https://public.example/look.png" }],
      seed: 11
    });

    const out = await instance.process(ctx);

    expect(requests).toEqual([
      {
        method: "POST",
        url: "https://api.atlascloud.ai/api/v1/model/uploadMedia",
        headers: { authorization: "Bearer ak" },
        body: [["file", { filename: "input-video", type: "video/mp4", bytes: [4, 5, 6] }]]
      },
      {
        method: "POST",
        url: "https://api.atlascloud.ai/api/v1/model/generateVideo",
        headers: API_HEADERS,
        body: {
          model: "google/gemini-omni-1.1-flash/video-edit",
          prompt: "Turn day into night",
          video: "https://uploads.atlas.example/input-video.mp4",
          reference_images: ["https://public.example/look.png"],
          thinking_level: "default",
          seed: 11
        }
      },
      { method: "GET", url: "https://api.atlascloud.ai/api/v1/model/prediction/pred-vid", headers: API_HEADERS, body: null },
      { method: "GET", url: "https://cdn.atlas.example/out.mp4", headers: {}, body: null }
    ]);
    expect(store).toHaveBeenCalledWith(expect.stringMatching(/^atlascloud-video-\d+\.mp4$/), Uint8Array.from([9]), "video/mp4");
    expect((out.output as { type: string }).type).toBe("video");
  });
});
