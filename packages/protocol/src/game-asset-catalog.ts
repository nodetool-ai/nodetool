/**
 * @nodetool-ai/protocol — What a game draft holds in assets, prefabs and
 * scenes, and where each asset is used.
 *
 * The editor's asset browser and the `browse_native_game_assets` capability
 * read the same catalog, so the "used by" list an agent sees is the one a
 * person sees.
 *
 * - **A reference is any `assetId` or `fontId` value that names a bound slot.**
 *   Every component that points at media uses one of those two keys (sprites,
 *   tilemaps, backgrounds, music, audio sources, LUT effects, HUD labels,
 *   models, mesh colliders), so walking for them finds a reference in a
 *   component added later without a change here.
 * - **A sliced sheet's frames are siblings, not separate media.**
 *   `generate_game_asset` binds `<slot>.frame.<n>` and `<slot>.tile.<mask>` to
 *   the same bytes as `<slot>`. Replacing `<slot>` has to move them too, or
 *   the sprites that draw a frame keep showing the old sheet.
 */

import { z } from "zod";

import type { AnyGameDocument } from "./game3d.js";
import type { GameAssetBinding } from "./game.js";
import { slotPrompt } from "./game-slot-prompt.js";
import type { GameSlotSpec } from "./game-assets.js";

export type GameAssetMediaKind = "image" | "audio" | "font" | "model" | "collider" | "hdri";

export interface GameAssetReference {
  /** Where the reference sits: an entity, a scene setting, a prefab entity, or a document setting. */
  readonly kind: "entity" | "scene" | "prefab" | "document";
  readonly sceneId?: string;
  readonly entityId?: string;
  readonly prefabId?: string;
  /** Entity or scene name when it has one. */
  readonly name?: string;
  /** Dotted path from the entity, scene, prefab entity or document to the key. */
  readonly path: string;
}

export interface GameAssetCatalogEntry {
  readonly slot: string;
  readonly mediaKind: GameAssetMediaKind;
  readonly digest: string;
  readonly assetId: string;
  /** The sheet slot this frame or tile binding was sliced from. */
  readonly siblingOf?: string;
  /** Frame and tile bindings of this slot that still point at different bytes. */
  readonly staleSiblings: readonly string[];
  readonly usedBy: readonly GameAssetReference[];
}

export interface GamePrefabCatalogEntry {
  readonly id: string;
  /** `document` for a 3D prefab, `authoring` for a retained-construction prefab. */
  readonly source: "document" | "authoring";
  readonly entityCount: number;
  readonly assets: readonly string[];
  readonly usedBy: readonly GameAssetReference[];
}

export interface GameSceneCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly entry: boolean;
  readonly entityCount: number;
  readonly assets: readonly string[];
}

export interface GameAssetCatalog {
  readonly assets: readonly GameAssetCatalogEntry[];
  readonly prefabs: readonly GamePrefabCatalogEntry[];
  readonly scenes: readonly GameSceneCatalogEntry[];
}

const REFERENCE_KEYS = new Set(["assetId", "fontId"]);
const SIBLING = /^(.+)\.(frame|tile)\.[^.]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every `assetId`/`fontId` naming a bound slot under `value`, with its dotted path. */
/** Bound slot names keyed by themselves, so a lookup with any field value answers the slot it names. */
type SlotIndex = ReadonlyMap<unknown, string>;
type CatalogEntity = Record<string, unknown> & { readonly id: string; readonly name?: string };

function collect(value: unknown, slots: SlotIndex, path: string[], out: { slot: string; path: string }[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, slots, [...path, String(index)], out));
    return;
  }
  if (!isRecord(value)) { return; }
  for (const [key, child] of Object.entries(value)) {
    const slot = REFERENCE_KEYS.has(key) ? slots.get(child) : undefined;
    if (slot !== undefined) {
      out.push({ slot, path: [...path, key].join(".") });
    } else {
      collect(child, slots, [...path, key], out);
    }
  }
}


/** The slot whose bytes a frame or tile binding was sliced from, if that slot is bound. */
export function gameAssetSiblingParent(slot: string, assets: Readonly<Record<string, unknown>>): string | undefined {
  const parent = SIBLING.exec(slot)?.[1];
  return parent && Object.hasOwn(assets, parent) ? parent : undefined;
}

export function gameAssetCatalog(document: AnyGameDocument): GameAssetCatalog {
  const slotNames = Object.keys(document.assets);
  const slots: SlotIndex = new Map(slotNames.map((slot) => [slot, slot]));
  const usedBy = new Map<string, GameAssetReference[]>(slotNames.map((slot) => [slot, []]));
  const add = (slot: string, reference: GameAssetReference): void => { usedBy.get(slot)?.push(reference); };
  const scenes: GameSceneCatalogEntry[] = [];
  for (const scene of document.scenes) {
    const sceneAssets = new Set<string>();
    const { entities, ...settings } = scene as unknown as Record<string, unknown> & { entities: CatalogEntity[] };
    const found: { slot: string; path: string }[] = [];
    collect(settings, slots, [], found);
    for (const { slot, path } of found) {
      sceneAssets.add(slot);
      add(slot, { kind: "scene", sceneId: scene.id, name: scene.name, path });
    }
    for (const entity of entities) {
      const hits: { slot: string; path: string }[] = [];
      collect(entity, slots, [], hits);
      for (const { slot, path } of hits) {
        sceneAssets.add(slot);
        add(slot, { kind: "entity", sceneId: scene.id, entityId: entity.id, name: entity.name || undefined, path });
      }
    }
    scenes.push({ id: scene.id, name: scene.name, entry: scene.id === document.entrySceneId,
      entityCount: entities.length, assets: [...sceneAssets].sort() });
  }
  const { assets: _assets, scenes: _scenes, prefabs: documentPrefabs, authoring, ...rest } =
    document as unknown as Record<string, unknown> & { prefabs?: Record<string, { entities: CatalogEntity[]; externalAssets?: string[] }> };
  const documentHits: { slot: string; path: string }[] = [];
  collect(rest, slots, [], documentHits);
  for (const { slot, path } of documentHits) { add(slot, { kind: "document", path }); }

  const instances = isRecord(authoring) && Array.isArray(authoring["instances"]) ? authoring["instances"].filter(isRecord) : [];
  const prefabUsers = (prefabId: string): GameAssetReference[] => instances
    .filter((instance) => instance["prefabId"] === prefabId)
    .map((instance) => ({ kind: "entity", sceneId: String(instance["sceneId"]), entityId: String(instance["entityId"]), path: "authoring.instances" }));
  const prefabs: GamePrefabCatalogEntry[] = [];
  for (const [prefabId, prefab] of Object.entries(documentPrefabs ?? {})) {
    const prefabAssets = new Set(prefab.externalAssets?.filter((slot) => Object.hasOwn(document.assets, slot)) ?? []);
    for (const entity of prefab.entities) {
      const hits: { slot: string; path: string }[] = [];
      collect(entity, slots, [], hits);
      for (const { slot, path } of hits) {
        prefabAssets.add(slot);
        add(slot, { kind: "prefab", prefabId, entityId: entity.id, name: entity.name || undefined, path });
      }
    }
    prefabs.push({ id: prefabId, source: "document", entityCount: prefab.entities.length,
      assets: [...prefabAssets].sort(), usedBy: prefabUsers(prefabId) });
  }
  const authored = isRecord(authoring) && isRecord(authoring["prefabs"]) ? authoring["prefabs"] : {};
  for (const [prefabId, prefab] of Object.entries(authored)) {
    if (documentPrefabs && Object.hasOwn(documentPrefabs, prefabId)) { continue; }
    const hits: { slot: string; path: string }[] = [];
    collect(prefab, slots, [], hits);
    const entities = isRecord(prefab) && Array.isArray(prefab["entities"]) ? prefab["entities"].length : 0;
    prefabs.push({ id: prefabId, source: "authoring", entityCount: entities,
      assets: [...new Set(hits.map((hit) => hit.slot))].sort(), usedBy: prefabUsers(prefabId) });
  }

  const assets: GameAssetCatalogEntry[] = Object.entries(document.assets).map(([slot, binding]) => {
    const staleSiblings = Object.entries(document.assets)
      .filter(([other, value]) => gameAssetSiblingParent(other, document.assets) === slot && value.digest !== binding.digest)
      .map(([other]) => other).sort();
    const siblingOf = gameAssetSiblingParent(slot, document.assets);
    const entry: GameAssetCatalogEntry = { slot, mediaKind: (binding.mediaKind ?? "image") as GameAssetMediaKind, digest: binding.digest,
      assetId: binding.assetId, staleSiblings, usedBy: usedBy.get(slot) ?? [] };
    return siblingOf ? { ...entry, siblingOf } : entry;
  });
  assets.sort((left, right) => left.slot.localeCompare(right.slot));
  return { assets, prefabs: prefabs.sort((left, right) => left.id.localeCompare(right.id)), scenes };
}

export interface GameAssetCatalogFilter {
  /** Case-insensitive text matched against slots, digests, ids, names and the entities that use an asset. */
  readonly query?: string;
  readonly kind?: GameAssetMediaKind;
}

/**
 * The asset browser's search and type filter. The editor panel and
 * `browse_native_game_assets` both call it, so a query finds the same rows on
 * either surface.
 */
export function filterGameAssetCatalog(catalog: GameAssetCatalog, filter: GameAssetCatalogFilter): GameAssetCatalog {
  const query = filter.query?.trim().toLowerCase() ?? "";
  const text = (value: string | undefined): boolean => Boolean(value?.toLowerCase().includes(query));
  const assets = catalog.assets.filter((entry) => (!filter.kind || entry.mediaKind === filter.kind) && (!query ||
    text(entry.slot) || entry.digest.startsWith(query) ||
    entry.usedBy.some((reference) => text(reference.name) || text(reference.entityId))));
  return {
    assets,
    prefabs: catalog.prefabs.filter((entry) => !query || text(entry.id) || entry.assets.some(text)),
    scenes: catalog.scenes.filter((entry) => !query || text(entry.id) || text(entry.name))
  };
}

export interface GameAssetSiblingRebind {
  readonly op: "bind_asset";
  readonly slot: string;
  readonly binding: GameAssetBinding;
}

/**
 * Move the frame and tile bindings of `slot` onto `parent`'s bytes, keeping
 * each one's frame. A frame that no longer fits inside the new sheet is
 * returned in `skipped` and left bound to the old bytes rather than drawing
 * outside the image.
 */
export function gameAssetSiblingRebinds(assets: Readonly<Record<string, GameAssetBinding>>, slot: string,
  parent: GameAssetBinding): { readonly ops: readonly GameAssetSiblingRebind[]; readonly skipped: readonly string[] } {
  const ops: GameAssetSiblingRebind[] = [];
  const skipped: string[] = [];
  for (const [other, binding] of Object.entries(assets).sort(([left], [right]) => left.localeCompare(right))) {
    if (other === slot || SIBLING.exec(other)?.[1] !== slot || binding.digest === parent.digest) { continue; }
    const frame = binding.frame;
    if ((binding.mediaKind ?? "image") !== "image" || (parent.mediaKind ?? "image") !== "image" ||
      (frame && (frame.x + frame.width > parent.width || frame.y + frame.height > parent.height))) {
      skipped.push(other);
      continue;
    }
    ops.push({ op: "bind_asset", slot: other, binding: { ...binding, assetId: parent.assetId, digest: parent.digest,
      width: parent.width, height: parent.height } });
  }
  return { ops, skipped };
}

export interface GameSlotGenerationRequest {
  /** The `generate_game_asset` kind that produces this slot. */
  readonly kind: "image" | "music" | "sfx";
  readonly prompt: string;
  /** `generate_game_asset` image preparation that cuts the result to the slot's grid or size. */
  readonly preparation?: Record<string, unknown>;
}

/**
 * The `generate_game_asset` request for one template slot: the slot prompt
 * with no style or cast, and the preparation that fits the image to the
 * slot. An `sfx` slot still needs a sound-effect `node_type` from the caller.
 */
export function gameSlotGenerationRequest(slot: GameSlotSpec): GameSlotGenerationRequest {
  const { prompt, width, height } = slotPrompt(slot, null, []);
  switch (slot.kind) {
    case "spritesheet": {
      const columns = Math.max(...Object.values(slot.animations));
      const rows = Object.keys(slot.animations).length;
      return { kind: "image", prompt, preparation: { sheet: { cols: columns, rows } } };
    }
    case "tileset":
    case "image":
      return { kind: "image", prompt, preparation: { targetWidth: width, targetHeight: height, cropPolicy: "cover" } };
    case "sfx":
      return { kind: "sfx", prompt };
    case "music":
      return { kind: "music", prompt };
  }
}

/**
 * What produced a staged file under `<source_root>/assets/`: its slot, the
 * binding staging made, and the prompt. Stored at
 * {@link stagedGameCandidateRecordPath} so a browser can offer the candidate
 * for its slot and seed a regeneration with the prompt.
 */
export const stagedGameCandidateRecord = z.strictObject({
  version: z.literal(1),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  slot: z.string().min(1).max(256),
  binding: z.record(z.string(), z.unknown()).optional(),
  prompt: z.string().max(20_000).optional(),
  source: z.enum(["stage", "generate", "import"]),
  stagedAt: z.string()
});

export type StagedGameCandidateRecord = z.infer<typeof stagedGameCandidateRecord>;

export function stagedGameCandidateRecordPath(sourceRoot: string, digest: string): string {
  return `${sourceRoot}/candidates/${digest}.json`;
}
