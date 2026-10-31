import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createCatalog, presetSchema, presetToWorkflow, type PresetMode } from "@nodetool-ai/presets";
import { initDb, closeDb } from "@nodetool-ai/models";
import { createFakeContext } from "@nodetool-ai/runtime";
import { runValidate } from "../src/validate/index.js";
import { normalizeGraph } from "../src/debug/target.js";
import { runOnServer } from "../src/debug/server-runner.js";

const catalog = createCatalog(JSON.parse(readFileSync(new URL("../../presets/preset-catalog.json", import.meta.url), "utf8")));
const dir = mkdtempSync(join(tmpdir(), "preset-ejection-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const modes: PresetMode[] = ["video", "image_to_video", "reference_to_video", "image", "image_edit", "video_edit"];
function modelFor(mode: PresetMode) {
  return { provider: "fake", id: mode === "image" || mode === "image_edit" ? "fake-image" : "fake-video" };
}

describe("preset ejection validation", () => {
  it("inspects a nonempty catalogue and validates every preset and advertised mode", async () => {
    expect(catalog.presets.length).toBeGreaterThan(0);
    for (const preset of catalog.presets) {
      for (const mode of preset.modes) {
        const graph = presetToWorkflow(preset, { mode, model: modelFor(mode) });
        const file = join(dir, `${preset.id}-${mode}.json`);
        writeFileSync(file, JSON.stringify({ graph }));
        const { report } = await runValidate(file, { loadFromDb: async () => null });
        expect(report.issues.filter(issue => issue.severity !== "info"), `${preset.id}/${mode}`).toEqual([]);
        expect(report.ok).toBe(true);
      }
    }
  }, 120_000);

  it.each(modes)("validates %s wiring, including scalar media to list inputs", async mode => {
    const preset = presetSchema.parse({ id: "effect.fixture", version: 1, kind: "effect", name: "Fixture", description: "Fixture", modes: [mode], prompt: { default: "Move slowly." } });
    const graph = presetToWorkflow(preset, { mode, model: modelFor(mode) });
    const file = join(dir, `${mode}.json`);
    writeFileSync(file, JSON.stringify({ graph }));
    const { report } = await runValidate(file, { loadFromDb: async () => null });
    expect(report.issues.filter(issue => issue.severity !== "info")).toEqual([]);
  });

  it("rejects deliberately invalid ejected wiring", async () => {
    const graph = presetToWorkflow(catalog.presets[0], { mode: catalog.presets[0].modes[0], model: modelFor("video") });
    graph.edges[0].targetHandle = "nonexistent";
    graph.nodes[1].type = "nodetool.missing.Invalid";
    const file = join(dir, "invalid.json");
    writeFileSync(file, JSON.stringify({ graph }));
    const { report } = await runValidate(file, { loadFromDb: async () => null });
    expect(report.ok).toBe(false);
  });

  it("runs an ejected graph on the nodetool debug server surface with the fake provider", async () => {
    const preset = presetSchema.parse({ id: "look.fixture", version: 1, kind: "look", name: "Fixture", description: "Fixture", modes: ["image"], prompt: { default: "Soft light." } });
    initDb(":memory:");
    const fake = createFakeContext({ persistOutputAssets: false });
    try {
      const provider = await fake.context.getProvider("fake");
      const generate = vi.spyOn(provider, "textToImage");
      const graph = presetToWorkflow(preset, { mode: "image", model: modelFor("image") });
      const { report } = await runOnServer({ graph: normalizeGraph(graph), workflowId: null, params: { prompt: "A cup" }, context: fake.context });
      expect(generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: "A cup Soft light." }));
      expect(report.ok, JSON.stringify(report)).toBe(true);
      expect(report.summary.errors).toEqual([]);
      expect(report.summary.outputs.length).toBeGreaterThan(0);
    } finally {
      fake.cleanup();
      await closeDb();
    }
  }, 120_000);
});
