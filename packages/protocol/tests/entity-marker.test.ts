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

describe("readEntityMarker thumbnail", () => {
  const preset = {
    kind: "style",
    name: "Flat / Vector",
    descriptor: "flat shapes",
    system: true,
    preset_id: "flat-vector",
    thumbnail: "package://nodetool-base/styles/flat-vector.jpg"
  };

  it("keeps the package thumbnail a shipped preset carries", () => {
    expect(readEntityMarker(marker(preset))?.thumbnail).toBe(
      "package://nodetool-base/styles/flat-vector.jpg"
    );
  });

  it("drops a thumbnail that is not a package asset URI", () => {
    const read = readEntityMarker(
      marker({ ...preset, thumbnail: "https://example.com/a.jpg" })
    );
    expect(read?.name).toBe("Flat / Vector");
    expect(read).not.toHaveProperty("thumbnail");
  });

  it("drops a thumbnail on a marker that is not a system entity", () => {
    const { system: _system, ...ordinary } = preset;
    expect(readEntityMarker(marker(ordinary))).not.toHaveProperty("thumbnail");
  });
});
