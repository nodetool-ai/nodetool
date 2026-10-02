import { describe, expect, it } from "vitest";
import { createNative3DGame } from "@nodetool-ai/game-runtime";
import { GameInput3D } from "../src/input3d.js";
import { FixedTickClock } from "../src/fixed-tick-host.js";

describe("shared browser tick host", () => {
  it("samples mouse firing and its keyboard fallback only for games that declare fire", () => {
    const input = new GameInput3D();
    const document = createNative3DGame("shooter");
    input.keyDown("Mouse0");
    expect(input.sample(document).pressed).toEqual([]);
    document.inputActions.push("fire");
    input.release();
    input.keyDown("Mouse0");
    expect(input.sample(document)).toMatchObject({ pressed: ["fire"], justPressed: ["fire"] });
    expect(input.sample(document)).toMatchObject({ pressed: ["fire"], justPressed: [] });
    input.keyUp("Mouse0");
    expect(input.sample(document).pressed).toEqual([]);
    input.keyDown("KeyF");
    expect(input.sample(document)).toMatchObject({ pressed: ["fire"], justPressed: ["fire"] });
    input.release();
    expect(input.sample(document).pressed).toEqual([]);
  });
  it("consumes action edges and look once, retains held movement and releases on focus loss", () => {
    const input = new GameInput3D();
    const document = createNative3DGame("input");
    input.keyDown("KeyW"); input.keyDown("KeyD"); input.keyDown("Space"); input.keyDown("Space"); input.keyDown("KeyR");
    input.look(8, -3); input.look(2, 1);
    expect(input.sample(document)).toEqual({ pressed: ["jump", "respawn"], justPressed: ["jump", "respawn"], axes: { moveX: 1, moveZ: -1 }, look: { x: 10, y: -2 } });
    expect(input.sample(document)).toMatchObject({ justPressed: [], axes: { moveX: 1, moveZ: -1 }, look: { x: 0, y: 0 } });
    input.keyUp("KeyD");
    expect(input.sample(document).axes.moveX).toBe(0);
    input.release();
    expect(input.sample(document)).toEqual({ pressed: [], justPressed: [], axes: { moveX: 0, moveZ: 0 }, look: { x: 0, y: 0 } });
  });

  it("maps declared custom actions through the same physical-key sampler", () => {
    const document = createNative3DGame("custom-input"); document.inputActions.push("e", "Enter");
    const input = new GameInput3D();
    expect(input.handlesKey(document, "KeyE")).toBe(true); expect(input.handlesKey(document, "Enter")).toBe(true);
    expect(input.handlesKey(document, "Tab")).toBe(false);
    input.keyDown("KeyE"); input.keyDown("Enter");
    expect(input.sample(document)).toMatchObject({ pressed: ["e", "Enter"], justPressed: ["e", "Enter"] });
    expect(input.sample(document).justPressed).toEqual([]);
    input.keyUp("KeyE"); input.keyUp("Enter"); expect(input.sample(document).pressed).toEqual([]);
  });
  it("advances fixed ticks and caps background catch-up without carrying stale time", () => {
    const clock = new FixedTickClock(60);
    let ticks = 0;
    const step = (): void => { ticks += 1; };
    expect(clock.advance(100, step)).toBe(0);
    expect(clock.advance(125, step)).toBeCloseTo(0.5);
    expect(ticks).toBe(1);
    expect(clock.advance(10_000, step)).toBe(0);
    expect(ticks).toBe(6);
    clock.reset();
    expect(clock.advance(20_000, step)).toBe(0);
    expect(ticks).toBe(6);
  });
});
