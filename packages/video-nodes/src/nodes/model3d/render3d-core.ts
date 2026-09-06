/// <reference lib="dom" />
/**
 * Shared three.js render core for `nodetool.model3d.RenderToImage` and for
 * the timeline's `model3d` clips.
 *
 * A **session** loads a GLB once and draws many frames from it
 * (`createModel3DRenderSession`); `renderGlbToPng` is the one-frame case.
 * Turning bytes into pixels needs a WebGL context on an `OffscreenCanvas`,
 * so the same module runs in two hosts:
 *
 * - the in-browser workflow runner and the timeline preview (main thread or
 *   worker), importing this file directly;
 * - a headless Chromium page on the Node backend, via the esbuild bundle
 *   `dist/render3d-page.js` (entry: `render3d-page.ts`).
 *
 * Editor-only clutter (grid, axes, gizmos) never exists here — the scene is
 * built fresh from the model plus the requested lights and nothing else.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";

export type LightingPreset = "studio" | "soft" | "flat";

/**
 * The 3D half of a timeline clip's style.
 *
 * These three interfaces are declared here, not imported, because
 * `@nodetool-ai/timeline` is pure document logic and this file is the GPU
 * side: the bundle that ships to a headless Chromium page must not pull the
 * document package in. They are structurally identical to the
 * `ClipModel3DCamera` / `ClipModel3DAnimation` / `ClipModel3DStyle` of
 * `packages/timeline/src/types.ts`, so a caller assigns one to the other
 * without a conversion.
 */
export type Model3DCameraMode = "orbit" | "scene";

export interface ClipModel3DCamera {
  /** `orbit` frames the model's bounding sphere; `scene` uses a glTF camera. */
  mode: Model3DCameraMode;
  /** Horizontal orbit angle around the model, degrees. 0 looks down -Z. */
  azimuthDeg: number;
  /** Vertical angle above the horizon, degrees. */
  elevationDeg: number;
  /** Vertical field of view, degrees. */
  fovDeg: number;
  /** Distance multiplier on the auto-framed fit: >1 closer. */
  zoom: number;
  /** Look-at offset from the bounding-sphere center, world units. */
  targetOffset?: [number, number, number];
  /** `scene` mode: the glTF camera's name; the first camera when absent. */
  sceneCameraName?: string;
}

export interface ClipModel3DAnimation {
  /** glTF animation name; every animation plays when absent. */
  clipName?: string;
  loop: boolean;
  /** Playback multiplier on top of the clip's own speed / time remap. */
  speed: number;
}

export interface ClipModel3DStyle {
  camera: ClipModel3DCamera;
  animation: ClipModel3DAnimation;
  lighting: LightingPreset;
  lightIntensity: number;
  background: { transparent: true } | { transparent: false; color: string };
  /** A Blender render of this clip at a given style. */
  bake?: { assetId: string; dependencyHash: string };
}

export interface Render3DOptions {
  /** Output image width in pixels. */
  width: number;
  /** Output image height in pixels. */
  height: number;
  /** Horizontal orbit angle around the model, degrees. 0 looks down -Z. */
  azimuthDeg: number;
  /** Vertical angle above the horizon, degrees. 90 is straight down. */
  elevationDeg: number;
  /** Vertical field of view, degrees. */
  fovDeg: number;
  /** Camera distance multiplier on the auto-framed fit: >1 closer, <1 farther. */
  zoom: number;
  lighting: LightingPreset;
  /** Multiplier applied to every light in the preset. */
  lightIntensity: number;
  /** CSS color for the background; ignored when `transparent` is true. */
  backgroundColor: string;
  transparent: boolean;
}

export interface Model3DRenderFrame {
  timeSec: number;
  /** Already folded with the animated camera channels. */
  camera: ClipModel3DCamera;
  width: number;
  height: number;
}

export interface Model3DRenderSession {
  /** Names of the glTF's animations and cameras, for the inspector and the validator. */
  readonly animations: readonly string[];
  readonly cameras: readonly string[];
  /** Draws one frame into the session's canvas and returns it. */
  render(frame: Model3DRenderFrame): OffscreenCanvas;
  dispose(): void;
}

/**
 * Everything a session fixes at creation. Two layers share a session only
 * when these are equal, so the key of every pool and every headless group is
 * `assetId` plus this object, never `assetId` alone.
 */
export interface Model3DSessionOptions {
  lighting: ClipModel3DStyle["lighting"];
  lightIntensity: number;
  background: ClipModel3DStyle["background"];
  animation: ClipModel3DAnimation;
}

interface CameraFraming {
  /** Distance from the bounding-sphere center to the camera. */
  distance: number;
  near: number;
  far: number;
}

/**
 * Distance that fits a bounding sphere of `radius` fully into a camera with
 * the given vertical fov and aspect, then applies `zoom` (>1 moves closer).
 * Pure math, exported for tests.
 */
export function computeFraming(
  radius: number,
  fovDeg: number,
  aspect: number,
  zoom: number
): CameraFraming {
  const safeRadius = Math.max(radius, 1e-6);
  const vFov = (Math.max(fovDeg, 1) * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 1e-6));
  const fitV = safeRadius / Math.sin(vFov / 2);
  const fitH = safeRadius / Math.sin(hFov / 2);
  const distance = Math.max(fitV, fitH) / Math.max(zoom, 1e-3);
  return {
    distance,
    near: Math.max(distance - safeRadius * 4, distance / 100, 1e-4),
    far: distance + safeRadius * 10
  };
}

/** Spherical → cartesian offset for the orbit camera. Exported for tests. */
export function orbitOffset(
  azimuthDeg: number,
  elevationDeg: number,
  distance: number
) {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (Math.min(Math.max(elevationDeg, -89.9), 89.9) * Math.PI) / 180;
  return {
    x: distance * Math.cos(el) * Math.sin(az),
    y: distance * Math.sin(el),
    z: distance * Math.cos(el) * Math.cos(az)
  };
}

/**
 * Map a clip-local animation time onto the mixer's time.
 *
 * With `loop` on the time wraps at `duration`; off, it clamps to the last
 * frame. A model with no animation (`duration` 0, or a non-finite duration)
 * has one pose, so every time maps to 0. Pure, exported for tests.
 */
export function mixerTimeFor(
  t: number,
  duration: number,
  loop: boolean
): number {
  if (!Number.isFinite(t)) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!loop) return Math.min(Math.max(t, 0), duration);
  return ((t % duration) + duration) % duration;
}

/**
 * The animation clips `animation.clipName` selects: the named one, or every
 * clip when the name is absent. Pure, exported for tests.
 */
export function selectAnimationClips<T extends { name: string }>(
  clips: readonly T[],
  clipName?: string
): T[] {
  if (clipName === undefined || clipName === "") return [...clips];
  const found = clips.filter((clip) => clip.name === clipName);
  if (found.length > 0) return found;
  throw new Error(
    clips.length === 0
      ? `Model3D render: animation "${clipName}" is not in this model — it has no animations`
      : `Model3D render: animation "${clipName}" is not in this model — available animations: ${clips
          .map((clip) => clip.name)
          .join(", ")}`
  );
}

/**
 * The glTF camera `camera.sceneCameraName` selects, or the first one when the
 * name is absent. Pure, exported for tests.
 */
export function selectSceneCamera<T extends { name: string }>(
  cameras: readonly T[],
  sceneCameraName?: string
): T {
  if (cameras.length === 0) {
    throw new Error(
      "Model3D render: camera mode is \"scene\" but this model has no cameras — use orbit mode"
    );
  }
  if (sceneCameraName === undefined || sceneCameraName === "") {
    return cameras[0];
  }
  const found = cameras.find((camera) => camera.name === sceneCameraName);
  if (found) return found;
  throw new Error(
    `Model3D render: camera "${sceneCameraName}" is not in this model — available cameras: ${cameras
      .map((camera) => camera.name)
      .join(", ")}`
  );
}

/** Direction of a light relative to the camera, in the rig's basis. */
type LightDirection = (
  toCamera: THREE.Vector3,
  side: THREE.Vector3,
  up: THREE.Vector3
) => THREE.Vector3;

interface LightRig {
  /**
   * Re-place the camera-relative lights. Called once per frame, because both
   * the camera and the look-at target move between frames.
   */
  aim(cameraPosition: THREE.Vector3, target: THREE.Vector3): void;
}

/**
 * Build the preset's lights into `scene`. Key/fill/rim ride along with the
 * camera azimuth so the visible side of the model is always lit, whatever
 * angle the user picked — `aim` is what puts them there.
 */
function createLightRig(
  scene: THREE.Scene,
  preset: LightingPreset,
  intensity: number
): LightRig {
  const scaled = (base: number): number => base * intensity;
  const directionals: { light: THREE.DirectionalLight; direction: LightDirection }[] =
    [];
  let hemisphere: THREE.HemisphereLight | null = null;

  const placeDirectional = (
    color: number,
    lightIntensity: number,
    direction: LightDirection
  ): void => {
    const light = new THREE.DirectionalLight(color, lightIntensity);
    scene.add(light);
    scene.add(light.target);
    directionals.push({ light, direction });
  };

  switch (preset) {
    case "studio": {
      scene.add(new THREE.AmbientLight(0xffffff, scaled(0.5)));
      placeDirectional(0xffffff, scaled(2.2), (toCamera, side, up) =>
        toCamera
          .clone()
          .add(side.clone().multiplyScalar(0.8))
          .add(up.clone().multiplyScalar(0.9))
      );
      placeDirectional(0xffffff, scaled(0.8), (toCamera, side, up) =>
        toCamera
          .clone()
          .sub(side.clone().multiplyScalar(1.1))
          .add(up.clone().multiplyScalar(0.2))
      );
      placeDirectional(0xffffff, scaled(1.4), (toCamera, _side, up) =>
        toCamera.clone().negate().add(up.clone().multiplyScalar(1.2))
      );
      break;
    }
    case "soft": {
      hemisphere = new THREE.HemisphereLight(0xffffff, 0x555566, scaled(1.6));
      scene.add(hemisphere);
      placeDirectional(0xffffff, scaled(0.9), (toCamera, _side, up) =>
        toCamera.clone().add(up)
      );
      break;
    }
    case "flat":
      scene.add(new THREE.AmbientLight(0xffffff, scaled(3)));
      break;
  }

  return {
    aim(cameraPosition, target) {
      const toCamera = cameraPosition.clone().sub(target).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(up, toCamera).normalize();
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      for (const entry of directionals) {
        entry.light.position
          .copy(target)
          .add(entry.direction(toCamera, side, up));
        entry.light.target.position.copy(target);
      }
      if (hemisphere) hemisphere.position.copy(target).add(up);
    }
  };
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // GLTFLoader wants an ArrayBuffer that starts at offset 0.
  return bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.slice().buffer;
}

/** The session options a one-shot `Render3DOptions` describes. */
export function sessionOptionsFromRender3DOptions(
  options: Render3DOptions
): Model3DSessionOptions {
  return {
    lighting: options.lighting,
    lightIntensity: options.lightIntensity,
    background: options.transparent
      ? { transparent: true }
      : { transparent: false, color: options.backgroundColor },
    animation: { loop: false, speed: 1 }
  };
}

/** The single frame a one-shot `Render3DOptions` describes. */
export function renderFrameFromRender3DOptions(
  options: Render3DOptions
): Model3DRenderFrame {
  return {
    timeSec: 0,
    width: options.width,
    height: options.height,
    camera: {
      mode: "orbit",
      azimuthDeg: options.azimuthDeg,
      elevationDeg: options.elevationDeg,
      fovDeg: options.fovDeg,
      zoom: options.zoom
    }
  };
}

/**
 * Load a model once and draw frames from it. Must run in a browser context
 * (window or worker) with WebGL and `OffscreenCanvas`.
 *
 * Every option here is fixed for the session's life: a style edit that
 * touches one of them disposes the session and creates a new one, because a
 * mixer whose actions were rebuilt mid-session is the same picture as a fresh
 * one and harder to prove.
 */
export async function createModel3DRenderSession(
  glb: Uint8Array,
  options: Model3DSessionOptions
): Promise<Model3DRenderSession> {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error(
      "RenderToImage needs a browser context with OffscreenCanvas support"
    );
  }

  const loader = new GLTFLoader();
  await MeshoptDecoder.ready;
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(toArrayBuffer(glb), "");

  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  // Resolve the world matrix before measuring, or the box is stale.
  scene.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(gltf.scene);
  if (box.isEmpty()) {
    disposeScene(scene);
    throw new Error("RenderToImage: the model contains no visible geometry");
  }
  // The framing sphere is the model's rest pose, so a camera does not drift
  // as the animation moves the geometry.
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  const sceneCameras = gltf.cameras;
  const selected = selectAnimationClips(
    gltf.animations,
    options.animation.clipName
  );
  const duration = selected.reduce(
    (longest, clip) => Math.max(longest, clip.duration),
    0
  );
  const loop = options.animation.loop;
  const mixer =
    selected.length > 0 ? new THREE.AnimationMixer(gltf.scene) : null;
  const actions: THREE.AnimationAction[] = [];
  if (mixer) {
    for (const clip of selected) {
      const action = mixer.clipAction(clip);
      if (loop) {
        action.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        // LoopOnce holds the last frame at exactly `duration`; LoopRepeat
        // would wrap it back to 0 there.
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.play();
      actions.push(action);
    }
  }

  const rig = createLightRig(scene, options.lighting, options.lightIntensity);
  if (!options.background.transparent) {
    scene.background = new THREE.Color(options.background.color);
  }

  const canvas = new OffscreenCanvas(1, 1);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (options.background.transparent) {
    renderer.setClearColor(0x000000, 0);
  }

  const orbitCamera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3();
  const eye = new THREE.Vector3();
  let disposed = false;

  return {
    animations: gltf.animations.map((clip) => clip.name),
    cameras: sceneCameras.map((camera) => camera.name),

    render(frame: Model3DRenderFrame): OffscreenCanvas {
      if (disposed) {
        throw new Error("Model3D render: this session is already disposed");
      }
      const width = Math.max(1, Math.round(frame.width));
      const height = Math.max(1, Math.round(frame.height));
      const aspect = width / height;

      if (mixer) {
        // Reset before every frame so a render depends only on its own time:
        // a scrub backwards, or one past a non-looping clip's end, draws the
        // same picture whatever was drawn before it.
        for (const action of actions) action.reset();
        mixer.setTime(mixerTimeFor(frame.timeSec, duration, loop));
      }
      scene.updateMatrixWorld(true);

      target.copy(sphere.center);
      if (frame.camera.targetOffset) {
        target.x += frame.camera.targetOffset[0];
        target.y += frame.camera.targetOffset[1];
        target.z += frame.camera.targetOffset[2];
      }

      let camera: THREE.Camera;
      if (frame.camera.mode === "scene") {
        const sceneCamera = selectSceneCamera(
          sceneCameras,
          frame.camera.sceneCameraName
        );
        if (sceneCamera instanceof THREE.PerspectiveCamera) {
          sceneCamera.aspect = aspect;
          sceneCamera.updateProjectionMatrix();
        }
        sceneCamera.getWorldPosition(eye);
        camera = sceneCamera;
      } else {
        const framing = computeFraming(
          sphere.radius,
          frame.camera.fovDeg,
          aspect,
          frame.camera.zoom
        );
        const offset = orbitOffset(
          frame.camera.azimuthDeg,
          frame.camera.elevationDeg,
          framing.distance
        );
        orbitCamera.fov = frame.camera.fovDeg;
        orbitCamera.aspect = aspect;
        orbitCamera.near = framing.near;
        orbitCamera.far = framing.far;
        orbitCamera.updateProjectionMatrix();
        orbitCamera.position.set(
          target.x + offset.x,
          target.y + offset.y,
          target.z + offset.z
        );
        orbitCamera.lookAt(target);
        orbitCamera.updateMatrixWorld(true);
        eye.copy(orbitCamera.position);
        camera = orbitCamera;
      }

      rig.aim(eye, target);
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
      return canvas;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (mixer) {
        mixer.stopAllAction();
        mixer.uncacheRoot(gltf.scene);
      }
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}

/**
 * Render GLB (or embedded-buffer glTF JSON) bytes to PNG bytes. Must run in a
 * browser context (window or worker) with WebGL and `OffscreenCanvas`.
 */
export async function renderGlbToPng(
  glb: Uint8Array,
  options: Render3DOptions
): Promise<Uint8Array> {
  const session = await createModel3DRenderSession(
    glb,
    sessionOptionsFromRender3DOptions(options)
  );
  try {
    const canvas = session.render(renderFrameFromRender3DOptions(options));
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    session.dispose();
  }
}
