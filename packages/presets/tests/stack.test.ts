import { describe, expect, it } from "vitest";
import { canAddPreset, compilePresets, createCatalog, presetSchema, type Preset } from "../src/index.js";

function preset(id: string, extra: Partial<Preset> = {}): Preset {
  return presetSchema.parse({
    id, version: 1, kind: "camera", name: id, description: id,
    modes: ["video"], stackable: true, prompt: { default: id }, ...extra
  });
}

describe("canAddPreset", () => {
  it("accepts a stackable preset in a free slot", () => {
    expect(canAddPreset([preset("camera.a", { slot: "move" })], preset("camera.b", { slot: "rig" }))).toEqual({ ok: true });
  });
  it("rejects a fourth preset", () => {
    const stack = [preset("camera.a"), preset("camera.b"), preset("camera.c")];
    expect(canAddPreset(stack, preset("camera.d"))).toEqual({ ok: false, reason: "limit" });
  });
  it("rejects a second preset for one slot", () => {
    const a = preset("camera.a", { slot: "move" });
    expect(canAddPreset([a], preset("camera.b", { slot: "move" }))).toEqual({ ok: false, reason: "slot", other: a });
  });
  it("rejects a declared conflict from either side", () => {
    const a = preset("camera.a", { conflicts: ["camera.b"] });
    const b = preset("camera.b");
    expect(canAddPreset([a], b)).toMatchObject({ ok: false, reason: "conflict", other: a });
    expect(canAddPreset([b], a)).toMatchObject({ ok: false, reason: "conflict", other: b });
  });
  it("rejects a non-stackable preset beside another and allows it alone", () => {
    const solo = preset("camera.solo", { stackable: false });
    expect(canAddPreset([], solo)).toEqual({ ok: true });
    expect(canAddPreset([solo], preset("camera.a"))).toMatchObject({ ok: false, reason: "not-stackable", other: solo });
    expect(canAddPreset([preset("camera.a")], solo)).toMatchObject({ ok: false, reason: "not-stackable", other: solo });
  });
  it("rejects a duplicate and an unsupported mode", () => {
    const a = preset("camera.a");
    expect(canAddPreset([a], a)).toMatchObject({ ok: false, reason: "duplicate" });
    expect(canAddPreset([], a, { mode: "image" })).toEqual({ ok: false, reason: "mode" });
    expect(canAddPreset([], a, { mode: "video" })).toEqual({ ok: true });
  });
  it("agrees with the compiler on every pair", () => {
    const presets = [
      preset("camera.a", { slot: "move" }),
      preset("camera.b", { slot: "move" }),
      preset("camera.c", { slot: "rig", conflicts: ["camera.d"] }),
      preset("camera.d", { slot: "speed" }),
      preset("camera.e", { stackable: false }),
      preset("camera.f")
    ];
    const catalog = createCatalog(presets);
    for (const a of presets) {
      for (const b of presets) {
        let compiles = true;
        try {
          compilePresets([a.id, b.id], { modelId: "default", mode: "video", prompt: "x", catalog });
        } catch {
          compiles = false;
        }
        expect(canAddPreset([a], b).ok).toBe(compiles);
      }
    }
  });
});
