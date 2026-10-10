import { describe, expect, it } from "vitest";
import type { GameAudioMixerInput, GameDocument, GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps, GameOpError } from "../src/document-ops.js";
import { applyAnyGameOps, anyGameDocumentOp } from "../src/document-ops3d.js";
import { createTopDownRoomGame } from "../src/sample.js";
import { createGameSession } from "../src/session.js";
import { createGameSession3D } from "../src/session3d.js";
import { validateGame } from "../src/validate.js";
import { validateGame3D } from "../src/validate3d.js";
import { blockout } from "./fixtures-game3d.js";

const MIXER: GameAudioMixerInput = {
  buses: { dialogue: { parent: "voice", volume: 0.8 } },
  assetBuses: { "sfx.collect": "ui" },
  snapshots: { victory: { buses: { music: { volume: 0.3, lowpassHz: 800 } } } },
  transitions: [{ on: { kind: "win" }, snapshot: "victory", fadeTicks: 45 }]
};

function withMixer(document: GameDocument, mixer: GameAudioMixerInput = MIXER): GameDocument {
  return applyGameOps(document, [{ op: "set_audio", mixer }]);
}

function blockoutWithAudio(): GameDocument3D {
  const document = blockout();
  document.assets.voice = { mediaKind: "audio", assetId: "0123456789abcdef0123456789abcdef", digest: "voice", required: true };
  return document;
}

describe("audio mixer document fields", () => {
  it("sets and clears the 2D mixer through set_audio", () => {
    const game = createTopDownRoomGame("mixer");
    const mixed = withMixer(game);
    expect(mixed.audio?.mixer?.assetBuses).toEqual({ "sfx.collect": "ui" });
    expect(mixed.audio?.mixer?.buses.dialogue).toEqual({ parent: "voice", volume: 0.8, muted: false, reverbSend: 0 });
    expect(validateGame(mixed).valid).toBe(true);
    expect(applyGameOps(mixed, [{ op: "set_audio", mixer: null }]).audio).toBeUndefined();
  });

  it("rejects mixer references to missing buses, assets and scenes with their paths", () => {
    const game = createTopDownRoomGame("mixer");
    expect(() => withMixer(game, { assetBuses: { "sfx.collect": "nowhere" } })).toThrow(GameOpError);
    const missingAsset = validateGame({ ...game, audio: { mixer: { assetBuses: { "missing.slot": "voice" } } } });
    expect(missingAsset.issues).toContainEqual({ path: ["audio", "mixer", "assetBuses", "missing.slot"], message: "Asset missing.slot must be an audio binding" });
    const missingScene = validateGame({ ...game, audio: { mixer: { transitions: [{ on: { kind: "scene", sceneId: "nope" }, snapshot: "base" }] } } });
    expect(missingScene.issues).toContainEqual({ path: ["audio", "mixer", "transitions", 0, "on", "sceneId"], message: "Scene nope does not exist" });
    const cycle = validateGame({ ...game, audio: { mixer: { buses: { a: { parent: "b" }, b: { parent: "a" } } } } });
    expect(cycle.valid).toBe(false);
  });

  it("refuses to unbind an asset slot that the mixer routes", () => {
    const mixed = withMixer(createTopDownRoomGame("mixer"));
    const removeSource = mixed.scenes.map((scene) => ({ ...scene, entities: scene.entities.map(({ audioSource: _audioSource, ...entity }) => entity) }));
    const withoutSource = { ...mixed, scenes: removeSource };
    expect(() => applyGameOps(withoutSource, [{ op: "unbind_asset", slot: "sfx.collect" }])).toThrow(/still referenced/);
  });

  it("sets the 3D mixer through the public JSON op union and validates its references", () => {
    const document = blockoutWithAudio();
    const op = anyGameDocumentOp.parse(JSON.parse(JSON.stringify({ op: "set_audio", mixer: { assetBuses: { voice: "voice" } } })));
    const mixed = applyAnyGameOps(document, [op]);
    expect(mixed.audio?.mixer?.assetBuses).toEqual({ voice: "voice" });
    const invalid = validateGame3D({ ...document, audio: { mixer: { assetBuses: { music: "music" } } } });
    expect(invalid.diagnostics).toContainEqual({ code: "invalid_audio_mixer", path: ["audio", "mixer", "assetBuses", "music"], message: "Asset music must be an audio binding" });
  });

  it("leaves 2D snapshots and events identical with and without a mixer", () => {
    const game = createTopDownRoomGame("mixer");
    const mixed = withMixer(game);
    const plain = createGameSession(game, 1);
    const withAudio = createGameSession(mixed, 1);
    const right = { pressed: ["right"], justPressed: [] };
    for (let tick = 0; tick < 120; tick++) {
      expect(withAudio.step(right).events).toEqual(plain.step(right).events);
    }
    expect(withAudio.snapshot()).toEqual(plain.snapshot());
    expect(JSON.stringify(withAudio.snapshot())).not.toContain("mixer");
  });

  it("leaves 3D simulation state identical with and without a mixer", async () => {
    const document = blockoutWithAudio();
    const mixed = applyAnyGameOps(document, [{ op: "set_audio", mixer: { assetBuses: { voice: "voice" } } }]);
    const plain = await createGameSession3D(document, 1);
    const withAudio = await createGameSession3D(mixed, 1);
    try {
      const input = { pressed: ["jump"], justPressed: [], axes: { moveX: 1 }, look: { x: 0, y: 0 } };
      for (let tick = 0; tick < 60; tick++) {
        expect(withAudio.step(input).events).toEqual(plain.step(input).events);
      }
      const { contentDigest: _mixedDigest, ...mixedState } = withAudio.snapshot();
      const { contentDigest: _plainDigest, ...plainState } = plain.snapshot();
      expect(mixedState).toEqual(plainState);
    } finally {
      plain.dispose();
      withAudio.dispose();
    }
  });
});
