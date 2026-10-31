import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compilePresets, createCatalog, presetToWorkflow, canAddPreset } from "../src/index.js";

const catalog = createCatalog(JSON.parse(readFileSync(new URL("../preset-catalog.json", import.meta.url), "utf8")));

describe("look catalogue", () => {
  it("ships at least 24 looks covering all six slots and camera-tuned families", () => {
    const looks = catalog.filter({ kind: "look" });
    expect(looks.length).toBeGreaterThanOrEqual(24);
    expect(new Set(looks.map((look) => look.slot))).toEqual(new Set(["body", "stock", "grade", "lighting", "era", "ramp"]));
    for (const look of looks) {
      expect(look.stackable).toBe(true);
      expect(look.preview).toBeUndefined();
      for (const family of ["default", "kling", "seedance", "veo", "wan"]) {
        expect(look.prompt[family], look.id).toBeTruthy();
      }
      expect(look.modes.includes("image")).toBe(look.slot !== "ramp");
      for (const id of look.conflicts) {
        expect(catalog.getPreset(id), id).toBeDefined();
      }
    }
  });
  it.each(["kling-v3", "dreamina_seedance_45_pro"])("stacks a look and two camera slots for %s", (modelId) => {
    const ids = ["camera.dolly-in", "camera.handheld", "look.kodak-5219"];
    const result = compilePresets(ids, { catalog, modelId, mode: "video", prompt: "A cyclist rounds a bend." });
    expect(result.applied).toEqual(ids);
    expect(result.prompt).toContain("A cyclist rounds a bend.");
    expect(result.prompt).toContain("5219");
    expect(result.warnings).toEqual([]);
  });
  it("blocks a shared look slot and explicit contradictions across slots", () => {
    const stock = catalog.getPreset("look.kodak-tri-x");
    const otherStock = catalog.getPreset("look.kodak-5219");
    const grade = catalog.getPreset("look.teal-amber");
    if (!stock || !otherStock || !grade) { throw new Error("Missing test looks"); }
    expect(canAddPreset([stock], otherStock)).toMatchObject({ ok: false, reason: "slot" });
    expect(canAddPreset([stock], grade)).toMatchObject({ ok: false, reason: "conflict" });
    expect(() => compilePresets([stock.id, grade.id], { catalog, modelId: "veo-3", mode: "video", prompt: "" })).toThrow(/cannot combine/);
  });
  it("ejects a look with unsafe scoped parameters removed", () => {
    const look = catalog.getPreset("look.arri-alexa");
    if (!look) { throw new Error("Missing test look"); }
    const graph = presetToWorkflow({ ...look, family_params: { kling: { fps: 24 } } }, { model: { provider: "fal_ai", id: "kling-v3" }, mode: "video" });
    expect(graph.nodes.find((node) => node.id === "generate")?.data).not.toHaveProperty("fps");
    expect(graph.nodes.find((node) => node.id === "template")?.data.string).toContain("ARRI Alexa");
  });
});
