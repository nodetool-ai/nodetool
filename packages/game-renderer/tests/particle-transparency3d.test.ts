import * as THREE from "three";
import type { RenderItem } from "three/src/renderers/webgl/WebGLRenderLists.js";
import { expect, it } from "vitest";
import { ParticleTransparency3D } from "../src/particles/transparency3d.js";

function item(object: THREE.Mesh, z: number, groupOrder = 0): RenderItem {
  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  if (!material) { throw new Error("Transparent draw control requires a material"); }
  return { id: object.id, object, geometry: object.geometry, material,
    materialVariant: 0, groupOrder, renderOrder: object.renderOrder, z, group: null };
}

it.each([new THREE.PerspectiveCamera(60, 1, 0.1, 30), new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 30)])(
  "merges particle depths with ordinary transparency and preserves explicit priorities for %s", camera => {
    const sorting = new ParticleTransparency3D();
    const geometry = new THREE.PlaneGeometry();
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    const far = new THREE.Mesh(geometry, material);
    const near = new THREE.Mesh(geometry, material);
    const ordinary = new THREE.Mesh(geometry, material);
    const clip = (depth: number): number => new THREE.Vector4(0, 0, -depth, 1).applyMatrix4(camera.projectionMatrix).z;
    try {
      sorting.add(far, 7, 0, camera); sorting.add(near, 3, 1, camera);
      // The particle mesh origins deliberately lie: sorting must use submitted particle depths.
      const entries = [item(near, clip(20)), item(ordinary, clip(5)), item(far, clip(1))];
      expect(entries.sort(sorting.compare).map(value => value.object)).toEqual([far, ordinary, near]);
      sorting.add(far, 3, 0, camera);
      const tied = [item(near, clip(20)), item(far, clip(1)), item(ordinary, clip(3))];
      expect(tied.sort(sorting.compare).map(value => value.object)).toEqual([ordinary, far, near]);
      ordinary.renderOrder = -1;
      expect(sorting.compare(item(ordinary, clip(1)), item(far, clip(20)))).toBeLessThan(0);
      ordinary.renderOrder = 0;
      expect(sorting.compare(item(ordinary, clip(20), 1), item(far, clip(1)))).toBeGreaterThan(0);
      sorting.clear();
      expect(sorting.compare(item(far, clip(1)), item(near, clip(7)))).toBeGreaterThan(0);
      expect(sorting.compare(item(far, clip(3)), item(near, clip(3)))).toBe(far.id - near.id);
    } finally { geometry.dispose(); material.dispose(); }
  });

it("collects current visible transparent draw depths, excluding other sorting buckets and non-rendered groups", () => {
  const sorting = new ParticleTransparency3D();
  const scene = new THREE.Scene();
  const particles = new THREE.Group(); scene.add(particles);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 30); camera.updateMatrixWorld();
  const geometry = new THREE.PlaneGeometry();
  const material = new THREE.MeshBasicMaterial({ transparent: true });
  const hiddenMaterial = material.clone(); hiddenMaterial.visible = false;
  const physical = new THREE.MeshPhysicalMaterial({ transparent: true, transmission: 1 });
  const grouped = geometry.clone(); grouped.clearGroups(); grouped.addGroup(0, 3, 0); grouped.addGroup(3, 3, 1);
  const mesh = (parent: THREE.Object3D, z: number): THREE.Mesh => {
    const value = new THREE.Mesh(geometry, material); value.position.z = z; parent.add(value); return value;
  };
  const parent = new THREE.Group(); parent.position.z = -2; scene.add(parent);
  const visible = mesh(parent, -3);
  const hidden = new THREE.Group(); hidden.visible = false; scene.add(hidden); mesh(hidden, -6);
  const priority = new THREE.Group(); priority.renderOrder = 2; scene.add(priority); mesh(priority, -7);
  mesh(scene, -8).layers.set(1);
  mesh(scene, -9).renderOrder = 1;
  mesh(particles, -10);
  mesh(scene, -11).position.x = 100;
  const groupedMesh = new THREE.Mesh(grouped, [hiddenMaterial, material]); groupedMesh.position.z = -4; scene.add(groupedMesh);
  const noGroups = new THREE.Mesh(geometry, [material]); noGroups.position.z = -12; scene.add(noGroups);
  const transmission = new THREE.Mesh(geometry, physical); transmission.position.z = -13; scene.add(transmission);
  const instances = new THREE.InstancedMesh(geometry, material, 1);
  instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, -6)); scene.add(instances);
  try {
    expect(sorting.depths(scene, camera, particles).sort((a, b) => a - b)).toEqual([4, 5, 6]);
    visible.position.z = -8;
    hiddenMaterial.visible = true; material.visible = false;
    expect(sorting.depths(scene, camera, particles)).toEqual([4]);
  } finally { instances.dispose(); grouped.dispose(); geometry.dispose(); material.dispose(); hiddenMaterial.dispose(); physical.dispose(); }
});
