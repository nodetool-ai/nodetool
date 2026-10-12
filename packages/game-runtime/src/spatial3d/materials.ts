import type { GameCollider3D, GameDocument3D, GameEntity3D, GamePhysicsMaterial3D } from "@nodetool-ai/protocol";

const INLINE_DEFAULTS = { friction: 0.5, restitution: 0 } as const;

/** The friction, restitution and combine rules a collider takes from a named material. */
export function physicsMaterialSettings3D(material: GamePhysicsMaterial3D): Pick<GameCollider3D, "friction" | "restitution" | "frictionCombine" | "restitutionCombine"> {
  return { friction: material.friction, restitution: material.restitution, frictionCombine: material.frictionCombine, restitutionCombine: material.restitutionCombine };
}

/** Own-key lookup, so a name such as "toString" never resolves to an inherited property. */
function namedMaterial(document: GameDocument3D, name: string): GamePhysicsMaterial3D | undefined {
  const materials = document.physicsMaterials;
  return materials && Object.hasOwn(materials, name) ? materials[name] : undefined;
}

function resolveEntities(entities: readonly GameEntity3D[], document: GameDocument3D): GameEntity3D[] {
  return entities.map((entity) => {
    const collider = entity.collider3d;
    const material = collider?.physicsMaterial === undefined ? undefined : namedMaterial(document, collider.physicsMaterial);
    return collider && material ? { ...entity, collider3d: { ...collider, ...physicsMaterialSettings3D(material) } } : entity;
  });
}

/**
 * Writes each named material's values into the colliders that reference it.
 * A document with no material reference is returned as the same object, so existing
 * documents simulate exactly as before.
 */
export function resolvePhysicsMaterials3D(document: GameDocument3D): GameDocument3D {
  const referenced = (entities: readonly GameEntity3D[]): boolean => entities.some((entity) => entity.collider3d?.physicsMaterial !== undefined);
  if (!document.scenes.some((scene) => referenced(scene.entities)) && !Object.values(document.prefabs).some((prefab) => referenced(prefab.entities))) {
    return document;
  }
  return {
    ...document,
    scenes: document.scenes.map((scene) => ({ ...scene, entities: resolveEntities(scene.entities, document) })),
    prefabs: Object.fromEntries(Object.entries(document.prefabs).map(([prefabId, prefab]) => [prefabId, { ...prefab, entities: resolveEntities(prefab.entities, document) }]))
  };
}

export interface PhysicsMaterialIssue3D {
  readonly code: "unknown_physics_material" | "physics_material_conflict";
  readonly path: (string | number)[];
  readonly message: string;
}

/** Reference checks for physicsMaterial names on colliders in scenes and prefabs. */
export function physicsMaterialIssues3D(document: GameDocument3D): PhysicsMaterialIssue3D[] {
  const issues: PhysicsMaterialIssue3D[] = [];
  const check = (entities: readonly GameEntity3D[], path: (string | number)[]): void => {
    for (const [index, entity] of entities.entries()) {
      const collider = entity.collider3d;
      if (collider?.physicsMaterial === undefined) { continue; }
      const colliderPath = [...path, index, "collider3d"];
      if (!namedMaterial(document, collider.physicsMaterial)) {
        issues.push({ code: "unknown_physics_material", path: [...colliderPath, "physicsMaterial"],
          message: `Physics material ${collider.physicsMaterial} is not declared in physicsMaterials` });
      }
      for (const [key, fallback] of Object.entries(INLINE_DEFAULTS) as [keyof typeof INLINE_DEFAULTS, number][]) {
        if (collider[key] !== fallback) {
          issues.push({ code: "physics_material_conflict", path: [...colliderPath, key],
            message: `A collider with a physics material takes its ${key} from the material. Reset ${key} to ${fallback} or remove the material` });
        }
      }
      for (const key of ["frictionCombine", "restitutionCombine"] as const) {
        if (collider[key] !== undefined) {
          issues.push({ code: "physics_material_conflict", path: [...colliderPath, key],
            message: `A collider with a physics material takes its ${key} from the material. Remove ${key} or remove the material` });
        }
      }
    }
  };
  for (const [index, scene] of document.scenes.entries()) { check(scene.entities, ["scenes", index, "entities"]); }
  for (const [prefabId, prefab] of Object.entries(document.prefabs)) { check(prefab.entities, ["prefabs", prefabId, "entities"]); }
  return issues;
}
