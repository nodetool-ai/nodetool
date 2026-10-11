import type { GameDocument3D, GameEntity3D } from "@nodetool-ai/protocol";

/** Every 3D collision filter bit, matching the 16-bit halves of Rapier's interaction groups. */
const ALL_LAYER_BITS_3D = 0xffff;

export interface CollisionLayerBits3D {
  readonly category: number;
  readonly mask: number;
}

/**
 * Bits for a named layer. The layer at index `i` of `collisionLayers` owns bit `i`.
 * Its mask holds every bit except the layers `collisionMatrix` pairs it with, so a
 * pair listed in either order is excluded from both sides. Callers validate the name.
 *
 * A collider with no layer keeps its raw bits, which default to category 1 and mask
 * 0xffff. Category 1 is bit 0, the bit of `collisionLayers[0]`, so an unlayered default
 * collider shares the first layer's matrix pairs: layers paired with `collisionLayers[0]`
 * do not touch it either.
 */
export function collisionLayerBits3D(document: Pick<GameDocument3D, "collisionLayers" | "collisionMatrix">, layer: string): CollisionLayerBits3D {
  const layers = document.collisionLayers ?? [];
  const bit = (name: string): number => {
    const index = layers.indexOf(name);
    return index < 0 ? 0 : 1 << index;
  };
  let mask = ALL_LAYER_BITS_3D;
  for (const [a, b] of document.collisionMatrix ?? []) {
    if (a === layer) { mask &= ~bit(b); }
    if (b === layer) { mask &= ~bit(a); }
  }
  return { category: bit(layer), mask };
}

function resolveEntities(entities: readonly GameEntity3D[], document: GameDocument3D): GameEntity3D[] {
  return entities.map((entity) => entity.collider3d?.layer === undefined ? entity
    : { ...entity, collider3d: { ...entity.collider3d, ...collisionLayerBits3D(document, entity.collider3d.layer) } });
}

/**
 * Writes derived category and mask bits into every collider that names a layer.
 * A document with no layered collider is returned as the same object, so existing
 * documents simulate exactly as before.
 */
export function resolveCollisionLayers3D(document: GameDocument3D): GameDocument3D {
  const layered = (entities: readonly GameEntity3D[]): boolean => entities.some((entity) => entity.collider3d?.layer !== undefined);
  if (!document.scenes.some((scene) => layered(scene.entities)) && !Object.values(document.prefabs).some((prefab) => layered(prefab.entities))) {
    return document;
  }
  return {
    ...document,
    scenes: document.scenes.map((scene) => ({ ...scene, entities: resolveEntities(scene.entities, document) })),
    prefabs: Object.fromEntries(Object.entries(document.prefabs).map(([prefabId, prefab]) => [prefabId, { ...prefab, entities: resolveEntities(prefab.entities, document) }]))
  };
}

export interface CollisionLayerIssue3D {
  readonly code: "unknown_collision_layer" | "duplicate_collision_pair" | "collision_layer_bits_conflict";
  readonly path: (string | number)[];
  readonly message: string;
}

/** Reference checks for layer names in collisionMatrix and on colliders in scenes and prefabs. */
export function collisionLayerIssues3D(document: GameDocument3D): CollisionLayerIssue3D[] {
  const issues: CollisionLayerIssue3D[] = [];
  const layers = new Set(document.collisionLayers ?? []);
  const unknown = (name: string, path: (string | number)[]): void => {
    if (!layers.has(name)) { issues.push({ code: "unknown_collision_layer", path, message: `Collision layer ${name} is not declared in collisionLayers` }); }
  };
  const pairs = new Set<string>();
  for (const [index, [a, b]] of (document.collisionMatrix ?? []).entries()) {
    unknown(a, ["collisionMatrix", index, 0]);
    unknown(b, ["collisionMatrix", index, 1]);
    const key = JSON.stringify([a, b].sort());
    if (pairs.has(key)) { issues.push({ code: "duplicate_collision_pair", path: ["collisionMatrix", index], message: `Layers ${a} and ${b} are already paired` }); }
    pairs.add(key);
  }
  const check = (entities: readonly GameEntity3D[], path: (string | number)[]): void => {
    for (const [index, entity] of entities.entries()) {
      const collider = entity.collider3d;
      if (collider?.layer === undefined) { continue; }
      const colliderPath = [...path, index, "collider3d"];
      unknown(collider.layer, [...colliderPath, "layer"]);
      for (const [key, fallback] of [["category", 1], ["mask", ALL_LAYER_BITS_3D]] as const) {
        if (collider[key] !== fallback) {
          issues.push({ code: "collision_layer_bits_conflict", path: [...colliderPath, key],
            message: `A collider with a layer derives its ${key} bits. Reset ${key} to ${fallback} or remove the layer` });
        }
      }
    }
  };
  for (const [index, scene] of document.scenes.entries()) { check(scene.entities, ["scenes", index, "entities"]); }
  for (const [prefabId, prefab] of Object.entries(document.prefabs)) { check(prefab.entities, ["prefabs", prefabId, "entities"]); }
  return issues;
}
