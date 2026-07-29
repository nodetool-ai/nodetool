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
});
