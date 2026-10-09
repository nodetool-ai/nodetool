import type { GameBehavior, GameDocument, GameEntity, GameScene } from "@nodetool-ai/protocol/game.js";

import type { DocumentMergeAdapter } from "../documentMerge";
import { authoringMergeScalars } from "./authoringMerge";

interface SceneUnit { id: string; name: string; music?: GameScene["music"] }
type EntityUnit = Omit<GameEntity, "behaviors"> & { sceneId: string };
interface BehaviorUnit { sceneId: string; entityId: string; index: number; behavior: GameBehavior }
interface BackgroundUnit { sceneId: string; id: string; layer: NonNullable<GameScene["backgrounds"]>[number] }
interface LightingUnit { sceneId: string; lighting: GameScene["lighting"] }
interface AssetUnit { slot: string; binding: GameDocument["assets"][string] }

function key(unit: unknown): string {
  const item = unit as { id?: string; sceneId?: string; slot?: string };
  return item.slot ?? (item.sceneId ? `${item.sceneId}:${item.id ?? ""}` : item.id ?? "");
}

export const gameMergeAdapter: DocumentMergeAdapter<GameDocument> = {
  collections: [
    {
      kind: "scene",
      read: (doc) => doc.scenes.map(({ id, name, music }): SceneUnit => ({ id, name, music })),
      write: (doc, units) => ({ ...doc, scenes: (units as SceneUnit[]).map((unit) => {
        const existing = doc.scenes.find((scene) => scene.id === unit.id);
        return { ...(existing ?? { id: unit.id, entities: [] }), name: unit.name, music: unit.music };
      }) }),
      unitId: key,
      unitLabel: (unit) => `scene ${key(unit)}`,
      unitFields: [{ field: "name" }, { field: "music" }]
    },
    {
      kind: "entity",
      read: (doc) => doc.scenes.flatMap((scene) => scene.entities.map((entity): EntityUnit => {
        const { behaviors: _behaviors, ...fields } = entity;
        return { sceneId: scene.id, ...fields };
      })),
      write: (doc, units) => ({ ...doc, scenes: doc.scenes.map((scene) => ({ ...scene,
        entities: (units as EntityUnit[]).filter((unit) => unit.sceneId === scene.id).map(({ sceneId: _sceneId, ...fields }) => ({
          ...fields, behaviors: scene.entities.find((entity) => entity.id === fields.id)?.behaviors ?? []
        })) })) }),
      unitId: key,
      unitLabel: (unit) => `entity ${key(unit)}`,
      unitFields: ["id", "name", "parentId", "templateOnly", "transform2d", "sprite", "tilemap", "camera2d", "body2d",
        "collider2d", "animator", "visualAnimation", "audioSource", "light2d"].map((field) => ({ field }))
    },
    {
      kind: "behavior",
      read: (doc) => doc.scenes.flatMap((scene) => scene.entities.flatMap((entity) => entity.behaviors.map((behavior, index): BehaviorUnit => ({
        sceneId: scene.id, entityId: entity.id, index, behavior
      })))),
      write: (doc, units) => ({ ...doc, scenes: doc.scenes.map((scene) => ({ ...scene,
        entities: scene.entities.map((entity) => ({ ...entity, behaviors: (units as BehaviorUnit[])
          .filter((unit) => unit.sceneId === scene.id && unit.entityId === entity.id)
          .sort((a, b) => a.index - b.index).map((unit) => unit.behavior) })) })) }),
      unitId: (unit) => {
        const item = unit as BehaviorUnit;
        return `${item.sceneId}:${item.entityId}:${item.index}`;
      },
      unitLabel: (unit) => `behavior ${(unit as BehaviorUnit).index} on ${(unit as BehaviorUnit).entityId}`
    },
    {
      kind: "background",
      read: (doc) => doc.scenes.flatMap((scene) => (scene.backgrounds ?? []).map((layer): BackgroundUnit => ({ sceneId: scene.id, id: layer.id, layer }))),
      write: (doc, units) => ({ ...doc, scenes: doc.scenes.map((scene) => ({ ...scene,
        backgrounds: (units as BackgroundUnit[]).filter((unit) => unit.sceneId === scene.id).map((unit) => unit.layer) })) }),
      unitId: key,
      unitLabel: (unit) => `background ${key(unit)}`
    },
    {
      kind: "lighting",
      read: (doc) => doc.scenes.filter((scene) => scene.lighting).map((scene): LightingUnit => ({ sceneId: scene.id, lighting: scene.lighting })),
      write: (doc, units) => ({ ...doc, scenes: doc.scenes.map((scene) => ({ ...scene,
        lighting: (units as LightingUnit[]).find((unit) => unit.sceneId === scene.id)?.lighting })) }),
      unitId: (unit) => (unit as LightingUnit).sceneId,
      unitLabel: (unit) => `lighting in ${(unit as LightingUnit).sceneId}`
    },
    {
      kind: "asset",
      read: (doc) => Object.entries(doc.assets).map(([slot, binding]): AssetUnit => ({ slot, binding })),
      write: (doc, units) => ({ ...doc, assets: Object.fromEntries((units as AssetUnit[]).map((unit) => [unit.slot, unit.binding])) }),
      unitId: key,
      unitLabel: (unit) => `asset ${key(unit)}`
    }
  ],
  scalars: [
    ...authoringMergeScalars<GameDocument>(),
    { name: "entrySceneId", read: (doc) => doc.entrySceneId, write: (doc, value) => ({ ...doc, entrySceneId: value as string }) },
    { name: "pixelsPerUnit", read: (doc) => doc.pixelsPerUnit, write: (doc, value) => ({ ...doc, pixelsPerUnit: value as number }) },
    { name: "inputActions", read: (doc) => doc.inputActions, write: (doc, value) => ({ ...doc, inputActions: value as string[] }) },
    { name: "inputBindings", read: (doc) => doc.inputBindings, write: (doc, value) => {
      const { inputBindings: _previous, ...rest } = doc;
      return value === undefined ? rest : { ...rest, inputBindings: value as GameDocument["inputBindings"] };
    } },
    { name: "collisionLayers", read: (doc) => doc.collisionLayers, write: (doc, value) => ({ ...doc, collisionLayers: value as string[] | undefined }) },
    { name: "renderEffects", read: (doc) => doc.renderEffects, write: (doc, value) => ({ ...doc, renderEffects: value as GameDocument["renderEffects"] }) },
    { name: "hudEffectOrder", read: (doc) => doc.hudEffectOrder, write: (doc, value) => ({ ...doc, hudEffectOrder: value as GameDocument["hudEffectOrder"] }) }
  ]
};

/** Apply one offered external unit while retaining the other local units. */
export function acceptServerGameUnit(current: GameDocument, server: GameDocument, kind: string, id: string): GameDocument {
  const collection = gameMergeAdapter.collections.find((entry) => entry.kind === kind);
  if (collection) {
    const units = collection.read(current) ?? [];
    const replacement = (collection.read(server) ?? []).find((unit) => collection.unitId(unit) === id);
    const filtered = units.filter((unit) => collection.unitId(unit) !== id);
    if (replacement) filtered.push(replacement);
    return collection.write(current, filtered);
  }
  const scalar = gameMergeAdapter.scalars?.find((entry) => entry.name === id);
  return scalar ? scalar.write(current, scalar.read(server)) : current;
}
