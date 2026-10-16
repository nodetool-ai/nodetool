import type { z } from "zod";
import { gameParticleEmitter, gameParticles, type GameParticles } from "./game-particles.js";

export const GAME_PARTICLE_PRESET_IDS = ["fire", "smoke", "sparks", "dust", "magic", "rain", "snow", "explosion"] as const;
export type GameParticlePresetId = typeof GAME_PARTICLE_PRESET_IDS[number];

type EmitterInput = z.input<typeof gameParticleEmitter>;

function emitters(name: string, dimension: "2d" | "3d"): EmitterInput[] {
  const fade = [{ t: 0, value: 0 }, { t: 0.12, value: 1 }, { t: 1, value: 0 }];
  const common = { maxParticles: 256, opacityOverLifetime: fade, unlit: true };
  switch (name) {
    case "fire": return [{ ...common, id: "flame", rate: 48, lifetime: { min: 0.6, max: 1.2 },
      shape: { kind: "cone", angle: 15, radius: 0.15 }, speed: { min: 1.2, max: 2.2 },
      size: { min: 0.15, max: 0.4 }, gravity: { x: 0, y: 1.4, z: 0 },
      color: "#ff932d", blend: "additive", sizeOverLifetime: [{ t: 0, value: 0.5 }, { t: 0.3, value: 1 }, { t: 1, value: 0.1 }],
      colorOverLifetime: [{ t: 0, color: "#fff4a0" }, { t: 0.5, color: "#ff8326" }, { t: 1, color: "#a91c14" }] }];
    case "smoke": return [{ ...common, id: "smoke", rate: 14, lifetime: { min: 2, max: 3.5 },
      shape: { kind: "cone", angle: 20, radius: 0.2 }, speed: { min: 0.3, max: 0.7 },
      size: { min: 0.3, max: 0.6 }, gravity: { x: 0.08, y: 0.35, z: 0 },
      drag: 0.3, color: "#9d9fa8", opacity: 0.45,
      sizeOverLifetime: [{ t: 0, value: 0.4 }, { t: 1, value: 2.5 }],
      colorOverLifetime: [{ t: 0, color: "#52545e" }, { t: 1, color: "#b9bac2" }] }];
    case "sparks": return [{ ...common, id: "sparks", rate: 24, lifetime: { min: 0.3, max: 0.9 },
      shape: { kind: "sphere", radius: 0.05 }, speed: { min: 2, max: 5 },
      size: { min: 0.025, max: 0.06 }, gravity: { x: 0, y: -4, z: 0 },
      color: "#ffd37c", blend: "additive", render: { kind: "stretched", length: 2, speedScale: 0.04 },
      colorOverLifetime: [{ t: 0, color: "#fff4c1" }, { t: 1, color: "#e7551d" }] }];
    case "dust": return [{ ...common, id: "dust", rate: 8, lifetime: { min: 3, max: 6 },
      shape: { kind: "box", size: { x: 4, y: 2, z: dimension === "2d" ? 0 : 2 } },
      speed: { min: 0.02, max: 0.08 }, size: { min: 0.02, max: 0.05 },
      color: "#d4c4a0", opacity: 0.45, gravity: { x: 0.01, y: 0.01, z: 0 } }];
    case "magic": return [{ ...common, id: "magic", rate: 30, lifetime: { min: 0.8, max: 1.8 },
      shape: { kind: "sphere", radius: 0.7, fromSurface: true }, speed: { min: 0.1, max: 0.5 },
      size: { min: 0.04, max: 0.12 }, angularVelocity: { min: -Math.PI, max: Math.PI },
      color: "#9d79ff", blend: "additive", sizeOverLifetime: [{ t: 0, value: 0 }, { t: 0.3, value: 1.5 }, { t: 1, value: 0 }],
      colorOverLifetime: [{ t: 0, color: "#63f4ff" }, { t: 0.5, color: "#9970ff" }, { t: 1, color: "#fa91e6" }] }];
    case "rain": return [{ ...common, id: "rain", maxParticles: 512, rate: 120, lifetime: { min: 0.7, max: 1.1 },
      shape: { kind: "box", size: { x: 6, y: 0.2, z: dimension === "2d" ? 0 : 3 } },
      speed: 0, gravity: { x: 0.4, y: -18, z: 0 }, size: 0.025,
      color: "#a2c9e8", opacity: 0.65, render: { kind: "stretched", length: 2, speedScale: 0.06 } }];
    case "snow": return [{ ...common, id: "snow", rate: 28, lifetime: { min: 4, max: 6 },
      shape: { kind: "box", size: { x: 6, y: 0.2, z: dimension === "2d" ? 0 : 3 } },
      speed: 0, gravity: { x: 0.025, y: -0.25, z: 0 },
      size: { min: 0.04, max: 0.1 }, color: "#e8f5ff", opacity: 0.9,
      angularVelocity: { min: -Math.PI / 4, max: Math.PI / 4 } }];
    case "explosion": return [{ ...common, id: "explosion", loop: false, duration: 0.1, rate: 0,
      bursts: [{ time: 0, count: 96 }], lifetime: { min: 0.4, max: 1 }, shape: { kind: "sphere", radius: 0.1 },
      speed: { min: 2, max: 6 }, size: { min: 0.1, max: 0.3 }, drag: 2,
      color: "#ff9b30", blend: "additive", sizeOverLifetime: [{ t: 0, value: 1.5 }, { t: 1, value: 0 }],
      colorOverLifetime: [{ t: 0, color: "#fff6c5" }, { t: 0.4, color: "#ff992c" }, { t: 1, color: "#b62c19" }] }];
    default: throw new Error(`Unknown particle preset: ${name}`);
  }
}

/** Returns a fresh, bounded particles component in world units for 2D or 3D authoring. */
export function getGameParticlePreset(name: string, dimension: "2d" | "3d"): GameParticles {
  const particles = gameParticles.parse({ emitters: emitters(name, dimension) });
  if (dimension === "2d") {
    for (const emitter of particles.emitters) { delete emitter.render; }
  }
  return particles;
}
