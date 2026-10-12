import { describe, expect, it } from "@jest/globals";
import type { GameDocument, GameUiTree } from "@nodetool-ai/protocol/game.js";
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

const hud: GameUiTree = { nodes: [{ kind: "panel", id: "scorePanel", anchor: { x: 1, y: 0 }, width: 120, height: 32 },
  { kind: "text", id: "score", parent: "scorePanel", text: "Score 0" }] };
const banner: GameUiTree = { nodes: [{ kind: "text", id: "banner", text: "Room 1" }] };

describe("HUD tree diff and merge units", () => {
  it("diffs document and scene trees into set_ui ops that replay exactly", () => {
    const base = createTopDownRoomGame("hud-diff");
    const edited: GameDocument = { ...copy(base), ui: hud };
    edited.scenes[0].ui = banner;
    const added = diffGameDocuments(base, edited);
    expect(added).toEqual(expect.arrayContaining([{ op: "set_ui", ui: hud }, { op: "set_ui", scene_id: base.scenes[0].id, ui: banner }]));
    const replayed = applyGameOps(base, added);
    expect(replayed.ui).toEqual(hud);
    expect(replayed.scenes[0].ui).toEqual(banner);
    const removed = applyGameOps(edited, diffGameDocuments(edited, base));
    expect("ui" in removed).toBe(false);
    expect("ui" in removed.scenes[0]).toBe(false);
  });

  it("keeps an agent's HUD next to a user's entity edit", () => {
    const base = createTopDownRoomGame("hud-merge");
    const user = copy(base);
    user.scenes[0].entities[1].transform2d.x = 3;
    const agent: GameDocument = { ...copy(base), ui: hud };
    agent.scenes[0].ui = banner;
    const result = mergeByUnits(base, user, agent, gameMergeAdapter, { mergeWithoutOps: true });
    expect(result.conflicts).toHaveLength(0);
    expect(result.doc.ui).toEqual(hud);
    expect(result.doc.scenes[0].ui).toEqual(banner);
    expect(result.doc.scenes[0].entities[1].transform2d.x).toBe(3);
  });

  it("diffs 3D document and scene trees into set_ui ops that replay exactly", () => {
    const base = createNative3DGame("hud-diff-3d");
    const edited: GameDocument3D = { ...copy(base), ui: hud };
    edited.scenes[0].ui = banner;
    const added = diffGameDocuments3D(base, edited);
    expect(added).toEqual(expect.arrayContaining([{ op: "set_ui", ui: hud }, { op: "set_ui", scene_id: base.scenes[0].id, ui: banner }]));
    expect(applyGameOps3D(base, added)).toEqual(edited);
    const removed = applyGameOps3D(edited, diffGameDocuments3D(edited, base));
    expect("ui" in removed).toBe(false);
    expect("ui" in removed.scenes[0]).toBe(false);
  });

  it("keeps an agent's 3D HUD next to a user's entity edit", () => {
    const base = createNative3DGame("hud-merge-3d");
    const user = copy(base);
    user.scenes[0].entities[1].transform3d.position.x = 3;
    const agent: GameDocument3D = { ...copy(base), ui: hud };
    agent.scenes[0].ui = banner;
    const result = mergeByUnits(base, user, agent, gameMergeAdapter3D, { mergeWithoutOps: true });
    expect(result.conflicts).toHaveLength(0);
    expect(result.doc.ui).toEqual(hud);
    expect(result.doc.scenes[0].ui).toEqual(banner);
    expect(result.doc.scenes[0].entities[1].transform3d.position.x).toBe(3);
  });
});
