import { describe, expect, it } from "vitest";
import { compilePresets, createCatalog, presetSchema, type Preset } from "../src/index.js";

function preset(id: string, extra: Partial<Preset> = {}): Preset {
  return presetSchema.parse({
    id, version: 1, kind: "camera", name: id, description: id,
    modes: ["video"], stackable: true, prompt: { default: id }, ...extra
  });
}
function compile(presets: Preset[], ids = presets.map((p) => p.id), modelId = "unknown") {
  return compilePresets(ids, { modelId, mode: "video", prompt: "subject", catalog: createCatalog(presets) });
}
describe("compilePresets", () => {
  it.each([
    ["kling", "fal-ai/kling-video/v3/pro/text-to-video"],
    ["seedance", "dreamina_seedance_45_pro"],
    ["veo", "veo-3.1"],
    ["wan", "wan-2.6/image-to-video"],
    ["sora", "openai/sora-2"],
    ["minimax", "minimax/h3"],
    ["ltx", "lightricks/ltx-video"],
    ["local-wan", "local-wan"],
    ["default", "default"]
  ])("selects %s fragments", (family, id) => {
    const result = compile([preset("camera.a", { prompt: { default: "fallback", [family]: "specific" } })], undefined, id);
    expect(result.prompt).toBe("subject specific");
    expect(result.warnings).toEqual([]);
  });
  it("falls back with a warning identifying the preset and family", () => {
    const result = compile([preset("camera.a")], undefined, "veo-3");
    expect(result.prompt).toBe("subject camera.a");
    expect(result.warnings[0]).toMatch(/camera.a.*veo.*default/);
  });
  it("applies prefix, suffix and replacement in stack order", () => {
    const a = preset("camera.a", { prompt: { default: { prefix: "before", suffix: "after" } } });
    const b = preset("camera.b", { prompt: { default: { replace: "replacement", prefix: "new", suffix: "end" } } });
    expect(compile([a]).prompt).toBe("before subject after");
    expect(compile([a, b]).prompt).toBe("new replacement end");
    expect(compile([b, a]).prompt).toBe("before new replacement end after");
    expect(compile([a, b]).applied).toEqual(["camera.a", "camera.b"]);
  });
  it("keeps the prompt for an empty stack", () => {
    expect(compile([preset("camera.a")], [])).toEqual({ prompt: "subject", params: {}, warnings: [], applied: [] });
  });
  it("merges equal parameters and rejects unequal values naming both presets", () => {
    const a = preset("camera.a", { params: { fps: 24 } });
    const b = preset("camera.b", { params: { fps: 24, audio: true } });
    expect(compile([a, b]).params).toEqual({ fps: 24, audio: true });
    b.params.fps = 30;
    expect(() => compile([a, b])).toThrow(/fps.*camera.a.*camera.b/);
  });
  it.each([
    { slot: "move" as const },
    { stackable: false },
    { conflicts: ["camera.b"] }
  ])("rejects incompatible stacks: %j", (extra) => {
    expect(() => compile([
      preset("camera.a", extra), preset("camera.b", { slot: "move" })
    ])).toThrow(/camera.a.*camera.b/);
  });
  it("checks conflicts in either direction and duplicate ids", () => {
    const a = preset("camera.a");
    const b = preset("camera.b", { conflicts: ["camera.a"] });
    expect(() => compile([a, b])).toThrow(/camera.a.*camera.b/);
    expect(() => compile([a], [a.id, a.id])).toThrow(/cannot combine/);
  });
  it("allows a non-stackable preset on its own", () => {
    expect(compile([preset("camera.a", { stackable: false })]).applied).toEqual(["camera.a"]);
  });
  it("allows three presets and rejects four", () => {
    const presets = ["a", "b", "c", "d"].map((id) => preset("camera." + id));
    expect(compile(presets.slice(0, 3)).applied).toHaveLength(3);
    expect(() => compile(presets)).toThrow(/three/);
  });
  it("rejects unknown ids and unsupported modes", () => {
    expect(() => compile([preset("camera.a")], ["camera.missing"])).toThrow("Unknown preset: camera.missing");
    expect(() => compile([preset("camera.a", { modes: ["image"] })])).toThrow(/does not support mode video/);
  });
});
