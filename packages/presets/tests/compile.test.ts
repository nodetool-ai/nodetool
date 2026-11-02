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
    const a = preset("camera.a", { params: { duration_seconds: 4 } });
    const b = preset("camera.b", { params: { duration_seconds: 4, resolution: "720p" } });
    expect(compile([a, b]).params).toEqual({ duration_seconds: 4, resolution: "720p" });
    b.params.duration_seconds = 8;
    expect(() => compile([a, b])).toThrow(/duration_seconds.*camera.a.*camera.b/);
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

describe("look parameters", () => {
  it("overrides shared params within a family before checking stack conflicts", () => {
    const look = preset("look.a", {
      kind: "look", slot: "stock", params: { duration_seconds: 4 },
      family_params: { kling: { duration_seconds: 6, resolution: "1080p" } }
    });
    expect(compile([look], undefined, "kling-v3").params).toEqual({ duration_seconds: 6, resolution: "1080p" });
    const result = compile([look], undefined, "veo-3");
    expect(result.params).toEqual({ duration_seconds: 4 });
    expect(result.warnings).toContainEqual(expect.stringMatching(/look.a.*resolution.*dropped.*veo/));
    const camera = preset("camera.a", { params: { duration_seconds: 4 } });
    expect(() => compile([camera, look], undefined, "kling-v3")).toThrow(/duration_seconds.*camera.a.*look.a/);
  });
  it.each(["kling-v3", "veo-3", "unknown"])("drops unsafe params before conflict checking for %s", (model) => {
    const look = preset("look.a", {
      kind: "look", slot: "ramp", params: { fps: 24 },
      family_params: { kling: { fps: 30, negative_prompt: "motion blur" } }
    });
    const result = compile([look], undefined, model);
    expect(result.params).toEqual({});
    expect(result.warnings).toContainEqual(expect.stringMatching(/look.a.*fps.*dropped/));
    expect(result.warnings).toContainEqual(expect.stringMatching(/look.a.*negative_prompt.*dropped/));
  });
  it("warns about every setting removed by mode filtering", () => {
    const look = preset("look.a", { kind: "look", params: { width: 1024, typo: true } });
    const result = compile([look], undefined, "veo-3");
    expect(result.params).toEqual({});
    expect(result.warnings).toContainEqual(expect.stringMatching(/look.a.*width.*dropped.*veo/));
    expect(result.warnings).toContainEqual(expect.stringMatching(/look.a.*typo.*dropped.*veo/));
  });
  it("does not use default family settings as a fallback for an unknown model", () => {
    const look = preset("look.a", { kind: "look", family_params: { default: { resolution: "720p" } } });
    expect(compile([look], undefined, "default").params).toEqual({ resolution: "720p" });
    const result = compile([look], undefined, "unknown");
    expect(result.params).toEqual({});
    expect(result.warnings).toContainEqual(expect.stringMatching(/resolution.*dropped.*unknown/));
  });
  it("rejects unknown family names in the schema", () => {
    expect(() => presetSchema.parse({ ...preset("look.a"), family_params: { typo: { fps: 24 } } })).toThrow();
  });
});
