import { describe, expect, it } from "@jest/globals";
import type { GameDocument } from "@nodetool-ai/protocol/game.js";
import type { GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps, applyGameOps3D, createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";

import { mergeByUnits } from "../../documentMerge";
import { diffGameDocuments } from "../diffGameDocuments";
import { diffGameDocuments3D } from "../diffGameDocuments3D";
import { gameMergeAdapter } from "../merge";
import { gameMergeAdapter3D } from "../merge3D";

function copy<T>(document: T): T {
  return JSON.parse(JSON.stringify(document)) as T;
}

const leftOnJ = { actions: { left: [{ kind: "key" as const, code: "KeyJ" }] }, axes: {} };

describe("input binding diff and merge units", () => {
  it("diffs added and removed 2D bindings into set_game ops that replay exactly", () => {
    const base = createTopDownRoomGame("bindings-diff");
    const bound: GameDocument = { ...copy(base), inputBindings: leftOnJ };
    const added = diffGameDocuments(base, bound);
    expect(added).toEqual([expect.objectContaining({ op: "set_game", input_bindings: leftOnJ })]);
    expect(applyGameOps(base, added).inputBindings).toEqual(leftOnJ);
    const removed = diffGameDocuments(bound, base);
    expect(removed).toEqual([expect.objectContaining({ op: "set_game", input_bindings: null })]);
    expect("inputBindings" in applyGameOps(bound, removed)).toBe(false);
  });

  it("diffs 3D look bindings", () => {
    const base = createNative3DGame("bindings-diff-3d");
    const bound: GameDocument3D = { ...copy(base), inputBindings: { actions: {}, axes: {}, look: [{ kind: "mouse", sensitivity: 2, invertY: true }] } };
    const ops = diffGameDocuments3D(base, bound);
    expect(applyGameOps3D(base, ops).inputBindings).toEqual(bound.inputBindings);
  });

  it("keeps an agent's input map next to a user's scene edit", () => {
    const base = createTopDownRoomGame("bindings-merge");
    const user = copy(base);
    user.scenes[0].entities[1].transform2d.x = 3;
    const agent: GameDocument = { ...copy(base), inputBindings: leftOnJ };
    const result = mergeByUnits(base, user, agent, gameMergeAdapter, { mergeWithoutOps: true });
    expect(result.conflicts).toHaveLength(0);
    expect(result.doc.inputBindings).toEqual(leftOnJ);
    expect(result.doc.scenes[0].entities[1].transform2d.x).toBe(3);

    const base3D = createNative3DGame("bindings-merge-3d");
    const agent3D: GameDocument3D = { ...copy(base3D), inputBindings: { actions: { jump: [{ kind: "gamepadButton", button: 1 }] }, axes: {} } };
    const merged3D = mergeByUnits(base3D, copy(base3D), agent3D, gameMergeAdapter3D, { mergeWithoutOps: true });
    expect(merged3D.doc.inputBindings).toEqual(agent3D.inputBindings);
  });
});
