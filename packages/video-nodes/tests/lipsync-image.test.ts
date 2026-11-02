import { describe, expect, it } from "vitest";
import { LipSyncNode } from "../src/nodes/video.js";

describe("LipSync image input", () => {
  it("sends image and audio bytes with their mime types", async () => {
    const node = new LipSyncNode();
    const image = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const audio = new Uint8Array([0x49, 0x44, 0x33]);
    node.assign({
      model: { type: "video_model", provider: "fake", id: "lipsync" },
      image: { type: "image", data: Buffer.from(image).toString("base64") },
      audio: { type: "audio", data: Buffer.from(audio).toString("base64") }
    });
    const requests: Array<Record<string, unknown>> = [];
    await node.process({
      runProviderPrediction: async (request: Record<string, unknown>) => {
        requests.push(request);
        return new Uint8Array([1]);
      }
    } as never);
    expect(requests[0]).toMatchObject({
      capability: "lip_sync",
      params: {
        video: image,
        audio,
        visualMimeType: "image/jpeg",
        audioMimeType: "audio/mpeg"
      }
    });
  });
});
