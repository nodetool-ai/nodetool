import { z } from "zod";
import { gameAssetBinding3D, gameDocument3D, gameEntity3D, gamePrefab3D, gameScene3D, type GameDocument3D } from "@nodetool-ai/protocol";
import type { DocumentMergeAdapter } from "../documentMerge";
import { authoringMergeScalars } from "./authoringMerge";

const sceneUnit = gameScene3D.omit({ entities: true });
const entityUnit = gameEntity3D.extend({ sceneId: z.string() });
const assetUnit = z.object({ slot: z.string(), binding: gameAssetBinding3D });
const prefabUnit = z.object({ id: z.string(), prefab: gamePrefab3D });

export const gameMergeAdapter3D: DocumentMergeAdapter<GameDocument3D> = {
  collections: [
    {
      kind: "scene",
      read: (doc) => doc.scenes.map(({ entities: _entities, ...scene }) => scene),
      write: (doc, values) => ({ ...doc, scenes: values.map((value) => {
        const scene = sceneUnit.parse(value);
        return { ...scene, entities: doc.scenes.find((item) => item.id === scene.id)?.entities ?? [] };
      }) }),
      unitId: (value) => sceneUnit.parse(value).id,
      unitLabel: (value) => `scene ${sceneUnit.parse(value).name}`,
      unitFields: ["name", "activeCameraId", "environment", "gravity", "music"].map((field) => ({ field }))
    },
    {
      kind: "entity",
      read: (doc) => doc.scenes.flatMap((scene) => scene.entities.map((entity) => ({ ...entity, sceneId: scene.id }))),
      write: (doc, values) => {
        const units = entityUnit.array().parse(values);
        return { ...doc, scenes: doc.scenes.map((scene) => ({ ...scene,
          entities: units.filter((value) => value.sceneId === scene.id).map(({ sceneId: _sceneId, ...entity }) => entity) })) };
      },
      unitId: (value) => { const entity = entityUnit.parse(value); return `${entity.sceneId}:${entity.id}`; },
      unitLabel: (value) => `entity ${entityUnit.parse(value).id}`,
      unitFields: ["name", "parentId", "templateOnly", "transform3d", "primitive", "model", "body3d", "collider3d", "character3d", "camera3d", "light3d", "animator3d", "interactionActor", "audioSource", "behaviors"].map((field) => ({ field }))
    },
    {
      kind: "asset",
      read: (doc) => Object.entries(doc.assets).map(([slot, binding]) => ({ slot, binding })),
      write: (doc, values) => ({ ...doc, assets: Object.fromEntries(assetUnit.array().parse(values).map((item) => [item.slot, item.binding])) }),
      unitId: (value) => assetUnit.parse(value).slot,
      unitLabel: (value) => `asset ${assetUnit.parse(value).slot}`
    },
    {
      kind: "prefab",
      read: (doc) => Object.entries(doc.prefabs).map(([id, prefab]) => ({ id, prefab })),
      write: (doc, values) => ({ ...doc, prefabs: Object.fromEntries(prefabUnit.array().parse(values).map((item) => [item.id, item.prefab])) }),
      unitId: (value) => prefabUnit.parse(value).id,
      unitLabel: (value) => `prefab ${prefabUnit.parse(value).id}`
    }
  ],
  scalars: [...authoringMergeScalars<GameDocument3D>(), ...(["entrySceneId", "inputActions", "inputAxes", "inputBindings", "collisionLayers", "presentation", "audio"] as const).map((name) => ({
    name,
    read: (doc: GameDocument3D) => doc[name],
    write: (doc: GameDocument3D, value: unknown) => gameDocument3D.parse({ ...doc, [name]: value })
  }))]
};
