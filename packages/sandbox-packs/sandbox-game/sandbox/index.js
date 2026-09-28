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
  const saved = await games.edit(id, [{ op: "set_document", document: bundle.document }],
    base_updated_at === undefined ? {} : { base_updated_at });
  if (saved.error || !saved.document || !saved.game?.id) {
    throw new Error(`edit_native_game: ${JSON.stringify(saved)}`);
  }
  return { game_id: saved.game.id, revision: saved.game.revision, draft_updated_at: saved.draft_updated_at };
}
