/**
 * @jest-environment jsdom
 */
import type { Entity } from "@nodetool-ai/protocol";

const mockAsset = {
  id: "asset-1",
  user_id: "u",
  parent_id: null,
  name: "Mara",
  content_type: "image/png",
  size: null,
  metadata: {
    nodetool_entity: {
      kind: "character",
      name: "Mara",
      descriptor: "a tall woman with red hair"
    }
  },
  sketch_document_id: null,
  workflow_id: null,
  node_id: null,
  job_id: null,
  timeline_id: null,
  created_at: "",
  get_url: "http://example/a.png",
  thumb_url: null
};

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    assets: {
      search: {
        query: jest.fn(async () => ({
          assets: [mockAsset],
          next_cursor: null,
          total_count: 1,
          is_global_search: true
        }))
      }
    }
  }
}));

import { injectEntities } from "../builtin/entities";
import { FrontendToolRegistry } from "../frontendTools";

const noopCtx = {
  abortSignal: new AbortController().signal,
  getState: () => ({}) as never
};

describe("injectEntities", () => {
  it("appends the descriptor and collects reference asset ids", () => {
    const entities: Entity[] = [
      {
        type: "entity",
        id: "asset-1",
        kind: "character",
        name: "Mara",
        descriptor: "a tall woman with red hair",
        reference_images: [
          { type: "image", asset_id: "asset-1", uri: "http://example/a.png" }
        ]
      }
    ];
    const result = injectEntities("Mara walks into the room", entities);
    expect(result.prompt).toContain("a tall woman with red hair");
    expect(result.referenceAssetIds).toEqual(["asset-1"]);
  });

  it("does not inject when the name is absent and no ids are given", () => {
    const entities: Entity[] = [
      {
        type: "entity",
        id: "asset-1",
        kind: "character",
        name: "Rex",
        descriptor: "a golden retriever",
        reference_images: []
      }
    ];
    const result = injectEntities("A quiet street", entities);
    expect(result.prompt).toBe("A quiet street");
    expect(result.referenceAssetIds).toEqual([]);
  });
});

describe("ui_entity_apply tool", () => {
  it("injects the entity descriptor for the selected entity id", async () => {
    const tool = FrontendToolRegistry.get("ui_entity_apply");
    expect(tool).toBeDefined();
    const result = (await tool!.execute(
      { text: "Mara walks", entityIds: ["asset-1"] },
      noopCtx
    )) as { prompt: string; referenceAssetIds: string[] };
    expect(result.prompt).toContain("a tall woman with red hair");
    expect(result.referenceAssetIds).toContain("asset-1");
  });
});
