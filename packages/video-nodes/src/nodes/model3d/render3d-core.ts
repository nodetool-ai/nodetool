/// <reference lib="dom" />
/**
 * Shared three.js render core for `nodetool.model3d.RenderToImage`.
 *
 * Turns GLB/glTF bytes into a PNG using a WebGL context on an
 * `OffscreenCanvas`. The same module runs in two hosts:
 *
 * - the in-browser workflow runner (main thread or worker), imported
 *   directly by `render.ts`;
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

export interface CameraFraming {
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
): { x: number; y: number; z: number } {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (Math.min(Math.max(elevationDeg, -89.9), 89.9) * Math.PI) / 180;
  return {
    x: distance * Math.cos(el) * Math.sin(az),
    y: distance * Math.sin(el),
    z: distance * Math.cos(el) * Math.cos(az)
  };
}

function addLights(
  scene: THREE.Scene,
  preset: LightingPreset,
  intensity: number,
  cameraPosition: THREE.Vector3,
  target: THREE.Vector3
): void {
  const scaled = (base: number): number => base * intensity;
  // Key/fill/rim ride along with the camera azimuth so the visible side of
  // the model is always lit, whatever angle the user picked.
  const toCamera = cameraPosition.clone().sub(target).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(up, toCamera).normalize();
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);

  const placeDirectional = (
    color: number,
    lightIntensity: number,
    direction: THREE.Vector3
  ): void => {
    const light = new THREE.DirectionalLight(color, lightIntensity);
    light.position.copy(target).add(direction);
    light.target.position.copy(target);
    scene.add(light);
    scene.add(light.target);
  };

  switch (preset) {
    case "studio": {
      scene.add(new THREE.AmbientLight(0xffffff, scaled(0.5)));
      const key = toCamera
        .clone()
        .add(side.clone().multiplyScalar(0.8))
        .add(up.clone().multiplyScalar(0.9));
      placeDirectional(0xffffff, scaled(2.2), key);
      const fill = toCamera
        .clone()
        .sub(side.clone().multiplyScalar(1.1))
        .add(up.clone().multiplyScalar(0.2));
      placeDirectional(0xffffff, scaled(0.8), fill);
      const rim = toCamera
        .clone()
        .negate()
        .add(up.clone().multiplyScalar(1.2));
      placeDirectional(0xffffff, scaled(1.4), rim);
      break;
    }
    case "soft": {
      const hemi = new THREE.HemisphereLight(0xffffff, 0x555566, scaled(1.6));
      hemi.position.copy(target).add(up);
      scene.add(hemi);
      placeDirectional(0xffffff, scaled(0.9), toCamera.clone().add(up));
      break;
    }
    case "flat":
      scene.add(new THREE.AmbientLight(0xffffff, scaled(3)));
      break;
  }
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
    const material = mesh.material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
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

/**
 * Render GLB (or embedded-buffer glTF JSON) bytes to PNG bytes. Must run in a
 * browser context (window or worker) with WebGL and `OffscreenCanvas`.
 */
export async function renderGlbToPng(
  glb: Uint8Array,
  options: Render3DOptions
): Promise<Uint8Array> {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error(
      "RenderToImage needs a browser context with OffscreenCanvas support"
    );
  }
  const width = Math.max(1, Math.round(options.width));
  const height = Math.max(1, Math.round(options.height));

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
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  const aspect = width / height;
  const framing = computeFraming(
    sphere.radius,
    options.fovDeg,
    aspect,
    options.zoom
  );
  const camera = new THREE.PerspectiveCamera(
    options.fovDeg,
    aspect,
    framing.near,
    framing.far
  );
  const offset = orbitOffset(
    options.azimuthDeg,
    options.elevationDeg,
    framing.distance
  );
  camera.position.set(
    sphere.center.x + offset.x,
    sphere.center.y + offset.y,
    sphere.center.z + offset.z
  );
  camera.lookAt(sphere.center);
  camera.updateMatrixWorld(true);

  addLights(
    scene,
    options.lighting,
    options.lightIntensity,
    camera.position,
    sphere.center
  );

  if (!options.transparent) {
    scene.background = new THREE.Color(options.backgroundColor);
  }

  const canvas = new OffscreenCanvas(width, height);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  try {
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (options.transparent) {
      renderer.setClearColor(0x000000, 0);
    }
    renderer.render(scene, camera);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    disposeScene(scene);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
