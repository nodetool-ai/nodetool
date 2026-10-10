import { describe, expect, it } from "@jest/globals";
import type { GameDocument } from "@nodetool-ai/protocol/game.js";
import { applyGameOps, createTopDownRoomGame } from "@nodetool-ai/game-runtime";

import { mergeByUnits } from "../../documentMerge";
import { diffGameDocuments } from "../diffGameDocuments";
import { gameMergeAdapter } from "../merge";

function copy(document: GameDocument): GameDocument {
  return JSON.parse(JSON.stringify(document)) as GameDocument;
}

describe("native game merge units", () => {
  it("keeps a user move and an agent sprite edit on the same entity", () => {
    const base = createTopDownRoomGame("merge-game");
    const user = copy(base);
    user.scenes[0].entities[1].transform2d.x = 3;
    const agent = copy(base);
    agent.scenes[0].entities[1].sprite = { ...agent.scenes[0].entities[1].sprite!, tint: "#112233" };

    const result = mergeByUnits(base, user, agent, gameMergeAdapter, { mergeWithoutOps: true });
    expect(result.conflicts).toHaveLength(0);
    expect(result.doc.scenes[0].entities[1].transform2d.x).toBe(3);
    expect(result.doc.scenes[0].entities[1].sprite?.tint).toBe("#112233");
  });

  it("keeps a user's spatial audio edit beside an agent move and flags concurrent audio source edits", () => {
    const base = createTopDownRoomGame("merge-game");
    const gem = base.scenes[0].entities.findIndex((entity) => entity.id === "gem");
    const user = copy(base);
    user.scenes[0].entities[gem].audioSource = { ...user.scenes[0].entities[gem].audioSource!, spatial: true, maxDistance: 20 };
    const agent = copy(base);
    agent.scenes[0].entities[gem].transform2d.x = 4;

    const merged = mergeByUnits(base, user, agent, gameMergeAdapter, { mergeWithoutOps: true });
    expect(merged.conflicts).toHaveLength(0);
    expect(merged.doc.scenes[0].entities[gem].audioSource).toMatchObject({ spatial: true, maxDistance: 20 });
    expect(merged.doc.scenes[0].entities[gem].transform2d.x).toBe(4);

    const rival = copy(base);
    rival.scenes[0].entities[gem].audioSource = { ...rival.scenes[0].entities[gem].audioSource!, spatial: true, minDistance: 3 };
    expect(mergeByUnits(base, user, rival, gameMergeAdapter, { mergeWithoutOps: true }).conflicts.length).toBeGreaterThan(0);
  });

  it("merges a script edit with another behavior and flags edits to the same script", () => {
    const base = createTopDownRoomGame("merge-game");
    base.scenes[0].entities[1].behaviors.push({ kind: "script", source: "({ state }) => ({ state, commands: [] })", maxCommands: 16, maxTickMs: 8 });
    const user = copy(base);
    const movement = user.scenes[0].entities[1].behaviors[0];
    if (movement.kind !== "movement") throw new Error("Fixture movement missing");
    movement.speed = 5;
    const agent = copy(base);
    const script = agent.scenes[0].entities[1].behaviors[2];
    if (script.kind !== "script") throw new Error("Fixture script missing");
    script.source = "({ state }) => ({ state, commands: [{ kind: 'emit', event: 'ready' }] })";

    const distinct = mergeByUnits(base, user, agent, gameMergeAdapter, { mergeWithoutOps: true });
    expect(distinct.conflicts).toHaveLength(0);
    expect(distinct.doc.scenes[0].entities[1].behaviors[0]).toMatchObject({ speed: 5 });
    expect(distinct.doc.scenes[0].entities[1].behaviors[2]).toMatchObject({ source: script.source });

    const userScript = copy(base);
    const edited = userScript.scenes[0].entities[1].behaviors[2];
    if (edited.kind !== "script") throw new Error("Fixture script missing");
    edited.source = "({ state }) => ({ state, commands: [{ kind: 'emit', event: 'user' }] })";
    const contested = mergeByUnits(base, userScript, agent, gameMergeAdapter, { mergeWithoutOps: true });
    expect(contested.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ unit: expect.objectContaining({ kind: "behavior", id: "room:player:2" }) })]));
    expect(contested.doc.scenes[0].entities[1].behaviors[2]).toMatchObject({ source: edited.source });
  });

  it("reverts an agent turn while keeping a later user edit to one of its units", () => {
    const before = createTopDownRoomGame("undo-agent-turn");
    const after = copy(before);
    after.scenes[0].entities[1].transform2d.x = 2;
    after.scenes[0].entities[1].sprite = { ...after.scenes[0].entities[1].sprite!, tint: "#112233" };
    const current = copy(after);
    current.scenes[0].entities[1].sprite = { ...current.scenes[0].entities[1].sprite!, tint: "#445566" };

    const result = mergeByUnits(after, current, before, gameMergeAdapter, { mergeWithoutOps: true });
    expect(result.doc.scenes[0].entities[1].transform2d.x).toBe(before.scenes[0].entities[1].transform2d.x);
    expect(result.doc.scenes[0].entities[1].sprite?.tint).toBe("#445566");
    expect(result.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ unit: expect.objectContaining({ kind: "entity", id: "room:player" }), reason: "edited" })]));
  });
});

describe("native game undo ops", () => {
  it("persists entity, behavior, and background order changes", () => {
    const original = createTopDownRoomGame("undo-game");
    original.schemaVersion = 2;
    original.scenes[0].backgrounds = [
      { id: "back-a", assetId: "wall", width: 16, height: 9, layer: -100, origin: { x: 0, y: 0 }, parallax: { x: 1, y: 1 }, scrollRate: { x: 0, y: 0 }, mode: "none" },
      { id: "back-b", assetId: "wall", width: 16, height: 9, layer: -99, origin: { x: 0, y: 0 }, parallax: { x: 1, y: 1 }, scrollRate: { x: 0, y: 0 }, mode: "none" }
    ];
    const reordered = copy(original);
    reordered.scenes[0].backgrounds?.reverse();
    reordered.scenes[0].entities[1].behaviors.reverse();
    reordered.scenes[0].entities.reverse();

    const ops = diffGameDocuments(original, reordered);
    expect(ops.some((op) => op.op === "move_background")).toBe(true);
    expect(ops.some((op) => op.op === "move_behavior")).toBe(true);
    expect(ops.some((op) => op.op === "move_entity")).toBe(true);
    const result = applyGameOps(original, ops);
    expect(result.scenes[0].backgrounds?.map((layer) => layer.id)).toEqual(["back-b", "back-a"]);
    expect(result.scenes[0].entities.find((entity) => entity.id === original.scenes[0].entities[1].id)?.behaviors)
      .toEqual(reordered.scenes[0].entities.find((entity) => entity.id === original.scenes[0].entities[1].id)?.behaviors);
    expect(result.scenes[0].entities.map((entity) => entity.id)).toEqual(reordered.scenes[0].entities.map((entity) => entity.id));
  });
});
