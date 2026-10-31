import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prepareBlacksiteAssets } from "./prepare-assets.mjs";
import { wrapLegacyScript } from "./script-adapter.mjs";

const vector = (value = {}, fallback = 0) => Array.isArray(value) ? value : [value.x ?? fallback, value.y ?? fallback, value.z ?? fallback];

export function createBlacksiteDocument(source, assets, facilitySlots) {
  const nativeId = (id) => id.replaceAll(".", "_dot_");
  const idMapping = Object.fromEntries(source.scenes.flatMap((scene) => scene.entities.filter((entity) => nativeId(entity.id) !== entity.id).map((entity) => [entity.id, nativeId(entity.id)])));
  const scripts = [];
  const scriptSources = [];
  const children = {};
  for (const scene of source.scenes) {
    for (const entity of scene.entities) {
      if (entity.parentId) {
        (children[nativeId(entity.parentId)] ??= []).push(nativeId(entity.id));
      }
    }
  }
  const audioSources = source.scenes.flatMap((scene) => scene.entities.filter((entity) => entity.audioSource).map((entity) => ({ id: entity.id, audioSource: entity.audioSource })));
  const prefabBindings = {};

  function convertEntity(original, scope) {
    const transform = original.transform3d ?? {};
    const entity = {
      id: nativeId(original.id),
      name: original.name ?? original.id,
      ...(original.parentId ? { parentId: nativeId(original.parentId) } : {}),
      prefabOverrides: [],
      transform: { position: vector(transform.position), rotation: transform.rotation ?? [0, 0, 0, 1], scale: vector(transform.scale, 1) },
      props: { ...original.props, ...(original.tags ? { sourceTags: original.tags } : {}), ...(idMapping[original.id] ? { sourceEntityId: original.id } : {}) },
      assetIds: [],
      behaviors: []
    };
    if (original.body3d) {
      entity.body = { type: original.body3d.type, mass: original.body3d.mass ?? 1, velocity: vector(original.body3d.velocity) };
    }
    if (original.collider3d) {
      const collider = original.collider3d;
      if (!["box", "sphere", "capsule"].includes(collider.kind)) {
        throw new Error(`Unmapped BLACKSITE collider: ${collider.kind}`);
      }
      entity.collider = { shape: collider.kind, halfExtents: vector(collider.halfExtents, 0.5), radius: collider.radius ?? 0.5, halfHeight: collider.halfHeight ?? 0.5, sensor: collider.sensor ?? false, layer: 0, mask: 65535 };
    }
    if (original.character3d) {
      delete entity.body;
      entity.character = { speed: original.character3d.speed, jumpSpeed: original.character3d.jumpSpeed, maxSlopeDegrees: 45, stepHeight: 0.3 };
      entity.gameplay = { health: 100 };
    }
    if (original.model && original.id !== "facility") {
      entity.visual = { kind: "model", assetId: original.model.assetId };
      for (const field of ["castShadow", "receiveShadow"]) {
        if (original.model[field] !== undefined) {
          entity.visual[field] = original.model[field];
        }
      }
      entity.assetIds.push(original.model.assetId);
    }
    if (original.primitive) {
      const primitive = original.primitive;
      if (!["box", "sphere", "capsule"].includes(primitive.kind)) {
        throw new Error(`Unmapped BLACKSITE primitive: ${primitive.kind}`);
      }
      const color = (primitive.material?.color ?? "#ffffff").slice(1);
      entity.visual = {
        kind: "primitive",
        shape: primitive.kind,
        size: vector(primitive.dimensions, 1),
        color: [0, 2, 4].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255).concat(primitive.material?.opacity ?? 1),
        material: structuredClone(primitive.material)
      };
      for (const field of ["castShadow", "receiveShadow"]) {
        if (primitive[field] !== undefined) {
          entity.visual[field] = primitive[field];
        }
      }
    }
    for (const component of ["camera3d", "animator3d", "light3d", "decal3d", "particles"]) {
      if (original[component]) {
        entity[component] = structuredClone(original[component]);
      }
    }
    if (original.decal3d) {
      entity.assetIds.push(original.decal3d.assetId);
    }
    for (const [index, behavior] of (original.behaviors ?? []).entries()) {
      if (behavior.kind === "lifetime") {
        if (behavior.fade !== false) {
          throw new Error("BLACKSITE lifetime fading requires an explicit native visual mapping");
        }
        entity.gameplay = { ...entity.gameplay, lifetimeTicks: behavior.ticks };
      } else if (behavior.kind === "script") {
        const id = `script-${scope}-${original.id}-${index}`;
        scriptSources.push({ id, entityId: original.id, source: behavior.source });
        entity.behaviors.push({ id: `behavior-${index}`, scriptId: id, props: {}, maxCommands: 128, maxTickMs: behavior.maxTickMs ?? 20, maxStateBytes: 65536, maxTimers: 32 });
      } else {
        throw new Error(`Unmapped BLACKSITE behavior: ${behavior.kind}`);
      }
    }
    return entity;
  }

  const prefabs = Object.entries(source.prefabs).map(([id, prefab]) => {
    if (prefab.entities.length !== 1 || prefab.entities[0].id !== prefab.rootId) {
      throw new Error("BLACKSITE adapter requires explicit mapping for multi-entity prefabs");
    }
    const original = prefab.entities[0];
    const entity = convertEntity(original, `prefab-${id}`);
    prefabBindings[id] = { entity, tags: original.tags ?? [], audioSource: original.audioSource ?? null };
    return { id, name: id, entities: [entity] };
  });
  const scenes = source.scenes.map((scene) => ({
    id: scene.id,
    name: scene.name,
    activeCameraId: scene.activeCameraId,
    environment: structuredClone(scene.environment),
    entities: scene.entities.flatMap((original) => {
      const entity = convertEntity(original, scene.id);
      if (original.id !== "facility") {
        return [entity];
      }
      // The source ID remains the decal receiver and hierarchy root. Only its
      // model payload is partitioned into portable children.
      return [entity, ...facilitySlots.map((assetId) => ({ id: assetId, name: assetId, parentId: "facility", prefabOverrides: [], transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, props: {}, assetIds: [assetId], behaviors: [], visual: { kind: "model", assetId } }))];
    })
  }));
  for (const scene of scenes) {
    if (new Set(scene.entities.map((entity) => entity.id)).size !== scene.entities.length) {
      throw new Error("BLACKSITE native entity-ID mapping is ambiguous");
    }
  }
  for (const script of scriptSources) {
    const isPlayer = script.entityId === "player";
    scripts.push({ id: script.id, source: wrapLegacyScript(script.source, { prefabs: isPlayer ? prefabBindings : {}, children, idMapping, audioSources: isPlayer ? audioSources : [], requireRayNormals: isPlayer }), stateVersion: 1 });
  }
  return {
    schemaVersion: 4,
    engine: "native-cpp-1",
    dimension: "3d",
    id: "blacksite-native-visual-parity",
    title: "BLACKSITE",
    revision: 0,
    initialSceneId: source.entrySceneId,
    scenes,
    prefabs,
    scripts,
    assets,
    inputActions: [{ id: "jump", bindings: ["Space"] }, { id: "fire", bindings: ["KeyF"] }, { id: "r", bindings: ["KeyR"] }],
    presentation: structuredClone(source.presentation),
    ui: structuredClone(source.ui),
    hud: []
  };
}

export async function adaptBlacksite(outputDirectory) {
  const output = resolve(outputDirectory);
  const prepared = await prepareBlacksiteAssets(output);
  const document = createBlacksiteDocument(prepared.source, prepared.assets, prepared.facilitySlots);
  const write = (name, value) => writeFile(resolve(output, name), typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  await write("game.json", document);
  for (const name of ["completion.inputs.json", "completion.assertions.json", "damage.inputs.json", "comparison.json"]) {
    await write(name, await readFile(new URL(name, import.meta.url), "utf8"));
  }
  await write("adaptation.json", {
    source: "packages/game-runtime/samples/blacksite/game.json",
    omittedVisualSurfaces: [],
    preservedVisualCommands: ["spawn", "despawn", "emit", "ui", "setVisual", "emitParticles"],
    facilityReceiverRoot: "facility",
    facilityModelChildren: prepared.facilitySlots,
    idMappings: Object.fromEntries(document.scenes.flatMap((scene) => scene.entities.filter((entity) => entity.props.sourceEntityId).map((entity) => [entity.props.sourceEntityId, entity.id]))),
    audioScope: "Audio mixer, streamed music and exact spatial attenuation remain outside visual acceptance. Event cues use admitted native audio commands.",
    physicsScope: "Native character acceleration/coyote/jump-buffer behavior differs from legacy. Replay completion independently."
  });
  return { output, document, provenance: prepared.provenance };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 2 || arguments_[0] !== "--out") {
    throw new Error("Usage: node adapt.mjs --out <empty-artifact-directory>");
  }
  const result = await adaptBlacksite(arguments_[1]);
  process.stdout.write(JSON.stringify({ output: result.output, scenes: result.document.scenes.length, scripts: result.document.scripts.length, assets: result.document.assets.length, omittedVisualSurfaces: [] }) + "\n");
}
