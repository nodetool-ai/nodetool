import { describe, expect, it } from "vitest";
import {
  gameDocument, gameDocument3D, gameInputFrame3D, type GameBehavior,
  type GameEvent, type GameEvent3D, type GameHudLabel, type GameSnapshot, type GameSnapshot3D
} from "@nodetool-ai/protocol";
import { createScriptedGameSession } from "../src/session.js";
import { createGameSession3D } from "../src/session3d.js";
import { runGameplayPhases } from "../src/gameplay/lifecycle.js";

const actorBehaviors: GameBehavior[] = [{ kind: "health", maximum: 4 }];
const managerBehaviors = [
  { kind: "winWhenCollected", count: 2 }, { kind: "spawn", prefabId: "spark", onEvent: "door" },
  { kind: "sceneTransition", sceneId: "next", onEvent: "advance" },
  { kind: "script", maxTickMs: 50, source: `input => ({state:{events:input.events.map(event=>event.kind)}, commands: input.tick===0 ?
    [{kind:'hud',id:'status',text:'Ready',x:16,y:80}] : input.tick===4 ? [{kind:'emit',event:'advance'}] : []})` }
];
const lifetime = [{ kind: "lifetime", ticks: 2, fade: true, endScale: 1 }];

function pairedGames() {
  const common = { id: "paired", revision: "paired-v1", entrySceneId: "room", tickRate: 60, inputActions: [] };
  const two = gameDocument.parse({ ...common, schemaVersion: 1, engineVersion: "1", pixelsPerUnit: 32,
    assets: { sound: { assetId: "builtin:sfx.collect", digest: "builtin:sfx.collect-v1", mediaKind: "audio", width: 1, height: 1 } },
    scenes: [
      { id: "room", name: "Room", entities: [
        { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
        { id: "player", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic" }, collider2d: { width: 1, height: 1 }, behaviors: actorBehaviors },
        { id: "gem", transform2d: { x: 0, y: 0 }, collider2d: { width: 1, height: 1, sensor: true }, behaviors: [{ kind: "collectible", score: 2 }], audioSource: { assetId: "sound", onEvent: "collected" } },
        { id: "switch", transform2d: { x: 0, y: 0 }, collider2d: { width: 1, height: 1, sensor: true }, behaviors: [{ kind: "trigger", event: "door" }] },
        { id: "manager", transform2d: { x: 10, y: 0 }, behaviors: managerBehaviors },
        { id: "fleeting", transform2d: { x: 10, y: 0 }, behaviors: lifetime },
        { id: "spark", templateOnly: true, transform2d: { x: 10, y: 0 }, behaviors: [{ kind: "lifetime", ticks: 1 }] }
      ] },
      { id: "next", name: "Next", entities: [
        { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
        { id: "arrival", transform2d: { x: 0, y: 0 }, behaviors: lifetime }
      ] }
    ] });
  const three = gameDocument3D.parse({ ...common, schemaVersion: 3, engineVersion: "2", dimension: "3d", inputAxes: [],
    presentation: { aspectRatio: 16 / 9, hudWidth: 960, hudHeight: 540 }, assets: { sound: { assetId: "builtin:sfx.collect", digest: "builtin:sfx.collect-v1", mediaKind: "audio" } },
    scenes: [
      { id: "room", name: "Room", activeCameraId: "camera", gravity: { x: 0, y: 0, z: 0 }, entities: [
        { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
        { id: "player", transform3d: {}, body3d: { type: "kinematic" }, collider3d: { kind: "capsule", radius: 0.3, halfHeight: 0.5 },
          interactionActor: { collects: true, activatesTriggers: true }, behaviors: actorBehaviors },
        { id: "gem", transform3d: {}, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 1, sensor: true }, behaviors: [{ kind: "collectible", score: 2 }], audioSource: { assetId: "sound", onEvent: "collected" } },
        { id: "switch", transform3d: {}, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 1, sensor: true }, behaviors: [{ kind: "trigger", event: "door" }] },
        { id: "manager", transform3d: { position: { x: 10, y: 0, z: 0 } }, behaviors: managerBehaviors },
        { id: "fleeting", transform3d: { position: { x: 10, y: 0, z: 0 } }, behaviors: lifetime },
        { id: "spark", templateOnly: true, transform3d: { position: { x: 10, y: 0, z: 0 } }, behaviors: [{ kind: "lifetime", ticks: 1 }] }
      ] },
      { id: "next", name: "Next", activeCameraId: "camera", gravity: { x: 0, y: 0, z: 0 }, entities: [
        { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
        { id: "arrival", transform3d: {}, behaviors: lifetime }
      ] }
    ] });
  return { two, three };
}

function sharedEvents(events: readonly (GameEvent | GameEvent3D)[]): unknown[] {
  return events.filter((event) => event.kind !== "contact").map((event) => {
    if (event.kind !== "audio") return event;
    const { voiceId: _voiceId, ...audio } = event;
    return audio;
  });
}

function sharedState(snapshot: GameSnapshot | GameSnapshot3D, hud: readonly GameHudLabel[]) {
  return { tick: snapshot.tick, sceneId: snapshot.sceneId, score: snapshot.score, won: snapshot.won, rngState: snapshot.rngState,
    spawnSequence: snapshot.spawnSequence, hud,
    entities: snapshot.entities.map((entity) => ({ id: entity.id, sourceId: entity.sourceId, active: entity.active, spawnTick: entity.spawnTick, health: entity.health })) };
}

describe("shared gameplay across spatial adapters", () => {
  it("matches collection, trigger, lifetime, spawn, transition, HUD, audio and win order", async () => {
    const games = pairedGames();
    const two = await createScriptedGameSession(games.two, 31);
    const three = await createGameSession3D(games.three, 31);
    try {
      const events: unknown[][] = [];
      for (let tick = 0; tick < 9; tick += 1) {
        const first = two.step({ pressed: [], justPressed: [] });
        const second = three.step(gameInputFrame3D.parse({ pressed: [] }));
        const shared = sharedEvents(first.events);
        expect(sharedEvents(second.events)).toEqual(shared);
        expect(sharedState(three.snapshot(), second.frame.hud)).toEqual(sharedState(two.snapshot(), first.frame.hud));
        events.push(shared);
        if (tick === 1) {
          expect(two.inspect().entities.some((entity) => entity.id === "spark#1" && entity.spawnTick === 2)).toBe(true);
          expect(three.inspect().entities.some((entity) => entity.id === "spark#1" && entity.spawnTick === 2)).toBe(true);
        }
        if (tick === 2) {
          expect(two.inspect().entities.find((entity) => entity.id === "fleeting")?.active).toBe(false);
          expect(three.inspect().entities.find((entity) => entity.id === "fleeting")?.active).toBe(false);
        }
      }
      expect(events[0].map((event) => (event as { kind: string }).kind)).toEqual(["collected", "trigger", "audio", "win"]);
      expect(events[4]).toEqual([{ kind: "trigger", entityId: "manager", event: "advance" }]);
      expect(events[5]).toEqual([{ kind: "sceneTransition", sceneId: "next" }]);
      expect(two.snapshot().sceneId).toBe("next");
    } finally { two.dispose(); three.dispose(); }
  });

  it("owns a single phase order and does not commit after a failed spatial step", () => {
    const phases: string[] = [];
    const result = runGameplayPhases({
      prepare: () => { phases.push("prepare"); },
      advanceSpatial: () => { phases.push("physics"); return "contacts"; },
      reduceContacts: (contacts) => { phases.push(contacts); },
      commit: () => { phases.push("commit"); return 7; }
    });
    expect(result).toBe(7);
    expect(phases).toEqual(["prepare", "physics", "contacts", "commit"]);
    phases.length = 0;
    expect(() => runGameplayPhases({
      prepare: () => { phases.push("prepare"); },
      advanceSpatial: () => { throw new Error("physics failure"); },
      reduceContacts: () => { phases.push("contacts"); },
      commit: () => { phases.push("commit"); }
    })).toThrow("physics failure");
    expect(phases).toEqual(["prepare"]);
  });
});
