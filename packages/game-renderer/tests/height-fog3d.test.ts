import * as THREE from "three";
import { expect, it } from "vitest";
import { GameHeightFog3D, heightFogOpacity3D } from "../src/renderer3d/environment/height-fog.js";

const settings = { kind: "height", color: "#cad9e4", density: 0.2, baseHeight: 0, heightFalloff: 1, maxOpacity: 1 } as const;

it("integrates constant-height rays at their actual altitude", () => {
  expect(heightFogOpacity3D(settings, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBeCloseTo(1 - Math.exp(-2), 12);
  expect(heightFogOpacity3D(settings, { x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 })).toBeCloseTo(1 - Math.exp(-2 / Math.E), 12);
});

it("matches the analytic vertical integral in both viewing directions", () => {
  const low = { x: 0, y: 0, z: 0 };
  const high = { x: 0, y: 1, z: 0 };
  const expected = 1 - Math.exp(-settings.density * (1 - Math.exp(-1)));
  expect(heightFogOpacity3D(settings, low, high)).toBeCloseTo(expected, 12);
  expect(heightFogOpacity3D(settings, high, low)).toBeCloseTo(expected, 12);
});

it("is continuous for horizontal rays and bounded far below the fog base", () => {
  const start = { x: 0, y: 0, z: 0 };
  const horizontal = heightFogOpacity3D(settings, start, { x: 10, y: 0, z: 0 });
  expect(heightFogOpacity3D(settings, start, { x: 10, y: 1e-9, z: 0 })).toBeCloseTo(horizontal, 9);
  expect(heightFogOpacity3D({ ...settings, maxOpacity: 0.75 }, { x: 0, y: -10000, z: 0 }, { x: 100, y: -9999, z: 0 })).toBe(0.75);
  expect(heightFogOpacity3D(settings, start, start)).toBe(0);
});

it("keeps default and linear material hooks untouched, and restores hooks when height fog is removed", () => {
  const fog = new GameHeightFog3D();
  const material = new THREE.MeshStandardMaterial();
  const beforeCompile = material.onBeforeCompile;
  const beforeKey = material.customProgramCacheKey;
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld();
  try {
    fog.configure(scene, camera, undefined);
    expect(material.onBeforeCompile).toBe(beforeCompile);
    expect(material.customProgramCacheKey).toBe(beforeKey);
    fog.configure(scene, camera, settings);
    const configuredCompile = material.onBeforeCompile;
    const configuredKey = material.customProgramCacheKey;
    expect(configuredCompile).not.toBe(beforeCompile);
    fog.configure(scene, camera, { ...settings, density: 0.4 });
    expect(material.onBeforeCompile).toBe(configuredCompile);
    expect(material.customProgramCacheKey).toBe(configuredKey);
    fog.configure(scene, camera, undefined);
    expect(material.onBeforeCompile).toBe(beforeCompile);
    expect(material.customProgramCacheKey).toBe(beforeKey);
  } finally { fog.dispose(); geometry.dispose(); material.dispose(); }
});

it("releases hooks for removed receivers across large scene replacements", () => {
  const fog = new GameHeightFog3D();
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera();
  const geometry = new THREE.BoxGeometry();
  const materials = Array.from({ length: 1000 }, () => new THREE.MeshStandardMaterial());
  const before = materials.map((material) => material.onBeforeCompile);
  for (const material of materials) { scene.add(new THREE.Mesh(geometry, material)); }
  try {
    fog.configure(scene, camera, settings);
    scene.clear();
    fog.configure(scene, camera, settings);
    expect(materials.map((material) => material.onBeforeCompile)).toEqual(before);
  } finally { fog.dispose(); geometry.dispose(); for (const material of materials) { material.dispose(); } }
});


it("retains distinct existing shader identities and dynamic explicit cache keys", () => {
  const fog = new GameHeightFog3D();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const geometry = new THREE.BoxGeometry();
  const first = new THREE.MeshStandardMaterial();
  const second = new THREE.MeshStandardMaterial();
  const custom = new THREE.MeshStandardMaterial();
  first.onBeforeCompile = shader => { shader.vertexShader += "/* first hook */"; };
  second.onBeforeCompile = shader => { shader.vertexShader += "/* second hook */"; };
  let customVersion = 1;
  custom.customProgramCacheKey = () => `custom-${customVersion}`;
  const original = [first, second, custom].map(material => material.customProgramCacheKey());
  scene.add(...[first, second, custom].map(material => new THREE.Mesh(geometry, material)));
  try {
    fog.configure(scene, camera, settings);
    expect(first.customProgramCacheKey()).not.toBe(second.customProgramCacheKey());
    const before = custom.customProgramCacheKey();
    customVersion = 2;
    expect(custom.customProgramCacheKey()).not.toBe(before);
    fog.dispose();
    customVersion = 1;
    expect([first, second, custom].map(material => material.customProgramCacheKey())).toEqual(original);
  } finally { fog.dispose(); geometry.dispose(); for (const material of [first, second, custom]) { material.dispose(); } }
});
