/**
 * The `entities` capability module — the ingredients library, headlessly.
 *
 * An entity is an ordinary image asset carrying a marker under
 * `metadata.nodetool_entity`: the kind, the name, and the descriptor that gets
 * pasted into every prompt naming it. That is what holds a character or a look
 * steady from shot to shot.
 *
 * The browser reads the library through `ui_entity_list` / `ui_entity_apply`,
 * which need an open app. These five answer the same questions with no
 * browser: list, read one, season a prompt, tag an asset as an entity, and
 * retag one. The injection rule itself is `injectEntities` in
 * `@nodetool-ai/protocol`, shared with the browser tool and the Director node,
 * so a prompt seasoned here and one seasoned in the editor come out the same.
 */

import type { Entity, EntityKind } from "@nodetool-ai/protocol";
import type { Asset } from "@nodetool-ai/models";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  applyEntitiesSpec,
  getEntitySpec,
  listEntitiesSpec,
  DEFAULT_LIMIT,
  MAX_LIMIT
} from "./entities.specs.js";
import {
  CREATE_ENTITY_SCHEMA,
  UPDATE_ENTITY_SCHEMA,
  createEntitySpec,
  updateEntitySpec
} from "./entities.specs.js";
import { MIME_TO_EXT } from "../tools/asset-persist.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { isRecord, isString } from "../utils/type-guards.js";

export {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  LIST_ENTITIES_SCHEMA,
  GET_ENTITY_SCHEMA,
  APPLY_ENTITIES_SCHEMA,
  CREATE_ENTITY_SCHEMA,
  UPDATE_ENTITY_SCHEMA
} from "./entities.specs.js";

/** The metadata key an entity's marker lives under, set by the library UI. */
export const ENTITY_METADATA_KEY = "nodetool_entity";

export const ENTITY_KINDS: ReadonlySet<string> = new Set([
  "character",
  "location",
  "style",
  "prop"
]);

/** Assets the library scans for markers. Entities are always image assets. */
const ENTITY_ASSET_LIMIT = 1000;

type ToolError = { error: string };

const stringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : undefined;

/**
 * Read the entity marker off an asset, or null when it carries none. Mirrors
 * `assetToEntity` in the web library: the asset's own bytes are the entity's
 * primary reference image, and the marker holds everything else.
 */
export function entityFromAsset(
  asset: Pick<Asset, "id" | "content_type" | "metadata" | "created_at">
): Entity | null {
  const raw = asset.metadata?.[ENTITY_METADATA_KEY];
  if (!isRecord(raw)) return null;
  const kind = isString(raw["kind"]) ? raw["kind"] : "";
  if (!ENTITY_KINDS.has(kind)) return null;

  const ext = MIME_TO_EXT[asset.content_type] ?? "png";
  const entity: Entity = {
    type: "entity",
    id: asset.id,
    kind: kind as EntityKind,
    name: isString(raw["name"]) ? raw["name"] : "",
    descriptor: isString(raw["descriptor"]) ? raw["descriptor"] : "",
    voice_id: isString(raw["voice_id"]) ? raw["voice_id"] : null,
    lora: (raw["lora"] as Entity["lora"]) ?? null,
    palette: (raw["palette"] as Entity["palette"]) ?? null,
    reference_images: [
      { type: "image", asset_id: asset.id, uri: `asset://${asset.id}.${ext}` }
    ]
  };
  if (isString(raw["description"])) {
    entity.description = raw["description"];
  }
  const tags = stringArray(raw["tags"]);
  if (tags) {
    entity.tags = tags;
  }
  if (asset.created_at) {
    entity.created_at = asset.created_at;
  }
  return entity;
}

/** Every entity in the caller's library. */
export async function loadEntities(
  run: CapabilityRun
): Promise<Entity[] | ToolError> {
  const userId = userIdOf(run.context);
  if (!userId) return { error: "No user is bound to this session." };
  const { Asset } = await import("@nodetool-ai/models");
  const [assets] = await Asset.paginate(userId, {
    contentType: "image",
    limit: ENTITY_ASSET_LIMIT
  });
  return assets
    .map((asset) => entityFromAsset(asset))
    .filter((entity): entity is Entity => entity !== null);
}

const isError = (value: unknown): value is ToolError =>
  isRecord(value) && isString((value as ToolError).error);

/** The summary shape `list_entities` returns, one row per entity. */
const entityRow = (entity: Entity) => ({
  id: entity.id,
  asset_id: entity.id,
  name: entity.name,
  kind: entity.kind,
  descriptor: entity.descriptor
});

const listEntities: CapabilityExport = {
  spec: listEntitiesSpec,
  impl: async (run, params) => {
    const entities = await loadEntities(run);
    if (isError(entities)) return entities;

    const requested = Number(params["limit"] ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const kind = isString(params["kind"]) ? params["kind"].trim() : "";
    const query = isString(params["query"])
      ? params["query"].trim().toLowerCase()
      : "";

    const matched = entities.filter((entity) => {
      if (kind && entity.kind !== kind) return false;
      if (!query) return true;
      return (
        entity.name.toLowerCase().includes(query) ||
        entity.descriptor.toLowerCase().includes(query)
      );
    });
    return {
      entities: matched.slice(0, limit).map(entityRow),
      count: Math.min(matched.length, limit),
      total: matched.length
    };
  }
};

const getEntity: CapabilityExport = {
  spec: getEntitySpec,
  impl: async (run, params) => {
    const entityId = params["entity_id"];
    if (!isString(entityId) || entityId.trim() === "") {
      return { error: "entity_id is required (use list_entities to find one)." };
    }
    const userId = userIdOf(run.context);
    if (!userId) return { error: "No user is bound to this session." };

    const { Asset } = await import("@nodetool-ai/models");
    const asset = await Asset.find(userId, entityId.trim());
    // An asset owned by someone else reads as missing, and an untagged one is
    // not an entity — the library only sees assets carrying the marker.
    const entity = asset ? entityFromAsset(asset) : null;
    if (!entity) {
      return { error: `Entity ${entityId} was not found.` };
    }
    return { entity };
  }
};

const applyEntities: CapabilityExport = {
  spec: applyEntitiesSpec,
  impl: async (run, params) => {
    const text = params["text"];
    if (!isString(text)) {
      return { error: "text is required and must be a string." };
    }
    const entityIds = stringArray(params["entity_ids"]);

    const entities = await loadEntities(run);
    if (isError(entities)) return entities;

    const { injectEntities } = await import("@nodetool-ai/protocol");
    const injection = injectEntities(text, entities, entityIds);
    const missing = (entityIds ?? []).filter(
      (id) => !entities.some((entity) => entity.id === id)
    );
    const result: Record<string, unknown> = {
      prompt: injection.prompt,
      referenceAssetIds: injection.referenceAssetIds,
      applied: injection.applied.map(entityRow)
    };
    // Named ids that resolve to nothing are the one failure a caller cannot
    // see from the prompt alone: the text comes back unseasoned and looks fine.
    if (missing.length > 0) {
      result.missing_entity_ids = missing;
    }
    return result;
  }
};

/**
 * Copy the optional marker fields present in params into the marker object,
 * validating each. A present-and-null optional clears the field, matching the
 * web library's marker shape (`EntityMarker` in `useEntities.ts`). Returns the
 * first problem found, or null; bumps `touched` once per applied field.
 */
const applyOptionalMarkerFields = (
  marker: Record<string, unknown>,
  params: Record<string, unknown>,
  touched: { value: number }
): string | null => {
  const description = params["description"];
  if (description !== undefined) {
    if (!isString(description)) return "description must be a string.";
    marker["description"] = description;
    touched.value += 1;
  }
  const voiceId = params["voice_id"];
  if (voiceId !== undefined) {
    if (!isString(voiceId) && voiceId !== null) {
      return "voice_id must be a string or null.";
    }
    if (voiceId === null) delete marker["voice_id"];
    else marker["voice_id"] = voiceId;
    touched.value += 1;
  }
  const tags = params["tags"];
  if (tags !== undefined) {
    if (tags === null) delete marker["tags"];
    else {
      if (!Array.isArray(tags)) {
        return "tags must be an array of strings or null.";
      }
      const cleaned = stringArray(tags);
      if (!cleaned || cleaned.length !== tags.length) {
        return "tags must be an array of strings or null.";
      }
      marker["tags"] = cleaned;
    }
    touched.value += 1;
  }
  const lora = params["lora"];
  if (lora !== undefined) {
    if (lora === null) delete marker["lora"];
    else {
      if (!isRecord(lora)) {
        return "lora must be an object ({url?, asset_id?, scale?}) or null.";
      }
      marker["lora"] = lora;
    }
    touched.value += 1;
  }
  const palette = params["palette"];
  if (palette !== undefined) {
    if (palette === null) delete marker["palette"];
    else {
      if (!Array.isArray(palette)) {
        return "palette must be an array of {name?, hex} swatches or null.";
      }
      marker["palette"] = palette;
    }
    touched.value += 1;
  }
  return null;
};

const requireKindNameDescriptor = (
  params: Record<string, unknown>
): { kind: string; name: string; descriptor: string } | ToolError => {
  const kind = params["kind"];
  if (!isString(kind) || !ENTITY_KINDS.has(kind)) {
    return {
      error: `kind must be one of: ${[...ENTITY_KINDS].join(", ")}.`
    };
  }
  for (const field of ["name", "descriptor"] as const) {
    const value = params[field];
    if (!isString(value) || value.trim() === "") {
      return { error: `${field} is required and must be a non-empty string.` };
    }
  }
  return {
    kind,
    name: params["name"] as string,
    descriptor: params["descriptor"] as string
  };
};

/** The metadata write both create_entity and update_entity land through. */
const saveEntityAsset = async (
  run: CapabilityRun,
  assetId: unknown,
  editMarker: (
    marker: Record<string, unknown>,
    existing: Entity | null
  ) => string | null
): Promise<Record<string, unknown>> => {
  if (!isString(assetId) || assetId.trim() === "") {
    return { error: "asset_id is required (the id of an image asset)." };
  }
  const userId = userIdOf(run.context);
  if (!userId) return { error: "No user is bound to this session." };

  const { Asset } = await import("@nodetool-ai/models");
  // An asset owned by someone else reads as missing, the same as get_entity.
  const asset = await Asset.find(userId, assetId.trim());
  if (!asset) {
    return { error: `Asset ${assetId} was not found.` };
  }
  if (!asset.content_type.startsWith("image/")) {
    return {
      error: `${asset.name || asset.id} is a ${asset.content_type} asset; entities are image assets. Generate or upload an image first.`
    };
  }

  const rawMarker = asset.metadata?.[ENTITY_METADATA_KEY];
  const marker: Record<string, unknown> = isRecord(rawMarker)
    ? { ...rawMarker }
    : {};
  const existing = entityFromAsset(asset);
  const problem = editMarker(marker, existing);
  if (problem) return { error: problem };

  asset.metadata = {
    ...(asset.metadata ?? {}),
    [ENTITY_METADATA_KEY]: marker
  };
  await asset.save();
  const entity = entityFromAsset(asset);
  return entity
    ? { entity }
    : { error: "The entity marker was not readable after saving." };
};

const createEntity: CapabilityExport = {
  spec: createEntitySpec,
  impl: async (run, params) => {
    const fields = requireKindNameDescriptor(params);
    if ("error" in fields) return fields;

    return saveEntityAsset(run, params["asset_id"], (marker, existing) => {
      // A malformed leftover marker may be overwritten; a real entity may
      // only be changed through update_entity.
      if (existing) {
        return (
          "That asset is already an entity — use update_entity to change it."
        );
      }
      marker["kind"] = fields.kind;
      marker["name"] = fields.name;
      marker["descriptor"] = fields.descriptor;
      return applyOptionalMarkerFields(marker, params, { value: 0 });
    });
  }
};

const updateEntity: CapabilityExport = {
  spec: updateEntitySpec,
  impl: async (run, params) => {
    const entityId = params["entity_id"];
    if (!isString(entityId) || entityId.trim() === "") {
      return { error: "entity_id is required (use list_entities to find one)." };
    }

    return saveEntityAsset(run, entityId, (marker, existing) => {
      // The same read rule get_entity applies: an asset whose marker does
      // not parse is not in the library at all.
      if (!existing) {
        return `Asset ${entityId} is not an entity — use create_entity to tag it.`;
      }
      const touched = { value: 0 };
      let problem: string | null = null;

      const kind = params["kind"];
      if (kind !== undefined) {
        if (!isString(kind) || !ENTITY_KINDS.has(kind)) {
          problem = `kind must be one of: ${[...ENTITY_KINDS].join(", ")}.`;
        } else {
          marker["kind"] = kind;
          touched.value += 1;
        }
      }
      for (const field of ["name", "descriptor", "description"] as const) {
        const value = params[field];
        if (value === undefined) continue;
        if (
          !isString(value) ||
          (field !== "description" && value.trim() === "")
        ) {
          problem =
            problem ??
            `${field} must be${field === "description" ? " a string" : " a non-empty string"}.`;
          break;
        }
        marker[field] = value;
        touched.value += 1;
      }
      if (problem) return problem;
      problem = applyOptionalMarkerFields(marker, params, touched);
      if (problem) return problem;
      if (touched.value === 0) {
        return (
          "Nothing to update — pass at least one field to change (kind, name, " +
          "descriptor, description, voice_id, tags, lora, palette)."
        );
      }
      return null;
    });
  }
};

/** Every entity capability, in declaration order. */
export const ENTITY_CAPABILITIES: readonly CapabilityExport[] = [
  listEntities,
  getEntity,
  applyEntities,
  createEntity,
  updateEntity
];

export const module: CapabilityModule = {
  module: "entities",
  exports: ENTITY_CAPABILITIES
};

export {
  listEntities,
  getEntity,
  applyEntities,
  createEntity,
  updateEntity
};
