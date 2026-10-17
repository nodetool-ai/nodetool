import { describe, expect, it } from "vitest";
import { gameDocument, gameParticles } from "@nodetool-ai/protocol";
import { createGameSession, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { GameParticles2D } from "../src/particles/render2d.js";
import { GameParticles3D } from "../src/particles/particles3d.js";
import { ParticleSimulator, type ParticleEmitterSource } from "../src/particles/simulator.js";
import { blockoutFrame } from "./fixtures/game3d.js";

const TICK = 1 / 60;
function source(emitters: unknown[], entityId = "owner"): ParticleEmitterSource {
  return { entityId, particles: gameParticles.parse({ emitters }), position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1] };
}

describe("particle lifetime and storage boundaries", () => {
  it.each([false, true])("clears 2D particles on a real scene transition, reused IDs: %s", (reuseIds) => {
    const base = createTopDownRoomGame("particle-scenes");
    const particles = gameParticles.parse({ emitters: [{ id: "burst", rate: 0, loop: false, lifetime: 10, bursts: [{ count: 1 }] }] });
    const document = gameDocument.parse({ ...base, schemaVersion: 2, scenes: [
      { ...base.scenes[0], entities: base.scenes[0].entities.map((entity) => {
        if (entity.id === "player") {
          return { ...entity, particles, behaviors: [...entity.behaviors, { kind: "sceneTransition", sceneId: "next", onEvent: "next" }] };
        }
        if (entity.id === "gem") {
          return { ...entity, transform2d: { ...entity.transform2d, x: 0 }, behaviors: [{ kind: "trigger", event: "next" }] };
        }
        return entity;
      }) },
      { id: "next", name: "Next", entities: reuseIds ? [{ id: "player", transform2d: { x: 0, y: 0 }, particles }] : [] }
    ] });
    const session = createGameSession(document, 1);
    const control = createGameSession(document, 1);
    const field = new GameParticles2D(60);
    try {
      for (let tick = 0; tick < 2; tick += 1) {
        const result = session.step({ pressed: [], justPressed: [] });
        control.step({ pressed: [], justPressed: [] });
        field.tick(result.frame, session.takePresentationEvents());
        expect(session.snapshot()).toEqual(control.snapshot());
      }
      expect(session.snapshot().sceneId).toBe("next");
      expect(field.count).toBe(reuseIds ? 1 : 0);
      field.forEachParticle((particle) => expect(particle.life).toBe(0));
    } finally { session.dispose(); control.dispose(); }
  });
  it("interpolates a local particle with its moving and rotating owner", () => {
    const simulator = new ParticleSimulator({ dimension: "2d" });
    const owner = source([{ id: "local", space: "local", shape: { kind: "cone", angle: 0 }, rate: 0, loop: false, speed: 60, lifetime: 10, bursts: [{ count: 1 }] }]);
    simulator.sync([owner]);
    simulator.step(TICK);
    simulator.sync([{ ...owner, position: { x: 1, y: 0, z: 0 }, rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }]);
    simulator.step(TICK);
    const positions: number[][] = [];
    for (const alpha of [0, 0.5, 1]) {
      simulator.forEachParticle((particle) => positions.push([particle.x, particle.y]), alpha);
    }
    expect(positions[0]).toEqual([0, 0]);
    expect(positions[1][0]).toBeCloseTo(0.5 - Math.SQRT1_2 * 0.5, 12);
    expect(positions[1][1]).toBeCloseTo(Math.SQRT1_2 * 0.5, 12);
    expect(positions[2][0]).toBeCloseTo(0, 12);
    expect(positions[2][1]).toBeCloseTo(0, 12);
  });
  it("starts reused emitter IDs fresh on scene changes, including an empty scene", () => {
    const particles = new GameParticles3D(60);
    const frame = blockoutFrame();
    const owner = source([{ id: "burst", rate: 0, loop: false, lifetime: 10, bursts: [{ count: 1 }] }]);
    const first = { ...frame, sceneId: "first", entities: [{ ...frame.entities[0], entityId: owner.entityId, particles: owner.particles }] };
    particles.tick(first, []);
    expect(particles.count).toBe(1);
    particles.tick({ ...frame, sceneId: "empty", entities: [] }, []);
    expect(particles.count).toBe(0);
    particles.tick({ ...first, sceneId: "second" }, []);
    expect(particles.count).toBe(1);
    particles.tick(first, []);
    expect(particles.count).toBe(1);
  });

  it("retains detached world death chains until their surviving particles finish", () => {
    const simulator = new ParticleSimulator({ dimension: "3d" });
    const attached = new ParticleSimulator({ dimension: "3d" });
    const sources = [source([
      { id: "shell", space: "world", rate: 0, loop: false, speed: 0, lifetime: 0.1, bursts: [{ count: 1 }], onDeath: [{ emitter: "spark", count: 2 }] },
      { id: "spark", space: "world", playOnStart: false, rate: 0, speed: 0, lifetime: 0.1 }
    ])];
    simulator.sync(sources);
    attached.sync(sources);
    simulator.step(TICK);
    attached.step(TICK);
    simulator.sync([]);
    for (let tick = 0; tick < 7; tick += 1) { simulator.step(TICK); attached.step(TICK); }
    expect(attached.countOf("owner", "spark")).toBe(2);
    expect(simulator.countOf("owner", "spark")).toBe(2);
    for (let tick = 0; tick < 7; tick += 1) { simulator.step(TICK); }
    expect(simulator.count).toBe(0);
    // A new owner with reused IDs must get a fresh burst after the detached chain is collected.
    simulator.sync([source([{ id: "shell", rate: 0, loop: false, lifetime: 1, bursts: [{ count: 1 }] }])]);
    simulator.step(TICK);
    expect(simulator.count).toBe(1);
  });

  it("allocates no particle pools for 800 dormant maximum-capacity emitters", () => {
    const simulator = new ParticleSimulator({ dimension: "3d" });
    const emitters = Array.from({ length: 8 }, (_, index) => ({ id: `e${index}`, maxParticles: 4096, playOnStart: false, rate: 0 }));
    simulator.sync(Array.from({ length: 100 }, (_, index) => source(emitters, `owner${index}`)));
    expect(simulator.count).toBe(0);
    expect(simulator.allocatedParticleCapacity).toBe(0);
  });

  it("keeps allocated capacity bounded across emitter churn", () => {
    const simulator = new ParticleSimulator({ dimension: "2d", maxSceneParticles: 8 });
    for (let round = 0; round < 20; round += 1) {
      simulator.sync([source([{ id: "burst", playOnStart: false, rate: 0, maxParticles: 4096, lifetime: 0.01 }], `owner${round}`)]);
      simulator.emit([{ kind: "particles", entityId: `owner${round}`, emitter: "burst", count: 8 }]);
      simulator.step(TICK);
      expect(simulator.count).toBe(8);
      expect(simulator.allocatedParticleCapacity).toBeLessThanOrEqual(8);
      simulator.step(TICK);
      expect(simulator.count).toBe(0);
      expect(simulator.allocatedParticleCapacity).toBeLessThanOrEqual(8);
    }
    simulator.clear();
    expect(simulator.allocatedParticleCapacity).toBe(0);
  });
});
