/** Plain-document helpers for the native engine. Positions use world units. */
export function game(options = {}) {
  const scenes = options.scenes ?? [{ id: "level", name: "Level", entities: [] }];
  return {
    ...options,
    schemaVersion: options.schemaVersion ?? 2,
    engineVersion: "1",
    id: options.id ?? "game",
    revision: options.revision ?? "draft",
    entrySceneId: options.entrySceneId ?? scenes[0]?.id,
    pixelsPerUnit: options.pixelsPerUnit ?? 32,
    tickRate: 60,
    inputActions: options.inputActions ?? ["left", "right", "up", "down", "space"],
    assets: options.assets ?? {},
    scenes
  };
}

export function entity(id, x = 0, y = 0, options = {}) {
  return {
    ...options,
    id,
    name: options.name ?? id,
    templateOnly: options.templateOnly ?? false,
    transform2d: { ...options.transform2d, x, y,
      rotation: options.transform2d?.rotation ?? 0,
      scaleX: options.transform2d?.scaleX ?? 1,
      scaleY: options.transform2d?.scaleY ?? 1 },
    behaviors: options.behaviors ?? []
  };
}

export function script(source, options = {}) {
  return { ...options, kind: "script", source: typeof source === "function" ? source.toString() : source,
    maxCommands: options.maxCommands ?? 16, maxTickMs: options.maxTickMs ?? 8 };
}

/** Bind installed assets. This does not install bytes or resolve asset IDs. */
export function registerAssets(document, bindings) {
  for (const [slot, binding] of Object.entries(bindings)) {
    const mediaKind = binding.mediaKind ?? "image";
    document.assets[slot] = { ...binding, mediaKind,
      ...(mediaKind !== "image" ? { width: binding.width ?? 1, height: binding.height ?? 1 } : {}),
      pivot: binding.pivot ?? { x: 0.5, y: 0.5 }, sampling: binding.sampling ?? "nearest" };
  }
  return document;
}

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) { throw new Error(`${name} must be positive and finite`); }
}

function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) { throw new Error(`${name} must be a nonnegative integer`); }
}

/** Append a rectangular grid of tile centres, starting at (x, y). */
export function fill(tiles, x, y, cols, rows, options = {}) {
  count(cols, "cols");
  count(rows, "rows");
  const { size = 1, width = size, height = size, ...tile } = options;
  positive(width, "width");
  positive(height, "height");
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      tiles.push({ ...tile, x: x + col * width, y: y + row * height, width, height });
    }
  }
  return tiles;
}

/** Append one row. Pass {oneWay: true} for a platform crossed from below. */
export function plank(tiles, x, y, cols, options = {}) {
  return fill(tiles, x, y, cols, 1, options);
}

/** Elliptical arc positions, inclusive of its endpoints. Angles are radians. */
export function arc(x, y, radiusX, radiusY, points, from = 0, to = Math.PI) {
  count(points, "points");
  return Array.from({ length: points }, (_, index) => {
    const angle = from + (to - from) * (points > 1 ? index / (points - 1) : 0);
    return { x: x + Math.cos(angle) * radiusX, y: y + Math.sin(angle) * radiusY };
  });
}

/** Save a complete mutable draft. Publishing remains an explicit tool call. */
export async function saveGame(bundle, { games, project_id, game_id, base_updated_at } = {}) {
  if (!games) { throw new Error("saveGame(bundle, {games: nodetool.games, project_id}) requires the game's tool bridge"); }
  let id = game_id;
  if (!id) {
    if (!project_id || !bundle.name) { throw new Error("A new game requires name and project_id"); }
    const created = await games.create(bundle.name, { project_id });
    if (created.error || !created.game?.id) { throw new Error(`create_native_game: ${JSON.stringify(created)}`); }
    id = created.game.id;
  }
  if (bundle.program) {
    const preview = await games.previewAuthoring(id, { program: bundle.program, expected_document: bundle.document, base_updated_at });
    if (preview.error || !preview.candidate) { throw new Error(`preview_native_game_authoring: ${JSON.stringify(preview)}`); }
    const applied = await games.applyAuthoring(id, preview.candidate);
    if (applied.error || !applied.game) { throw new Error(`apply_native_game_authoring: ${JSON.stringify(applied)}`); }
    return { game_id: applied.game.id, revision: applied.game.revision, draft_updated_at: applied.draft_updated_at };
  }
  const saved = await games.edit(id, [{ op: "set_document", document: bundle.document }],
    base_updated_at === undefined ? {} : { base_updated_at });
  if (saved.error || !saved.document || !saved.game?.id) {
    throw new Error(`edit_native_game: ${JSON.stringify(saved)}`);
  }
  return { game_id: saved.game.id, revision: saved.game.revision, draft_updated_at: saved.draft_updated_at };
}

/** Explicit retained function body. All preparation results belong in inputs. */
export function constructGame(program, build) {
  if (!program || typeof build !== "function" || !Number.isSafeInteger(program.seed)) {
    throw new Error("A retained game needs source and an integer authoring seed");
  }
  const retainedInputs = JSON.parse(JSON.stringify(program.inputs ?? {}));
  const inputs = JSON.parse(JSON.stringify(retainedInputs));
  let state = program.seed >>> 0;
  const definitions = new Map();
  const parameters = {};
  const instances = [];
  const sceneKeys = new Map();
  const builder = {
    game, entity, script, registerAssets, fill, plank, arc,
    random() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    },
    parameter(name, spec) {
      if (["__proto__", "prototype", "constructor"].includes(name)) { throw new Error(`Unsafe parameter key ${name}`); }
      if (Object.hasOwn(parameters, name)) { throw new Error(`Duplicate parameter ${name}`); }
      parameters[name] = JSON.parse(JSON.stringify(spec));
      const value = inputs[name] ?? spec.default;
      if (spec.type === "number" && (typeof value !== "number" || !Number.isFinite(value) ||
        (spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max))) {
        throw new Error(`Invalid number parameter ${name}`);
      }
      if ((spec.type === "string" || spec.type === "boolean") && typeof value !== spec.type) {
        throw new Error(`Invalid ${spec.type} parameter ${name}`);
      }
      if (spec.type === "enum" && (!Array.isArray(spec.values) || !spec.values.includes(value))) { throw new Error(`Invalid enum parameter ${name}`); }
      if ((spec.type === "vector2" || spec.type === "vector3") && (!Array.isArray(value) ||
        value.length !== (spec.type === "vector2" ? 2 : 3) || value.some((part) => typeof part !== "number" || !Number.isFinite(part)))) {
        throw new Error(`Invalid vector parameter ${name}`);
      }
      if (!["number", "string", "boolean", "enum", "vector2", "vector3"].includes(spec.type)) { throw new Error(`Unknown parameter type ${spec.type}`); }
      return value;
    },
    prefab(key, definition) {
      if (typeof key !== "string" || !key || definitions.has(key)) { throw new Error(`Duplicate or empty prefab key ${key}`); }
      definitions.set(key, mergeConstructionProperties({}, definition));
      return key;
    },
    instance(scene, key, prefab, overrides = {}) {
      let keys = sceneKeys.get(scene);
      if (!keys) { keys = new Set(scene.entities.map((item) => item.id)); sceneKeys.set(scene, keys); }
      if (typeof key !== "string" || !key || keys.has(key)) {
        throw new Error(`Duplicate or empty instance key ${key}`);
      }
      const definition = definitions.get(prefab);
      if (!definition) { throw new Error(`Unknown prefab ${prefab}`); }
      const instance = { ...mergeConstructionProperties(definition, overrides), id: key };
      scene.entities.push(instance);
      keys.add(key);
      instances.push({ sceneId: scene.id, entityId: key, prefabId: prefab });
      return instance;
    }
  };
  const document = build(inputs, builder);
  if (!document || typeof document !== "object" || !Array.isArray(document.scenes)) {
    throw new Error("Retained construction must return a native document");
  }
  const scenes = new Set();
  const entities = new Set();
  for (const scene of document.scenes) {
    if (typeof scene.id !== "string" || !scene.id || scenes.has(scene.id)) { throw new Error(`Duplicate or empty scene key ${scene.id}`); }
    scenes.add(scene.id);
    for (const item of scene.entities) {
      if (typeof item.id !== "string" || !item.id || entities.has(item.id)) { throw new Error(`Duplicate or empty entity key ${item.id}`); }
      entities.add(item.id);
    }
  }
  return { document, program: { source: program.source ?? `return (${build.toString()})(inputs, builder);`, inputs: retainedInputs, seed: program.seed },
    parameters, prefabs: Object.fromEntries(definitions), instances };
}

/** Component fields inherit independently. Arrays are replaced as one value. */
function mergeConstructionProperties(base, override) {
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const checkKeys = (value) => {
    if (value === null || typeof value !== "object") { return; }
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) { throw new Error(`Unsafe construction property ${key}`); }
      checkKeys(item);
    }
  };
  checkKeys(base);
  checkKeys(override);
  const merge = (left, right) => {
    if (!object(left) || !object(right)) { return JSON.parse(JSON.stringify(right)); }
    const result = JSON.parse(JSON.stringify(left));
    for (const [key, value] of Object.entries(right)) {
      result[key] = object(result[key]) && object(value) ? merge(result[key], value) : JSON.parse(JSON.stringify(value));
    }
    return result;
  };
  return merge(base, override);
}
