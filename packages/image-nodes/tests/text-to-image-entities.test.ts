/**
 * `nodetool.image.TextToImage`'s `entities` property is typed `list[entity]`.
 *
 * Two things have to stay true across that retype: a graph saved when the
 * property was `list[dict]` still runs (the runtime value never changed shape),
 * and a picked entity — an id with an empty descriptor — is resolved against
 * the library before the provider ever sees it, so the consistency block is not
 * silently empty.
 */

import { describe, expect, it, vi } from "vitest";
import { getDeclaredPropertiesForClass } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { Entity } from "@nodetool-ai/protocol";

import { TextToImageNode } from "../src/nodes/image.js";

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

function contextWithProvider(withLibrary: boolean) {
  const context = new ProcessingContext({ jobId: "j", userId: "u" });
  if (withLibrary) {
    context.setModelInterfaces({
      getEntity: async ({ id }) => (id === FOX.id ? FOX : null)
    });
  }
  const runProviderPrediction = vi.fn(async () => new Uint8Array([1, 2, 3]));
  context.runProviderPrediction =
    runProviderPrediction as unknown as ProcessingContext["runProviderPrediction"];
  return { context, runProviderPrediction };
}

const entitiesParam = (call: unknown): Entity[] => {
  const req = call as { params: { entities: Entity[] } };
  return req.params.entities;
};

describe("TextToImageNode entities", () => {
  it("runs a graph saved with the old list[dict] value", async () => {
    const { context, runProviderPrediction } = contextWithProvider(false);
    const node = new TextToImageNode();
    // Exactly what a pre-retype graph stored: bare dicts, no `type` tag.
    node.assign({
      prompt: "Fox on a rooftop",
      model: { type: "image_model", provider: "fake", id: "m1" },
      entities: [{ name: "Fox", descriptor: "a red fox in a blue coat" }]
    });

    const out = await node.process(context);

    expect(out.output.type).toBe("image");
    expect(entitiesParam(runProviderPrediction.mock.calls[0][0])).toEqual([
      { name: "Fox", descriptor: "a red fox in a blue coat" }
    ]);
  });

  it("resolves a picked entity against the library before calling the provider", async () => {
    const { context, runProviderPrediction } = contextWithProvider(true);
    const node = new TextToImageNode();
    node.assign({
      prompt: "Fox on a rooftop",
      model: { type: "image_model", provider: "fake", id: "m1" },
      entities: [
        { type: "entity", id: "e-fox", kind: "character", name: "Fox", descriptor: "" }
      ]
    });

    await node.process(context);

    const passed = entitiesParam(runProviderPrediction.mock.calls[0][0]);
    expect(passed[0].descriptor).toBe("a red fox in a blue coat");
    expect(passed[0].reference_images?.[0].uri).toBe("asset://e-fox.png");
  });

  it("declares the entities property as list[entity]", () => {
    const declared = getDeclaredPropertiesForClass(TextToImageNode).find(
      (entry) => entry.name === "entities"
    );
    expect(declared?.options.type).toBe("list[entity]");
  });
});
