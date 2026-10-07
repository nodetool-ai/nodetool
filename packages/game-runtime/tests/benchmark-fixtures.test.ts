import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateAnyGame } from "../src/index.js";

describe("benchmark fixture workloads", () => {
  it.each(["bench-2d-500", "bench-3d-1000", "bench-3d-64-scripted"])("validates %s and retains its intended workload", async (name) => {
    const validation = validateAnyGame(JSON.parse(await readFile(new URL(`../bench/${name}.json`, import.meta.url), "utf8")));
    expect(validation.valid).toBe(true);
    if (!validation.valid) { throw new Error(validation.diagnostics.map((issue) => issue.message).join(", ")); }
    const document = validation.document;
    const entities = document.scenes.flatMap((scene) => scene.entities);
    const scripts = entities.flatMap((entity) => entity.behaviors).filter((behavior) => behavior.kind === "script");
    if (document.schemaVersion === 3) {
      expect(entities).toHaveLength(name === "bench-3d-1000" ? 1000 : 64);
      expect(scripts).toHaveLength(name === "bench-3d-1000" ? 0 : 30);
      const spatial = document.scenes.flatMap((scene) => scene.entities);
      expect(spatial.filter((entity) => entity.body3d?.type === "dynamic")).toHaveLength(name === "bench-3d-1000" ? 100 : 61);
      expect(spatial.filter((entity) => entity.model)).toHaveLength(10);
    } else {
      expect(entities).toHaveLength(500);
      expect(scripts).toHaveLength(32);
      expect(document.scenes.flatMap((scene) => scene.entities).some((entity) => entity.tilemap)).toBe(true);
    }
  });
});
