import { describe, expect, it } from "vitest";

import { ENTITY_METADATA_KEY, readEntityMarker } from "../src/index.js";

const marker = (value: unknown) => ({ [ENTITY_METADATA_KEY]: value });

describe("readEntityMarker source", () => {
  it("leaves a marker written before `source` existed without one", () => {
    const read = readEntityMarker(
      marker({ kind: "character", name: "Nova", descriptor: "a courier" })
    );
    expect(read).not.toBeNull();
    expect(read).not.toHaveProperty("source");
  });

  it("round-trips the workflow and upsert key a graph stamped", () => {
    const read = readEntityMarker(
      marker({
        kind: "prop",
        name: "Kettle",
        descriptor: "matte black",
        source: { workflow_id: "wf_7", key: "SKU-119" }
      })
    );
    expect(read?.source).toEqual({ workflow_id: "wf_7", key: "SKU-119" });
  });

  it("drops a malformed source rather than losing the entity", () => {
    const read = readEntityMarker(
      marker({ kind: "style", name: "Dusk", descriptor: "amber", source: 7 })
    );
    expect(read?.name).toBe("Dusk");
    expect(read?.source).toBeUndefined();
  });
});
