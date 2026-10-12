import { expect, it } from "@jest/globals";
import { gameDocument3D, type GameAnimationGraph3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { createNative3DGame } from "@nodetool-ai/game-runtime";

import { mergeByUnits } from "../../documentMerge";
import { anyGameMergeAdapter } from "../anyMerge";
import { gameMergeAdapter3D } from "../merge3D";

const graph = (clip: string): GameAnimationGraph3D => ({ parameters: {}, layers: [{ id: "base", mode: "override", weight: 1, initialState: "idle",
  states: { idle: { motion: { kind: "clip", clip }, speed: 1, loop: true } }, transitions: [] }] });

function withGraphs(graphs: Record<string, GameAnimationGraph3D>): GameDocument3D {
  return { ...createNative3DGame("animation-graph-merge"), animationGraphs: graphs };
}

it("merges animation graphs per graph, keeping a draft edit next to an agent's new graph", () => {
  const base = withGraphs({ locomotion: graph("idle") });
  const draft = withGraphs({ locomotion: graph("stand") });
  const server = withGraphs({ locomotion: graph("idle"), combat: graph("guard") });
  const merged = mergeByUnits(base, draft, server, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(merged.conflicts).toEqual([]);
  expect(merged.doc.animationGraphs).toEqual({ locomotion: graph("stand"), combat: graph("guard") });
});

it("reports competing edits to one graph as a conflict on that graph", () => {
  const base = withGraphs({ locomotion: graph("idle") });
  const merged = mergeByUnits(base, withGraphs({ locomotion: graph("stand") }), withGraphs({ locomotion: graph("rest") }),
    anyGameMergeAdapter(base), { mergeWithoutOps: true });
  expect(merged.conflicts).toHaveLength(1);
  expect(merged.conflicts[0].unit).toEqual({ kind: "animationGraph", id: "locomotion", label: "animation graph locomotion" });
  expect(gameDocument3D.parse(merged.doc).animationGraphs?.locomotion).toEqual(graph("stand"));
});

it("drops the animationGraphs field when a merge removes the last graph", () => {
  const base = withGraphs({ locomotion: graph("idle") });
  const removed = createNative3DGame("animation-graph-merge");
  const merged = mergeByUnits(base, base, removed, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(merged.conflicts).toEqual([]);
  expect("animationGraphs" in merged.doc).toBe(false);
});
