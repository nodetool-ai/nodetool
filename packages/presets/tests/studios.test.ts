import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  catalogEntryJsonSchema,
  compileMediaPresets,
  compilePresets,
  createCatalog,
  listCatalog,
  studioPresetProblem,
  studioSchema,
  type Studio
} from "../src/index.js";

const rows: unknown[] = JSON.parse(readFileSync(new URL("../preset-catalog.json", import.meta.url), "utf8"));
const catalog = createCatalog(rows);
const studio = (target: Studio["target"], preset_ids: string[]): Studio => studioSchema.parse({
  id: "studio.test", version: 1, kind: "studio", name: "Test", description: "A test studio.", target, preset_ids
});

describe("studio catalogue", () => {
  it("ships outcome studios whose preset ids resolve to generation presets that fit the target", () => {
    expect(catalog.studios.length).toBeGreaterThanOrEqual(6);
    for (const entry of catalog.studios) {
      for (const id of entry.preset_ids) {
        expect(catalog.getPreset(id), `${entry.id} → ${id}`).toBeDefined();
      }
      expect(studioPresetProblem(entry, catalog.getPreset), entry.id).toBeNull();
    }
    expect(new Set(catalog.studios.map((entry) => entry.target.type)))
      .toEqual(new Set(["create", "effects", "lipsync", "skill", "flow", "app"]));
  });

  it("names shipped starter skills and example apps that exist", () => {
    let inspected = 0;
    for (const { id, target } of catalog.studios) {
      if (target.type === "skill") {
        expect(existsSync(new URL(`../../system-skills/${target.skill}/SKILL.md`, import.meta.url)), id).toBe(true);
        inspected++;
      }
      if (target.type === "app") {
        expect(existsSync(new URL(`../../base-nodes/nodetool/examples/apps/${target.app}.app.json`, import.meta.url)), id).toBe(true);
        inspected++;
      }
    }
    expect(inspected).toBeGreaterThan(0);
  });

  it("rejects preset ids that do not fit the target", () => {
    const get = catalog.getPreset;
    expect(studioPresetProblem(studio({ type: "create", mode: "video" }, ["camera.missing"]), get)).toMatch(/unknown preset/);
    expect(studioPresetProblem(studio({ type: "create", mode: "video" }, ["effect.levitate"]), get)).toMatch(/no effect/);
    expect(studioPresetProblem(studio({ type: "create", mode: "image" }, ["camera.dolly-in"]), get)).toMatch(/mode/);
    expect(studioPresetProblem(studio({ type: "create", mode: "video" }, ["camera.dolly-in", "camera.dolly-out"]), get)).toMatch(/cannot join/);
    expect(studioPresetProblem(studio({ type: "effects" }, ["camera.dolly-in"]), get)).toMatch(/not an effect/);
    expect(studioPresetProblem(studio({ type: "lipsync" }, ["camera.dolly-in"]), get)).toMatch(/takes no presets/);
    expect(() => createCatalog([...rows, studio({ type: "skill", skill: "x" }, ["look.kodak-5219"])])).toThrow(/takes no presets/);
    expect(() => studioSchema.parse({ ...studio({ type: "lipsync" }, []), target: { type: "page" } })).toThrow();
  });

  it("keeps studios out of compilation and alias lookup", () => {
    const id = catalog.studios[0].id;
    expect(catalog.getPreset(id)).toBeUndefined();
    expect(catalog.byAlias(catalog.studios[0].name)).toBeUndefined();
    expect(() => compilePresets([id], { catalog, modelId: "kling-v3", mode: "video", prompt: "" }))
      .toThrow(`${id} is a studio`);
    expect(() => compileMediaPresets([id], "", "kling-v3", "video", "", catalog)).toThrow(/is a studio/);
  });

  it("lists studios by kind and leaves them out of mode and family filters", () => {
    expect(listCatalog(catalog, { kind: "studio" })).toEqual(catalog.studios);
    expect(listCatalog(catalog, { kind: "studio", mode: "video" })).toEqual([]);
    expect(listCatalog(catalog, { mode: "video" }).some((row) => row.kind === "studio")).toBe(false);
    expect(listCatalog(catalog, {})).toHaveLength(catalog.presets.length + catalog.studios.length);
    expect(listCatalog(catalog, { kind: "camera", family: "kling" }).every((row) => row.kind === "camera")).toBe(true);
  });

  it("exports one JSON Schema covering both row shapes", () => {
    expect(catalogEntryJsonSchema.$schema).toMatch(/json-schema/);
    expect(catalogEntryJsonSchema.oneOf).toHaveLength(2);
    expect(catalogEntryJsonSchema.oneOf[1]).toMatchObject({ required: expect.arrayContaining(["target"]) });
  });
});
