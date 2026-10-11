import { describe, expect, it, vi } from "vitest";
import { gameDocument3D, gameParticles, gameInputFrame3D, type GameParticles } from "@nodetool-ai/protocol";
import { createGameSession3D } from "@nodetool-ai/game-runtime";

import {
  MAX_PARTICLE_STEP_SECONDS,
  ParticleRandom,
  ParticleSimulator,
  evaluateParticleCurve,
  evaluateParticleGradient,
  particleSeed,
  particleSourcesFromFrame,
  sampleParticleRange,
  type ParticleEmitterSource,
  type ParticleView
} from "../src/index.js";

const TICK = 1 / 60;
const IDENTITY = [0, 0, 0, 1] as const;

function source(particles: unknown, entityId = "torch", position = { x: 0, y: 0, z: 0 }): ParticleEmitterSource {
  return { entityId, position, rotation: IDENTITY, particles: gameParticles.parse(particles) };
}

function run(simulator: ParticleSimulator, sources: readonly ParticleEmitterSource[], ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    simulator.sync(sources);
    simulator.step(TICK);
  }
}

function views(simulator: ParticleSimulator): ParticleView[] {
  const result: ParticleView[] = [];
  simulator.forEachParticle((particle) => result.push({ ...particle }));
  return result;
}

describe("particle curves", () => {
  const curve = [{ t: 0.25, value: 0 }, { t: 0.5, value: 2 }, { t: 0.5, value: 4 }, { t: 1, value: 0 }];

  it("holds end values outside the keys and interpolates linearly between them", () => {
    expect(evaluateParticleCurve(curve, 0)).toBe(0);
    expect(evaluateParticleCurve(curve, 0.375)).toBe(1);
    expect(evaluateParticleCurve(curve, 0.75)).toBe(2);
    expect(evaluateParticleCurve(curve, 1)).toBe(0);
    expect(evaluateParticleCurve([{ t: 0.4, value: 3 }], 0.9)).toBe(3);
  });

  it("steps at keys that share a time", () => {
    expect(evaluateParticleCurve(curve, 0.5)).toBe(2);
    expect(evaluateParticleCurve(curve, 0.5000001)).toBeCloseTo(4, 5);
  });

  it("interpolates gradients per channel", () => {
    const gradient = [{ t: 0, color: "#ff0000" }, { t: 1, color: "#0000ff" }];
    expect(evaluateParticleGradient(gradient, 0.5)).toEqual({ r: 0.5, g: 0, b: 0.5 });
    expect(evaluateParticleGradient(gradient, 2)).toEqual({ r: 0, g: 0, b: 1 });
  });

  it("samples fixed ranges without consuming random numbers", () => {
    const random = new ParticleRandom(1);
    const reference = new ParticleRandom(1);
    expect(sampleParticleRange(3, random)).toBe(3);
    const value = sampleParticleRange({ min: 2, max: 4 }, random);
    expect(value).toBe(2 + 2 * reference.next());
  });
});

describe("particle emission counts", () => {
  it("emits the authored rate across ticks and loops", () => {
    const simulator = new ParticleSimulator({ dimension: "2d" });
    const sources = [source({ emitters: [{ id: "flame", rate: 10, lifetime: 10 }] })];
    run(simulator, sources, 60);
    expect(simulator.count).toBe(10);
    run(simulator, sources, 60);
    expect(simulator.count).toBe(20);
  });

  it("fires burst cycles once per emitter cycle", () => {
    const burst = { time: 0, count: 5, cycles: 3, interval: 0.25 };
    const once = new ParticleSimulator({ dimension: "3d" });
    const onceSources = [source({ emitters: [{ id: "pop", rate: 0, loop: false, lifetime: 10, bursts: [burst] }] })];
    run(once, onceSources, 1);
    expect(once.count).toBe(5);
    run(once, onceSources, 119);
    expect(once.count).toBe(15);

    const looping = new ParticleSimulator({ dimension: "3d" });
    run(looping, [source({ emitters: [{ id: "pop", rate: 0, lifetime: 10, bursts: [burst] }] })], 120);
    expect(looping.count).toBe(30);
  });

  it("waits for emitParticles when playOnStart is false, then restarts or bursts on request", () => {
    const simulator = new ParticleSimulator({ dimension: "2d" });
    const sources = [source({ emitters: [{ id: "boom", playOnStart: false, loop: false, rate: 0, lifetime: 10, bursts: [{ count: 8 }] }] })];
    run(simulator, sources, 30);
    expect(simulator.count).toBe(0);
    simulator.emit([{ kind: "trigger" }, { kind: "particles", entityId: "torch" }]);
    run(simulator, sources, 30);
    expect(simulator.count).toBe(8);
    simulator.emit([{ kind: "particles", entityId: "torch", emitter: "boom", count: 7 }, { kind: "particles", entityId: "other", count: 50 }]);
    run(simulator, sources, 1);
    expect(simulator.count).toBe(15);
  });

  it("caps live particles per emitter and per scene", () => {
    const emitter = { rate: 1000, lifetime: 10, maxParticles: 100 };
    const single = new ParticleSimulator({ dimension: "2d" });
    run(single, [source({ emitters: [{ id: "a", ...emitter }] })], 60);
    expect(single.countOf("torch", "a")).toBe(100);

    const scene = new ParticleSimulator({ dimension: "2d", maxSceneParticles: 120 });
    run(scene, [source({ emitters: [{ id: "a", ...emitter }, { id: "b", ...emitter }] })], 60);
    expect(scene.count).toBe(120);
    expect(scene.countOf("torch", "a") + scene.countOf("torch", "b")).toBe(120);
    expect(views(scene)).toHaveLength(120);
  });

  it("retires particles at the end of their lifetime and fires death emitters at their position", () => {
    const simulator = new ParticleSimulator({ dimension: "3d" });
    const sources = [source({ emitters: [
      { id: "shell", rate: 0, loop: false, lifetime: 0.1, speed: 0, bursts: [{ count: 4 }], onDeath: [{ emitter: "spark", count: 3 }] },
      { id: "spark", playOnStart: false, rate: 0, lifetime: 1, speed: 0 }
    ] }, "torch", { x: 5, y: 6, z: 7 })];
    run(simulator, sources, 1);
    expect(simulator.countOf("torch", "shell")).toBe(4);
    run(simulator, sources, 8);
    expect(simulator.countOf("torch", "shell")).toBe(0);
    expect(simulator.countOf("torch", "spark")).toBe(12);
    for (const particle of views(simulator)) {
      expect(particle).toMatchObject({ emitterId: "spark", x: 5, y: 6, z: 7 });
    }
  });
});

describe("particle review limits", () => {
  it("stops a death emitter's spawn loop once its cap is full", () => {
    const simulator = new ParticleSimulator({ dimension: "2d" });
    const sources = [source({ emitters: [
      { id: "shell", rate: 0, loop: false, lifetime: 0.05, speed: 0, bursts: [{ count: 10 }], onDeath: [{ emitter: "spark", count: 64 }] },
      { id: "spark", playOnStart: false, rate: 0, lifetime: 10, speed: 0, maxParticles: 1 }
    ] })];
    run(simulator, sources, 1);
    const spawn = vi.spyOn(simulator as unknown as { spawn: (...args: unknown[]) => boolean }, "spawn");
    run(simulator, sources, 5);
    expect(simulator.countOf("torch", "spark")).toBe(1);
    // One success, then one refused call per dying particle instead of 64.
    expect(spawn.mock.calls.length).toBe(1 + 10);
  });

  it("clamps a long step to the documented maximum", () => {
    const simulator = new ParticleSimulator({ dimension: "2d" });
    const sources = [source({ emitters: [{ id: "flame", rate: 100, lifetime: 60, duration: 0.01, maxParticles: 4096,
      bursts: [{ count: 1, cycles: 1 }] }] })];
    simulator.sync(sources);
    simulator.step(3600);
    // 0.25 s of rate 100 plus one burst per 0.01 s cycle, not an hour of either.
    expect(MAX_PARTICLE_STEP_SECONDS).toBe(0.25);
    expect(simulator.count).toBeGreaterThanOrEqual(25 + 24);
    expect(simulator.count).toBeLessThanOrEqual(25 + 26);
    expect(views(simulator)[0].life).toBeCloseTo(0, 6);
  });

  it("sends an emitter-less request to the first attached emitter in document order", () => {
    const simulator = new ParticleSimulator({ dimension: "2d" });
    const stale = source({ emitters: [{ id: "old", rate: 0, lifetime: 10, speed: 0, bursts: [{ count: 1 }] }] });
    run(simulator, [stale], 1);
    expect(simulator.countOf("torch", "old")).toBe(1);
    const current = [source({ emitters: [
      { id: "burst", playOnStart: false, rate: 0, lifetime: 10 },
      { id: "trail", playOnStart: false, rate: 0, lifetime: 10 }
    ] })];
    simulator.sync(current);
    simulator.emit([{ kind: "particles", entityId: "torch", count: 3 }]);
    simulator.step(TICK);
    expect(simulator.countOf("torch", "burst")).toBe(3);
    expect(simulator.countOf("torch", "trail")).toBe(0);
  });
});

describe("particle motion and space", () => {
  it("integrates gravity and drag", () => {
    const simulator = new ParticleSimulator({ dimension: "2d" });
    const sources = [source({ emitters: [{ id: "drop", rate: 0, loop: false, lifetime: 10, speed: 0, bursts: [{ count: 1 }], gravity: { x: 0, y: -10 } }] })];
    run(simulator, sources, 61);
    const [particle] = views(simulator);
    expect(particle.y).toBeCloseTo(-10 * (60 * 61) / 2 * TICK * TICK, 6);

    const dragged = new ParticleSimulator({ dimension: "2d" });
    run(dragged, [source({ emitters: [{ id: "drift", rate: 0, loop: false, lifetime: 10, speed: 1, shape: { kind: "cone", angle: 0 }, bursts: [{ count: 1 }], drag: 60 }] })], 2);
    expect(views(dragged)[0].y).toBeCloseTo(TICK / 2, 9);
  });

  it("keeps world-space particles in place and moves local-space particles with the entity", () => {
    const definition = (space: string) => ({ emitters: [{ id: space, space, rate: 0, loop: false, lifetime: 10, speed: 0, bursts: [{ count: 1 }] }] });
    const simulator = new ParticleSimulator({ dimension: "3d" });
    run(simulator, [source(definition("world"), "a"), source(definition("local"), "b")], 1);
    run(simulator, [source(definition("world"), "a", { x: 3, y: 0, z: 0 }), source(definition("local"), "b", { x: 3, y: 0, z: 0 })], 1);
    const byEmitter = Object.fromEntries(views(simulator).map((particle) => [particle.emitterId, particle.x]));
    expect(byEmitter).toEqual({ world: 0, local: 3 });
    run(simulator, [], 1);
    expect(views(simulator).map((particle) => particle.emitterId)).toEqual(["world"]);
  });

  it("evaluates size, opacity and colour over lifetime", () => {
    const simulator = new ParticleSimulator({ dimension: "2d" });
    run(simulator, [source({ emitters: [{ id: "fade", rate: 0, loop: false, lifetime: 1, size: 2, color: "#ffffff", opacity: 0.5, speed: 0,
      bursts: [{ count: 1 }], sizeOverLifetime: [{ t: 0, value: 1 }, { t: 1, value: 0 }], opacityOverLifetime: [{ t: 0, value: 1 }, { t: 1, value: 0 }],
      colorOverLifetime: [{ t: 0, color: "#ffffff" }, { t: 1, color: "#000000" }] }] })], 31);
    const [particle] = views(simulator);
    expect(particle.life).toBeCloseTo(0.5, 9);
    expect(particle.size).toBeCloseTo(1, 9);
    expect(particle.opacity).toBeCloseTo(0.25, 9);
    expect(particle.r).toBeCloseTo(0.5, 9);
  });

  it("replays identical particles for the same entity and different ones for another entity", () => {
    const particles: GameParticles = gameParticles.parse({ emitters: [{ id: "spray", rate: 120, lifetime: { min: 0.5, max: 2 }, speed: { min: 1, max: 3 },
      size: { min: 0.1, max: 0.4 }, shape: { kind: "cone", angle: 30, radius: 0.5 } }] });
    const capture = (entityId: string): ParticleView[] => {
      const simulator = new ParticleSimulator({ dimension: "3d" });
      run(simulator, [{ entityId, position: { x: 0, y: 0, z: 0 }, rotation: IDENTITY, particles }], 90);
      return views(simulator).map((particle) => ({ ...particle, entityId: "", emitterId: "" }));
    };
    expect(capture("torch")).toEqual(capture("torch"));
    expect(capture("torch")).not.toEqual(capture("lamp"));
    expect(particleSeed("torch", "spray")).not.toBe(particleSeed("lamp", "spray"));
  });
});

describe("particles from a session", () => {
  it("reads emitters and emitParticles events from a 3D session without touching its snapshot", async () => {
    const document = gameDocument3D.parse({
      schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "particles", revision: "draft", entrySceneId: "scene", tickRate: 60,
      presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 }, inputActions: [], assets: {},
      scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
        { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
        { id: "torch", transform3d: { position: { x: 1, y: 2, z: 3 } },
          particles: { emitters: [{ id: "burst", playOnStart: false, rate: 0, lifetime: 10, speed: 0 }] },
          behaviors: [{ kind: "script", maxTickMs: 50, source: "({tick}) => ({ state: null, commands: tick === 0 ? [{ kind: 'emitParticles', count: 6 }] : [] })" }] }
      ] }]
    });
    const session = await createGameSession3D(document, 1);
    try {
      const simulator = new ParticleSimulator({ dimension: "3d" });
      const input = gameInputFrame3D.parse({ pressed: [] });
      for (let tick = 0; tick < 3; tick += 1) {
        session.step(input);
        const before = JSON.stringify(session.snapshot());
        simulator.sync(particleSourcesFromFrame(session.frame()));
        simulator.emit(session.takePresentationEvents());
        simulator.step(TICK);
        expect(JSON.stringify(session.snapshot())).toBe(before);
      }
      expect(simulator.count).toBe(6);
      expect(views(simulator)[0]).toMatchObject({ x: 1, y: 2, z: 3 });
    } finally {
      session.dispose();
    }
  });

  it("turns 2D frame rotation into a Z rotation", () => {
    const particles = gameParticles.parse({ emitters: [{ id: "jet" }] });
    const [emitter] = particleSourcesFromFrame({ tick: 0, width: 16, height: 9, pixelsPerUnit: 32, camera: { x: 0, y: 0, zoom: 1 }, sprites: [], tiles: [], hud: [],
      particles: [{ entityId: "ship", x: 1, y: 2, rotation: Math.PI, particles }] });
    expect(emitter.position).toEqual({ x: 1, y: 2, z: 0 });
    expect(emitter.rotation[2]).toBeCloseTo(1, 9);
    expect(emitter.rotation[3]).toBeCloseTo(0, 9);
  });
});
