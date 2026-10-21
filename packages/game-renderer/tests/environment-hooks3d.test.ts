import * as THREE from "three";
import { expect, it } from "vitest";
import { GameHeightFog3D } from "../src/renderer3d/environment/height-fog.js";
import { GameCascadedShadows3D } from "../src/renderer3d/shadows/cascades.js";

const fogSettings = { kind: "height", color: "#cad9e4", density: 0.2, baseHeight: 0, heightFalloff: 1, maxOpacity: 1 } as const;
const sunSettings = { kind: "directional", color: "#ffffff", intensity: 1, castShadow: true } as const;

function fixture() {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  const geometry = new THREE.BoxGeometry();
  scene.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.updateMatrixWorld(true);
  const sun = new THREE.DirectionalLight();
  const fog = new GameHeightFog3D();
  const cascades = new GameCascadedShadows3D();
  const configure = (height: boolean, count: 0 | 2 | 4, fogFirst: boolean): void => {
    const configureFog = (): void => fog.configure(scene, camera, height ? fogSettings : undefined);
    const configureShadows = (): void => {
      if (count === 0) { cascades.detach(); }
      else { cascades.update(scene, sun, sunSettings, { count, split: 0.5, maxDistance: 60 }, 512, camera); cascades.bindMaterials(scene); }
    };
    if (fogFirst) { configureFog(); configureShadows(); } else { configureShadows(); configureFog(); }
  };
  const sample = () => {
    const shader = { uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: "#include <lights_pars_begin>\n#include <fog_pars_vertex>\n#include <fog_vertex>",
      fragmentShader: "#include <lights_pars_begin>\n#include <lights_fragment_begin>\n#include <fog_pars_fragment>\n#include <fog_fragment>" };
    Reflect.apply(material.onBeforeCompile, material, [shader, {}]);
    return { vertex: shader.vertexShader, fragment: shader.fragmentShader,
      uniforms: Object.keys(shader.uniforms).sort(), key: material.customProgramCacheKey(), defines: { ...material.defines } };
  };
  return { material, configure, sample, dispose: () => { fog.dispose(); cascades.detach(); geometry.dispose(); material.dispose(); } };
}

it.each([false, true])("preserves both shader features through persistent-material edits, fog first %s", fogFirst => {
  const reused = fixture();
  try {
    for (const [height, count] of [[true, 2], [true, 0], [true, 4], [false, 4], [true, 2], [false, 0], [false, 2], [true, 2], [false, 2]] as const) {
      const fresh = fixture();
      try {
        reused.configure(height, count, fogFirst);
        fresh.configure(height, count, fogFirst);
        expect(reused.sample(), JSON.stringify({ height, count, fogFirst })).toEqual(fresh.sample());
      } finally { fresh.dispose(); }
    }
  } finally { reused.dispose(); }
});

it("retains distinct default shader identities and dynamic explicit cache keys under cascades", () => {
  const first = fixture(); const second = fixture(); const dynamic = fixture();
  let version = 1;
  first.material.onBeforeCompile = shader => { shader.uniforms.red = { value: 1 }; };
  second.material.onBeforeCompile = shader => { shader.uniforms.green = { value: 1 }; };
  dynamic.material.customProgramCacheKey = () => `external-${version}`;
  try {
    first.configure(false, 2, false); second.configure(false, 2, false); dynamic.configure(true, 2, true);
    expect(first.sample().key).not.toBe(second.sample().key);
    expect(first.sample().uniforms).toContain("red");
    expect(second.sample().uniforms).toContain("green");
    const key = dynamic.sample().key;
    version = 2;
    expect(dynamic.sample().key).not.toBe(key);
  } finally { first.dispose(); second.dispose(); dynamic.dispose(); }
});
