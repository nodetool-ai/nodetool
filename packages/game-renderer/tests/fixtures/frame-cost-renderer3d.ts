import * as THREE from "three";
import { gameRenderFrame3D } from "@nodetool-ai/protocol";
import { createGameRenderer3D } from "../../src/browser3d.js";
import { GameUiController } from "../../src/ui/controller.js";
import type { GameParticleField } from "../../src/particles/render2d.js";

export interface RendererFrameCost3D {
  /** Scene walks in one steady frame. */
  readonly walks: number;
  /** JSON.stringify calls in one steady frame. */
  readonly stringify: number;
  /** HUD canvas texture uploads in one steady frame. */
  readonly hudUploads: number;
  /** HUD text measurements in one steady frame. */
  readonly measures: number;
  /** Particle field reads when `render` is called, and after the frame drew. */
  readonly readsAtSubmit: number;
  readonly readsAfterDraw: number;
}

/**
 * Renders the same tick three times, like a 180 Hz display over a 60 Hz tick, and counts the repeated work of the
 * last frame. The scene has two shadow cascades, height fog, a HUD tree and a HUD label.
 */
export async function measureRendererFrameCost3D(): Promise<RendererFrameCost3D> {
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 64;
  document.body.append(canvas);
  const renderer = await createGameRenderer3D({ canvas });
  const transform = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], scale: { x: 1, y: 1, z: 1 } };
  const length = Math.hypot(-0.5, 0.3, 0.1, 0.8);
  const down = { ...transform, rotation: [-0.5 / length, 0.3 / length, 0.1 / length, 0.8 / length] };
  const frame = gameRenderFrame3D.parse({ dimension: "3d", gameId: "cost", sceneId: "scene", tick: 1,
    presentation: { aspectRatio: 1, hudWidth: 64, hudHeight: 64 },
    camera: { entityId: "camera", transform: { ...transform, position: { x: 0, y: 2, z: 8 } }, projection: { kind: "perspective", fov: 60, near: 0.1, far: 200 } },
    entities: [{ entityId: "box", transform, previousTransform: transform, primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 }, material: { color: "#0088ff" } } }],
    lights: [{ entityId: "sun", transform: down, light: { kind: "directional", color: "#ffffff", intensity: 2, castShadow: true } }],
    environment: { background: "#202838", ambient: { color: "#ffffff", intensity: 0.4 },
      fog: { kind: "height", color: "#cad9e4", density: 0.05, baseHeight: 0, heightFalloff: 0.5, maxOpacity: 1 },
      shadows: { enabled: true, mapSize: 512, extent: 20, cascades: { count: 2, maxDistance: 60 } } },
    ui: { safeArea: false, focusNavigation: false, nodes: [{ kind: "text", id: "score", text: "Score 10" }] },
    hud: [{ id: "label", text: "Lap 1", x: 4, y: 4 }] });
  let measures = 0;
  const hud = new GameUiController({ pressUiAction: () => undefined, releaseUiAction: () => undefined }, (text, size) => { measures++; return text.length * size / 2; });
  const viewport = { width: 64, height: 64 };
  const draw = async (interpolation: number): Promise<void> => {
    hud.update(frame.ui, viewport, { top: 1, right: 0, bottom: 0, left: 0 });
    await renderer.render(hud.annotate(frame), interpolation);
  };
  const insets = { top: 1, right: 0, bottom: 0, left: 0 };
  const drawSteady = async (interpolation: number): Promise<void> => {
    hud.update(frame.ui, viewport, insets);
    await renderer.render(hud.annotate(frame), interpolation);
  };
  await draw(0.2);
  await drawSteady(0.4);
  const scene = renderer.getScene();
  const traverse = THREE.Object3D.prototype.traverse;
  const stringify = JSON.stringify;
  let walks = 0;
  let stringifies = 0;
  let hudUploads = 0;
  THREE.Object3D.prototype.traverse = function (this: THREE.Object3D, callback: (object: THREE.Object3D) => void): void {
    if (this === scene) { walks++; }
    traverse.call(this, callback);
  };
  JSON.stringify = (...args: Parameters<typeof JSON.stringify>) => { stringifies++; return stringify(...args); };
  const upload = THREE.CanvasTexture.prototype;
  Object.defineProperty(upload, "needsUpdate", { configurable: true, set(value: boolean) { if (value) { hudUploads++; this.version++; } } });
  measures = 0;
  try {
    await drawSteady(0.6);
  } finally {
    THREE.Object3D.prototype.traverse = traverse;
    JSON.stringify = stringify;
    Reflect.deleteProperty(upload, "needsUpdate");
  }
  let reads = 0;
  const field: GameParticleField = { forEachParticle: () => { reads++; } };
  const pending = renderer.render(frame, 0.5, field);
  const readsAtSubmit = reads;
  await pending;
  const readsAfterDraw = reads;
  renderer.dispose();
  return { walks, stringify: stringifies, hudUploads, measures, readsAtSubmit, readsAfterDraw };
}
