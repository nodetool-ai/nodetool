/**
 * `nodetool.creative.ApplyEntities` resolves before it injects.
 *
 * A picked entity is an id plus a cache; the descriptor may live only in the
 * library. Injecting the picked value directly produced an empty consistency
 * block — the node looked like it worked and the prompt lost the very thing
 * that holds a character steady. `resolveEntities` runs first, and an inline
 * entity or a graph saved with the old `list[dict]` value still injects with no
 * library at all.
 */

import { describe, expect, it } from "vitest";
import { getDeclaredPropertiesForClass } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { Entity } from "@nodetool-ai/protocol";

import { ApplyEntitiesNode } from "../src/nodes/director.js";

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

function context(withLibrary: boolean) {
  const ctx = new ProcessingContext({ jobId: "j", userId: "u" });
  if (withLibrary) {
    ctx.setModelInterfaces({
      getEntity: async ({ id }) => (id === FOX.id ? FOX : null)
    });
  }
  return ctx;
}

describe("ApplyEntitiesNode", () => {
  it("puts the library descriptor into the prompt for a picked entity", async () => {
    const node = new ApplyEntitiesNode();
    node.assign({
      text: "Fox climbs the fire escape",
      entities: [
        { type: "entity", id: "e-fox", kind: "character", name: "Fox", descriptor: "" }
      ]
    });

    const out = await node.process(context(true));

    expect(out.prompt).toContain("Consistency references:");
    expect(out.prompt).toContain("- Fox: a red fox in a blue coat");
    expect(out.reference_images).toEqual([FOX.reference_images![0]]);
  });

  it("injects a graph's old list[dict] value with no library wired", async () => {
    const node = new ApplyEntitiesNode();
    node.assign({
      text: "Fox climbs the fire escape",
      entities: [{ name: "Fox", descriptor: "a red fox in a blue coat" }]
    });

    const out = await node.process(context(false));

    expect(out.prompt).toContain("- Fox: a red fox in a blue coat");
  });

  it("leaves a picked entity alone when the library has no such row", async () => {
    const node = new ApplyEntitiesNode();
    node.assign({
      text: "Badger waits below",
      entities: [
        {
          type: "entity",
          id: "e-badger",
          kind: "character",
          name: "Badger",
          descriptor: ""
        }
      ]
    });

    const out = await node.process(context(true));

    // No descriptor to inject, so the prompt is unchanged rather than damaged.
    expect(out.prompt).toBe("Badger waits below");
  });

  it("declares entities as list[entity]", () => {
    const declared = getDeclaredPropertiesForClass(ApplyEntitiesNode).find(
      (entry) => entry.name === "entities"
    );
    expect(declared?.options.type).toBe("list[entity]");
  });
});
