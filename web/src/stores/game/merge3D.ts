import { z } from "zod";
import { gameAnimationGraph3D, gameAssetBinding3D, gameDocument3D, gameEntity3D, gamePrefab3D, gameScene3D, type GameDocument3D } from "@nodetool-ai/protocol";
import type { DocumentMergeAdapter } from "../documentMerge";
import { authoringMergeScalars } from "./authoringMerge";

const sceneUnit = gameScene3D.omit({ entities: true });
const entityUnit = gameEntity3D.extend({ sceneId: z.string() });
const assetUnit = z.object({ slot: z.string(), binding: gameAssetBinding3D });
const prefabUnit = z.object({ id: z.string(), prefab: gamePrefab3D });
const animationGraphUnit = z.object({ id: z.string(), graph: gameAnimationGraph3D });

function referencedAnimationGraphs(doc: GameDocument3D): Set<string> {
  const entities = [...doc.scenes.flatMap((scene) => scene.entities), ...Object.values(doc.prefabs).flatMap((prefab) => prefab.entities)];
  return new Set(entities.flatMap((entity) => entity.animator3d?.graph === undefined ? [] : [entity.animator3d.graph]));
}

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
      unitFields: ["name", "parentId", "templateOnly", "transform3d", "primitive", "model", "body3d", "collider3d", "character3d", "camera3d", "light3d", "animator3d", "interactionActor", "audioSource", "behaviors", "particles"].map((field) => ({ field }))
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
    },
    {
      kind: "animationGraph",
      read: (doc) => Object.entries(doc.animationGraphs ?? {}).map(([id, graph]) => ({ id, graph })),
      // Entities merge first, so a merged animator may name a graph the server deleted. The draft's copy of that graph is
      // kept, because dropping it would leave a dangling animator3d.graph that fails validation.
      write: (doc, values) => {
        const { animationGraphs: previous, ...rest } = doc;
        const graphs = Object.fromEntries(animationGraphUnit.array().parse(values).map((item) => [item.id, item.graph]));
        for (const graphId of referencedAnimationGraphs(doc)) {
          const kept = previous?.[graphId];
          if (!Object.hasOwn(graphs, graphId) && kept) { graphs[graphId] = kept; }
        }
        return Object.keys(graphs).length === 0 ? rest : { ...rest, animationGraphs: graphs };
      },
      unitId: (value) => animationGraphUnit.parse(value).id,
      unitLabel: (value) => `animation graph ${animationGraphUnit.parse(value).id}`
    }
  ],
  scalars: [...authoringMergeScalars<GameDocument3D>(), ...(["entrySceneId", "inputActions", "inputAxes", "inputBindings", "collisionLayers", "collisionMatrix", "physicsMaterials", "presentation", "audio", "performance"] as const).map((name) => ({
    name,
    read: (doc: GameDocument3D) => doc[name],
    write: (doc: GameDocument3D, value: unknown) => gameDocument3D.parse({ ...doc, [name]: value })
  }))]
};
