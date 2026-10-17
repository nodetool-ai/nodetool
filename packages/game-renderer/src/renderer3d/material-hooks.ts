import * as THREE from "three";

type Feature = "cascades" | "heightFog";
type Compile = THREE.Material["onBeforeCompile"];
interface Hooks {
  readonly compile: Compile;
  readonly key: THREE.Material["customProgramCacheKey"];
  readonly ownCompile: boolean;
  readonly ownKey: boolean;
  readonly defaultKey: string | undefined;
  readonly features: Map<Feature, { compile: Compile; suffix: string }>;
}
const hooks = new WeakMap<THREE.Material, Hooks>();
const order: readonly Feature[] = ["cascades", "heightFog"];

/** Fog and cascades remove only their own contribution, regardless of activation order. */
export function setGameMaterialHook(material: THREE.Material, feature: Feature, compile: Compile, suffix: string): void {
  let state = hooks.get(material);
  if (!state) {
    state = { compile: material.onBeforeCompile, key: material.customProgramCacheKey,
      ownCompile: Object.hasOwn(material, "onBeforeCompile"), ownKey: Object.hasOwn(material, "customProgramCacheKey"),
      defaultKey: material.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey ? material.onBeforeCompile.toString() : undefined,
      features: new Map() };
    hooks.set(material, state);
    const base = state;
    material.onBeforeCompile = (shader, renderer) => {
      base.compile.call(material, shader, renderer);
      for (const name of order) { base.features.get(name)?.compile.call(material, shader, renderer); }
    };
    material.customProgramCacheKey = () => {
      let key = base.defaultKey ?? base.key.call(material);
      for (const name of order) { key += base.features.get(name)?.suffix ?? ""; }
      return key;
    };
  }
  state.features.set(feature, { compile, suffix });
  material.needsUpdate = true;
}

export function removeGameMaterialHook(material: THREE.Material, feature: Feature): void {
  const state = hooks.get(material);
  if (!state || !state.features.delete(feature)) { return; }
  if (state.features.size === 0) {
    if (state.ownCompile) { material.onBeforeCompile = state.compile; }
    else { Reflect.deleteProperty(material, "onBeforeCompile"); }
    if (state.ownKey) { material.customProgramCacheKey = state.key; }
    else { Reflect.deleteProperty(material, "customProgramCacheKey"); }
    hooks.delete(material);
  }
  material.needsUpdate = true;
}
