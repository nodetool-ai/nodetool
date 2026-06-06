import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { registerReveNodes, REVE_NODES } from "../src/index.js";
import { CreateImageNode } from "../src/nodes/create-image.js";
import { EditImageNode } from "../src/nodes/edit-image.js";
import { RemixImageNode } from "../src/nodes/remix-image.js";

describe("registerReveNodes", () => {
  it("registers the Reve node pack", () => {
    const registry = new NodeRegistry();

    registerReveNodes(registry);

    expect(registry.has("reve.CreateImage")).toBe(true);
    expect(registry.has("reve.EditImage")).toBe(true);
    expect(registry.has("reve.RemixImage")).toBe(true);
    expect(REVE_NODES).toHaveLength(3);
  });

  it("declares image outputs and requires the API key", () => {
    for (const Node of [CreateImageNode, EditImageNode, RemixImageNode]) {
      expect(Node.metadataOutputTypes).toEqual({ output: "image" });
      expect(Node.requiredSettings).toEqual(["REVE_API_KEY"]);
      expect(Node.autoSaveAsset).toBe(true);
    }
  });
});
