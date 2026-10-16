import { gameRenderFrame, gameRenderFrame3D, type GameParticles, type GameRenderFrame, type GameRenderFrame3D } from "@nodetool-ai/protocol";

import { GameParticles2D } from "./render2d.js";
import { GameParticles3D } from "./particles3d.js";

export const PARTICLE_PREVIEW_TICK_RATE = 60;
export const PARTICLE_PREVIEW_WIDTH = 640;
export const PARTICLE_PREVIEW_HEIGHT = 360;

interface ParticlePreview2D {
  readonly dimension: "2d";
  readonly frame: GameRenderFrame;
  readonly particles: GameParticles2D;
  step(): void;
}

interface ParticlePreview3D {
  readonly dimension: "3d";
  readonly frame: GameRenderFrame3D;
  readonly particles: GameParticles3D;
  step(): void;
}

export type GameParticlePreview = ParticlePreview2D | ParticlePreview3D;

/** Creates presentation state only. Recreate it to restart at the same deterministic particle seed. */
export function createGameParticlePreview(definition: GameParticles, dimension: "2d" | "3d"): GameParticlePreview {
  if (dimension === "2d") {
    const frame = gameRenderFrame.parse({ tick: 0, width: PARTICLE_PREVIEW_WIDTH / 50, height: PARTICLE_PREVIEW_HEIGHT / 50,
      pixelsPerUnit: 50, camera: { x: 0, y: 0, zoom: 0.7 }, sprites: [], tiles: [], hud: [],
      lighting: { ambient: { color: "#ffffff", intensity: 0.4 }, points: [] },
      particles: [{ entityId: "particle-preview", x: 0, y: 0, rotation: 0, particles: definition }] });
    const particles = new GameParticles2D(PARTICLE_PREVIEW_TICK_RATE);
    return { dimension, frame, particles, step() { frame.tick += 1; particles.tick(frame, []); } };
  }
  const transform = { position: { x: 0, y: 0.5, z: 0 }, rotation: [0, 0, 0, 1], scale: { x: 1, y: 1, z: 1 } };
  // Fixed Y-up camera at (5, 3, 7), looking toward (0, 1, 0), without loading the 3D renderer.
  const cameraRotation = [-0.10853342030695386, 0.3031889422882463, 0.03478116833527789, 0.946090498990367];
  const frame = gameRenderFrame3D.parse({ dimension, gameId: "particle-preview", sceneId: "preview", tick: 0,
    presentation: { aspectRatio: PARTICLE_PREVIEW_WIDTH / PARTICLE_PREVIEW_HEIGHT, hudWidth: PARTICLE_PREVIEW_WIDTH, hudHeight: PARTICLE_PREVIEW_HEIGHT },
    camera: { entityId: "preview-camera", transform: { position: { x: 5, y: 3, z: 7 }, rotation: cameraRotation }, projection: { kind: "perspective" } },
    entities: [{ entityId: "particle-preview", transform, previousTransform: transform, particles: definition },
      { entityId: "preview-floor", transform: { position: { x: 0, y: -0.25, z: 0 } }, previousTransform: { position: { x: 0, y: -0.25, z: 0 } },
        primitive: { kind: "box", dimensions: { x: 10, y: 0.5, z: 10 }, material: { color: "#27313e" }, castShadow: false } }],
    environment: { background: "#151b25", ambient: { color: "#ffffff", intensity: 0.4 }, shadows: { enabled: false, mapSize: 1024, extent: 30 } },
    lights: [{ entityId: "preview-light", transform: { position: { x: 2, y: 4, z: 3 } }, light: { kind: "point", intensity: 20, range: 20, color: "#ffffff" } }], hud: [] });
  const particles = new GameParticles3D(PARTICLE_PREVIEW_TICK_RATE);
  return { dimension, frame, particles, step() { frame.tick += 1; particles.tick(frame, []); } };
}
