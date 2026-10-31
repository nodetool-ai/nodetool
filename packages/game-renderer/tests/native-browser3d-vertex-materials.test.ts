import { expect, it, vi } from "vitest";
import { Mesh, ShaderLib } from "three";
import { NativePBRMaterials } from "../src/native-cpp/3d-materials.js";
import { NativeModelInstance } from "../src/native-cpp/model3d-instance.js";
import { nativeVertexAlphaShadowShader, NATIVE_FINITE_HDR_FRAGMENT } from "../src/native-cpp/3d-shaders.js";
import type { NativePreparedModel } from "../src/native-cpp/model3d-types.js";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function model(): NativePreparedModel {
  const vertices = [[0, 0, 0], [1, 0, 0], [0, 1, 0]].map(position => ({ position, normal: [0, 0, 1], uv: [0, 0], joints: [0, 0, 0, 0], weights: [1, 0, 0, 0] }));
  const colored = vertices.map(vertex => ({ ...vertex, color: [0.25, 0.5, 0.75, 0.3] }));
  return {
    meshes: [[{ vertices, indices: [0, 1, 2], material: 0 }, { vertices: colored, indices: [0, 1, 2], material: 0 }, { vertices: colored, indices: [0, 1, 2], material: 0 }]],
    materials: [{ color: [0.5, 0.5, 0.5, 0.6], metallic: 0, roughness: 1, image: -1, doubleSided: false, emissive: [0.2, 0.3, 0.4], emissiveStrength: 2.8, alphaMode: "MASK", alphaCutoff: 0.5 }],
    images: [], nodes: [{ local: identity, children: [], mesh: 0, skin: -1 }], roots: [0], skins: [], animations: []
  };
}

it("owns cached linear RGBA variants without changing a shared uncolored material or its hooks", () => {
  const source = model(), materials = new NativePBRMaterials(source, []);
  const original = materials.materials[0], originalDispose = vi.spyOn(original, "dispose");
  const instance = new NativeModelInstance(source, materials.materials);
  const meshes: Mesh[] = [];
  instance.root.traverse(object => { if (object instanceof Mesh) { meshes.push(object); } });
  const colored = meshes[1].material;
  expect(meshes[0].material).toBe(original);
  expect(original.vertexColors).toBe(false);
  expect(meshes[0].geometry.getAttribute("color")).toBeUndefined();
  expect(meshes[2].material).toBe(colored);
  expect(Array.isArray(colored)).toBe(false);
  if (Array.isArray(colored)) { throw new Error("Expected one primitive material"); }
  expect(colored.vertexColors).toBe(true);
  expect(colored.onBeforeCompile).toBe(original.onBeforeCompile);
  expect(colored.customProgramCacheKey()).toBe(original.customProgramCacheKey());
  expect(Array.from(meshes[1].geometry.getAttribute("color").array).slice(0, 3)).toEqual([0.25, 0.5, 0.75]);
  expect(meshes[1].geometry.getAttribute("color").itemSize).toBe(4);
  expect(original.emissive.toArray()).toEqual([0.2, 0.3, 0.4]);
  expect(original.emissiveIntensity).toBe(2.8);
  expect(meshes[1].customDepthMaterial).toBe(meshes[2].customDepthMaterial);
  expect(meshes[1].customDistanceMaterial).toBe(meshes[2].customDistanceMaterial);
  const disposeColor = vi.spyOn(colored, "dispose");
  const depth = meshes[1].customDepthMaterial;
  if (!depth) { throw new Error("Missing alpha shadow material"); }
  const disposeDepth = vi.spyOn(depth, "dispose");
  instance.dispose();
  expect(disposeColor).toHaveBeenCalledOnce();
  expect(disposeDepth).toHaveBeenCalledOnce();
  expect(originalDispose).not.toHaveBeenCalled();
  materials.dispose();
});

it("adds vertex and factor alpha before MASK testing in both shadow shader paths", () => {
  for (const source of [ShaderLib.depth, ShaderLib.distance]) {
    const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader };
    nativeVertexAlphaShadowShader(shader);
    expect(shader.vertexShader).toContain("#include <color_vertex>");
    expect(shader.fragmentShader).toContain("diffuseColor.a *= nativeOpacity;\n#include <color_fragment>\n#include <alphatest_fragment>");
    expect(shader.fragmentShader.match(/#include <map_fragment>/g)).toHaveLength(1);
  }
});

it("retains default emission and guards half-float writes without limiting authored intensity", () => {
  const source = model();
  const materials = new NativePBRMaterials({ ...source, materials: source.materials.map(({ emissiveStrength: _strength, ...entry }) => entry) }, []);
  expect(materials.materials[0].emissiveIntensity).toBe(1);
  expect(NATIVE_FINITE_HDR_FRAGMENT).toContain("isnan(outgoingLight.r) ? 0.0");
  expect(NATIVE_FINITE_HDR_FRAGMENT).toContain("clamp(outgoingLight.r, 0.0, 65504.0)");
  materials.dispose();
});
