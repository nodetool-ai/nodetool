import type { GameEvent3D, GameParticleEmission, GameParticleEmitter, GameRenderFrame3D } from "@nodetool-ai/protocol";

import type { GameParticleField } from "./render2d.js";
import { ParticleSimulator, particleSourcesFromFrame, type ParticleView } from "./simulator.js";

/**
 * Runs 3D particles beside a game session. Call `tick` after every session step with that step's frame and
 * the session's presentation events, and pass the instance to the 3D renderer. It reads the session and never
 * writes to it, so particles stay out of snapshots and replay.
 */
export class GameParticles3D implements GameParticleField {
  readonly simulator: ParticleSimulator;
  private readonly tickSeconds: number;

  constructor(tickRate: number, maxSceneParticles?: number) {
    if (!(tickRate > 0)) {
      throw new Error("Particle tick rate must be positive");
    }
    this.tickSeconds = 1 / tickRate;
    this.simulator = new ParticleSimulator({ dimension: "3d", maxSceneParticles });
  }

  /** Live particles, for the frame budget. */
  get count(): number {
    return this.simulator.count;
  }

  tick(frame: GameRenderFrame3D, events: readonly (GameEvent3D | GameParticleEmission)[]): void {
    this.simulator.sync(particleSourcesFromFrame(frame));
    this.simulator.emit(events);
    this.simulator.step(this.tickSeconds);
  }

  forEachParticle(visit: (particle: Readonly<ParticleView>) => void): void {
    this.simulator.forEachParticle(visit);
  }

  clear(): void {
    this.simulator.clear();
  }
}

/** One live particle as plain data, for handing a particle field to a renderer in another realm such as a capture page. */
export interface GameParticleSample3D {
  readonly entityId: string;
  readonly emitterId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly size: number;
  readonly rotation: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly opacity: number;
  readonly life: number;
}

/** Copies every live particle of a field, in the field's order. */
export function gameParticleSamples3D(field: GameParticleField): GameParticleSample3D[] {
  const samples: GameParticleSample3D[] = [];
  field.forEachParticle((particle) => {
    samples.push({ entityId: particle.entityId, emitterId: particle.emitterId, x: particle.x, y: particle.y, z: particle.z,
      vx: particle.vx, vy: particle.vy, vz: particle.vz, size: particle.size, rotation: particle.rotation,
      r: particle.r, g: particle.g, b: particle.b, opacity: particle.opacity, life: particle.life });
  });
  return samples;
}

/**
 * A particle field over copied samples. Each sample takes its emitter definition from the frame, so samples whose
 * entity or emitter the frame does not carry are dropped.
 */
export function gameParticleFieldFromSamples3D(samples: readonly GameParticleSample3D[], frame: GameRenderFrame3D): GameParticleField {
  const emitters = new Map<string, GameParticleEmitter>();
  for (const entity of frame.entities) {
    for (const emitter of entity.particles?.emitters ?? []) {
      emitters.set(`${entity.entityId}\u0000${emitter.id}`, emitter);
    }
  }
  return {
    forEachParticle(visit) {
      for (const sample of samples) {
        const emitter = emitters.get(`${sample.entityId}\u0000${sample.emitterId}`);
        if (emitter) {
          visit({ ...sample, emitter });
        }
      }
    }
  };
}

/** What a 3D particle batch draws: a camera-facing quad or one of the mesh shapes. */
export type ParticleBatchShape3D = "quad" | "box" | "sphere" | "tetrahedron" | "octahedron";

/**
 * Floats per particle in a batch: position (3), velocity (3), linear colour and opacity (4), size, rotation,
 * stretch length, stretch speed scale, softness and mode. Mode is 1 for a stretched quad or a velocity-aligned mesh.
 */
export const PARTICLE_INSTANCE_STRIDE_3D = 16;

/** Particles that share one draw call: the same shape, blend and lighting. */
export interface ParticleBatch3D {
  readonly key: string;
  readonly shape: ParticleBatchShape3D;
  readonly blend: "normal" | "additive";
  /** Mesh particles take scene lighting unless their emitter is `unlit`. Quads are always unlit. */
  readonly lit: boolean;
  count: number;
  data: Float32Array;
}

/** The camera position and view direction, used to sort alpha-blended particles back to front. */
export interface ParticleViewer3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly forwardX: number;
  readonly forwardY: number;
  readonly forwardZ: number;
}

export interface PackedParticles3D {
  /** Batches in the order their first particle appeared in the field. */
  readonly batches: readonly ParticleBatch3D[];
  /** Particles packed across every batch. */
  readonly drawn: number;
  /** True when a packed quad has a softness distance, so the renderer needs scene depth. */
  readonly soft: boolean;
}

/** Converts an sRGB channel in [0, 1] to linear light, which is the colour space three.js shades in. */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function batchKey(emitter: GameParticleEmitter): { key: string; shape: ParticleBatchShape3D; blend: "normal" | "additive"; lit: boolean } {
  const blend = emitter.blend ?? "normal";
  const render = emitter.render;
  if (render?.kind === "mesh") {
    const lit = emitter.unlit !== true;
    return { key: `${render.shape}:${blend}:${lit ? "lit" : "unlit"}`, shape: render.shape, blend, lit };
  }
  return { key: `quad:${blend}`, shape: "quad", blend, lit: false };
}

/**
 * Packs a particle field into per-batch instance data. Particles with no size or no opacity are skipped. Batches of
 * alpha-blended particles are sorted farthest first, keeping field order between particles at the same depth, so
 * the result depends only on the field and the viewer. `previous` batches are reused when their capacity fits.
 */
export function packParticleBatches3D(field: GameParticleField, viewer: ParticleViewer3D, previous: readonly ParticleBatch3D[] = []): PackedParticles3D {
  const reusable = new Map(previous.map((batch) => [batch.key, batch]));
  const batches = new Map<string, ParticleBatch3D>();
  let drawn = 0;
  let soft = false;
  field.forEachParticle((particle) => {
    if (!(particle.size > 0) || !(particle.opacity > 0)) {
      return;
    }
    const emitter = particle.emitter;
    const kind = batchKey(emitter);
    let batch = batches.get(kind.key);
    if (!batch) {
      const reused = reusable.get(kind.key);
      batch = reused ?? { ...kind, count: 0, data: new Float32Array(PARTICLE_INSTANCE_STRIDE_3D * 64) };
      batch.count = 0;
      batches.set(kind.key, batch);
    }
    if ((batch.count + 1) * PARTICLE_INSTANCE_STRIDE_3D > batch.data.length) {
      const grown = new Float32Array(batch.data.length * 2);
      grown.set(batch.data);
      batch.data = grown;
    }
    const render = emitter.render;
    const softness = kind.shape === "quad" ? emitter.softness ?? 0 : 0;
    const data = batch.data;
    const base = batch.count * PARTICLE_INSTANCE_STRIDE_3D;
    data[base] = particle.x;
    data[base + 1] = particle.y;
    data[base + 2] = particle.z;
    data[base + 3] = particle.vx;
    data[base + 4] = particle.vy;
    data[base + 5] = particle.vz;
    data[base + 6] = srgbToLinear(particle.r);
    data[base + 7] = srgbToLinear(particle.g);
    data[base + 8] = srgbToLinear(particle.b);
    data[base + 9] = Math.min(1, particle.opacity);
    data[base + 10] = particle.size;
    data[base + 11] = particle.rotation;
    data[base + 12] = render?.kind === "stretched" ? render.length : 0;
    data[base + 13] = render?.kind === "stretched" ? render.speedScale : 0;
    data[base + 14] = softness;
    data[base + 15] = render?.kind === "stretched" || (render?.kind === "mesh" && render.align === "velocity") ? 1 : 0;
    batch.count += 1;
    drawn += 1;
    soft ||= softness > 0;
  });
  for (const batch of batches.values()) {
    if (batch.blend === "normal" && batch.count > 1) {
      sortFarthestFirst(batch, viewer);
    }
  }
  return { batches: [...batches.values()], drawn, soft };
}

function sortFarthestFirst(batch: ParticleBatch3D, viewer: ParticleViewer3D): void {
  const stride = PARTICLE_INSTANCE_STRIDE_3D;
  const source = batch.data;
  const depths = new Float64Array(batch.count);
  const order: number[] = [];
  for (let index = 0; index < batch.count; index += 1) {
    const base = index * stride;
    depths[index] = (source[base] - viewer.x) * viewer.forwardX + (source[base + 1] - viewer.y) * viewer.forwardY + (source[base + 2] - viewer.z) * viewer.forwardZ;
    order.push(index);
  }
  // Array.prototype.sort is stable, so equal depths keep field order.
  order.sort((first, second) => depths[second] - depths[first]);
  if (order.every((value, index) => value === index)) {
    return;
  }
  const sorted = new Float32Array(source.length);
  order.forEach((from, to) => sorted.set(source.subarray(from * stride, from * stride + stride), to * stride));
  batch.data = sorted;
}
