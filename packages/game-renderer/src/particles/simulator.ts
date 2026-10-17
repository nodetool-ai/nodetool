import type { GameParticleEmission, GameParticleEmitter, GameParticles, GameRenderFrame, GameRenderFrame3D } from "@nodetool-ai/protocol";

import { evaluateParticleCurve, evaluateParticleGradient, parseParticleColor, sampleParticleRange, type ParticleColor } from "./curves.js";
import { ParticleRandom, particleSeed } from "./random.js";
import { sampleParticleShape, type ParticleDimension, type ParticleShapeSample } from "./shapes.js";

export interface ParticleVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Unit quaternion as `[x, y, z, w]`, matching `gameQuaternion3D`. */
export type ParticleQuaternion = readonly [number, number, number, number];

/** One entity's particles component and its current world transform. */
export interface ParticleEmitterSource {
  readonly entityId: string;
  readonly position: ParticleVector;
  readonly rotation: ParticleQuaternion;
  readonly particles: GameParticles;
}

export interface ParticleSimulatorOptions {
  readonly dimension: ParticleDimension;
  /** Live particles across every emitter. Emission stops at this cap until particles die. */
  readonly maxSceneParticles?: number;
}

/** A live particle in world space. The object is reused between callbacks of one emitter, so copy what you keep. */
export interface ParticleView {
  entityId: string;
  emitterId: string;
  /** The emitter definition, for render settings such as blend and sprite. */
  emitter: GameParticleEmitter;
  x: number;
  y: number;
  z: number;
  /** World-space velocity in units per second, including `speedOverLifetime`. */
  vx: number;
  vy: number;
  vz: number;
  size: number;
  rotation: number;
  r: number;
  g: number;
  b: number;
  opacity: number;
  /** Normalized age: 0 at birth, 1 at death. */
  life: number;
}

export const DEFAULT_MAX_SCENE_PARTICLES = 8192;

/** Longest interval one `step` simulates, so a long pause cannot turn into thousands of emission cycles. */
export const MAX_PARTICLE_STEP_SECONDS = 0.25;

const STRIDE = 19;
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, SIZE = 8, ROT = 9, SPIN = 10, CR = 11, CG = 12, CB = 13;
const PREVIOUS_X = 14, PREVIOUS_Y = 15, PREVIOUS_Z = 16, PREVIOUS_ROTATION = 17, PREVIOUS_AGE = 18;
const SAME_TIME = 1e-9;
const IDENTITY: ParticleQuaternion = [0, 0, 0, 1];

interface EmitterInstance {
  readonly entityId: string;
  definition: GameParticleEmitter;
  readonly random: ParticleRandom;
  head: number;
  tail: number;
  count: number;
  time: number;
  playing: boolean;
  accumulator: number;
  pending: number;
  attached: boolean;
  position: ParticleVector;
  rotation: ParticleQuaternion;
  previousPosition: ParticleVector;
  previousRotation: ParticleQuaternion;
}

interface Death {
  readonly entityId: string;
  readonly emitter: string;
  readonly count: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * CPU particle simulation for the renderers. It is presentation state: it reads render frames and
 * presentation events, owns its own random streams, and has no snapshot or path back into a session.
 */
export class ParticleSimulator {
  readonly dimension: ParticleDimension;
  readonly maxSceneParticles: number;
  private readonly instances = new Map<string, EmitterInstance>();
  /** Emitter ids of each entity in the last sync, in document order. */
  private readonly emitterOrder = new Map<string, readonly string[]>();
  private total = 0;
  private data = new Float64Array(0);
  private next = new Int32Array(0);
  private previous = new Int32Array(0);
  private free = new Int32Array(0);
  private freeCount = 0;
  private readonly sample: ParticleShapeSample = { px: 0, py: 0, pz: 0, dx: 0, dy: 1, dz: 0 };
  private readonly color: ParticleColor = { r: 0, g: 0, b: 0 };

  constructor(options: ParticleSimulatorOptions) {
    this.dimension = options.dimension;
    this.maxSceneParticles = options.maxSceneParticles ?? DEFAULT_MAX_SCENE_PARTICLES;
  }

  /** Live particles across every emitter. */
  get count(): number {
    return this.total;
  }

  /** Particle slots reserved by typed-array storage, including unused capacity. */
  get allocatedParticleCapacity(): number {
    return this.data.length / STRIDE;
  }

  /** Live particles of one emitter. */
  countOf(entityId: string, emitterId: string): number {
    return this.instances.get(instanceKey(entityId, emitterId))?.count ?? 0;
  }

  /**
   * Updates emitters from the current frame. An emitter missing from `sources` stops emitting. Its world-space
   * particles finish their lives and its local-space particles disappear with the entity.
   */
  sync(sources: readonly ParticleEmitterSource[]): void {
    for (const instance of this.instances.values()) {
      instance.attached = false;
    }
    this.emitterOrder.clear();
    for (const source of sources) {
      this.emitterOrder.set(source.entityId, source.particles.emitters.map((emitter) => emitter.id));
      for (const definition of source.particles.emitters) {
        const key = instanceKey(source.entityId, definition.id);
        let instance = this.instances.get(key);
        if (!instance) {
          instance = {
            entityId: source.entityId,
            definition,
            random: new ParticleRandom(particleSeed(source.entityId, definition.id)),
            head: -1,
            tail: -1,
            count: 0,
            time: 0,
            playing: definition.playOnStart,
            accumulator: 0,
            pending: 0,
            attached: true,
            position: source.position,
            rotation: source.rotation,
            previousPosition: source.position,
            previousRotation: source.rotation
          };
          this.instances.set(key, instance);
        }
        while (instance.count > definition.maxParticles) { this.remove(instance, instance.tail); }
        instance.definition = definition;
        instance.previousPosition = instance.position;
        instance.previousRotation = instance.rotation;
        instance.position = source.position;
        instance.rotation = source.rotation;
        instance.attached = true;
      }
    }
    this.collectDetached();
  }

  /** Applies `particles` presentation events from a session. Other event kinds are ignored. */
  emit(events: readonly { readonly kind: string }[]): void {
    for (const event of events) {
      if (!isParticleEmission(event)) {
        continue;
      }
      const instance = this.findInstance(event.entityId, event.emitter);
      if (!instance || !instance.attached) {
        continue;
      }
      if (event.count === undefined) {
        instance.time = 0;
        instance.accumulator = 0;
        instance.playing = true;
      } else {
        instance.pending += event.count;
      }
    }
  }

  /**
   * Advances every particle, then emits new particles for the same interval. A step longer than
   * {@link MAX_PARTICLE_STEP_SECONDS}, such as the first frame after a paused tab, is clamped to it.
   */
  step(seconds: number): void {
    if (!(seconds > 0)) {
      return;
    }
    const dt = Math.min(seconds, MAX_PARTICLE_STEP_SECONDS);
    const deaths: Death[] = [];
    for (const instance of this.instances.values()) {
      this.advance(instance, dt, deaths);
    }
    for (const death of deaths) {
      const instance = this.instances.get(instanceKey(death.entityId, death.emitter));
      if (instance && (instance.attached || instance.definition.space === "world")) {
        for (let index = 0; index < death.count; index += 1) {
          if (!this.spawn(instance, death)) {
            break;
          }
        }
      }
    }
    for (const instance of this.instances.values()) {
      if (instance.attached) {
        this.schedule(instance, dt);
      }
    }
    this.collectDetached();
  }

  /** Visits every live particle in world space. */
  forEachParticle(visit: (particle: Readonly<ParticleView>) => void, interpolation = 1): void {
    const alpha = Math.max(0, Math.min(1, interpolation));
    for (const instance of this.instances.values()) {
      const definition = instance.definition;
      const data = this.data;
      const position = { x: mix(instance.previousPosition.x, instance.position.x, alpha),
        y: mix(instance.previousPosition.y, instance.position.y, alpha), z: mix(instance.previousPosition.z, instance.position.z, alpha) };
      const rotation = interpolateRotation(instance.previousRotation, instance.rotation, alpha);
      const view: ParticleView = { entityId: instance.entityId, emitterId: definition.id, emitter: definition,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, rotation: 0, r: 0, g: 0, b: 0, opacity: 0, life: 0 };
      for (let slot = instance.head; slot !== -1; slot = this.next[slot]) {
        const base = slot * STRIDE;
        const life = Math.min(1, mix(data[base + PREVIOUS_AGE], data[base + AGE], alpha) / data[base + LIFE]);
        const speed = definition.speedOverLifetime ? evaluateParticleCurve(definition.speedOverLifetime, life) : 1;
        const x = mix(data[base + PREVIOUS_X], data[base + PX], alpha);
        const y = mix(data[base + PREVIOUS_Y], data[base + PY], alpha);
        const z = mix(data[base + PREVIOUS_Z], data[base + PZ], alpha);
        if (definition.space === "local") {
          const point = transformPoint(rotation, position, x, y, z);
          view.x = point.x;
          view.y = point.y;
          view.z = point.z;
          const velocity = rotate(rotation, data[base + VX] * speed, data[base + VY] * speed, data[base + VZ] * speed);
          view.vx = velocity.x;
          view.vy = velocity.y;
          view.vz = velocity.z;
        } else {
          view.x = x;
          view.y = y;
          view.z = z;
          view.vx = data[base + VX] * speed;
          view.vy = data[base + VY] * speed;
          view.vz = data[base + VZ] * speed;
        }
        view.size = data[base + SIZE] * (definition.sizeOverLifetime ? evaluateParticleCurve(definition.sizeOverLifetime, life) : 1);
        view.rotation = mix(data[base + PREVIOUS_ROTATION], data[base + ROT], alpha);
        view.r = data[base + CR];
        view.g = data[base + CG];
        view.b = data[base + CB];
        if (definition.colorOverLifetime) {
          const tint = evaluateParticleGradient(definition.colorOverLifetime, life, this.color);
          view.r *= tint.r;
          view.g *= tint.g;
          view.b *= tint.b;
        }
        view.opacity = definition.opacity * (definition.opacityOverLifetime ? evaluateParticleCurve(definition.opacityOverLifetime, life) : 1);
        view.life = life;
        visit(view);
      }
    }
  }

  /** Removes every emitter and particle. */
  clear(): void {
    this.instances.clear();
    this.emitterOrder.clear();
    this.total = 0;
    this.data = new Float64Array(0);
    this.next = new Int32Array(0);
    this.previous = new Int32Array(0);
    this.free = new Int32Array(0);
    this.freeCount = 0;
  }

  /** Marks the death chains reachable from live world particles before collecting detached definitions. */
  private collectDetached(): void {
    const retained = new Set<EmitterInstance>();
    const pending: EmitterInstance[] = [];
    for (const instance of this.instances.values()) {
      if (instance.attached || (instance.definition.space === "world" && instance.count > 0)) {
        retained.add(instance);
        pending.push(instance);
      }
    }
    for (let index = 0; index < pending.length; index += 1) {
      const instance = pending[index];
      for (const death of instance.definition.onDeath) {
        const child = this.instances.get(instanceKey(instance.entityId, death.emitter));
        if (child && child.definition.space === "world" && !retained.has(child)) {
          retained.add(child);
          pending.push(child);
        }
      }
    }
    for (const [key, instance] of this.instances) {
      if (!retained.has(instance)) {
        while (instance.count > 0) { this.remove(instance, instance.tail); }
        this.instances.delete(key);
      }
    }
  }

  private allocate(): number {
    if (this.freeCount === 0) {
      const oldCapacity = this.allocatedParticleCapacity;
      const capacity = Math.min(this.maxSceneParticles, Math.max(1, oldCapacity * 2));
      if (capacity <= oldCapacity) { throw new Error("Particle storage exhausted"); }
      const data = new Float64Array(capacity * STRIDE);
      data.set(this.data);
      this.data = data;
      const next = new Int32Array(capacity);
      next.set(this.next);
      this.next = next;
      const previous = new Int32Array(capacity);
      previous.set(this.previous);
      this.previous = previous;
      this.free = new Int32Array(capacity);
      for (let slot = capacity - 1; slot >= oldCapacity; slot -= 1) { this.free[this.freeCount++] = slot; }
    }
    return this.free[--this.freeCount];
  }

  /** Swap-removes the last particle's payload, preserving the original per-emitter iteration order. */
  private remove(instance: EmitterInstance, slot: number): void {
    const tail = instance.tail;
    if (slot !== tail) { this.data.copyWithin(slot * STRIDE, tail * STRIDE, (tail + 1) * STRIDE); }
    instance.tail = this.previous[tail];
    if (instance.tail === -1) { instance.head = -1; } else { this.next[instance.tail] = -1; }
    this.free[this.freeCount++] = tail;
    instance.count -= 1;
    this.total -= 1;
  }

  private findInstance(entityId: string, emitterId: string | undefined): EmitterInstance | undefined {
    if (emitterId !== undefined) {
      return this.instances.get(instanceKey(entityId, emitterId));
    }
    // The first emitter in document order. Every emitter of a synced entity is attached.
    const first = this.emitterOrder.get(entityId)?.[0];
    return first === undefined ? undefined : this.instances.get(instanceKey(entityId, first));
  }

  private advance(instance: EmitterInstance, dt: number, deaths: Death[]): void {
    const definition = instance.definition;
    const data = this.data;
    const flat = this.dimension === "2d";
    const gx = definition.gravity.x, gy = definition.gravity.y, gz = flat ? 0 : definition.gravity.z;
    const damping = definition.drag > 0 ? 1 / (1 + definition.drag * dt) : 1;
    let slot = instance.head;
    while (slot !== -1) {
      const base = slot * STRIDE;
      const age = data[base + AGE] + dt;
      if (age >= data[base + LIFE]) {
        if (definition.onDeath.length > 0) {
          const point = definition.space === "local"
            ? transformPoint(instance.rotation, instance.position, data[base + PX], data[base + PY], data[base + PZ])
            : { x: data[base + PX], y: data[base + PY], z: data[base + PZ] };
          for (const sub of definition.onDeath) {
            deaths.push({ entityId: instance.entityId, emitter: sub.emitter, count: sub.count, ...point });
          }
        }
        const tail = instance.tail;
        this.remove(instance, slot);
        if (slot === tail) { slot = -1; }
        continue;
      }
      data[base + PREVIOUS_X] = data[base + PX];
      data[base + PREVIOUS_Y] = data[base + PY];
      data[base + PREVIOUS_Z] = data[base + PZ];
      data[base + PREVIOUS_ROTATION] = data[base + ROT];
      data[base + PREVIOUS_AGE] = data[base + AGE];
      data[base + AGE] = age;
      data[base + VX] = (data[base + VX] + gx * dt) * damping;
      data[base + VY] = (data[base + VY] + gy * dt) * damping;
      data[base + VZ] = (data[base + VZ] + gz * dt) * damping;
      const speed = definition.speedOverLifetime ? evaluateParticleCurve(definition.speedOverLifetime, age / data[base + LIFE]) : 1;
      data[base + PX] += data[base + VX] * speed * dt;
      data[base + PY] += data[base + VY] * speed * dt;
      data[base + PZ] += data[base + VZ] * speed * dt;
      data[base + ROT] += data[base + SPIN] * dt;
      slot = this.next[slot];
    }
  }

  /** Emits the rate and bursts that fall in [time, time + dt), wrapping looping cycles, plus pending counts. */
  private schedule(instance: EmitterInstance, dt: number): void {
    const definition = instance.definition;
    let emitted = instance.pending;
    instance.pending = 0;
    let remaining = dt;
    while (instance.playing && remaining > 0) {
      const start = instance.time;
      // Subtracting the segment length itself ends the loop exactly, so float rounding cannot leave a sliver.
      const length = Math.max(0, Math.min(remaining, definition.duration - start));
      const end = start + length;
      instance.accumulator += definition.rate * length;
      const whole = Math.floor(instance.accumulator + SAME_TIME);
      instance.accumulator = Math.max(0, instance.accumulator - whole);
      emitted += whole;
      for (const burst of definition.bursts) {
        for (let cycle = 0; cycle < burst.cycles; cycle += 1) {
          const at = burst.time + cycle * burst.interval;
          if (at >= start - SAME_TIME && at < end - SAME_TIME) {
            emitted += burst.count;
          }
        }
      }
      remaining -= length;
      instance.time = end;
      if (instance.time >= definition.duration - SAME_TIME) {
        if (definition.loop) {
          instance.time = 0;
        } else {
          instance.playing = false;
        }
      }
    }
    for (let index = 0; index < emitted; index += 1) {
      if (!this.spawn(instance)) {
        break;
      }
    }
  }

  /** Spawns one particle at the emitter, or at `origin` (a world point) for a death emitter. */
  private spawn(instance: EmitterInstance, origin?: ParticleVector): boolean {
    const definition = instance.definition;
    if (instance.count >= definition.maxParticles || this.total >= this.maxSceneParticles) {
      return false;
    }
    const random = instance.random;
    const shape = sampleParticleShape(definition.shape, this.dimension, random, this.sample);
    const lifetime = sampleParticleRange(definition.lifetime, random);
    const speed = sampleParticleRange(definition.speed, random);
    const size = sampleParticleRange(definition.size, random);
    const rotation = sampleParticleRange(definition.rotation, random);
    const spin = sampleParticleRange(definition.angularVelocity, random);
    const color = this.color;
    if (typeof definition.color === "string") {
      parseParticleColor(definition.color, color);
    } else {
      const mix = random.next();
      const from = parseParticleColor(definition.color.min);
      const to = parseParticleColor(definition.color.max);
      color.r = from.r + (to.r - from.r) * mix;
      color.g = from.g + (to.g - from.g) * mix;
      color.b = from.b + (to.b - from.b) * mix;
    }
    let position: ParticleVector;
    let direction: ParticleVector;
    if (definition.space === "world") {
      const offset = rotate(instance.rotation, shape.px, shape.py, shape.pz);
      const anchor = origin ?? instance.position;
      position = { x: anchor.x + offset.x, y: anchor.y + offset.y, z: anchor.z + offset.z };
      direction = rotate(instance.rotation, shape.dx, shape.dy, shape.dz);
    } else {
      const anchor = origin ? inverseTransformPoint(instance.rotation, instance.position, origin) : { x: 0, y: 0, z: 0 };
      position = { x: anchor.x + shape.px, y: anchor.y + shape.py, z: anchor.z + shape.pz };
      direction = { x: shape.dx, y: shape.dy, z: shape.dz };
    }
    const flat = this.dimension === "2d";
    const slot = this.allocate();
    this.previous[slot] = instance.tail;
    this.next[slot] = -1;
    if (instance.tail === -1) { instance.head = slot; } else { this.next[instance.tail] = slot; }
    instance.tail = slot;
    const base = slot * STRIDE;
    const data = this.data;
    data[base + PX] = position.x;
    data[base + PY] = position.y;
    data[base + PZ] = flat ? 0 : position.z;
    data[base + VX] = direction.x * speed;
    data[base + VY] = direction.y * speed;
    data[base + VZ] = flat ? 0 : direction.z * speed;
    data[base + AGE] = 0;
    data[base + LIFE] = lifetime;
    data[base + SIZE] = size;
    data[base + ROT] = rotation;
    data[base + SPIN] = spin;
    data[base + CR] = color.r;
    data[base + CG] = color.g;
    data[base + CB] = color.b;
    data[base + PREVIOUS_X] = data[base + PX];
    data[base + PREVIOUS_Y] = data[base + PY];
    data[base + PREVIOUS_Z] = data[base + PZ];
    data[base + PREVIOUS_ROTATION] = rotation;
    data[base + PREVIOUS_AGE] = 0;
    instance.count += 1;
    this.total += 1;
    return true;
  }
}

function mix(previous: number, current: number, alpha: number): number {
  if (alpha === 0) { return previous; }
  if (alpha === 1) { return current; }
  return previous + (current - previous) * alpha;
}

function interpolateRotation(previous: ParticleQuaternion, current: ParticleQuaternion, alpha: number): ParticleQuaternion {
  if (alpha === 0) { return previous; }
  if (alpha === 1) { return current; }
  const dot = previous.reduce((sum, value, index) => sum + value * current[index], 0);
  const sign = dot < 0 ? -1 : 1;
  const cosine = Math.min(1, Math.abs(dot));
  const angle = Math.acos(cosine);
  const sine = Math.sin(angle);
  const from = sine > 1e-6 ? Math.sin((1 - alpha) * angle) / sine : 1 - alpha;
  const to = sign * (sine > 1e-6 ? Math.sin(alpha * angle) / sine : alpha);
  const result = [previous[0] * from + current[0] * to, previous[1] * from + current[1] * to,
    previous[2] * from + current[2] * to, previous[3] * from + current[3] * to] as const;
  const length = Math.hypot(...result);
  return [result[0] / length, result[1] / length, result[2] / length, result[3] / length];
}

/** Emitter sources from a 2D or 3D render frame. 2D rotation turns about Z. */
export function particleSourcesFromFrame(frame: GameRenderFrame | GameRenderFrame3D): ParticleEmitterSource[] {
  if ("dimension" in frame) {
    return frame.entities.flatMap((entity) => entity.particles
      ? [{ entityId: entity.entityId, position: entity.transform.position, rotation: entity.transform.rotation, particles: entity.particles }]
      : []);
  }
  return (frame.particles ?? []).map((emitter) => ({
    entityId: emitter.entityId,
    position: { x: emitter.x, y: emitter.y, z: 0 },
    rotation: emitter.rotation === 0 ? IDENTITY : [0, 0, Math.sin(emitter.rotation / 2), Math.cos(emitter.rotation / 2)],
    particles: emitter.particles
  }));
}

function isParticleEmission(event: { readonly kind: string }): event is GameParticleEmission {
  return event.kind === "particles";
}

function instanceKey(entityId: string, emitterId: string): string {
  return `${entityId}\u0000${emitterId}`;
}

function rotate(q: ParticleQuaternion, x: number, y: number, z: number): ParticleVector {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return {
    x: x + qw * tx + (qy * tz - qz * ty),
    y: y + qw * ty + (qz * tx - qx * tz),
    z: z + qw * tz + (qx * ty - qy * tx)
  };
}

function transformPoint(q: ParticleQuaternion, origin: ParticleVector, x: number, y: number, z: number): ParticleVector {
  const turned = rotate(q, x, y, z);
  return { x: origin.x + turned.x, y: origin.y + turned.y, z: origin.z + turned.z };
}

function inverseTransformPoint(q: ParticleQuaternion, origin: ParticleVector, point: ParticleVector): ParticleVector {
  return rotate([-q[0], -q[1], -q[2], q[3]], point.x - origin.x, point.y - origin.y, point.z - origin.z);
}
