import { describe, expect, it } from "vitest";
import { NativeBrowserInput, NativeInputRecording } from "../src/native-browser/input.js";

describe("native browser relative look sampling", () => {
  it("accumulates raw pixel deltas once without changing at-rest packets", () => {
    const input = new NativeBrowserInput("3d");
    expect(input.sample()).not.toHaveProperty("look");
    input.addLook(7.25, -5);
    input.addLook(4.75, -1);
    const sampled = input.sample();
    expect(sampled.look).toEqual({ x: 12, y: -6 });
    expect(input.sample()).not.toHaveProperty("look");
    const recording = new NativeInputRecording();
    recording.record({ generation: 1, tick: 0, input: sampled });
    expect(recording.entries()[0]?.input.look).toEqual({ x: 12, y: -6 });
  });

  it("clears unsampled motion on the same reset path used by blur, pause and generation changes", () => {
    const input = new NativeBrowserInput("3d");
    input.addLook(30, -20);
    input.releaseAll();
    expect(input.sample()).not.toHaveProperty("look");
    input.addLook(-2, 3);
    expect(input.sample().look).toEqual({ x: -2, y: 3 });
  });

  it("keeps finite component and accumulated motion within the existing protocol bounds atomically", () => {
    const input = new NativeBrowserInput("3d");
    input.addLook(1_000_000, -1_000_000);
    for (const delta of [[1, 0], [0, -1], [NaN, 0], [0, Infinity], [1_000_001, 0]]) {
      expect(() => input.addLook(delta[0] ?? 0, delta[1] ?? 0)).toThrow("look");
    }
    expect(input.sample().look).toEqual({ x: 1_000_000, y: -1_000_000 });
    expect(input.sample()).not.toHaveProperty("look");
  });

  it("preserves 2D pointer/movement packets without adding camera input", () => {
    const input = new NativeBrowserInput("2d");
    input.setPointer(12, 34, true);
    input.addLook(20, -10);
    expect(input.sample()).toEqual({ actions: {}, move: { x: 0, y: 0 }, jump: false, edges: [], pointer: { x: 12, y: 34, down: true } });
  });
});
