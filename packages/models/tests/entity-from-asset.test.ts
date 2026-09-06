import { describe, expect, it } from "vitest";

import { entityFromAsset } from "../src/entity.js";

/** The fields `entityFromAsset` reads off an asset row. */
const assetRow = (metadata: Record<string, unknown> | null) => ({
  id: "a1",
  content_type: "image/png",
  created_at: "2026-01-01T00:00:00.000Z",
  metadata
});

describe("entityFromAsset", () => {
  it("reads the marker and points the reference image at the asset's own bytes", () => {
    expect(
      entityFromAsset(
        assetRow({
          nodetool_entity: {
            kind: "character",
            name: "Mara",
            descriptor: "a tall woman with red hair",
            voice_id: "v1"
          }
        })
      )
    ).toMatchObject({
      type: "entity",
      id: "a1",
      kind: "character",
      name: "Mara",
      voice_id: "v1",
      project_id: "default",
      created_at: "2026-01-01T00:00:00.000Z",
      reference_images: [
        { type: "image", asset_id: "a1", uri: "asset://a1.png" }
      ]
    });
  });

  it("follows a swapped picture without moving the entity's id", () => {
    expect(
      entityFromAsset(
        assetRow({
          nodetool_entity: {
            kind: "prop",
            name: "Kettle",
            descriptor: "matte black",
            reference_asset_id: "a9"
          }
        })
      )
    ).toMatchObject({
      id: "a1",
      reference_images: [{ type: "image", asset_id: "a9", uri: "asset://a9" }]
    });
  });

  it("carries the lineage a graph stamped on the marker", () => {
    expect(
      entityFromAsset(
        assetRow({
          nodetool_entity: {
            kind: "prop",
            name: "Kettle",
            descriptor: "matte black",
            source: { workflow_id: "wf_7", key: "SKU-119" }
          }
        })
      )?.source
    ).toEqual({ workflow_id: "wf_7", key: "SKU-119" });
  });

  it("is null for an asset with no marker and for an unknown kind", () => {
    expect(entityFromAsset(assetRow(null))).toBeNull();
    expect(
      entityFromAsset(assetRow({ nodetool_entity: { kind: "vehicle" } }))
    ).toBeNull();
  });
});
