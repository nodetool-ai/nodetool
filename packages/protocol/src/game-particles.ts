import { z } from "zod";

/**
 * Particle emitters shared by 2D and 3D entities. Particles are presentation
 * state: the renderer simulates them, and they never enter a snapshot.
 */
const finite = z.number().finite();
const id = z.string().min(1).max(64);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const count = z.number().int().min(1).max(1024);

/** A fixed value, or a uniform random value between min and max chosen per particle. */
function range(bounds: z.ZodNumber) {
  return z.union([bounds, z.strictObject({ min: bounds, max: bounds })]);
}

export const gameParticleRange = range(finite);

const rangeBounds = z.strictObject({ min: finite, max: finite });

export type GameParticleRange = z.infer<typeof gameParticleRange>;

/** Piecewise-linear keys over normalized particle age (0 at birth, 1 at death). */
export const gameParticleCurve = z.array(z.strictObject({ t: finite.min(0).max(1), value: finite.min(0).max(100) })).min(1).max(16);

export type GameParticleCurve = z.infer<typeof gameParticleCurve>;

export const gameParticleGradient = z.array(z.strictObject({ t: finite.min(0).max(1), color })).min(1).max(8);

export type GameParticleGradient = z.infer<typeof gameParticleGradient>;

const vector = z.strictObject({ x: finite.min(-1000).max(1000), y: finite.min(-1000).max(1000), z: finite.min(-1000).max(1000).default(0) });
const extent = finite.min(0).max(1000);

/** Spawn volume in emitter space. Particles travel along local +Y unless the shape says otherwise. */
export const gameParticleShape = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("point") }),
  z.strictObject({ kind: z.literal("circle"), radius: extent, arc: finite.min(0).max(360).default(360), fromEdge: z.boolean().default(false) }),
  z.strictObject({ kind: z.literal("sphere"), radius: extent, fromSurface: z.boolean().default(false) }),
  z.strictObject({ kind: z.literal("cone"), angle: finite.min(0).max(90), radius: extent.default(0) }),
  z.strictObject({ kind: z.literal("box"), size: z.strictObject({ x: extent, y: extent, z: extent.default(0) }) }),
  z.strictObject({ kind: z.literal("edge"), length: extent })
]);

export type GameParticleShape = z.infer<typeof gameParticleShape>;

/**
 * Image for each particle. A sheet is cut into `columns` by `rows` cells, read left to right and top to bottom,
 * and the first `frameCount` cells play `cycles` times over each particle's life.
 */
export const gameParticleSprite = z.strictObject({
  assetId: z.string().min(1),
  columns: z.number().int().min(1).max(64).default(1),
  rows: z.number().int().min(1).max(64).default(1),
  frameCount: z.number().int().min(1).max(4096).optional(),
  cycles: z.number().int().min(1).max(64).default(1),
  sampling: z.enum(["nearest", "linear"]).optional()
});

export type GameParticleSprite = z.infer<typeof gameParticleSprite>;

export const gameParticleEmitter = z.strictObject({
  id,
  playOnStart: z.boolean().default(true),
  duration: finite.min(0.01).max(600).default(1),
  loop: z.boolean().default(true),
  rate: finite.min(0).max(1000).default(10),
  bursts: z.array(z.strictObject({ time: finite.min(0).max(600).default(0), count, cycles: z.number().int().min(1).max(100).default(1),
    interval: finite.min(0.01).max(60).default(0.1) })).max(8).default([]),
  maxParticles: z.number().int().min(1).max(4096).default(256),
  shape: gameParticleShape.default({ kind: "point" }),
  space: z.enum(["world", "local"]).default("world"),
  lifetime: range(finite.min(0.01).max(60)).default(1),
  speed: range(finite.min(0).max(1000)).default(1),
  size: range(finite.min(0).max(1000)).default(0.1),
  rotation: gameParticleRange.default(0),
  angularVelocity: gameParticleRange.default(0),
  color: z.union([color, z.strictObject({ min: color, max: color })]).default("#ffffff"),
  opacity: finite.min(0).max(1).default(1),
  sizeOverLifetime: gameParticleCurve.optional(),
  speedOverLifetime: gameParticleCurve.optional(),
  opacityOverLifetime: gameParticleCurve.optional(),
  colorOverLifetime: gameParticleGradient.optional(),
  gravity: vector.default({ x: 0, y: 0, z: 0 }),
  drag: finite.min(0).max(100).default(0),
  /** Emitters of the same component that fire at each dying particle's position. */
  onDeath: z.array(z.strictObject({ emitter: id, count: z.number().int().min(1).max(64).default(1) })).max(4).default([]),
  /** Without a sprite, particles draw as a soft round dot. */
  sprite: gameParticleSprite.optional(),
  /** `normal` alpha-blends. `additive` adds light, which suits fire, sparks and magic. Defaults to `normal`. */
  blend: z.enum(["normal", "additive"]).optional(),
  /** Opts out of scene lighting so particles keep their own colour in the dark. */
  unlit: z.boolean().optional(),
  /** 2D draw layer. Defaults to the entity's sprite layer, or 0 without a sprite. */
  layer: z.number().int().optional()
});

export type GameParticleEmitter = z.infer<typeof gameParticleEmitter>;

export const gameParticles = z.strictObject({ emitters: z.array(gameParticleEmitter).min(1).max(8) });

export type GameParticles = z.infer<typeof gameParticles>;

/**
 * Script command that plays an emitter on the script's own entity. Without `count` it restarts the emitter's cycle.
 * With `count` it spawns that many particles at once. Unknown emitters are ignored because particles are presentation only.
 */
export const gameEmitParticlesCommand = z.strictObject({ kind: z.literal("emitParticles"), emitter: id.optional(), count: count.optional() });

/** Presentation event from the `emitParticles` script command. It never enters the simulation event stream. */
export const gameParticleEmission = z.strictObject({ kind: z.literal("particles"), entityId: z.string().min(1), emitter: id.optional(), count: count.optional() });

export type GameParticleEmission = z.infer<typeof gameParticleEmission>;

/** Converts a script's `emitParticles` command into its presentation event. */
export function gameParticleEmissionOf(command: z.infer<typeof gameEmitParticlesCommand>, entityId: string): GameParticleEmission {
  const emission: GameParticleEmission = { kind: "particles", entityId };
  if (command.emitter !== undefined) {
    emission.emitter = command.emitter;
  }
  if (command.count !== undefined) {
    emission.count = command.count;
  }
  return emission;
}

/** Cross-reference checks for a particles component that its Zod schema cannot express. */
export function gameParticleIssues(particles: GameParticles): { readonly path: (string | number)[]; readonly message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  const ids = new Set<string>();
  for (const [index, emitter] of particles.emitters.entries()) {
    if (ids.has(emitter.id)) {
      issues.push({ path: ["emitters", index, "id"], message: `Duplicate particle emitter ${emitter.id}` });
    }
    ids.add(emitter.id);
    for (const field of ["lifetime", "speed", "size", "rotation", "angularVelocity"] as const) {
      const bounds = rangeBounds.safeParse(emitter[field]);
      if (bounds.success && bounds.data.min > bounds.data.max) {
        issues.push({ path: ["emitters", index, field], message: "Range min must not exceed max" });
      }
    }
    for (const field of ["sizeOverLifetime", "speedOverLifetime", "opacityOverLifetime", "colorOverLifetime"] as const) {
      const keys = emitter[field];
      if (keys?.some((key, keyIndex) => keyIndex > 0 && key.t < keys[keyIndex - 1].t)) {
        issues.push({ path: ["emitters", index, field], message: "Curve keys must be sorted by t" });
      }
    }
  }
  for (const [index, emitter] of particles.emitters.entries()) {
    const sprite = emitter.sprite;
    if (sprite?.frameCount !== undefined && sprite.frameCount > sprite.columns * sprite.rows) {
      issues.push({ path: ["emitters", index, "sprite", "frameCount"], message: `frameCount must not exceed columns × rows (${sprite.columns * sprite.rows})` });
    }
    for (const [subIndex, sub] of emitter.onDeath.entries()) {
      if (!ids.has(sub.emitter)) {
        issues.push({ path: ["emitters", index, "onDeath", subIndex, "emitter"], message: `Particle emitter ${sub.emitter} does not exist` });
      } else if (sub.emitter === emitter.id) {
        issues.push({ path: ["emitters", index, "onDeath", subIndex, "emitter"], message: "An emitter cannot be its own death emitter" });
      }
    }
  }
  return issues;
}
