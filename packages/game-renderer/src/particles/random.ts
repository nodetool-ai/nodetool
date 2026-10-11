/** FNV-1a hash of an entity and emitter id, so every emitter replays the same particles in captures. */
export function particleSeed(entityId: string, emitterId: string): number {
  const key = `${entityId}\u0000${emitterId}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: a small seeded generator. It is cosmetic and never shares state with the simulation RNG. */
export class ParticleRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A uniform number in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}
