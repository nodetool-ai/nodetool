import type { GameParticleShape } from "@nodetool-ai/protocol";

import type { ParticleRandom } from "./random.js";

export type ParticleDimension = "2d" | "3d";

/** Spawn position and unit direction in emitter space. */
export interface ParticleShapeSample {
  px: number;
  py: number;
  pz: number;
  dx: number;
  dy: number;
  dz: number;
}

const DEGREES = Math.PI / 180;

/**
 * Samples a spawn point and direction. Shapes lie in the XY plane except sphere, cone and box in 3D.
 * Box, edge and cone emit along +Y. Point, circle and sphere emit outward.
 */
export function sampleParticleShape(shape: GameParticleShape, dimension: ParticleDimension, random: ParticleRandom, out: ParticleShapeSample): ParticleShapeSample {
  out.px = 0;
  out.py = 0;
  out.pz = 0;
  out.dx = 0;
  out.dy = 1;
  out.dz = 0;
  const flat = dimension === "2d";
  switch (shape.kind) {
    case "point":
      if (flat) {
        circleDirection(random.next() * Math.PI * 2, out);
      } else {
        sphereDirection(random, out);
      }
      break;
    case "circle": {
      const angle = random.next() * shape.arc * DEGREES;
      const radius = shape.fromEdge ? shape.radius : shape.radius * Math.sqrt(random.next());
      circleDirection(angle, out);
      out.px = out.dx * radius;
      out.py = out.dy * radius;
      break;
    }
    case "sphere": {
      if (flat) {
        circleDirection(random.next() * Math.PI * 2, out);
      } else {
        sphereDirection(random, out);
      }
      const unit = random.next();
      const radius = shape.fromSurface ? shape.radius : shape.radius * (flat ? Math.sqrt(unit) : Math.cbrt(unit));
      out.px = out.dx * radius;
      out.py = out.dy * radius;
      out.pz = out.dz * radius;
      break;
    }
    case "cone": {
      const spread = shape.angle * DEGREES;
      if (flat) {
        const angle = (random.next() * 2 - 1) * spread;
        out.dx = -Math.sin(angle);
        out.dy = Math.cos(angle);
        out.px = (random.next() * 2 - 1) * shape.radius;
      } else {
        // Uniform over the cap's solid angle, around +Y, from a disc of the given radius in XZ.
        const cosine = 1 - random.next() * (1 - Math.cos(spread));
        const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
        const turn = random.next() * Math.PI * 2;
        out.dx = sine * Math.cos(turn);
        out.dy = cosine;
        out.dz = sine * Math.sin(turn);
        const radius = shape.radius * Math.sqrt(random.next());
        const baseTurn = random.next() * Math.PI * 2;
        out.px = radius * Math.cos(baseTurn);
        out.pz = radius * Math.sin(baseTurn);
      }
      break;
    }
    case "box":
      out.px = (random.next() - 0.5) * shape.size.x;
      out.py = (random.next() - 0.5) * shape.size.y;
      out.pz = flat ? 0 : (random.next() - 0.5) * shape.size.z;
      break;
    case "edge":
      out.px = (random.next() - 0.5) * shape.length;
      break;
  }
  return out;
}

function circleDirection(angle: number, out: ParticleShapeSample): void {
  out.dx = Math.cos(angle);
  out.dy = Math.sin(angle);
  out.dz = 0;
}

function sphereDirection(random: ParticleRandom, out: ParticleShapeSample): void {
  const z = random.next() * 2 - 1;
  const turn = random.next() * Math.PI * 2;
  const ring = Math.sqrt(Math.max(0, 1 - z * z));
  out.dx = ring * Math.cos(turn);
  out.dy = ring * Math.sin(turn);
  out.dz = z;
}
