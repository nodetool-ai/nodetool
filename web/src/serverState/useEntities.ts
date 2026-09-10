/**
 * useEntities — the reusable production "ingredients" (characters, locations,
 * styles, props) the creative agent injects for cross-shot consistency.
 *
 * Storage convention: an entity is an ordinary image asset carrying an
 * {@link EntityMarker} under `metadata.nodetool_entity`. The asset's own bytes
 * are the entity's primary reference image (`asset://<id>`); the marker holds the
 * kind/name/descriptor and other prompt-injection fields. Tagging and untagging
 * never create or delete the underlying asset — they only write the marker.
 *
 * Swapping an entity's picture writes `reference_asset_id` onto that marker
 * rather than moving it to the other asset: boards and scripts store the entity
 * id, so an entity that changed asset would leave every one of them dangling.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult
} from "@tanstack/react-query";
import type { Entity, EntityKind } from "@nodetool-ai/protocol";
import type { Asset } from "../stores/ApiTypes";
import { mediaRefFromAsset } from "../utils/mediaRef";
import { trpcClient } from "../trpc/client";
import { isObjectLike, isString } from "../utils/typePredicates";

/** The Entity-without-images object stored on `metadata.nodetool_entity`. */
interface EntityMarker {
  kind: EntityKind;
  name: string;
  descriptor: string;
  description?: string;
  voice_id?: string | null;
  tags?: string[];
  lora?: Entity["lora"];
  palette?: Entity["palette"];
  /** The image the entity shows, when it is not the marker asset's own bytes. */
  reference_asset_id?: string;
}

const ENTITY_METADATA_KEY = "nodetool_entity";

/**
 * A project's overview lists the entities filed under it, so tagging or
 * untagging one changes what it shows. Matches `invalidateProjectViews` in
 * `resourceChangeHandler` — the tRPC key head is `[router, procedure]`.
 */
const invalidateProjectQueries = (client: QueryClient): void => {
  void client.invalidateQueries({
    predicate: (query) => {
      const head = query.queryKey[0];
      return Array.isArray(head) && head[0] === "projects";
    }
  });
};
const ENTITIES_QUERY_KEY = ["entities"] as const;
const VALID_KINDS: ReadonlySet<string> = new Set([
  "character",
  "location",
  "style",
  "prop"
]);

/** Read the entity marker off an asset's metadata, or null when absent/invalid. */
export function readEntityMarker(
  metadata: Record<string, unknown> | null | undefined
): EntityMarker | null {
  const raw = metadata?.[ENTITY_METADATA_KEY];
  if (!raw || !isObjectLike(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const kind = isString(obj.kind) ? obj.kind : "";
  if (!VALID_KINDS.has(kind)) {
    return null;
  }
  return {
    kind: kind as EntityKind,
    name: isString(obj.name) ? obj.name : "",
    descriptor: isString(obj.descriptor) ? obj.descriptor : "",
    description:
      isString(obj.description) ? obj.description : undefined,
    voice_id: isString(obj.voice_id) ? obj.voice_id : undefined,
    tags: Array.isArray(obj.tags)
      ? obj.tags.filter((t): t is string => typeof t === "string")
      : undefined,
    lora: (obj.lora as EntityMarker["lora"]) ?? undefined,
    palette: (obj.palette as EntityMarker["palette"]) ?? undefined,
    reference_asset_id:
      isString(obj.reference_asset_id) && obj.reference_asset_id.trim() !== ""
        ? obj.reference_asset_id.trim()
        : undefined
  };
}

/**
 * Map a marked asset to an {@link Entity}, using the marker's swapped reference
 * image when it names one and the asset's own bytes otherwise.
 */
export function assetToEntity(asset: Asset): Entity | null {
  const marker = readEntityMarker(asset.metadata);
  if (!marker) {
    return null;
  }
  return {
    type: "entity",
    id: asset.id,
    project_id: asset.project_id ?? "default",
    kind: marker.kind,
    name: marker.name,
    descriptor: marker.descriptor,
    description: marker.description,
    voice_id: marker.voice_id ?? null,
    tags: marker.tags,
    lora: marker.lora ?? null,
    palette: marker.palette ?? null,
    reference_images: [
      mediaRefFromAsset({ id: marker.reference_asset_id ?? asset.id }, "image")
    ],
    created_at: asset.created_at
  };
}

/** Fetch all assets tagged as entities, mapped to {@link Entity} objects. */
export function useEntities(): UseQueryResult<Entity[], Error> {
  return useQuery({
    queryKey: ENTITIES_QUERY_KEY,
    queryFn: async (): Promise<Entity[]> => {
      const result = await trpcClient.assets.search.query({
        query: "",
        page_size: 1000
      });
      const entities: Entity[] = [];
      for (const asset of result.assets) {
        const entity = assetToEntity(asset as Asset);
        if (entity) {
          entities.push(entity);
        }
      }
      return entities;
    },
    staleTime: 30_000
  });
}

interface SaveEntityInput {
  /** The existing image asset to tag as an entity's reference. */
  assetId: string;
  /** Refuse to replace an existing entity marker. */
  createOnly?: boolean;
  /**
   * File the entity under this project. Omitted leaves its membership alone,
   * so editing an entity never moves it. `"default"` takes it out of every
   * project — the loose bucket's id, as everywhere else.
   */
  projectId?: string;
  kind: EntityKind;
  name: string;
  descriptor: string;
  description?: string;
  voice_id?: string | null;
  tags?: string[];
  lora?: Entity["lora"];
  palette?: Entity["palette"];
  /**
   * The image asset the entity should show. Null, undefined, or `assetId`
   * itself means the entity's own bytes.
   */
  reference_asset_id?: string | null;
}

/** Tag (or re-tag) an existing image asset as an entity. */
export function useSaveEntity(): UseMutationResult<
  Entity | null,
  Error,
  SaveEntityInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveEntityInput): Promise<Entity | null> => {
      const asset = await trpcClient.assets.get.query({ id: input.assetId });
      if (input.createOnly && readEntityMarker(asset.metadata)) {
        throw new Error("That image is already used by another entity.");
      }
      const marker: EntityMarker = {
        kind: input.kind,
        name: input.name,
        descriptor: input.descriptor,
        description: input.description,
        voice_id: input.voice_id,
        tags: input.tags,
        lora: input.lora,
        palette: input.palette,
        reference_asset_id:
          input.reference_asset_id && input.reference_asset_id !== input.assetId
            ? input.reference_asset_id
            : undefined
      };
      const updated = await trpcClient.assets.update.mutate({
        id: input.assetId,
        expected_metadata: asset.metadata ?? null,
        metadata: {
          ...(asset.metadata ?? {}),
          [ENTITY_METADATA_KEY]: marker
        }
      });
      // Membership is the projects router's write, not the asset's: it is the
      // one path that checks the project is the caller's before filing
      // anything into it.
      if (input.projectId && input.projectId !== updated.project_id) {
        await trpcClient.projects.assignDocument.mutate({
          projectId: input.projectId,
          type: "entity",
          ref: input.assetId
        });
        return assetToEntity({
          ...updated,
          project_id: input.projectId
        } as Asset);
      }
      return assetToEntity(updated as Asset);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENTITIES_QUERY_KEY });
      invalidateProjectQueries(queryClient);
    }
  });
}

/** Remove the entity marker from an asset. The asset itself is left intact. */
export function useDeleteEntity(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assetId: string): Promise<void> => {
      const asset = await trpcClient.assets.get.query({ id: assetId });
      const nextMetadata = {
        ...(asset.metadata ?? {})
      } satisfies Record<string, unknown>;
      delete nextMetadata[ENTITY_METADATA_KEY];
      await trpcClient.assets.update.mutate({
        id: assetId,
        metadata: nextMetadata
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENTITIES_QUERY_KEY });
      invalidateProjectQueries(queryClient);
    }
  });
}
