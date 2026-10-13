import { describe, expect, it } from "vitest";
import { gameDocument, gameDocument3D } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { createGameSession } from "../src/session.js";
import { createGameSession3D } from "../src/session3d.js";
import { blockout } from "./fixtures-game3d.js";

const streaming = { loopStartSeconds: 12, loopEndSeconds: 90 };
const music = { assetId: "music", volume: 0.4, fadeInTicks: 30, fadeOutTicks: 30 };
const input2D = { pressed: ["right"], justPressed: [] };
const input3D = { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } };

describe("streaming music is presentation configuration", () => {
  it("keeps 2D events and snapshots identical and resumes a 120-tick seed-1 route from tick 60", () => {
    const base = createTopDownRoomGame("streaming-determinism");
    const plain = gameDocument.parse({ ...base, schemaVersion: 2,
      assets: { ...base.assets, music: { assetId: "music.wav", digest: "music", mediaKind: "audio", width: 1, height: 1 } },
      scenes: base.scenes.map((scene) => ({ ...scene, music })) });
    const streamed = gameDocument.parse({ ...plain, scenes: plain.scenes.map((scene) => ({ ...scene, music: { ...music, streaming } })) });
    const regular = createGameSession(plain, 1);
    const session = createGameSession(streamed, 1);
    let replay: ReturnType<typeof createGameSession> | undefined;
    try {
      expect(session.snapshot()).toEqual(regular.snapshot());
      for (let tick = 0; tick < 120; tick++) {
        const result = session.step(input2D);
        expect(result.events).toEqual(regular.step(input2D).events);
        if (replay) {
          expect(replay.step(input2D).events).toEqual(result.events);
          expect(replay.snapshot()).toEqual(session.snapshot());
        }
        if (tick === 59) replay = createGameSession(streamed, 1, session.snapshot());
      }
      expect(session.snapshot()).toEqual(regular.snapshot());
      expect(session.snapshot().tick).toBe(120);
      expect(JSON.stringify(session.snapshot())).not.toContain("streaming");
    } finally { regular.dispose(); session.dispose(); replay?.dispose(); }
  });

  it("keeps 3D music settings outside initialization, transition and restore snapshots with zero replay divergence", async () => {
    const base = blockout();
    base.assets.music = { assetId: "music.wav", digest: "music", mediaKind: "audio", required: true };
    base.scenes[0].music = music;
    const manager = base.scenes[0].entities.find((entity) => entity.id === "player");
    if (!manager) throw new Error("Fixture player missing");
    manager.behaviors.push({ kind: "script", maxTickMs: 20,
      source: "input => ({state:null,commands:input.tick===0?[{kind:'sceneTransition',sceneId:'next'}]:[]})" });
    base.scenes.push({ ...base.scenes[0], id: "next", name: "Next", entities: base.scenes[0].entities.map((entity) => ({ ...entity, behaviors: [] })) });
    const document = gameDocument3D.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, music: { ...music, streaming } })) });
    const regular = await createGameSession3D(base, 1);
    const session = await createGameSession3D(document, 1);
    let replay: Awaited<ReturnType<typeof createGameSession3D>> | undefined;
    try {
      expect(session.snapshot().music).toEqual({ ...music, voiceId: "scene:scene:music", startTick: 0 });
      for (let tick = 0; tick < 120; tick++) {
        const result = session.step(input3D);
        expect(result.events).toEqual(regular.step(input3D).events);
        if (tick === 0) {
          expect(result.events.some((event) => event.kind === "sceneTransition")).toBe(true);
          expect(session.snapshot().music).toEqual({ ...music, voiceId: "scene:next:music", startTick: 1 });
        }
        if (replay) {
          expect(replay.step(input3D).events).toEqual(result.events);
          expect(replay.snapshot()).toEqual(session.snapshot());
        }
        if (tick === 59) replay = await createGameSession3D(document, 1, session.snapshot());
      }
      const { contentDigest: _regularDigest, ...regularState } = regular.snapshot();
      const { contentDigest: _streamedDigest, ...streamedState } = session.snapshot();
      expect(streamedState).toEqual(regularState);
      expect(session.snapshot().tick).toBe(120);
      expect(JSON.stringify(session.snapshot().music)).not.toContain("streaming");
      const restored = await createGameSession3D(document, 1, { ...session.snapshot(), music: null });
      try {
        expect(restored.snapshot().music).toEqual({ ...music, voiceId: "scene:next:music", startTick: 120 });
      } finally { restored.dispose(); }
    } finally { regular.dispose(); session.dispose(); replay?.dispose(); }
  });
});
