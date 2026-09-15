/**
 * What the image-to-video node puts on the wire. The route names its source
 * frame `image_url`; a body that names it anything else is accepted, billed,
 * and generates from no image at all — which no unit test of the node's props
 * would catch.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { MuapiImageToVideoNode } from "../src/index.js";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d
]);
const MP4_BYTES = Uint8Array.from([
  0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 1
]);
const OUTPUT_URL = "https://cdn.muapi.ai/out/clip.mp4";

const originalFetch = global.fetch;
const originalKey = process.env.MUAPI_API_KEY;
afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.MUAPI_API_KEY;
  else process.env.MUAPI_API_KEY = originalKey;
  vi.restoreAllMocks();
});

function mockWire(): { submitBody?: Record<string, unknown> } {
  const capture: { submitBody?: Record<string, unknown> } = {};
  global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/upload_file")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ file_url: "https://files.muapi.ai/in.png" })
      } as Response;
    }
    if (u.includes("/predictions/")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({ status: "completed", outputs: [OUTPUT_URL] })
      } as Response;
    }
    if (u === OUTPUT_URL) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(MP4_BYTES);
            controller.close();
          }
        })
      } as Response;
    }
    capture.submitBody = JSON.parse(init!.body as string);
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ request_id: "req-1" })
    } as Response;
  }) as unknown as typeof fetch;
  return capture;
}

describe("MuapiImageToVideoNode", () => {
  it("references the uploaded frame as image_url", async () => {
    process.env.MUAPI_API_KEY = "muapi-test-key";
    const capture = mockWire();

    const node = new MuapiImageToVideoNode({
      image: {
        type: "image",
        uri: "",
        asset_id: null,
        data: Buffer.from(PNG_BYTES).toString("base64")
      },
      prompt: "pan right",
      aspect_ratio: "16:9",
      resolution: "720p",
      duration: 8,
      generate_audio: true
    });
    const result = await node.process();

    expect(capture.submitBody?.image_url).toBe("https://files.muapi.ai/in.png");
    expect(capture.submitBody).not.toHaveProperty("images_list");
    expect(capture.submitBody?.duration).toBe(8);
    expect(result.output.type).toBe("video");
  });
});
