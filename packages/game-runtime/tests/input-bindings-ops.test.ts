import { describe, expect, it } from "vitest";
import { anyGameDocumentOp, applyAnyGameOps, applyGameOps3D } from "../src/document-ops3d.js";
import { applyGameOps, GameOpError } from "../src/document-ops.js";
import { createTopDownRoomGame } from "../src/sample.js";
import { createNative3DGame } from "../src/sample3d.js";
import { createGameSession } from "../src/session.js";
import { createGameSession3D } from "../src/session3d.js";
import { validateGame3D } from "../src/validate3d.js";

const bindings = { actions: { left: [{ kind: "key", code: "KeyJ" }, { kind: "gamepadButton", button: 14 }] } };

describe("input binding document ops", () => {
  it("sets and removes 2D bindings through set_game", () => {
    const document = createTopDownRoomGame("bindings");
    const op = anyGameDocumentOp.parse(JSON.parse(JSON.stringify({ op: "set_game", input_bindings: bindings })));
    const bound = applyAnyGameOps(document, [op]);
    expect(bound.inputBindings).toEqual({ actions: bindings.actions, axes: {} });
    const cleared = applyGameOps(bound, [{ op: "set_game", input_bindings: null }]);
    expect("inputBindings" in cleared).toBe(false);
  });

  it("rejects a binding for an undeclared action and points at set_game", () => {
    const document = createTopDownRoomGame("bindings-invalid");
    let error: unknown;
    try { applyGameOps(document, [{ op: "set_game", pixels_per_unit: 24 }, { op: "set_game", input_bindings: { actions: { fly: [] }, axes: {} } }]); }
    catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(GameOpError);
    expect((error as GameOpError).issues).toEqual([expect.objectContaining({ opIndex: 1, path: ["inputBindings", "actions", "fly"] })]);
  });

  it("sets 3D axis and look bindings and validates their targets", () => {
    const document = createNative3DGame("bindings-3d");
    const bound = applyGameOps3D(document, [{ op: "set_game", input_bindings: { actions: {}, axes: { moveX: [{ kind: "gamepadAxis", axis: 2, deadZone: 0.2, invert: true }] },
      look: [{ kind: "mouse", sensitivity: 2, invertY: true }] } }]);
    expect(bound.inputBindings?.axes.moveX).toEqual([{ kind: "gamepadAxis", axis: 2, deadZone: 0.2, invert: true }]);
    const invalid = { ...bound, inputBindings: { actions: { dash: [] }, axes: {} } };
    expect(validateGame3D(invalid).diagnostics).toEqual([
      { code: "missing_input_binding_target", path: ["inputBindings", "actions", "dash"], message: "Input action dash is not declared" }]);
  });

  it("leaves simulation unchanged: bindings only map physical input to frames", async () => {
    const plain = createTopDownRoomGame("bindings-sim");
    const bound = applyGameOps(plain, [{ op: "set_game", input_bindings: { actions: { left: [{ kind: "key", code: "KeyJ" }] }, axes: {} } }]);
    const frames = Array.from({ length: 90 }, (_, tick) => ({ pressed: tick % 30 < 15 ? ["left"] : ["down"], justPressed: [] }));
    const run2D = (document: typeof plain) => { const session = createGameSession(document, 7); return frames.map((frame) => session.step(frame)); };
    expect(JSON.stringify(run2D(bound))).toEqual(JSON.stringify(run2D(plain)));

    // Scripts are removed: step results carry wall-clock script timings, and the script budget can interrupt a busy host.
    const sample3D = createNative3DGame("bindings-sim-3d");
    const plain3D = { ...sample3D, scenes: sample3D.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => ({ ...entity, behaviors: [] })) })) };
    const bound3D = applyGameOps3D(plain3D, [{ op: "set_game", input_bindings: { actions: { jump: [{ kind: "key", code: "KeyK" }] }, axes: {} } }]);
    const frames3D = Array.from({ length: 90 }, (_, tick) => ({ pressed: tick === 10 ? ["jump"] : [], justPressed: tick === 10 ? ["jump"] : [],
      axes: { moveX: tick < 45 ? 1 : 0, moveZ: -0.5 }, look: { x: 2, y: 0 } }));
    const run3D = async (document: typeof plain3D): Promise<string> => {
      const session = await createGameSession3D(document, 7);
      try { return JSON.stringify(frames3D.map((frame) => session.step(frame))); } finally { session.dispose(); }
    };
    expect(await run3D(bound3D)).toEqual(await run3D(plain3D));
  });
});
