import { describe, expect, it } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import type { GameAudioEmitter, GameRenderFrame, GameRenderFrame3D, GameTransform3D } from "@nodetool-ai/protocol";
import { GameAudioMixer } from "../src/audio/mixer.js";
import {
  createGameAudioPanner, gameAudioDopplerRate, gameAudioSpatialView2D, gameAudioSpatialView3D, placeGameAudioListener, placeGameAudioPanner,
  type GameAudioSpatialQuality, type GameAudioSpatialView
} from "../src/audio/spatial.js";

const SAMPLE_RATE = 48000;
const IDENTITY: GameTransform3D["rotation"] = [0, 0, 0, 1];
/** A half turn around +y: the camera faces +z, so world +x is on its left. */
const TURNED: GameTransform3D["rotation"] = [0, 1, 0, 0];

function transform(x: number, z = 0, rotation = IDENTITY): GameTransform3D {
  return { position: { x, y: 0, z }, rotation, scale: { x: 1, y: 1, z: 1 } };
}

function frame3D(emitterX: number, cameraRotation = IDENTITY, emitterZ = 0): GameRenderFrame3D {
  return {
    dimension: "3d", gameId: "game", sceneId: "scene", tick: 1, presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 },
    camera: { entityId: "camera", transform: transform(0, 0, cameraRotation), projection: { kind: "perspective", fov: 60, near: 0.1, far: 100 } },
    entities: [{ entityId: "radio", transform: transform(emitterX, emitterZ), previousTransform: transform(emitterX, emitterZ) }],
    lights: [], environment: { background: "#000000", ambient: { color: "#ffffff", intensity: 1 }, shadows: { enabled: false, mapSize: 1024, extent: 30 } },
    hud: []
  } as GameRenderFrame3D;
}

function frame2D(emitterX: number): GameRenderFrame {
  return { tick: 1, width: 16, height: 9, pixelsPerUnit: 32, camera: { x: 0, y: 0, previousX: 0, previousY: 0, zoom: 1 }, tiles: [], hud: [],
    sprites: [{ entityId: "radio", assetId: "sprite", x: emitterX, y: 0, previousX: emitterX, previousY: 0, rotation: 0, scaleX: 1, scaleY: 1,
      width: 1, height: 1, layer: 0 }] };
}

function emitter(overrides: Partial<GameAudioEmitter> = {}): GameAudioEmitter {
  return { entityId: "radio", position: { x: 0, y: 0, z: 0 }, minDistance: 1, maxDistance: 50, rolloff: 1, distanceModel: "inverse", doppler: 0, ...overrides };
}

/** Renders a 440 Hz tone through a spatial voice and the default mixer. Returns left and right RMS. */
async function render(view: GameAudioSpatialView, quality: GameAudioSpatialQuality, settings = emitter()): Promise<{ left: number; right: number }> {
  const context = new OfflineAudioContext({ numberOfChannels: 2, length: SAMPLE_RATE / 4, sampleRate: SAMPLE_RATE });
  const mixer = new GameAudioMixer(context, undefined, 60, { clock: () => 0 });
  placeGameAudioListener(context.listener, view.listener, 0, false);
  const panner = createGameAudioPanner(context, settings, quality, 0);
  const pose = view.emitter(settings.entityId);
  if (pose) { placeGameAudioPanner(panner, settings, pose, 0, false); }
  panner.connect(mixer.input("sfx"));
  const tone = context.createOscillator();
  tone.frequency.value = 440;
  const gain = context.createGain();
  gain.gain.value = 0.5;
  tone.connect(gain).connect(panner);
  tone.start(0);
  const buffer = await context.startRendering();
  const rms = (channel: number): number => {
    const data = buffer.getChannelData(channel);
    let sum = 0;
    for (const value of data) { sum += value * value; }
    return Math.sqrt(sum / data.length);
  };
  return { left: rms(0), right: rms(1) };
}

describe("spatial audio", () => {
  for (const quality of ["high", "low"] as const) {
    it(`pans an emitter at x=+5 right and at x=-5 left with ${quality} quality`, async () => {
      const right = await render(gameAudioSpatialView3D(frame3D(5), 1), quality);
      const left = await render(gameAudioSpatialView3D(frame3D(-5), 1), quality);
      expect(right.right).toBeGreaterThan(right.left * 1.3);
      expect(left.left).toBeGreaterThan(left.right * 1.3);
      expect(left.left).toBeCloseTo(right.right, 2);
    });
  }

  it("takes the listener orientation from the active camera", async () => {
    const turned = await render(gameAudioSpatialView3D(frame3D(5, TURNED), 1), "low");
    expect(turned.left).toBeGreaterThan(turned.right * 1.3);
  });

  it("pans 2D emitters relative to the camera", async () => {
    const right = await render(gameAudioSpatialView2D(frame2D(5), 1), "low");
    expect(right.right).toBeGreaterThan(right.left * 1.3);
  });

  it("attenuates with distance by the authored model and rolloff", async () => {
    const level = async (x: number, settings: GameAudioEmitter): Promise<number> => {
      const result = await render(gameAudioSpatialView3D(frame3D(0, IDENTITY, -x), 1), "low", settings);
      return Math.hypot(result.left, result.right);
    };
    const inverse = emitter();
    const near = await level(1, inverse);
    expect(await level(4, inverse) / near).toBeCloseTo(0.25, 2);
    const linear = emitter({ distanceModel: "linear", maxDistance: 10, rolloff: 1 });
    expect(await level(10, linear)).toBeLessThan(1e-4);
    expect(await level(5.5, linear) / await level(1, linear)).toBeCloseTo(0.5, 2);
  });

  // node-web-audio-api measures the cone angle from the listener to the source, the reverse of the Web Audio
  // specification and of browsers, so this test checks the panner's cone settings rather than rendered gain.
  it("orients a cone with the 3D emitter and leaves 2D emitters omnidirectional", () => {
    const coned = emitter({ cone: { innerAngle: 60, outerAngle: 90, outerGain: 0.1 } });
    const context = new OfflineAudioContext({ numberOfChannels: 2, length: 128, sampleRate: SAMPLE_RATE });
    const flat = createGameAudioPanner(context, coned, "low", 0);
    const flatPose = gameAudioSpatialView2D(frame2D(5), 1).emitter("radio");
    if (!flatPose) { throw new Error("2D emitter must have a pose"); }
    placeGameAudioPanner(flat, coned, flatPose, 0, false);
    expect([flat.coneInnerAngle, flat.coneOuterAngle, flat.coneOuterGain]).toEqual([360, 360, 0]);
    const facing = createGameAudioPanner(context, coned, "low", 0);
    const pose = gameAudioSpatialView3D(frame3D(0, TURNED, -4), 1).emitter("radio");
    const turnedPose = gameAudioSpatialView3D({ ...frame3D(0), entities: [{ entityId: "radio", transform: transform(0, -4, TURNED), previousTransform: transform(0, -4, TURNED) }] }, 1).emitter("radio");
    if (!pose || !turnedPose) { throw new Error("3D emitter must have a pose"); }
    expect(pose.forward).toEqual({ x: 0, y: 0, z: -1 });
    placeGameAudioPanner(facing, coned, turnedPose, 0, false);
    expect([facing.coneInnerAngle, facing.coneOuterAngle, facing.coneOuterGain]).toEqual([60, 90, expect.closeTo(0.1, 5)]);
    expect(turnedPose.forward?.z).toBeCloseTo(1, 6);
  });

  it("raises pitch for an approaching emitter and lowers it for a receding one", () => {
    const listener = { x: 0, y: 0, z: 0 };
    const still = { x: 0, y: 0, z: 0 };
    expect(gameAudioDopplerRate(listener, still, { x: 10, y: 0, z: 0 }, { x: -34.3, y: 0, z: 0 }, 1)).toBeCloseTo(343 / (343 - 34.3), 5);
    expect(gameAudioDopplerRate(listener, still, { x: 10, y: 0, z: 0 }, { x: 34.3, y: 0, z: 0 }, 1)).toBeCloseTo(343 / (343 + 34.3), 5);
    expect(gameAudioDopplerRate(listener, { x: 34.3, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, still, 1)).toBeCloseTo((343 + 34.3) / 343, 5);
    expect(gameAudioDopplerRate(listener, still, { x: 10, y: 0, z: 0 }, { x: -34.3, y: 0, z: 0 }, 0)).toBe(1);
    expect(gameAudioDopplerRate(listener, still, { x: 10, y: 0, z: 0 }, { x: -1000, y: 0, z: 0 }, 1)).toBe(2);
  });
});
