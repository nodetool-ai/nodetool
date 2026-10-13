import { z } from "zod";
import { gameAnimationGraph3D, gameAssetBinding3D, gameDocument3D, gameEntity3D, gameMaterial3D, gamePrefab3D, gameScene3D, type GameDocument3D, type GameEntity3D, type GameMaterial3D } from "@nodetool-ai/protocol";
import { validateGame3D } from "@nodetool-ai/game-runtime";
import { mergeByUnits, type DocumentMergeAdapter, type MergeConflict, type MergeOptions, type MergeResult } from "../documentMerge";
import { authoringMergeScalars } from "./authoringMerge";

const sceneUnit = gameScene3D.omit({ entities: true });
const entityUnit = gameEntity3D.extend({ sceneId: z.string() });
const assetUnit = z.object({ slot: z.string(), binding: gameAssetBinding3D });
const prefabUnit = z.object({ id: z.string(), prefab: gamePrefab3D });
const materialUnit = z.object({ id: z.string(), material: gameMaterial3D });
const animationGraphUnit = z.object({ id: z.string(), graph: gameAnimationGraph3D });

function referencedAnimationGraphs(doc: GameDocument3D): Set<string> {
  const entities = [...doc.scenes.flatMap((scene) => scene.entities), ...Object.values(doc.prefabs).flatMap((prefab) => prefab.entities)];
  return new Set(entities.flatMap((entity) => entity.animator3d?.graph === undefined ? [] : [entity.animator3d.graph]));
}

const MATERIAL_TEXTURE_FIELDS = ["baseColorTexture", "normalTexture", "ormTexture", "emissiveTexture"] as const;

function materialEntities(doc: GameDocument3D): Map<string, GameEntity3D> {
  const entities = new Map<string, GameEntity3D>();
  for (const scene of doc.scenes) {
    for (const entity of scene.entities) { entities.set(JSON.stringify(["scene", scene.id, entity.id]), entity); }
  }
  for (const [id, prefab] of Object.entries(doc.prefabs)) {
    for (const entity of prefab.entities) { entities.set(JSON.stringify(["prefab", id, entity.id]), entity); }
  }
  return entities;
}

function retainReferencedMaterials(doc: GameDocument3D, sources: readonly GameDocument3D[], conflicts?: MergeConflict[]): GameDocument3D {
  const entities = materialEntities(doc);
  const indexedSources = sources.map((source) => ({ document: source, entities: materialEntities(source) }));
  const referenced = new Set([...Object.keys(doc.materials ?? {}), ...[...entities.values()].flatMap((entity) => [entity.primitive?.materialId, entity.model?.materialId])
    .filter((id): id is string => id !== undefined)]);
  const conflictedAssets = new Set(conflicts?.filter((conflict) => conflict.unit.kind === "asset").map((conflict) => conflict.unit.id));
  let restored: GameDocument3D["materials"];
  let restoredAssets: GameDocument3D["assets"] | undefined;
  function retainImages(material: Partial<GameMaterial3D>, candidates: readonly GameDocument3D[]): void {
    for (const field of MATERIAL_TEXTURE_FIELDS) {
      const slot = material[field]?.assetId;
      if (!slot) { continue; }
      const current = Object.hasOwn(doc.assets, slot) ? doc.assets[slot] : undefined;
      if (current?.mediaKind === "image") { continue; }
      const source = candidates.find((candidate) => Object.hasOwn(candidate.assets, slot) && candidate.assets[slot].mediaKind === "image");
      const binding = source?.assets[slot];
      if (!binding) { continue; }
      restoredAssets ??= { ...doc.assets };
      Object.defineProperty(restoredAssets, slot, { value: binding, enumerable: true, writable: true, configurable: true });
      if (current && conflicts && !conflictedAssets.has(slot)) {
        conflictedAssets.add(slot);
        conflicts.push({ unit: { kind: "asset", id: slot, label: `asset ${slot}` },
          external: sources[1] && Object.hasOwn(sources[1].assets, slot) ? { slot, binding: sources[1].assets[slot] } : null,
          draft: sources[0] && Object.hasOwn(sources[0].assets, slot) ? { slot, binding: sources[0].assets[slot] } : null, reason: "edited" });
      }
    }
  }
  for (const materialId of referenced) {
    const materialSource = sources.find((source) => source.materials && Object.hasOwn(source.materials, materialId));
    const material = doc.materials && Object.hasOwn(doc.materials, materialId) ? doc.materials[materialId] : materialSource?.materials?.[materialId];
    if (!material) { continue; }
    if (!doc.materials || !Object.hasOwn(doc.materials, materialId)) {
      restored ??= { ...doc.materials };
      // Material IDs may name Object prototype properties.
      Object.defineProperty(restored, materialId, { value: material, enumerable: true, writable: true, configurable: true });
    }
    const materialValue = JSON.stringify(material);
    retainImages(material, sources.filter((candidate) => candidate.materials && Object.hasOwn(candidate.materials, materialId)
      && JSON.stringify(candidate.materials[materialId]) === materialValue));
  }
  for (const [key, entity] of entities) {
    for (const component of ["primitive", "model"] as const) {
      const visual = entity[component];
      if (!visual?.material || visual.materialId !== undefined) { continue; }
      const materialValue = JSON.stringify(visual.material);
      const candidates = indexedSources.filter((source) => {
        const original = source.entities.get(key)?.[component];
        return original?.materialId === undefined && JSON.stringify(original?.material) === materialValue;
      }).map((source) => source.document);
      retainImages(visual.material, candidates);
    }
  }
  if (!restored && !restoredAssets) { return doc; }
  return { ...doc, ...(restored ? { materials: restored } : {}), ...(restoredAssets ? { assets: restoredAssets } : {}) };
}

function mergeNative3D(base: GameDocument3D, draft: GameDocument3D, server: GameDocument3D, options?: MergeOptions): MergeResult<GameDocument3D> {
  const { merge: _merge, ...adapter } = gameMergeAdapter3D;
  let merged: MergeResult<GameDocument3D> | undefined;
  let materialLimitError: z.ZodError | undefined;
  try {
    merged = mergeByUnits(base, draft, server, adapter, options);
    if (validateGame3D(merged.doc).valid) { return merged; }
  } catch (error) {
    if (!(error instanceof z.ZodError) || error.issues.length === 0 || !error.issues.every((issue) =>
      issue.code === "custom" && issue.path.length === 1 && issue.path[0] === "materials" && issue.message === "At most 256 named materials")) {
      throw error;
    }
    materialLimitError = error;
  }
  if (!validateGame3D(draft).valid || !validateGame3D(server).valid) {
    if (merged) { return merged; }
    throw materialLimitError;
  }
  const kept = validateGame3D({ ...draft, id: server.id, revision: server.revision });
  if (!kept.valid || !kept.document) { throw new Error("Cannot preserve the native game draft"); }
  // A document conflict exposes both complete choices instead of losing unrelated server changes under an asset conflict.
  return { doc: kept.document, nextBase: base, conflicts: [{ unit: { kind: "document", id: "document", label: "document" },
    external: server, draft, reason: "replaced" }] };
}

export const gameMergeAdapter3D: DocumentMergeAdapter<GameDocument3D> = {
  merge: mergeNative3D,
  finalizeMergedDocument: (doc, base, draft, server, conflicts) => retainReferencedMaterials(doc, [draft, server, base], conflicts),
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
      unitFields: ["name", "activeCameraId", "environment", "gravity", "music", "ui"].map((field) => ({ field }))
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
      kind: "material",
      read: (doc) => Object.entries(doc.materials ?? {}).map(([id, material]) => ({ id, material })),
      write: (doc, values) => {
        const { materials: _previous, ...rest } = doc;
        const materials = Object.fromEntries(materialUnit.array().parse(values).map((item) => [item.id, item.material]));
        return retainReferencedMaterials(Object.keys(materials).length === 0 ? rest : { ...rest, materials }, [doc]);
      },
      unitId: (value) => materialUnit.parse(value).id,
      unitLabel: (value) => `material ${materialUnit.parse(value).id}`
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
  scalars: [...authoringMergeScalars<GameDocument3D>(), ...(["entrySceneId", "inputActions", "inputAxes", "inputBindings", "collisionLayers", "collisionMatrix", "physicsMaterials", "presentation", "audio", "performance", "ui"] as const).map((name) => ({
    name,
    read: (doc: GameDocument3D) => doc[name],
    write: (doc: GameDocument3D, value: unknown) => gameDocument3D.parse({ ...doc, [name]: value })
  }))]
};
