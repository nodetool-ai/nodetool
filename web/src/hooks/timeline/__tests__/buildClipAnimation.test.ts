/**
 * @jest-environment node
 */
import { buildClipAnimation } from "../buildClipAnimation";

describe("buildClipAnimation", () => {
  it("fills the preset default duration and a fresh id", () => {
    const anim = buildClipAnimation({ role: "in", preset: "fade" });
    expect(anim.preset).toBe("fade");
    expect(anim.role).toBe("in");
    expect(anim.durationMs).toBe(500); // fade default
    expect(anim.id).toBeTruthy();
  });

  it("keeps an explicit duration and passes params through", () => {
    const anim = buildClipAnimation({
      role: "in",
      preset: "slide",
      durationMs: 800,
      params: { direction: "up", distance: 0.4 }
    });
    expect(anim.durationMs).toBe(800);
    expect(anim.params).toEqual({ direction: "up", distance: 0.4 });
  });

  it("throws listing valid presets for an unknown preset", () => {
    expect(() => buildClipAnimation({ role: "in", preset: "sparkle" })).toThrow(
      /Valid presets:.*fade.*kenBurns/s
    );
  });

  it("throws listing allowed roles when the role is not supported", () => {
    // pulse is emphasis-only.
    expect(() => buildClipAnimation({ role: "in", preset: "pulse" })).toThrow(
      /Allowed roles: emphasis/
    );
  });

  it("rejects invalid timing values", () => {
    expect(() =>
      buildClipAnimation({ role: "in", preset: "fade", durationMs: 0 })
    ).toThrow(/durationMs must be a positive finite number/);
    expect(() =>
      buildClipAnimation({ role: "in", preset: "fade", delayMs: -1 })
    ).toThrow(/delayMs must be a non-negative finite number/);
  });

  it("passes a valid stagger through and rejects bad ones", () => {
    const anim = buildClipAnimation({
      role: "in",
      preset: "pop",
      stagger: { unit: "word", offsetMs: 120, from: "center" }
    });
    expect(anim.stagger).toEqual({ unit: "word", offsetMs: 120, from: "center" });

    expect(() =>
      buildClipAnimation({
        role: "in",
        preset: "fade",
        stagger: { unit: "word", offsetMs: 0 }
      })
    ).toThrow(/offsetMs must be a positive finite number/);
  });

  it("generates a distinct id per call", () => {
    const a = buildClipAnimation({ role: "loop", preset: "float" });
    const b = buildClipAnimation({ role: "loop", preset: "float" });
    expect(a.id).not.toBe(b.id);
  });

  describe("preset custom", () => {
    const curves = [
      { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
    ];

    it("stores the curves it was handed", () => {
      const anim = buildClipAnimation({ role: "in", preset: "custom", curves });
      expect(anim.preset).toBe("custom");
      expect(anim.custom?.curves).toEqual([
        { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
      ]);
      expect(anim.custom?.bakedAt).toEqual(expect.any(String));
    });

    // The tool schema accepts `code`, but baking runs host-side and the editor
    // has no client for that route. Refusing beats storing an animation whose
    // curves never arrive.
    it("refuses a code body", () => {
      expect(() =>
        buildClipAnimation({ role: "in", preset: "custom", code: "return {curves: []};" })
      ).toThrow(/baked host-side/);
    });

    it("refuses curves that drive nothing", () => {
      expect(() =>
        buildClipAnimation({ role: "in", preset: "custom", curves: [] })
      ).toThrow(/unusable/);
    });

    it("needs curves at all", () => {
      expect(() =>
        buildClipAnimation({ role: "in", preset: "custom" })
      ).toThrow(/needs `curves`/);
    });

    it("refuses a wipeProgress curve with no mask", () => {
      expect(() =>
        buildClipAnimation({
          role: "in",
          preset: "custom",
          curves: [
            { property: "wipeProgress", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
          ]
        })
      ).toThrow(/needs a mask/);
    });

    it("keeps the mask when one is given", () => {
      const anim = buildClipAnimation({
        role: "in",
        preset: "custom",
        curves: [
          { property: "wipeProgress", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
        ],
        mask: { direction: "left", softness: 0.2 }
      });
      expect(anim.custom?.mask).toEqual({ direction: "left", softness: 0.2 });
    });
  });
});
