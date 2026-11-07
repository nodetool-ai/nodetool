import { describe, expect, it } from "vitest";
import { MinimaxTextToImageNode } from "../src/nodes/text-to-image.js";
import { predictions, scriptedMinimax } from "./scripted.js";

// PNG signature so inferImageMime resolves to image/png.
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);
const pngB64 = Buffer.from(pngBytes).toString("base64");
const OK = {
  output: {
    data: { image_base64: [pngB64] },
    base_resp: { status_code: 0, status_msg: "success" }
  }
};

function makeNode(props: Record<string, unknown> = {}): MinimaxTextToImageNode {
  return new MinimaxTextToImageNode(props);
}

describe("MinimaxTextToImageNode", () => {
  it("calls the image route and returns a base64 image ref", async () => {
    const { provider, context } = scriptedMinimax(OK);
    const node = makeNode({ prompt: "a fox", aspect_ratio: "16:9" });
    const result = await node.process(context);

    expect(provider.endpointCalls[0]).toMatchObject({
      model: "image-01",
      route: "image",
      input: { model: "image-01", prompt: "a fox", aspect_ratio: "16:9" }
    });
    expect(predictions(context).at(-1)).toMatchObject({
      status: "completed",
      provider: "minimax",
      capability: "text_to_image",
      model: "image-01"
    });
    expect(result.output).toMatchObject({
      type: "image",
      mimeType: "image/png",
      data: pngB64
    });
  });

  it("appends the negative prompt into the prompt text", async () => {
    const { provider, context } = scriptedMinimax(OK);
    await makeNode({ prompt: "a fox", negative_prompt: "blurry" }).process(
      context
    );
    expect(String(provider.endpointCalls[0].input.prompt)).toContain(
      "Do not include: blurry"
    );
  });

  it("requires a prompt", async () => {
    await expect(makeNode({ prompt: "" }).process()).rejects.toThrow(
      "Prompt is required"
    );
  });

  it("downloads from image_urls through the provider when no base64 is returned", async () => {
    const url = "https://cdn.minimax.io/img.png";
    const { provider, context } = scriptedMinimax(
      { output: { data: { image_urls: [url] } } },
      { [url]: pngBytes }
    );
    const result = await makeNode({ prompt: "a fox" }).process(context);
    expect(provider.downloadCalls.map((call) => call.url)).toEqual([url]);
    expect(result.output).toMatchObject({ type: "image", data: pngB64 });
  });

  it("throws when the reply carries no image", async () => {
    const { context } = scriptedMinimax({ output: { data: {} } });
    await expect(
      makeNode({ prompt: "a fox" }).process(context)
    ).rejects.toThrow("MiniMax image_generation returned no image data");
  });
});
