import { describe, expect, it } from "vitest";
import { gameDocument, gameDocument3D, type GameDocument, type GameDocument3D, type GameEvent, type GameEvent3D } from "@nodetool-ai/protocol";
import { applyGameOps } from "../src/document-ops.js";
import { applyAnyGameOps, anyGameDocumentOp } from "../src/document-ops3d.js";
import { createScriptedGameSession } from "../src/session.js";
import { createGameSession3D } from "../src/session3d.js";
import { validateGame } from "../src/validate.js";
import { validateGame3D } from "../src/validate3d.js";

const sound = { assetId: "builtin:sfx.collect", digest: "builtin:sfx.collect-v1", mediaKind: "audio" } as const;
const hum = { kind: "script", maxTickMs: 50, source: "input => ({ state: {}, commands: input.tick === 0 ? [{ kind: 'emit', event: 'hum' }] : [] })" };

function game2D(audioSource: Record<string, unknown>): GameDocument {
  return gameDocument.parse({ id: "spatial", revision: "one", entrySceneId: "room", tickRate: 60, inputActions: [],
    schemaVersion: 1, engineVersion: "1", pixelsPerUnit: 32, assets: { sound: { ...sound, width: 1, height: 1 } },
    scenes: [{ id: "room", name: "Room", entities: [
      { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
      { id: "radio", transform2d: { x: 5, y: 2 }, audioSource: { assetId: "sound", onEvent: "hum", ...audioSource } },
      { id: "manager", transform2d: { x: 0, y: 0 }, behaviors: [hum] }
    ] }] });
}

function game3D(audioSource: Record<string, unknown>): GameDocument3D {
  return gameDocument3D.parse({ id: "spatial", revision: "one", entrySceneId: "room", tickRate: 60, inputActions: [], inputAxes: [],
    schemaVersion: 3, engineVersion: "2", dimension: "3d", presentation: { aspectRatio: 16 / 9, hudWidth: 960, hudHeight: 540 },
    assets: { sound },
    scenes: [{ id: "room", name: "Room", activeCameraId: "camera", gravity: { x: 0, y: 0, z: 0 }, entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
      { id: "radio", transform3d: { position: { x: -5, y: 1, z: 3 } }, audioSource: { assetId: "sound", onEvent: "hum", ...audioSource } },
      { id: "manager", transform3d: {}, behaviors: [hum] }
    ] }] });
}

function audioEvents(events: readonly (GameEvent | GameEvent3D)[]): Extract<GameEvent, { kind: "audio" }>[] {
  return events.flatMap((event) => event.kind === "audio" ? [event] : []);
}

const defaults = { minDistance: 1, maxDistance: 50, rolloff: 1, distanceModel: "inverse", doppler: 0 };

describe("spatial audio sources", () => {
  it("emits a 2D effect with its emitter position and default spatial settings", async () => {
    const session = await createScriptedGameSession(game2D({ spatial: true }), 1);
    const events = audioEvents([...session.step({ pressed: [], justPressed: [] }).events, ...session.step({ pressed: [], justPressed: [] }).events]);
    expect(events).toHaveLength(1);
    expect(events[0].emitter).toEqual({ entityId: "radio", position: { x: 5, y: 2, z: 0 }, ...defaults });
  });

  it("emits a 3D effect with its world position and authored settings", async () => {
    const cone = { innerAngle: 90, outerAngle: 180, outerGain: 0.25 };
    const session = await createGameSession3D(game3D({ spatial: true, minDistance: 2, maxDistance: 20, rolloff: 0.5, distanceModel: "linear", cone, doppler: 1 }), 1);
    try {
      const input = { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } };
      const events = audioEvents([...session.step(input).events, ...session.step(input).events]);
      expect(events).toHaveLength(1);
      expect(events[0].emitter).toEqual({ entityId: "radio", position: { x: -5, y: 1, z: 3 }, minDistance: 2, maxDistance: 20, rolloff: 0.5,
        distanceModel: "linear", cone, doppler: 1 });
    } finally {
      session.dispose();
    }
  });

  it("keeps events of non-spatial sources free of an emitter", async () => {
    const session = await createScriptedGameSession(game2D({ minDistance: 4 }), 1);
    const events = audioEvents([...session.step({ pressed: [], justPressed: [] }).events, ...session.step({ pressed: [], justPressed: [] }).events]);
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0])).not.toContain("emitter");
  });

  it("reports a max distance that does not exceed the min distance and an inverted cone", () => {
    const bad = { spatial: true, minDistance: 10, maxDistance: 5, cone: { innerAngle: 90, outerAngle: 45, outerGain: 0 } };
    expect(validateGame(game2D(bad)).issues).toEqual(expect.arrayContaining([
      { path: ["scenes", 0, "entities", 1, "audioSource", "maxDistance"], message: "maxDistance (5) must be greater than minDistance (10)" },
      { path: ["scenes", 0, "entities", 1, "audioSource", "cone", "outerAngle"], message: "cone.outerAngle must be at least cone.innerAngle" }
    ]));
    expect(validateGame3D(game3D({ minDistance: 80 })).diagnostics).toContainEqual({ code: "invalid_audio_source",
      path: ["scenes", 0, "entities", 1, "audioSource", "minDistance"], message: "maxDistance (50) must be greater than minDistance (80)" });
  });

  it("sets and clears spatial fields through update_entity in 2D and 3D", () => {
    const set = { audioSource: { spatial: true, maxDistance: 30, cone: { innerAngle: 60, outerAngle: 120, outerGain: 0.1 } } };
    const two = applyGameOps(game2D({}), [{ op: "update_entity", entity_id: "radio", set }]);
    expect(two.scenes[0].entities[1].audioSource).toEqual({ assetId: "sound", onEvent: "hum", volume: 1, ...set.audioSource });
    const cleared = applyGameOps(two, [{ op: "update_entity", entity_id: "radio", set: { audioSource: { cone: null, maxDistance: null } } }]);
    expect(cleared.scenes[0].entities[1].audioSource).toEqual({ assetId: "sound", onEvent: "hum", volume: 1, spatial: true });

    const op = anyGameDocumentOp.parse(JSON.parse(JSON.stringify({ op: "update_entity", entity_id: "radio", set })));
    const three = applyAnyGameOps(game3D({}), [op]) as GameDocument3D;
    expect(three.scenes[0].entities[1].audioSource).toEqual({ assetId: "sound", onEvent: "hum", volume: 1, ...set.audioSource });
    const clearedThree = applyAnyGameOps(three, [{ op: "update_entity", entity_id: "radio", set: { audioSource: { cone: null } } }]) as GameDocument3D;
    expect(clearedThree.scenes[0].entities[1].audioSource?.cone).toBeUndefined();
    expect(() => applyGameOps(game2D({}), [{ op: "update_entity", entity_id: "radio", set: { audioSource: { rolloff: -1 } } }])).toThrow();
  });

  it("replays a spatial source with identical events and snapshots", async () => {
    const document = game3D({ spatial: true, doppler: 1 });
    const first = await createGameSession3D(document, 1);
    const second = await createGameSession3D(document, 1);
    try {
      const input = { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } };
      for (let tick = 0; tick < 10; tick++) { expect(second.step(input).events).toEqual(first.step(input).events); }
      expect(second.snapshot()).toEqual(first.snapshot());
    } finally {
      first.dispose();
      second.dispose();
    }
  });
});
