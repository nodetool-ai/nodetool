/**
 * The model interfaces a graph uses to reach the documents a director approves:
 * storyboards, the entity library, and the shipped game templates.
 *
 * They live here rather than in `session/model-interfaces.ts` so the CLI's
 * local (no-server) runs get the same implementations — a `nodetool debug` run
 * of a graph that recasts a board has to write the same rows the server does,
 * or the harness proves nothing about the server.
 */

import { Asset, Storyboard, entityFromAsset } from "@nodetool-ai/models";
import {
  ENTITY_METADATA_KEY,
  isRecord,
  readEntityMarker,
  type Entity
} from "@nodetool-ai/protocol";
import type {
  EntityUpsertArgs,
  GameTemplateInfo,
  ProcessingContextModelInterfaces
} from "@nodetool-ai/runtime";

/** How many of the caller's image assets a library scan reads. */
const ENTITY_ASSET_LIMIT = 1000;

const norm = (value: string): string => value.trim().toLowerCase();

/**
 * The entity row an upsert writes to: the one a previous run of the same graph
 * made (`source.key`), else the one with the same kind and name in the same
 * project. Null when neither exists and the entity is new.
 */
async function findUpsertTarget(args: EntityUpsertArgs): Promise<Asset | null> {
  const [assets] = await Asset.paginate(args.userId, {
    contentType: "image",
    projectId: args.projectId,
    limit: ENTITY_ASSET_LIMIT
  });
  const markers = assets.map(
    (asset) => [asset, readEntityMarker(asset.metadata)] as const
  );
  const key = args.source?.key?.trim();
  if (key) {
    const bySource = markers.find(
      ([, marker]) => marker?.source?.key === key
    );
    if (bySource) return bySource[0];
  }
  const name = norm(args.name);
  return (
    markers.find(
      ([, marker]) =>
        !!marker && marker.kind === args.kind && norm(marker.name) === name
    )?.[0] ?? null
  );
}

/**
 * Write the marker fields onto an asset's metadata and save it. Optional
 * fields are left alone when the caller did not pass them, so a re-run that
 * only knows the name and descriptor does not wipe a hand-written description.
 */
async function writeEntityMarker(
  asset: Asset,
  args: EntityUpsertArgs
): Promise<Entity> {
  const refusal = Asset.systemEntityRefusal(asset);
  if (refusal) {
    throw new Error(refusal);
  }
  const raw = asset.metadata?.[ENTITY_METADATA_KEY];
  const marker: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  marker["kind"] = args.kind;
  marker["name"] = args.name;
  marker["descriptor"] = args.descriptor;
  if (args.description !== undefined) marker["description"] = args.description;
  if (args.tags !== undefined) marker["tags"] = args.tags;
  if (args.voiceId !== undefined) {
    if (args.voiceId === null) delete marker["voice_id"];
    else marker["voice_id"] = args.voiceId;
  }
  if (args.source !== undefined) marker["source"] = { ...args.source };
  // A swap points the entity's picture at another asset rather than moving the
  // marker: the id boards and scripts store is the marker asset's, and moving
  // it would leave every one of those references dangling.
  if (args.imageAssetId && args.imageAssetId !== asset.id) {
    marker["reference_asset_id"] = args.imageAssetId;
  } else {
    delete marker["reference_asset_id"];
  }

  asset.metadata = { ...(asset.metadata ?? {}), [ENTITY_METADATA_KEY]: marker };
  if (args.projectId) {
    asset.project_id = args.projectId;
  }
  await asset.save();

  const entity = entityFromAsset(asset);
  if (!entity) {
    throw new Error(`Entity marker on asset ${asset.id} was not readable`);
  }
  return entity;
}

/** Storyboards, mirroring the script trio: owner-scoped reads, CAS updates. */
export function storyboardModelInterfaces(): Pick<
  ProcessingContextModelInterfaces,
  "getStoryboard" | "listStoryboards" | "createStoryboard" | "updateStoryboard"
> {
  return {
    getStoryboard: async ({ userId, id }) => {
      const board = await Storyboard.findById(id);
      if (!board || board.user_id !== userId) return null;
      return board.toResponse();
    },
    listStoryboards: async ({ userId, projectId, limit }) => {
      const boards = projectId
        ? await Storyboard.listByProject(projectId, userId, limit)
        : await Storyboard.listByUser(userId, limit);
      return boards.map((board) => board.toResponse());
    },
    createStoryboard: async ({ userId, name, projectId, document }) => {
      const board = new Storyboard({
        user_id: userId,
        name: name ?? "Untitled storyboard",
        project_id: projectId ?? "default",
        document: JSON.stringify(document)
      });
      await board.save();
      return board.toResponse();
    },
    updateStoryboard: async ({
      userId,
      id,
      document,
      timelineId,
      baseUpdatedAt
    }) => {
      const existing = await Storyboard.findById(id);
      if (!existing || existing.user_id !== userId) return null;
      const fields: Partial<{
        document: string;
        timeline_id: string | null;
      }> = {};
      if (document !== undefined) fields.document = JSON.stringify(document);
      if (timelineId !== undefined) fields.timeline_id = timelineId;
      const updated = await Storyboard.updateFieldsIfUnchanged(
        id,
        baseUpdatedAt ?? existing.updated_at,
        fields
      );
      return updated ? updated.toResponse() : null;
    }
  };
}

/**
 * The entity library. An entity is an image asset carrying a marker, so every
 * read here is an owner-scoped asset read and every write is a metadata write —
 * the same path the `entities` agent capability takes.
 */
export function entityModelInterfaces(): Pick<
  ProcessingContextModelInterfaces,
  "listEntities" | "getEntity" | "upsertEntity"
> {
  return {
    listEntities: async ({ userId, projectId, kind, tags, nameContains, limit }) => {
      const [assets] = await Asset.paginate(userId, {
        contentType: "image",
        projectId,
        limit: ENTITY_ASSET_LIMIT
      });
      const wanted = nameContains ? norm(nameContains) : "";
      const matched = assets
        .map((asset) => entityFromAsset(asset))
        .filter((entity): entity is Entity => entity !== null)
        .filter((entity) => {
          if (kind && entity.kind !== kind) return false;
          if (wanted && !norm(entity.name).includes(wanted)) return false;
          if (tags && tags.length > 0) {
            const own = entity.tags ?? [];
            if (!tags.every((tag) => own.includes(tag))) return false;
          }
          return true;
        });
      return limit !== undefined ? matched.slice(0, Math.max(limit, 0)) : matched;
    },
    getEntity: async ({ userId, id }) => {
      // An asset owned by someone else reads as missing, and an untagged one is
      // not an entity — the library only sees assets carrying the marker.
      const asset = await Asset.find(userId, id);
      return asset ? entityFromAsset(asset) : null;
    },
    upsertEntity: async (args) => {
      const existing = await findUpsertTarget(args);
      if (existing) {
        return writeEntityMarker(existing, args);
      }
      const asset = await Asset.find(args.userId, args.imageAssetId);
      if (!asset) {
        throw new Error(`Asset ${args.imageAssetId} was not found`);
      }
      if (!asset.content_type.startsWith("image/")) {
        throw new Error(
          `${asset.name || asset.id} is a ${asset.content_type} asset; entities are image assets`
        );
      }
      return writeEntityMarker(asset, args);
    }
  };
}

/** The shipped Godot templates, read from disk once per call. */
export function gameTemplateModelInterfaces(): Pick<
  ProcessingContextModelInterfaces,
  "listGameTemplates"
> {
  return {
    listGameTemplates: async (): Promise<GameTemplateInfo[]> => {
      const { listTemplates } = await import("@nodetool-ai/godot-templates");
      return listTemplates().map((template) => ({
        id: template.id,
        manifest: template.manifest
      }));
    }
  };
}

/** All three groups, for a host installing the whole document surface. */
export function documentModelInterfaces(): ProcessingContextModelInterfaces {
  return {
    ...storyboardModelInterfaces(),
    ...entityModelInterfaces(),
    ...gameTemplateModelInterfaces()
  };
}
