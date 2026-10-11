import { describe, expect, it } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import * as THREE from "three";
import { gameParticles, gameRenderFrame3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";

import { GameAudioMixer } from "../src/audio/mixer.js";
import { applyDistanceCulling3D } from "../src/renderer3d/culling.js";
import type { RenderInstance } from "../src/renderer3d/types.js";
import {
  DEFAULT_GAME_FRAME_BUDGETS,
  GameFrameBudgetMonitor,
  ParticleSimulator,
  gameAudioVoiceCount,
  gameFrameBudgetOverruns,
  resolveGameFrameBudgets
} from "../src/index.js";

describe("frame budgets", () => {
  it("fills budgets the document leaves out with the player defaults", () => {
    expect(resolveGameFrameBudgets({ drawCalls: 50 })).toEqual({ ...DEFAULT_GAME_FRAME_BUDGETS, drawCalls: 50 });
    expect(resolveGameFrameBudgets(undefined)).toEqual(DEFAULT_GAME_FRAME_BUDGETS);
  });

  it("reports only measured metrics that exceed their budget", () => {
    const limits = resolveGameFrameBudgets({ drawCalls: 10, triangles: 100 });
    expect(gameFrameBudgetOverruns({ drawCalls: 10, triangles: 101 }, limits)).toEqual([{ metric: "triangles", value: 101, budget: 100 }]);
    expect(gameFrameBudgetOverruns({}, limits)).toEqual([]);
  });

  it("warns once per overrun and again only after the metric recovers", () => {
    const warnings: string[] = [];
    const monitor = new GameFrameBudgetMonitor({ drawCalls: 10, voices: 2 }, (message) => warnings.push(message));
    monitor.observe({ drawCalls: 12, voices: 1 });
    monitor.observe({ drawCalls: 15, voices: 3 });
    monitor.observe({ drawCalls: 9, voices: 3 });
    monitor.observe({ drawCalls: 11 });
    expect(warnings).toEqual([
      "Frame budget exceeded: 12 draw calls (budget 10)",
      "Frame budget exceeded: 3 audio voices (budget 2)",
      "Frame budget exceeded: 11 draw calls (budget 10)"
    ]);
  });

  it("budgets live particles from the particle simulator", () => {
    const simulator = new ParticleSimulator({ dimension: "3d" });
    const particles = gameParticles.parse({ emitters: [{ id: "burst", rate: 0, bursts: [{ time: 0, count: 40 }], lifetime: { min: 5, max: 5 } }] });
    simulator.sync([{ entityId: "torch", position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], particles }]);
    simulator.step(1 / 60);
    expect(simulator.count).toBe(40);
    const warnings: string[] = [];
    new GameFrameBudgetMonitor({ particles: 32 }, (message) => warnings.push(message)).observe({ particles: simulator.count });
    expect(warnings).toEqual(["Frame budget exceeded: 40 particles (budget 32)"]);
  });

  it("counts playing voices across every mixer bus", () => {
    const context = new OfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: 8000 });
    const mixer = new GameAudioMixer(context, undefined, 60);
    mixer.voiceStarted("sfx");
    mixer.voiceStarted("sfx");
    mixer.voiceStarted("music");
    expect(gameAudioVoiceCount(mixer.state())).toBe(3);
    mixer.voiceEnded("sfx");
    expect(gameAudioVoiceCount(mixer.state())).toBe(2);
  });
});

function frame(entities: readonly { entityId: string; x: number; cullDistance?: number }[]): GameRenderFrame3D {
  const transform = (x: number) => ({ position: { x, y: 0, z: 0 } });
  return gameRenderFrame3D.parse({
    dimension: "3d", gameId: "game", sceneId: "scene", tick: 1, presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 },
    camera: { entityId: "camera", transform: transform(0), projection: { kind: "perspective" } },
    entities: entities.map(({ entityId, x, cullDistance }) => ({ entityId, transform: transform(x), previousTransform: transform(x),
      ...(cullDistance === undefined ? {} : { cullDistance }) })),
    lights: [], environment: {}, hud: []
  });
}

function instances(value: GameRenderFrame3D): Map<string, RenderInstance> {
  return new Map(value.entities.map((entity) => {
    const object = new THREE.Group();
    object.position.set(entity.transform.position.x, entity.transform.position.y, entity.transform.position.z);
    return [entity.entityId, { descriptor: "transform", object, materials: [] }];
  }));
}

describe("3D distance culling", () => {
  const scene = frame([{ entityId: "near", x: 4, cullDistance: 5 }, { entityId: "far", x: 20, cullDistance: 10 }, { entityId: "always", x: 500 }]);

  it("hides entities beyond their cull distance from the game camera and keeps the rest", () => {
    const objects = instances(scene);
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld(true);
    expect(applyDistanceCulling3D(objects, scene, camera)).toBe(1);
    expect(Object.fromEntries([...objects].map(([id, instance]) => [id, instance.object.visible]))).toEqual({ near: true, far: false, always: true });
    camera.position.set(15, 0, 0);
    camera.updateMatrixWorld(true);
    expect(applyDistanceCulling3D(objects, scene, camera)).toBe(1);
    expect(Object.fromEntries([...objects].map(([id, instance]) => [id, instance.object.visible]))).toEqual({ near: false, far: true, always: true });
  });

  it("shows everything for the editor camera and leaves the frame unchanged", () => {
    const objects = instances(scene);
    const before = structuredClone(scene);
    const camera = new THREE.PerspectiveCamera();
    applyDistanceCulling3D(objects, scene, camera);
    expect(applyDistanceCulling3D(objects, scene, null)).toBe(0);
    expect([...objects.values()].every((instance) => instance.object.visible)).toBe(true);
    expect(scene).toEqual(before);
  });
});
