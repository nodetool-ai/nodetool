import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  anyGameDocument, gameDocument, gameDocument3D, gameInputBindingIssues, gameKeyAction, resolveGameInputBindings,
  type GameDocument, type GameDocument3D, type GameInputFrame3D
} from "@nodetool-ai/protocol";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { GameInput, type GamepadLike } from "../src/input-bindings.js";
import { touchLayout } from "../src/touch-controls.js";

const EXAMPLES = new URL("../../base-nodes/nodetool/examples/games/", import.meta.url);

// US-layout key values for the codes the characterization presses.
const US_KEYS: Record<string, string> = {
  ...Object.fromEntries(Array.from({ length: 26 }, (_, index) => [`Key${String.fromCharCode(65 + index)}`, String.fromCharCode(97 + index)])),
  ...Object.fromEntries(Array.from({ length: 10 }, (_, digit) => [`Digit${digit}`, String(digit)])),
  ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", Space: " ", Enter: "Enter",
  Escape: "Escape", ShiftLeft: "Shift", Tab: "Tab", Minus: "-", Comma: ",", Mouse0: "", Mouse2: ""
};
const CODES = Object.keys(US_KEYS);

/** The 3D mapping before input bindings existed, kept as the oracle for generated defaults. */
function legacyFrame3D(document: GameDocument3D, keys: ReadonlySet<string>, newlyPressed: ReadonlySet<string>, look: { x: number; y: number }): GameInputFrame3D {
  const actionKeys = (action: string): readonly string[] => action === "fire" ? ["Mouse0", "KeyF"]
    : action === "jump" ? ["Space"] : action === "respawn" ? ["KeyR"] : [`Key${action.toUpperCase()}`, action];
  const actions = (held: ReadonlySet<string>): string[] => document.inputActions.filter((action) => actionKeys(action).some((code) => held.has(code)));
  const x = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const z = Number(keys.has("KeyS") || keys.has("ArrowDown")) - Number(keys.has("KeyW") || keys.has("ArrowUp"));
  return { pressed: actions(keys), justPressed: actions(newlyPressed),
    axes: Object.fromEntries(document.inputAxes.map((axis) => [axis, axis === "moveX" ? x : axis === "moveZ" ? z : 0])), look };
}

function random(seed: number): () => number {
  let state = seed;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
}

function examples(): { name: string; document: ReturnType<typeof anyGameDocument.parse> }[] {
  return readdirSync(EXAMPLES).filter((name) => name.endsWith(".game.json"))
    .map((name) => ({ name, document: anyGameDocument.parse(JSON.parse(readFileSync(new URL(name, EXAMPLES), "utf8")).document) }));
}

function pad(buttons: readonly number[], axes: readonly number[]): GamepadLike {
  return { connected: true, buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: buttons.includes(index), value: buttons.includes(index) ? 1 : 0 })), axes };
}

describe("input bindings", () => {
  it("reproduces the earlier keyboard and mouse frames for every shipped example game", () => {
    const shipped = examples();
    expect(shipped.length).toBeGreaterThanOrEqual(5);
    for (const { name, document } of shipped) {
      const input = new GameInput();
      const next = random(name.length);
      const keys = new Set<string>();
      const newly = new Set<string>();
      const legacy2D = new Map<string, string>();
      const legacyNew2D = new Set<string>();
      for (let tick = 0; tick < 600; tick += 1) {
        for (let event = Math.floor(next() * 3); event > 0; event -= 1) {
          const code = CODES[Math.floor(next() * CODES.length)];
          if (next() < 0.6) {
            if (!keys.has(code)) { newly.add(code); }
            keys.add(code);
            input.keyDown(code);
            const action = gameKeyAction(code, US_KEYS[code]);
            if (document.inputActions.includes(action)) {
              if (!legacy2D.has(code)) { legacyNew2D.add(action); }
              legacy2D.set(code, action);
            }
          } else {
            keys.delete(code);
            input.keyUp(code);
            legacy2D.delete(code);
          }
        }
        if ("dimension" in document) {
          const look = { x: Math.round(next() * 20 - 10), y: Math.round(next() * 20 - 10) };
          input.look(look.x, look.y);
          expect(input.sample(document), `${name} tick ${tick}`).toEqual(legacyFrame3D(document, keys, newly, { x: 0 + look.x, y: 0 + look.y }));
        } else {
          const frame = input.sample2D(document);
          expect(new Set(frame.pressed), `${name} tick ${tick}`).toEqual(new Set(legacy2D.values()));
          expect(new Set(frame.justPressed), `${name} tick ${tick}`).toEqual(legacyNew2D);
          legacyNew2D.clear();
        }
        newly.clear();
      }
    }
  });

  it("generates 2D defaults by inverting the key naming rule", () => {
    const document = { ...createTopDownRoomGame("defaults"), inputActions: ["left", "space", "e", "enter", "shift", "1", "a"] };
    const actions = Object.fromEntries(resolveGameInputBindings(document).actions.map(({ action, bindings }) => [action, bindings]));
    expect(actions.left).toEqual([{ kind: "key", code: "KeyA" }, { kind: "key", code: "ArrowLeft" }, { kind: "gamepadButton", button: 14 },
      { kind: "gamepadAxis", axis: 0, direction: "negative", threshold: 0.5 }, { kind: "touchStick", direction: "left" }]);
    expect(actions.space).toEqual([{ kind: "key", code: "Space" }, { kind: "gamepadButton", button: 0 }, { kind: "touchButton" }]);
    expect(actions.enter).toEqual([{ kind: "key", code: "Enter" }, { kind: "key", code: "NumpadEnter" }, { kind: "touchButton" }]);
    expect(actions.shift).toEqual([{ kind: "key", code: "ShiftLeft" }, { kind: "key", code: "ShiftRight" }, { kind: "touchButton" }]);
    // KeyA has always meant "left" in 2D, so an action named "a" keeps no key.
    expect(actions.a).toEqual([{ kind: "touchButton" }]);
  });

  it("keeps a quick 2D tap until the next game frame", () => {
    const document = { ...createTopDownRoomGame("quick-tap"), inputActions: ["space", "e"] };
    const input = new GameInput();
    input.keyDown("Space"); input.keyDown("KeyE");
    expect(input.sample2D(document)).toEqual({ pressed: ["space", "e"], justPressed: ["space", "e"] });
    expect(input.sample2D(document).justPressed).toEqual([]);
    input.keyUp("Space"); input.keyUp("KeyE");
    input.keyDown("Space"); input.keyUp("Space");
    expect(input.sample2D(document)).toEqual({ pressed: [], justPressed: ["space"] });
  });

  it("uses authored bindings in place of an action's defaults and keeps defaults for the rest", () => {
    const document = gameDocument3D.parse({ ...createNative3DGame("authored"), inputBindings: { actions: { jump: [{ kind: "key", code: "KeyK" }] } } });
    const input = new GameInput();
    input.keyDown("Space"); input.keyDown("KeyR");
    expect(input.sample(document).pressed).toEqual(["respawn"]);
    input.keyDown("KeyK");
    expect(input.sample(document)).toMatchObject({ pressed: ["jump", "respawn"], justPressed: ["jump"] });
    expect(input.handlesKey(document, "KeyK")).toBe(true);
    expect(input.handlesKey(document, "Space")).toBe(false);
  });

  it("drives actions, axes and look from a gamepad polled each tick", () => {
    const document = createNative3DGame("gamepad");
    const input = new GameInput();
    input.pollGamepads([null, pad([0], [0.575, -0.1, 0.5, 0])]);
    const first = input.sample(document);
    expect(first.pressed).toEqual(["jump"]);
    expect(first.justPressed).toEqual(["jump"]);
    expect(first.axes.moveX).toBeCloseTo(0.5);
    expect(first.axes.moveZ).toBe(0);
    expect(first.look.x).toBeCloseTo((0.5 - 0.15) / 0.85 * 10);
    expect(first.look.y).toBe(0);
    input.pollGamepads([pad([0, 13], [0, 0, 0, 0])]);
    expect(input.sample(document)).toEqual({ pressed: ["jump"], justPressed: [], axes: { moveX: 0, moveZ: 1 }, look: { x: 0, y: 0 } });
    input.pollGamepads([]);
    expect(input.sample(document).pressed).toEqual([]);
    input.pollGamepads([pad([], [-1, 0])]);
    expect(input.sample(document).axes.moveX).toBe(-1);
  });

  it("reads 2D directions from a gamepad stick past its threshold with one edge per press", () => {
    const document = createTopDownRoomGame("gamepad-2d");
    const input = new GameInput();
    input.pollGamepads([pad([], [0.6, 0])]);
    expect(input.sample2D(document)).toEqual({ pressed: ["right"], justPressed: ["right"] });
    input.pollGamepads([pad([], [0.7, 0])]);
    expect(input.sample2D(document)).toEqual({ pressed: ["right"], justPressed: [] });
    input.pollGamepads([pad([], [0.2, 0])]);
    expect(input.sample2D(document)).toEqual({ pressed: [], justPressed: [] });
  });

  it("maps the touch stick to axes in 3D and to direction actions in 2D", () => {
    const input = new GameInput();
    input.setTouch({ stick: { x: 0.6, y: -0.8 }, buttons: new Set(["jump"]) });
    input.touchLook(4, 2);
    expect(input.sample(createNative3DGame("touch"))).toEqual({ pressed: ["jump"], justPressed: ["jump"], axes: { moveX: 0.6, moveZ: -0.8 }, look: { x: 4, y: 2 } });
    input.setTouch({ stick: { x: 0.1, y: 0.1 }, buttons: new Set() });
    expect(input.sample(createNative3DGame("touch")).axes).toEqual({ moveX: 0, moveZ: 0 });
    input.setTouch({ stick: { x: -0.7, y: 0.7 }, buttons: new Set(["space"]) });
    const document: GameDocument = { ...createTopDownRoomGame("touch-2d"), inputActions: ["left", "right", "up", "down", "space"] };
    expect(input.sample2D(document)).toEqual({ pressed: ["left", "down", "space"], justPressed: ["left", "down", "space"] });
  });

  it("applies mouse sensitivity and inversion from look bindings", () => {
    const document = gameDocument3D.parse({ ...createNative3DGame("look"), inputBindings: { look: [{ kind: "mouse", sensitivity: 0.5, invertY: true }] } });
    const input = new GameInput();
    input.look(8, 4);
    input.pollGamepads([pad([], [0, 0, 1, 1])]);
    expect(input.sample(document).look).toEqual({ x: 4, y: -2 });
  });

  it("drops input pressed while play is paused instead of firing it on resume (F23)", () => {
    const document = createNative3DGame("paused");
    const input = new GameInput();
    input.setEnabled(false);
    input.keyDown("Space"); input.keyUp("Space"); input.keyDown("KeyR"); input.look(30, 30);
    input.setTouch({ buttons: new Set(["jump"]) });
    input.pollGamepads([pad([0], [1, 1, 1, 1])]);
    input.setEnabled(true);
    expect(input.sample(document)).toEqual({ pressed: [], justPressed: [], axes: { moveX: 0, moveZ: 0 }, look: { x: 0, y: 0 } });
  });

  it("derives touch controls from bindings", () => {
    const twoD = { ...createTopDownRoomGame("layout"), inputActions: ["left", "right", "up", "down", "space", "dash"] };
    expect(touchLayout(resolveGameInputBindings(twoD))).toEqual({ stick: true, look: false,
      buttons: [{ action: "space", label: "SPACE" }, { action: "dash", label: "DASH" }] });
    expect(touchLayout(resolveGameInputBindings({ ...twoD, inputActions: ["space"] }))).toEqual({ stick: false, look: false, buttons: [{ action: "space", label: "SPACE" }] });
    const threeD = gameDocument3D.parse({ ...createNative3DGame("layout-3d"), inputBindings: { actions: { respawn: [{ kind: "touchButton", label: "↺" }] } } });
    expect(touchLayout(resolveGameInputBindings(threeD))).toEqual({ stick: true, look: true,
      buttons: [{ action: "jump", label: "JUMP" }, { action: "respawn", label: "↺" }] });
  });

  it("reports bindings for undeclared actions, axes and 2D look", () => {
    const twoD = gameDocument.parse({ ...createTopDownRoomGame("issues"), inputBindings: { actions: { fly: [] }, axes: { moveX: [] }, look: [] } });
    expect(gameInputBindingIssues(twoD).map((issue) => issue.path.join("."))).toEqual(["inputBindings.actions.fly", "inputBindings.axes.moveX", "inputBindings.look"]);
    const threeD = gameDocument3D.parse({ ...createNative3DGame("issues-3d"), inputBindings: { axes: { turn: [] } } });
    expect(gameInputBindingIssues(threeD)).toEqual([{ path: ["inputBindings", "axes", "turn"], message: "Input axis turn is not declared" }]);
    expect(gameInputBindingIssues(createNative3DGame("clean"))).toEqual([]);
  });
});
