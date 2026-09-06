/**
 * `entities` on `nodetool.video.TextToVideo` and `nodetool.video.ImageToVideo`.
 *
 * Both are typed `list[entity]` and both resolve a picked entity against the
 * library before the provider call, so an entity whose descriptor lives only in
 * the library still seasons the prompt. A graph saved when `ImageToVideo`'s
 * property was `list[dict]` runs unchanged — the runtime value is the same
 * object either way.
 */

import { describe, expect, it, vi } from "vitest";
import { getDeclaredPropertiesForClass } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { Entity } from "@nodetool-ai/protocol";

import { ImageToVideoNode, TextToVideoNode } from "../src/nodes/video.js";

const FOX: Entity = {
  type: "entity",
  id: "e-fox",
  kind: "character",
  name: "Fox",
  descriptor: "a red fox in a blue coat",
  reference_images: [
    { type: "image", asset_id: "e-fox", uri: "asset://e-fox.png" }
  ]
};

const PICKED = {
  type: "entity",
  id: "e-fox",
  kind: "character",
  name: "Fox",
  descriptor: ""
};

function contextWithProvider(withLibrary: boolean) {
  const context = new ProcessingContext({ jobId: "j", userId: "u" });
  if (withLibrary) {
    context.setModelInterfaces({
      getEntity: async ({ id }) => (id === FOX.id ? FOX : null)
    });
  }
  const runProviderPrediction = vi.fn(async () => new Uint8Array([9, 9, 9]));
  context.runProviderPrediction =
    runProviderPrediction as unknown as ProcessingContext["runProviderPrediction"];
  return { context, runProviderPrediction };
}

const entitiesParam = (call: unknown): Entity[] => {
  const req = call as { params: { entities: Entity[] } };
  return req.params.entities;
};

const model = { type: "video_model", provider: "fake", id: "m1" };

describe("TextToVideoNode entities", () => {
  it("resolves a picked entity before the provider call", async () => {
    const { context, runProviderPrediction } = contextWithProvider(true);
    const node = new TextToVideoNode();
    node.assign({ prompt: "Fox on a rooftop", model, entities: [PICKED] });

    await node.process(context);

    expect(
      entitiesParam(runProviderPrediction.mock.calls[0][0])[0].descriptor
    ).toBe("a red fox in a blue coat");
  });

  it("declares entities as list[entity]", () => {
    const declared = getDeclaredPropertiesForClass(TextToVideoNode).find(
      (entry) => entry.name === "entities"
    );
    expect(declared?.options.type).toBe("list[entity]");
  });
});

describe("ImageToVideoNode entities", () => {
  it("runs a graph saved with the old list[dict] value", async () => {
    const { context, runProviderPrediction } = contextWithProvider(false);
    const node = new ImageToVideoNode();
    node.assign({
      prompt: "Fox on a rooftop",
      model,
      image: [{ type: "image", data: new Uint8Array([1, 2, 3]) }],
      entities: [{ name: "Fox", descriptor: "a red fox in a blue coat" }]
    });

    const out = await node.process(context);

    expect(out.output.type).toBe("video");
    expect(entitiesParam(runProviderPrediction.mock.calls[0][0])).toEqual([
      { name: "Fox", descriptor: "a red fox in a blue coat" }
    ]);
  });

  it("resolves a picked entity before the provider call", async () => {
    const { context, runProviderPrediction } = contextWithProvider(true);
    const node = new ImageToVideoNode();
    node.assign({
      prompt: "Fox on a rooftop",
      model,
      image: [{ type: "image", data: new Uint8Array([1, 2, 3]) }],
      entities: [PICKED]
    });

    await node.process(context);

    expect(
      entitiesParam(runProviderPrediction.mock.calls[0][0])[0].descriptor
    ).toBe("a red fox in a blue coat");
  });

  it("declares entities as list[entity]", () => {
    const declared = getDeclaredPropertiesForClass(ImageToVideoNode).find(
      (entry) => entry.name === "entities"
    );
    expect(declared?.options.type).toBe("list[entity]");
  });
});
