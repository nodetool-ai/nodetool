import { describe, expect, it } from "@jest/globals";
import type { GameDocument, GameUiTree } from "@nodetool-ai/protocol/game.js";
import { applyGameOps, createTopDownRoomGame } from "@nodetool-ai/game-runtime";

import { mergeByUnits } from "../../documentMerge";
import { diffGameDocuments } from "../diffGameDocuments";
import { gameMergeAdapter } from "../merge";

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
});
