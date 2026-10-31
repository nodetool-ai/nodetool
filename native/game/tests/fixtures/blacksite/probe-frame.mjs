const vector = (value) => Array.isArray(value) ? value : [value.x, value.y, value.z];
const transform = (value) => ({ position: vector(value.position), rotation: [...value.rotation], scale: vector(value.scale) });

function rotate(quaternion, value) {
  const [x, y, z, w] = quaternion;
  const t = [2 * (y * value[2] - z * value[1]), 2 * (z * value[0] - x * value[2]), 2 * (x * value[1] - y * value[0])];
  return [value[0] + w * t[0] + y * t[2] - z * t[1], value[1] + w * t[1] + z * t[0] - x * t[2], value[2] + w * t[2] + x * t[1] - y * t[0]];
}

export function resolvedLegacyCamera(frame) {
  if (frame.camera.projection.kind !== "perspective") {
    throw new Error("BLACKSITE controlled probe requires its authored perspective camera");
  }
  const position = vector(frame.camera.transform.position);
  const forward = rotate(frame.camera.transform.rotation, [0, 0, -1]);
  return { position, target: position.map((value, index) => value + forward[index]), up: rotate(frame.camera.transform.rotation, [0, 1, 0]), fov: frame.camera.projection.fov, near: frame.camera.projection.near, far: frame.camera.projection.far };
}

/** Renderer-only conversion. It does not open a native session or import a snapshot. */
export function controlledNativeFrame(legacyFrame, nativeDocument, particleSamples) {
  if (legacyFrame.dimension !== "3d") {
    throw new Error("Expected a legacy 3D presentation frame");
  }
  const scene = nativeDocument.scenes.find((scene) => scene.id === legacyFrame.sceneId);
  if (!scene) {
    throw new Error("Controlled probe scene does not exist in the prepared native document");
  }
  const templates = new Map(scene.entities.map((entity) => [entity.props.sourceEntityId ?? entity.id, entity]));
  const aliases = new Map(scene.entities.map((entity) => [entity.props.sourceEntityId ?? entity.id, entity.id]));
  const nativeIds = new Set(scene.entities.map((entity) => entity.id));
  const alias = (id) => {
    if (aliases.has(id)) {
      return aliases.get(id);
    }
    const match = /^([a-zA-Z0-9:_-]+)#([0-9]+)\/([a-zA-Z0-9:_-]+)$/.exec(id);
    if (!match) {
      throw new Error(`Controlled probe has an unmapped entity ID: ${id}`);
    }
    const prefab = nativeDocument.prefabs.find((prefab) => prefab.id === match[1]);
    if (!prefab || prefab.entities.length !== 1 || prefab.entities[0].id !== match[3]) {
      throw new Error(`Controlled probe has an unmapped prefab entity: ${id}`);
    }
    const mapped = `probe-${match[1]}-${match[2]}`;
    if (nativeIds.has(mapped)) {
      throw new Error("Controlled probe entity-ID alias collides with an existing entity");
    }
    nativeIds.add(mapped);
    aliases.set(id, mapped);
    templates.set(id, prefab.entities[0]);
    return mapped;
  };
  const entities = [];
  for (const original of legacyFrame.entities) {
    const id = alias(original.entityId);
    const template = templates.get(original.entityId);
    if (original.opacity !== undefined && original.opacity !== 1) {
      throw new Error("Controlled probe requires an explicit mapping for per-entity fading");
    }
    if (original.animationPose) {
      throw new Error("Controlled probe requires an explicit mapping for animation graphs");
    }
    const entity = { ...structuredClone(template), id, transform: transform(original.transform), props: { ...template.props, controlledSourceEntityId: original.entityId } };
    if (original.animation) {
      const match = /^clip:([0-9]+)$/.exec(original.animation.clipId);
      if (!match || entity.visual?.kind !== "model") {
        throw new Error("Controlled probe has an unmapped model animation");
      }
      entity.visual.animation = Number(match[1]);
      entity.visual.animationTime = Math.max(0, legacyFrame.tick - original.animation.startTick) * original.animation.playbackRate / 60;
      entity.visual.animationLoop = original.animation.loop;
    }
    entities.push(entity);
    if (original.entityId === "facility") {
      for (const child of scene.entities.filter((entity) => entity.parentId === "facility")) {
        entities.push({ ...structuredClone(child), transform: transform(original.transform) });
      }
    }
  }
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  for (const original of legacyFrame.lights) {
    const entity = byId.get(alias(original.entityId));
    if (!entity) {
      throw new Error(`Controlled light pose is absent: ${original.entityId}`);
    }
    entity.transform = transform(original.transform);
    entity.light3d = structuredClone(original.light);
  }
  for (const entity of entities) {
    delete entity.parentId;
  }
  for (const label of legacyFrame.hud) {
    if (label.text !== "") {
      throw new Error("Controlled probe requires an explicit mapping for visible legacy HUD labels");
    }
  }
  const particles = particleSamples.map((sample) => {
    if (!sample.emitter) {
      throw new Error("Controlled particles require their original emitter definition");
    }
    return { entityId: alias(sample.entityId), emitterId: sample.emitterId, position: [sample.x, sample.y, sample.z], velocity: [sample.vx, sample.vy, sample.vz], color: [sample.r, sample.g, sample.b], opacity: sample.opacity, size: sample.size, rotation: sample.rotation, life: sample.life, age: sample.life, lifetime: 1, render: sample.emitter.render ?? { kind: "billboard" }, blend: sample.emitter.blend ?? "normal", unlit: sample.emitter.unlit ?? false, softness: sample.emitter.softness ?? 0 };
  });
  const ui = legacyFrame.ui ? structuredClone(legacyFrame.ui) : undefined;
  if (ui) {
    ui.focusNavigation = false;
  }
  return {
    dimension: "3d", generation: 1, tick: legacyFrame.tick, sceneId: legacyFrame.sceneId,
    events: [], presentationEvents: [], hostRequests: [], queryResults: [], music: [], score: 0, health: 100, logs: [], hud: [],
    camera: resolvedLegacyCamera(legacyFrame), environment: structuredClone(legacyFrame.environment), presentation: structuredClone(legacyFrame.presentation),
    ...(ui ? { ui } : {}), particles, entities, authoredOrder: Object.fromEntries(entities.map((entity, index) => [entity.id, index])), worldTransforms: Object.fromEntries(entities.map((entity) => [entity.id, entity.transform])), lighting: {}, backgrounds: []
  };
}
