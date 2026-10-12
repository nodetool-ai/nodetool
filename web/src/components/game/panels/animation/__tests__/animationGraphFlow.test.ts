import { describe, expect, it } from "@jest/globals";
import type { GameAnimationLayer3D, GameEntityState3D } from "@nodetool-ai/protocol";

import {
  animationGraphDiagnostics, animationGraphEdges, animationGraphLiveState, animationGraphNodes, animationTransitionLabel, layoutAnimationStates,
  transitionIndexOfEdge
} from "../animationGraphFlow";

const clip = (name: string) => ({ motion: { kind: "clip" as const, clip: name }, speed: 1, loop: true });
const layer: GameAnimationLayer3D = { id: "base", mode: "override", weight: 1, initialState: "idle",
  states: { idle: clip("idle"), run: clip("run"), jump: clip("jump"), orphan: clip("idle") },
  transitions: [
    { from: "idle", to: "run", conditions: [{ parameter: "speed", op: "gt", value: 0.1 }], durationTicks: 6 },
    { from: "run", to: "idle", conditions: [{ parameter: "speed", op: "lte", value: 0.1 }, { parameter: "grounded", op: "true" }], exitTicks: 10, durationTicks: 6 },
    { from: "*", to: "jump", conditions: [{ parameter: "jump", op: "set" }], durationTicks: 4 }
  ] };

function entityState(id: string, graph: GameEntityState3D["animationGraph"], extra: Partial<GameEntityState3D> = {}): GameEntityState3D {
  const transform = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1] as [number, number, number, number], scale: { x: 1, y: 1, z: 1 } };
  return { id, spawnTick: 0, transform, previousTransform: transform, velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 },
    active: true, grounded: false, animationGraph: graph, ...extra };
}

describe("live animation state", () => {
  const blending = { graphId: "locomotion", parameters: { speed: 0.4, grounded: true },
    layers: [{ state: "run", enteredTick: 100, previousState: "idle", previousEnteredTick: 40, transitionTicks: 6 }] };
  const settled = { graphId: "locomotion", parameters: { speed: 0 }, layers: [{ state: "idle", enteredTick: 0 }] };

  it("reads the preferred entity, else the first active entity running the graph", () => {
    const inspection = { tick: 103, entities: [
      entityState("enemy", settled), entityState("other", { ...settled, graphId: "other" }), entityState("hero", blending)
    ] };
    expect(animationGraphLiveState(inspection, "locomotion", "hero")).toEqual({ entityId: "hero", tick: 103,
      parameters: { speed: 0.4, grounded: true }, layers: [{ state: "run", previousState: "idle", blending: true }] });
    expect(animationGraphLiveState(inspection, "locomotion", "missing")?.entityId).toBe("enemy");
    expect(animationGraphLiveState(inspection, "locomotion", undefined)?.layers).toEqual([{ state: "idle", previousState: undefined, blending: false }]);
    expect(animationGraphLiveState(inspection, "unused", "hero")).toBeNull();
    expect(animationGraphLiveState(null, "locomotion", "hero")).toBeNull();
  });

  it("matches spawned copies by source entity and skips inactive entities", () => {
    const inspection = { tick: 5, entities: [entityState("enemy", settled, { active: false }), entityState("spawn-1", blending, { sourceId: "hero" })] };
    expect(animationGraphLiveState(inspection, "locomotion", "hero")?.entityId).toBe("spawn-1");
  });

  it("stops reporting the previous state once the transition blend has finished", () => {
    const inspection = { tick: 106, entities: [entityState("hero", blending)] };
    expect(animationGraphLiveState(inspection, "locomotion", "hero")?.layers[0]).toEqual({ state: "run", previousState: undefined, blending: false });
  });

  it("highlights the current and previous state nodes and animates the transition that is blending", () => {
    const live = { state: "run", previousState: "idle", blending: true };
    const nodes = animationGraphNodes(layer, {}, live, { kind: "state", stateId: "jump" }, false);
    expect(nodes.map((node) => [node.id, node.data.live, node.selected])).toEqual([
      ["*", null, false], ["idle", "previous", false], ["run", "current", false], ["jump", null, true], ["orphan", null, false]
    ]);
    expect(nodes.find((node) => node.id === "idle")?.data.initial).toBe(true);
    expect(nodes.map((node) => node.ariaLabel)).toEqual(["Any state", "State idle, initial, blending out", "State run, playing", "State jump", "State orphan"]);
    const edges = animationGraphEdges(layer, live, { kind: "transition", index: 2 }, layoutAnimationStates(layer));
    expect(edges.map((edge) => [edge.id, edge.animated, edge.selected])).toEqual([
      ["transition-0", true, false], ["transition-1", false, false], ["transition-2", false, true]
    ]);
    expect(edges[2].ariaLabel).toBe("Transition from any state to jump when jump fired");
    expect(animationGraphEdges(layer, { state: "run", blending: false }, null, {}).every((edge) => !edge.animated)).toBe(true);
    expect(animationGraphNodes(layer, {}, null, null, false).every((node) => node.data.live === null)).toBe(true);
  });
});

describe("animation graph canvas model", () => {
  it("lays states out in columns by distance from the initial state", () => {
    const positions = layoutAnimationStates(layer);
    expect(positions.idle.x).toBe(0);
    expect(positions.run.x).toBeGreaterThan(positions.idle.x);
    expect(positions.jump.x).toBe(positions.run.x);
    expect(positions.orphan.x).toBeGreaterThan(positions.run.x);
    expect(positions["*"]).toEqual({ x: 0, y: 0 });
    expect(new Set(Object.values(positions).map((position) => `${position.x},${position.y}`)).size).toBe(5);
  });

  it("keeps dragged positions and omits the any-state node when nothing starts from it", () => {
    const withoutAny = { ...layer, transitions: layer.transitions.slice(0, 2) };
    const nodes = animationGraphNodes(withoutAny, { run: { x: 7, y: 9 } }, null, null, false);
    expect(nodes.map((node) => node.id)).toEqual(["idle", "run", "jump", "orphan"]);
    expect(nodes[1].position).toEqual({ x: 7, y: 9 });
  });

  it("routes transitions back to an earlier column through the bottom handles", () => {
    const edges = animationGraphEdges(layer, null, null, layoutAnimationStates(layer));
    expect(edges.map((edge) => [edge.sourceHandle, edge.targetHandle])).toEqual([["out", "in"], ["back-out", "back-in"], ["out", "in"]]);
    const flipped = animationGraphEdges(layer, null, null, { idle: { x: 500, y: 0 }, run: { x: 0, y: 0 } });
    expect(flipped.slice(0, 2).map((edge) => edge.sourceHandle)).toEqual(["back-out", "out"]);
  });

  it("labels transitions by their conditions and exit time and maps edges back to indices", () => {
    expect(animationTransitionLabel(layer.transitions[1])).toBe("speed ≤ 0.1 and grounded and after 10 ticks");
    expect(animationTransitionLabel(layer.transitions[2])).toBe("jump fired");
    expect(transitionIndexOfEdge({ id: "transition-12" })).toBe(12);
    expect(transitionIndexOfEdge({ id: "other" })).toBeNull();
  });

  it("selects validation messages inside one graph", () => {
    expect(animationGraphDiagnostics([
      { path: ["animationGraphs", "locomotion", "layers", 0, "transitions", 1], message: "A transition needs at least one condition or exitTicks" },
      { path: ["animationGraphs", "other"], message: "Other graph" },
      { path: ["scenes", 0], message: "Scene problem" }
    ], "locomotion")).toEqual(["layers.0.transitions.1: A transition needs at least one condition or exitTicks"]);
  });
});
