import type { GameEvent, GameParticleEmission, GameParticleSprite, GameRenderFrame } from "@nodetool-ai/protocol";

import { ParticleSimulator, particleSourcesFromFrame, type ParticleView } from "./simulator.js";

/** What a 2D renderer reads from a particle simulation. */
export interface GameParticleField {
  forEachParticle(visit: (particle: Readonly<ParticleView>) => void): void;
}

/** Asset id of the built-in soft round dot that particles without a sprite draw with. */
export const PARTICLE_DOT_ASSET = "nodetool:particle-dot";

export const PARTICLE_DOT_SIZE = 32;

/**
 * Visible particles the Canvas2D fallback draws. Canvas2D composites each particle separately, so it stops at a
 * lower count than WebGPU, which draws every particle the simulator holds as one instanced batch per texture.
 */
export const CANVAS2D_MAX_PARTICLES = 1024;

/** White RGBA pixels whose alpha falls smoothly from the centre to zero at the edge. */
export function particleDotPixels(size = PARTICLE_DOT_SIZE): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
      const falloff = Math.max(0, 1 - distance);
      const offset = (y * size + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round(255 * falloff * falloff * (3 - 2 * falloff));
    }
  }
  return pixels;
}

/** A sprite sheet cell, resolved to pixels once the image size is known. */
export interface ParticleCell {
  readonly index: number;
  readonly columns: number;
  readonly rows: number;
}

/** The sheet cell a particle shows at normalized age `life`. */
export function particleCell(sprite: GameParticleSprite, life: number): ParticleCell | undefined {
  const cells = sprite.columns * sprite.rows;
  if (cells <= 1) {
    return undefined;
  }
  const frames = Math.min(sprite.frameCount ?? cells, cells);
  const steps = frames * sprite.cycles;
  // Life 1 is the last moment of the last cycle, not the start of another.
  const index = Math.min(steps - 1, Math.floor(Math.max(0, Math.min(1, life)) * steps)) % frames;
  return { index, columns: sprite.columns, rows: sprite.rows };
}

/**
 * Runs 2D particles beside a game session. Call `tick` after every session step with that step's frame and
 * the session's presentation events, and pass the instance to the renderer. It reads the session and never
 * writes to it, so particles stay out of snapshots and replay.
 */
export class GameParticles2D implements GameParticleField {
  readonly simulator: ParticleSimulator;
  private readonly tickSeconds: number;

  constructor(tickRate: number, maxSceneParticles?: number) {
    if (!(tickRate > 0)) {
      throw new Error("Particle tick rate must be positive");
    }
    this.tickSeconds = 1 / tickRate;
    this.simulator = new ParticleSimulator({ dimension: "2d", maxSceneParticles });
  }

  /** Live particles, for the frame budget. */
  get count(): number {
    return this.simulator.count;
  }

  tick(frame: GameRenderFrame, events: readonly (GameEvent | GameParticleEmission)[]): void {
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
