import { describe, expect, it } from "@jest/globals";
import { gameDocument3D, type GameAnimationGraph3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps3D, createNative3DGame, validateGame3D } from "@nodetool-ai/game-runtime";

import { getGameDraftStore } from "../../../../../stores/game/GameDraftStore";
import {
  addAnimationLayer, addAnimationParameter, addAnimationState, AnimationGraphEditError, connectAnimationStates, convertAnimationMotion,
  createAnimationGraph, removeAnimationLayer, removeAnimationParameter, removeAnimationState, removeAnimationTransition, renameAnimationParameter,
  renameAnimationState, setAnimationParameterKind, setAnimationTransition
} from "../animationGraphEdits";

const clip = (name: string) => ({ motion: { kind: "clip" as const, clip: name }, speed: 1, loop: true });

function locomotion(): GameAnimationGraph3D {
  return {
    parameters: { speed: { kind: "float", default: 0 }, grounded: { kind: "bool", default: true }, jump: { kind: "trigger" } },
    layers: [{ id: "base", mode: "override", weight: 1, initialState: "idle",
      states: {
        idle: clip("idle"),
        move: { motion: { kind: "blend1d", parameter: "speed", points: [{ value: 0, clip: "idle" }, { value: 1, clip: "run" }] }, speed: 1, loop: true },
        jump: { ...clip("run"), loop: false }
      },
      transitions: [
        { from: "idle", to: "move", conditions: [{ parameter: "speed", op: "gt", value: 0.1 }], durationTicks: 6 },
        { from: "*", to: "jump", conditions: [{ parameter: "jump", op: "set" }, { parameter: "grounded", op: "true" }], durationTicks: 4 }
      ] }]
  };
}

/** The sample game with the graph installed and its visual's animator driven by it, so every edit is checked by document validation. */
function gameWith(graph: GameAnimationGraph3D): GameDocument3D {
  const document = createNative3DGame("animation-graph-edits");
  document.assets.hero = { mediaKind: "model", assetId: "hero", digest: "hero-digest", required: true, format: "glb", preparationVersion: "1",
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, nodeIds: ["node:0"], clipIds: ["clip:0", "clip:1"],
    geometryBytes: 1, textureBytes: 0, triangles: 1, supportedExtensions: [] };
  const visual = document.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!visual) { throw new Error("Fixture visual missing"); }
  delete visual.primitive;
  visual.model = { assetId: "hero", castShadow: true, receiveShadow: true };
  visual.animator3d = { clips: { idle: "clip:0", run: "clip:1" }, playbackRate: 1, loop: true, transitionTicks: 6, graph: "locomotion" };
  return applyGameOps3D(document, [{ op: "set_animation_graph", graph_id: "locomotion", graph }]);
}

function valid(graph: GameAnimationGraph3D): GameDocument3D {
  const document = gameWith(graph);
  expect(validateGame3D(document).diagnostics).toEqual([]);
  return document;
}

describe("animation graph state edits", () => {
  it("adds a state, and removing it drops its transitions and moves the initial state", () => {
    const added = addAnimationState(locomotion(), 0, "fall", clip("idle"));
    expect(Object.keys(added.layers[0].states)).toEqual(["idle", "move", "jump", "fall"]);
    const linked = connectAnimationStates(added, 0, "jump", "fall");
    valid(linked);
    const removed = removeAnimationState(linked, 0, "fall");
    expect(removed.layers[0].transitions).toEqual(locomotion().layers[0].transitions);
    expect(Object.keys(removed.layers[0].states)).toEqual(["idle", "move", "jump"]);
    const withoutInitial = removeAnimationState(locomotion(), 0, "idle");
    expect(withoutInitial.layers[0].initialState).toBe("move");
    expect(withoutInitial.layers[0].transitions.map((transition) => transition.to)).toEqual(["jump"]);
    valid(withoutInitial);
  });

  it("refuses duplicate, reserved and last-state edits", () => {
    expect(() => addAnimationState(locomotion(), 0, "idle", clip("idle"))).toThrow(AnimationGraphEditError);
    expect(() => addAnimationState(locomotion(), 0, "*", clip("idle"))).toThrow(/reserved/);
    expect(() => removeAnimationState(createAnimationGraph("idle"), 0, "idle")).toThrow(/at least one state/);
    expect(() => renameAnimationState(locomotion(), 0, "idle", "move")).toThrow(/already exists/);
  });

  it("renames a state in place and rewrites the initial state and transitions", () => {
    const renamed = renameAnimationState(locomotion(), 0, "idle", "stand");
    expect(Object.keys(renamed.layers[0].states)).toEqual(["stand", "move", "jump"]);
    expect(renamed.layers[0].initialState).toBe("stand");
    expect(renamed.layers[0].transitions[0]).toMatchObject({ from: "stand", to: "move" });
    valid(renamed);
  });
});

describe("animation graph transitions", () => {
  it("adds a transition that fires on a new trigger, then takes edited conditions", () => {
    const connected = connectAnimationStates(locomotion(), 0, "move", "idle");
    const transition = connected.layers[0].transitions[2];
    expect(transition).toEqual({ from: "move", to: "idle", conditions: [{ parameter: "idle", op: "set" }], durationTicks: 6 });
    expect(connected.parameters.idle).toEqual({ kind: "trigger" });
    valid(connected);
    const edited = setAnimationTransition(connected, 0, 2, { ...transition, exitTicks: 12,
      conditions: [{ parameter: "speed", op: "lte", value: 0.05 }, { parameter: "grounded", op: "true" }] });
    const document = valid(edited);
    expect(document.animationGraphs?.locomotion.layers[0].transitions[2]).toEqual({ from: "move", to: "idle", exitTicks: 12, durationTicks: 6,
      conditions: [{ parameter: "speed", op: "lte", value: 0.05 }, { parameter: "grounded", op: "true" }] });
    expect(removeAnimationTransition(edited, 0, 2).layers[0].transitions).toHaveLength(2);
    expect(() => connectAnimationStates(locomotion(), 0, "idle", "missing")).toThrow(/does not exist/);
  });

  it("starts any-state transitions from the reserved source", () => {
    const connected = connectAnimationStates(locomotion(), 0, "*", "idle");
    expect(connected.layers[0].transitions.at(-1)).toMatchObject({ from: "*", to: "idle" });
    valid(connected);
  });

  it("falls back to an exit time when the graph has no room for a trigger", () => {
    const parameters = Object.fromEntries(Array.from({ length: 64 }, (_value, index) => [`p${index}`, { kind: "trigger" as const }]));
    const full = { ...locomotion(), parameters: { ...parameters } };
    const connected = connectAnimationStates(full, 0, "idle", "jump");
    expect(Object.keys(connected.parameters)).toHaveLength(64);
    expect(connected.layers[0].transitions.at(-1)).toEqual({ from: "idle", to: "jump", conditions: [], exitTicks: 30, durationTicks: 6 });
  });
});

describe("animation graph parameters", () => {
  it("renames a parameter in place and updates every condition and blend that reads it", () => {
    const renamed = renameAnimationParameter(locomotion(), "speed", "velocity");
    expect(Object.keys(renamed.parameters)).toEqual(["velocity", "grounded", "jump"]);
    expect(renamed.layers[0].transitions[0].conditions).toEqual([{ parameter: "velocity", op: "gt", value: 0.1 }]);
    expect(renamed.layers[0].states.move.motion).toMatchObject({ kind: "blend1d", parameter: "velocity" });
    valid(renamed);
    expect(() => renameAnimationParameter(locomotion(), "speed", "jump")).toThrow(/already exists/);
  });

  it("keeps a parameter that a condition or blend still reads", () => {
    expect(() => removeAnimationParameter(locomotion(), "jump")).toThrow("Parameter jump is used by transition * → jump");
    expect(() => removeAnimationParameter(locomotion(), "speed")).toThrow(/state move/);
    const unused = removeAnimationParameter(addAnimationParameter(locomotion(), "crouch", "bool"), "crouch");
    expect(unused).toEqual(locomotion());
  });

  it("retypes the conditions that read a parameter and keeps blend parameters as floats", () => {
    const retyped = setAnimationParameterKind(locomotion(), "grounded", "trigger");
    expect(retyped.parameters.grounded).toEqual({ kind: "trigger" });
    expect(retyped.layers[0].transitions[1].conditions[1]).toEqual({ parameter: "grounded", op: "set" });
    valid(retyped);
    expect(() => setAnimationParameterKind(locomotion(), "speed", "bool")).toThrow(/must stay a float/);
  });

  it("converts a clip state to a blend on the first float parameter", () => {
    const graph = locomotion();
    expect(convertAnimationMotion(graph, { kind: "clip", clip: "run" }, "blend1d"))
      .toEqual({ kind: "blend1d", parameter: "speed", points: [{ value: 0, clip: "run" }, { value: 1, clip: "run" }] });
    expect(() => convertAnimationMotion(createAnimationGraph("idle"), { kind: "clip", clip: "idle" }, "blend2d")).toThrow(/float parameter/);
  });
});

describe("animation graph layers", () => {
  it("adds an override layer starting in the base layer's initial state and removes it again", () => {
    const layered = addAnimationLayer(locomotion());
    expect(layered.layers[1]).toEqual({ id: "layer", mode: "override", weight: 1, initialState: "idle", states: { idle: clip("idle") }, transitions: [] });
    valid(layered);
    expect(removeAnimationLayer(layered, 1)).toEqual(locomotion());
    expect(() => removeAnimationLayer(layered, 0)).toThrow(/base layer/);
  });
});

it("applies graph edits through the draft store as undoable set_animation_graph commands", () => {
  const document = gameWith(locomotion());
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "first");
  const next = renameAnimationParameter(locomotion(), "speed", "velocity");
  store.getState().apply([{ op: "set_animation_graph", graph_id: "locomotion", graph: next }], { label: "Rename Animation Parameter" });
  const edited = gameDocument3D.parse(store.getState().document);
  expect(edited.animationGraphs?.locomotion.parameters).toHaveProperty("velocity");
  expect(store.getState().pendingOps).toEqual([expect.objectContaining({ op: "set_animation_graph", graph_id: "locomotion" })]);
  store.getState().undo();
  expect(gameDocument3D.parse(store.getState().document)).toEqual(document);
  store.getState().redo();
  expect(gameDocument3D.parse(store.getState().document).animationGraphs?.locomotion).toEqual(edited.animationGraphs?.locomotion);
});
