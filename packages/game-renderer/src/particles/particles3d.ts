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
  private identity: string | null = null;

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
    const identity = JSON.stringify([frame.gameId, frame.sceneId]);
    if (identity !== this.identity || events.some((event) => event.kind === "sceneTransition")) {
      this.clear(); this.identity = identity;
    }
    this.simulator.sync(particleSourcesFromFrame(frame));
    this.simulator.emit(events);
    this.simulator.step(this.tickSeconds);
  }

  forEachParticle(visit: (particle: Readonly<ParticleView>) => void, interpolation = 1): void {
    this.simulator.forEachParticle(visit, interpolation);
  }

  clear(): void {
    this.simulator.clear();
    this.identity = null;
  }
}

/** One live particle as plain data, for handing a particle field to a renderer in another realm such as a capture page. */
export interface GameParticleSample3D {
  readonly entityId: string;
  readonly emitterId: string;
  readonly emitter?: GameParticleEmitter;
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
export function gameParticleSamples3D(field: GameParticleField, interpolation = 1): GameParticleSample3D[] {
  const samples: GameParticleSample3D[] = [];
  field.forEachParticle((particle) => {
    samples.push({ emitter: particle.emitter, entityId: particle.entityId, emitterId: particle.emitterId, x: particle.x, y: particle.y, z: particle.z,
      vx: particle.vx, vy: particle.vy, vz: particle.vz, size: particle.size, rotation: particle.rotation,
      r: particle.r, g: particle.g, b: particle.b, opacity: particle.opacity, life: particle.life });
  }, interpolation);
  return samples;
}

/**
 * A particle field over copied samples, including world particles whose emitter has left the frame.
 * Older payloads resolve their emitter definition from the frame.
 */
export function gameParticleFieldFromSamples3D(samples: readonly GameParticleSample3D[], frame: GameRenderFrame3D): GameParticleField {
  const emitters = new Map<string, GameParticleEmitter>();
  if (samples.some(sample => sample.emitter === undefined)) {
    for (const entity of frame.entities) {
      for (const emitter of entity.particles?.emitters ?? []) {
        emitters.set(`${entity.entityId}\u0000${emitter.id}`, emitter);
      }
    }
  }
  return {
    forEachParticle(visit) {
      for (const sample of samples) {
        const emitter = sample.emitter ?? emitters.get(`${sample.entityId}\u0000${sample.emitterId}`);
        if (emitter) {
          visit({ ...sample, emitter });
        }
      }
    }
  };
}

const SNAPSHOT_STRIDE = 13;

/**
 * A reusable copy of a particle field at one interpolation. A renderer reads it after the field moves on, so a frame
 * draws the particles of its own tick. `capture` writes into arrays it keeps between frames, so it allocates only when
 * the particle count grows. The emitter and ids are kept by reference.
 */
export class GameParticleSnapshot3D implements GameParticleField {
  private values = new Float64Array(0);
  private readonly entityIds: string[] = [];
  private readonly emitterIds: string[] = [];
  private readonly emitters: GameParticleEmitter[] = [];
  private length = 0;

  /** Particles in the last capture. */
  get count(): number { return this.length; }

  capture(field: GameParticleField, interpolation = 1): this {
    this.length = 0;
    field.forEachParticle((particle) => {
      const index = this.length;
      if ((index + 1) * SNAPSHOT_STRIDE > this.values.length) {
        const grown = new Float64Array(Math.max(64, (index + 1) * 2) * SNAPSHOT_STRIDE);
        grown.set(this.values);
        this.values = grown;
      }
      const values = this.values;
      const base = index * SNAPSHOT_STRIDE;
      values[base] = particle.x; values[base + 1] = particle.y; values[base + 2] = particle.z;
      values[base + 3] = particle.vx; values[base + 4] = particle.vy; values[base + 5] = particle.vz;
      values[base + 6] = particle.size; values[base + 7] = particle.rotation;
      values[base + 8] = particle.r; values[base + 9] = particle.g; values[base + 10] = particle.b;
      values[base + 11] = particle.opacity; values[base + 12] = particle.life;
      this.entityIds[index] = particle.entityId;
      this.emitterIds[index] = particle.emitterId;
      this.emitters[index] = particle.emitter;
      this.length = index + 1;
    }, interpolation);
    // Drop references past the live count, so removed emitters can be collected.
    this.entityIds.length = this.length;
    this.emitterIds.length = this.length;
    this.emitters.length = this.length;
    return this;
  }

  /** Visits the captured particles through one view per call. A visitor copies what it keeps. */
  forEachParticle(visit: (particle: Readonly<ParticleView>) => void): void {
    if (this.length === 0) { return; }
    const values = this.values;
    const view: ParticleView = { entityId: this.entityIds[0], emitterId: this.emitterIds[0], emitter: this.emitters[0],
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, rotation: 0, r: 0, g: 0, b: 0, opacity: 0, life: 0 };
    for (let index = 0; index < this.length; index++) {
      const base = index * SNAPSHOT_STRIDE;
      view.entityId = this.entityIds[index]; view.emitterId = this.emitterIds[index]; view.emitter = this.emitters[index];
      view.x = values[base]; view.y = values[base + 1]; view.z = values[base + 2];
      view.vx = values[base + 3]; view.vy = values[base + 4]; view.vz = values[base + 5];
      view.size = values[base + 6]; view.rotation = values[base + 7];
      view.r = values[base + 8]; view.g = values[base + 9]; view.b = values[base + 10];
      view.opacity = values[base + 11]; view.life = values[base + 12];
      visit(view);
    }
  }
}

/** What a 3D particle batch draws: a camera-facing quad or one of the mesh shapes. */
export type ParticleBatchShape3D = "quad" | "box" | "sphere" | "tetrahedron" | "octahedron";

/**
 * Floats per particle in a batch: position (3), velocity (3), linear colour and opacity (4), size, rotation,
 * stretch length, stretch speed scale, softness and mode. Mode is 1 for a stretched quad or a velocity-aligned mesh.
 */
export const PARTICLE_INSTANCE_STRIDE_3D = 16;

/** A contiguous depth-ordered run sharing shape, blend and lighting. */
export interface ParticleBatch3D {
  readonly key: string;
  readonly shape: ParticleBatchShape3D;
  readonly blend: "normal" | "additive";
  /** Mesh particles take scene lighting unless their emitter is `unlit`. Quads are always unlit. */
  readonly lit: boolean;
  /** View depth of the first (farthest) particle, used to merge this run with scene transparency. */
  depth: number;
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
  /** Runs in global farthest-first order, including across different materials. */
  readonly batches: readonly ParticleBatch3D[];
  /** Particles packed across every batch. */
  readonly drawn: number;
  /** True when a packed quad has a softness distance, so the renderer needs scene depth. */
  readonly soft: boolean;
  /**
   * One world box per soft emitter around its quads, grown by their drawn extent and softness. Geometry outside every
   * box never changes a soft fade: it is either in front of the particle, which the depth test hides, or more than the
   * softness distance behind it.
   */
  readonly softBounds: readonly ParticleBounds3D[];
}

export interface ParticleBounds3D {
  readonly min: { x: number; y: number; z: number };
  readonly max: { x: number; y: number; z: number };
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
 * Sorts all visible particles before forming contiguous compatible runs. Equal depths retain field order.
 * A material may occur in multiple runs: joining those runs would move it across another transparent material.
 * Previous run buffers are reused, and no particles are dropped to reduce the draw count.
 * Scene-depth boundaries split otherwise compatible runs so ordinary transparent objects can draw between them.
 */
export function packParticleBatches3D(field: GameParticleField, viewer: ParticleViewer3D, previous: readonly ParticleBatch3D[] = [], interpolation = 1,
  sceneDepths?: () => readonly number[]): PackedParticles3D {
  const batches: ParticleBatch3D[] = [];
  const kinds: ReturnType<typeof batchKey>[] = [];
  const emitterKinds = new Map<GameParticleEmitter, ReturnType<typeof batchKey>>();
  let drawn = 0;
  let soft = false;
  const softBounds = new Map<GameParticleEmitter, ParticleBounds3D>();
  field.forEachParticle((particle) => {
    if (!(particle.size > 0) || !(particle.opacity > 0)) {
      return;
    }
    const emitter = particle.emitter;
    let kind = emitterKinds.get(emitter);
    if (!kind) {
      kind = batchKey(emitter);
      emitterKinds.set(emitter, kind);
    }
    kinds.push(kind);
    growScratch(drawn + 1);
    const render = emitter.render;
    const softness = kind.shape === "quad" ? emitter.softness ?? 0 : 0;
    const data = sortData;
    const base = drawn * PARTICLE_INSTANCE_STRIDE_3D;
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
    sortDepths[drawn] = (particle.x - viewer.x) * viewer.forwardX + (particle.y - viewer.y) * viewer.forwardY + (particle.z - viewer.z) * viewer.forwardZ;
    sortOrder[drawn] = drawn;
    drawn += 1;
    if (softness > 0) {
      soft = true;
      // A quad corner lies at most `size` from its centre, or half the stretched length along the velocity.
      const stretched = data[base + 15] === 1
        ? particle.size * data[base + 12]! + Math.hypot(particle.vx, particle.vy, particle.vz) * data[base + 13]! : 0;
      const reach = softness + Math.max(particle.size, stretched);
      let box = softBounds.get(emitter);
      if (!box) {
        box = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
        softBounds.set(emitter, box);
      }
      box.min.x = Math.min(box.min.x, particle.x - reach); box.max.x = Math.max(box.max.x, particle.x + reach);
      box.min.y = Math.min(box.min.y, particle.y - reach); box.max.y = Math.max(box.max.y, particle.y + reach);
      box.min.z = Math.min(box.min.z, particle.z - reach); box.max.z = Math.max(box.max.z, particle.z + reach);
    }
  }, interpolation);
  const order = sortOrder.subarray(0, drawn).sort((first, second) => sortDepths[second] - sortDepths[first] || first - second);
  const reusable = new Map(previous.map(batch => [batch.key, batch]));
  const occurrences = new Map<string, number>();
  // Query lazily: an empty field must not walk a potentially large scene.
  const boundaries = drawn > 0 && sceneDepths ? [...sceneDepths()].sort((a, b) => b - a) : [];
  let boundary = 0;
  for (let start = 0; start < drawn;) {
    const kind = kinds[order[start]];
    const depth = sortDepths[order[start]];
    while (boundary < boundaries.length && boundaries[boundary] >= depth) { boundary++; }
    let end = start + 1;
    while (end < drawn && kinds[order[end]].key === kind.key
      && (boundary === boundaries.length || sortDepths[order[end]] > boundaries[boundary])) { end += 1; }
    const occurrence = occurrences.get(kind.key) ?? 0;
    occurrences.set(kind.key, occurrence + 1);
    const key = occurrence === 0 ? kind.key : `${kind.key}:${occurrence}`;
    const count = end - start;
    const capacity = PARTICLE_INSTANCE_STRIDE_3D * 2 ** Math.ceil(Math.log2(count));
    const batch = reusable.get(key) ?? { ...kind, key, depth, count: 0, data: new Float32Array(capacity) };
    // Hysteresis avoids small size-change reallocations without retaining every run's historical peak.
    if (batch.data.length < capacity || batch.data.length > capacity * 4) { batch.data = new Float32Array(capacity); }
    batch.count = count;
    batch.depth = depth;
    for (let index = start; index < end; index += 1) {
      const from = order[index] * PARTICLE_INSTANCE_STRIDE_3D;
      batch.data.set(sortData.subarray(from, from + PARTICLE_INSTANCE_STRIDE_3D), (index - start) * PARTICLE_INSTANCE_STRIDE_3D);
    }
    batches.push(batch);
    start = end;
  }
  return { batches, drawn, soft, softBounds: [...softBounds.values()] };
}

/** Packing is synchronous. Shared scratch copies views before a field reuses its mutable particle object. */
let sortData = new Float32Array(0);
let sortDepths = new Float64Array(0);
let sortOrder = new Uint32Array(0);

function growScratch(count: number): void {
  if (sortDepths.length < count) {
    const capacity = Math.max(count, sortDepths.length * 2, 64);
    const data = new Float32Array(capacity * PARTICLE_INSTANCE_STRIDE_3D);
    const depths = new Float64Array(capacity);
    const order = new Uint32Array(capacity);
    data.set(sortData);
    depths.set(sortDepths);
    order.set(sortOrder);
    sortData = data;
    sortDepths = depths;
    sortOrder = order;
  }
}
