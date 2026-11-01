import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPackageAssetJson } from "@nodetool-ai/config";
import { catalogEntryJsonSchema, catalogEntrySchema, createCatalog, loadCatalog, presetSchema, presetJsonSchema } from "../src/index.js";

const root = new URL("../", import.meta.url);
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, root), "utf8"));
}
describe("catalogue", () => {
  it("validates every file, unique ids and aliases, and matching paths", () => {
    const rows = [];
    for (const kind of readdirSync(new URL("catalog/", root))) {
      for (const file of readdirSync(new URL(`catalog/${kind}/`, root))) {
        const preset = catalogEntrySchema.parse(readJson(`catalog/${kind}/${file}`));
        expect(preset.kind).toBe(kind);
        expect(preset.id.startsWith(`${kind}.`)).toBe(true);
        expect(file).toBe(`${preset.id}.json`);
        rows.push(preset);
      }
    }
    expect(rows.length).toBeGreaterThan(0);
    const catalog = createCatalog(rows);
    expect(catalog.presets.length + catalog.studios.length).toBe(rows.length);
  });
  it("ships a rendered preview backed by a run record for camera and effect presets", () => {
    let inspected = 0;
    for (const kind of readdirSync(new URL("catalog/", root))) {
      for (const file of readdirSync(new URL(`catalog/${kind}/`, root))) {
        const preset = catalogEntrySchema.parse(readJson(`catalog/${kind}/${file}`));
        // Studios open a surface and have no preview.
        if (preset.kind === "studio") { continue; }
        expect(preset.preview?.url, preset.id).toMatch(/^https:\/\/.+\.mp4$/);
        expect(preset.preview?.poster, preset.id).toMatch(/^https:\/\/.+\.png$/);
        expect(existsSync(new URL(preset.preview?.run ?? "missing", root)), preset.id).toBe(true);
        inspected++;
      }
    }
    expect(inspected).toBeGreaterThan(0);
  });
  it("requires default and rejects invalid fragment fields", () => {
    const row = loadCatalog(() => readJson("preset-catalog.json")).presets[0];
    expect(() => presetSchema.parse({ ...row, prompt: { kling: "move" } })).toThrow(/default/);
    expect(() => presetSchema.parse({ ...row, prompt: { default: { typo: "move" } } })).toThrow();
    expect(presetJsonSchema.properties?.prompt).toMatchObject({ required: ["default"] });
    expect(presetJsonSchema.required).not.toContain("tags");
    expect(presetJsonSchema.required).not.toContain("params");
  });
  it("finds exact aliases and names without case sensitivity and filters kind/mode", () => {
    const catalog = loadCatalog(() => readJson("preset-catalog.json"));
    expect(catalog.byAlias("DOLLY IN")?.id).toBe("camera.dolly-in");
    expect(catalog.byAlias("dolly")).toBeUndefined();
    expect(catalog.getPreset("missing")).toBeUndefined();
    expect(catalog.filter({ kind: "camera", mode: "video" }).length).toBeGreaterThan(0);
    expect(catalog.filter({ kind: "effect" }).filter(preset => preset.inputs.includes("image"))).toHaveLength(20);
    expect(catalog.filter({ kind: "look", mode: "image" }).length).toBeGreaterThan(0);
  });
  it("rejects duplicate ids and aliases across presets", () => {
    const catalog = loadCatalog(() => readJson("preset-catalog.json"));
    const a = catalog.presets[0];
    const b = catalog.presets[1];
    expect(() => createCatalog([a, a])).toThrow(/Duplicate preset id/);
    expect(() => createCatalog([a, { ...b, aliases: [a.name.toUpperCase()] }])).toThrow(/belongs to both/);
  });
  it("loads the registered server asset through config", () => {
    const catalog = loadCatalog(() => loadPackageAssetJson(
      { pkg: "@nodetool-ai/presets", path: "preset-catalog.json" }, import.meta.url
    ));
    expect(catalog.presets.length).toBeGreaterThan(0);
  });
  it("keeps generated JSON Schema and catalogue in sync", () => {
    execFileSync(process.execPath, ["scripts/generate.mjs", "--check"], { cwd: fileURLToPath(root) });
    expect(readJson("preset.schema.json")).toEqual(catalogEntryJsonSchema);
  });
});
