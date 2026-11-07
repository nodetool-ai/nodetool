/**
 * Wire parity for the move from pack transport to `HiggsfieldProvider`
 * (docs/plans/provider-endpoint-interface.md, Testing item 4).
 *
 * The expected requests below were recorded from the pack's own transport
 * before the migration. The node now reaches Higgsfield through
 * `context.callProviderEndpoint` and the real provider, with `fetch` mocked,
 * and must send the same requests in the same order.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HiggsfieldProvider, ProcessingContext } from "@nodetool-ai/runtime";
import manifest from "../src/higgsfield-manifest.json";
import { createHiggsfieldNodeClass, type HiggsfieldManifestEntry } from "../src/higgsfield-factory.js";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const STATUS_URL = `https://api.higgsfield.ai/requests/${REQUEST_ID}/status`;
const CREDENTIALS = { HIGGSFIELD_API_KEY_ID: "kid", HIGGSFIELD_API_KEY_SECRET: "ksecret" };

interface WireRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function spec(modelId: string): HiggsfieldManifestEntry {
  const entry = (manifest as HiggsfieldManifestEntry[]).find((candidate) => candidate.modelId === modelId);
  if (!entry) throw new Error(`${modelId} is missing from the manifest`);
  return entry;
}

function bodyOf(body: BodyInit | null | undefined): unknown {
  if (typeof body === "string") return JSON.parse(body);
  if (body instanceof Uint8Array) return [...body];
  return body ?? null;
}

/** Answer the Higgsfield API and record every request it receives. */
function mockHiggsfield(result: Record<string, unknown>): WireRequest[] {
  const requests: WireRequest[] = [];
  let uploads = 0;
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    requests.push({ method, url, headers, body: bodyOf(init?.body) });
    if (url === "https://api.higgsfield.ai/files/generate-upload-url") {
      uploads += 1;
      return new Response(JSON.stringify({
        upload_url: `https://upload.example/put-${uploads}`,
        public_url: `https://cdn.example/input-${uploads}`,
        upload_headers: { "x-upload-token": `token-${uploads}` }
      }), { status: 200 });
    }
    if (url.startsWith("https://upload.example/")) return new Response(null, { status: 200 });
    if (url === STATUS_URL) return new Response(JSON.stringify(result), { status: 200 });
    if (url.startsWith("https://cdn.example/out")) return new Response(Uint8Array.from([7, 8, 9]), { status: 200 });
    if (method === "POST" && url.startsWith("https://api.higgsfield.ai/")) {
      return new Response(JSON.stringify({
        request_id: REQUEST_ID,
        status_url: STATUS_URL,
        cancel_url: `https://api.higgsfield.ai/requests/${REQUEST_ID}/cancel`
      }), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
  return requests;
}

function context(): { ctx: ProcessingContext; store: ReturnType<typeof vi.fn> } {
  const store = vi.fn(async (key: string) => `memory://${key}`);
  const storage = { store, retrieve: async () => null, delete: async () => undefined, list: async () => ({ entries: [] }) };
  const ctx = new ProcessingContext({ jobId: "job-1", storage: storage as never });
  ctx.setProviderResolver(() => new HiggsfieldProvider(CREDENTIALS));
  return { ctx, store };
}

function node(entry: HiggsfieldManifestEntry, properties: Record<string, unknown>) {
  const Node = createHiggsfieldNodeClass(entry);
  return new Node(properties);
}

const API_HEADERS = { authorization: "Key kid:ksecret", "content-type": "application/json" };

describe("Higgsfield wire parity", () => {
  it("sends the recorded requests for an image edit with two uploaded references", async () => {
    const requests = mockHiggsfield({ status: "completed", images: [{ url: "https://cdn.example/out.png" }] });
    const { ctx, store } = context();
    const instance = node(spec("alibaba/qwen-image-3/edit"), {
      prompt: "Replace the sky",
      image_urls: [
        { type: "image", uri: "", data: Uint8Array.from([1, 2, 3]), asset_id: null },
        { type: "image", uri: "https://public.example/ref.png", data: null, asset_id: null }
      ],
      seed: 4
    });

    const out = await instance.process(ctx);

    expect(requests).toEqual([
      { method: "POST", url: "https://api.higgsfield.ai/files/generate-upload-url", headers: API_HEADERS, body: { content_type: "image/png" } },
      { method: "PUT", url: "https://upload.example/put-1", headers: { "content-type": "image/png", "x-upload-token": "token-1" }, body: [1, 2, 3] },
      {
        method: "POST",
        url: "https://api.higgsfield.ai/alibaba/qwen-image-3/edit",
        headers: API_HEADERS,
        body: {
          prompt: "Replace the sky",
          image_urls: ["https://cdn.example/input-1", "https://public.example/ref.png"],
          resolution: "1k",
          aspect_ratio: "1:1",
          prompt_extend: true,
          enable_thinking: true,
          prompt_extend_mode: "direct",
          seed: 4
        }
      },
      { method: "GET", url: STATUS_URL, headers: API_HEADERS, body: null },
      { method: "GET", url: "https://cdn.example/out.png", headers: {}, body: null }
    ]);
    expect(store).toHaveBeenCalledWith(`higgsfield-image-${REQUEST_ID}-0`, Uint8Array.from([7, 8, 9]), "image/png");
    expect(out).toEqual({ output: { type: "image", uri: `memory://higgsfield-image-${REQUEST_ID}-0` } });
  }, 15_000);

  it("sends the recorded requests for an image-to-video run with an uploaded first frame", async () => {
    const requests = mockHiggsfield({ status: "completed", video: { url: "https://cdn.example/out.mp4" } });
    const { ctx, store } = context();
    const instance = node(spec("bytedance/seedance-2.5/image-to-video"), {
      prompt: "The camera pushes in",
      image_url: { type: "image", uri: "", data: Uint8Array.from([4, 5]), asset_id: null },
      duration: 6
    });

    const out = await instance.process(ctx);

    expect(requests).toEqual([
      { method: "POST", url: "https://api.higgsfield.ai/files/generate-upload-url", headers: API_HEADERS, body: { content_type: "image/png" } },
      { method: "PUT", url: "https://upload.example/put-1", headers: { "content-type": "image/png", "x-upload-token": "token-1" }, body: [4, 5] },
      {
        method: "POST",
        url: "https://api.higgsfield.ai/bytedance/seedance-2.5/image-to-video",
        headers: API_HEADERS,
        body: {
          prompt: "The camera pushes in",
          image_url: "https://cdn.example/input-1",
          duration: 6,
          resolution: "720p",
          bitrate_mode: "high",
          generate_audio: true
        }
      },
      { method: "GET", url: STATUS_URL, headers: API_HEADERS, body: null },
      { method: "GET", url: "https://cdn.example/out.mp4", headers: {}, body: null }
    ]);
    expect(store).toHaveBeenCalledWith(`higgsfield-video-${REQUEST_ID}-0`, Uint8Array.from([7, 8, 9]), "video/mp4");
    expect(out).toEqual({ output: { type: "video", uri: `memory://higgsfield-video-${REQUEST_ID}-0` } });
  }, 15_000);
});
