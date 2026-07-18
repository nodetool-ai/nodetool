/**
 * useEntities — the reusable production "ingredients" (characters, locations,
 * styles, props) the creative agent injects for cross-shot consistency.
 *
 * Storage convention: an entity is an ordinary image asset carrying an
 * {@link EntityMarker} under `metadata.nodetool_entity`. The asset's own bytes
 * are the entity's primary reference image (`get_url`); the marker holds the
 * kind/name/descriptor and other prompt-injection fields. Tagging and untagging
 * never create or delete the underlying asset — they only write the marker.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Entity, EntityKind } from "@nodetool-ai/protocol";
import type { Asset } from "../stores/ApiTypes";
import { trpcClient } from "../trpc/client";

/** The Entity-without-images object stored on `metadata.nodetool_entity`. */
export interface EntityMarker {
  kind: EntityKind;
  name: string;
  descriptor: string;
  description?: string;
  voice_id?: string | null;
  tags?: string[];
  lora?: Entity["lora"];
  palette?: Entity["palette"];
}

export const ENTITY_METADATA_KEY = "nodetool_entity";
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
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const kind = typeof obj.kind === "string" ? obj.kind : "";
  if (!VALID_KINDS.has(kind)) {
    return null;
  }
  return {
    kind: kind as EntityKind,
    name: typeof obj.name === "string" ? obj.name : "",
    descriptor: typeof obj.descriptor === "string" ? obj.descriptor : "",
    description:
      typeof obj.description === "string" ? obj.description : undefined,
    voice_id: typeof obj.voice_id === "string" ? obj.voice_id : undefined,
    tags: Array.isArray(obj.tags)
      ? obj.tags.filter((t): t is string => typeof t === "string")
      : undefined,
    lora: (obj.lora as EntityMarker["lora"]) ?? undefined,
    palette: (obj.palette as EntityMarker["palette"]) ?? undefined
  };
}

/** Map a marked asset to an {@link Entity}, using the asset itself as the ref image. */
export function assetToEntity(asset: Asset): Entity | null {
  const marker = readEntityMarker(asset.metadata);
  if (!marker) {
    return null;
  }
  return {
    type: "entity",
    id: asset.id,
    kind: marker.kind,
    name: marker.name,
    descriptor: marker.descriptor,
    description: marker.description,
    voice_id: marker.voice_id ?? null,
    tags: marker.tags,
    lora: marker.lora ?? null,
    palette: marker.palette ?? null,
    reference_images: asset.get_url
      ? [{ type: "image", asset_id: asset.id, uri: asset.get_url }]
      : [],
    created_at: asset.created_at
  };
}

/** Fetch all assets tagged as entities, mapped to {@link Entity} objects. */
export function useEntities() {
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

export interface SaveEntityInput {
  /** The existing image asset to tag as an entity's reference. */
  assetId: string;
  kind: EntityKind;
  name: string;
  descriptor: string;
  description?: string;
  voice_id?: string | null;
  tags?: string[];
  lora?: Entity["lora"];
  palette?: Entity["palette"];
}

/** Tag (or re-tag) an existing image asset as an entity. */
export function useSaveEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveEntityInput): Promise<Entity | null> => {
      const asset = await trpcClient.assets.get.query({ id: input.assetId });
      const marker: EntityMarker = {
        kind: input.kind,
        name: input.name,
        descriptor: input.descriptor,
        description: input.description,
        voice_id: input.voice_id,
        tags: input.tags,
        lora: input.lora,
        palette: input.palette
      };
      const updated = await trpcClient.assets.update.mutate({
        id: input.assetId,
        metadata: {
          ...(asset.metadata ?? {}),
          [ENTITY_METADATA_KEY]: marker
        }
      });
      return assetToEntity(updated as Asset);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENTITIES_QUERY_KEY });
    }
  });
}

/** Remove the entity marker from an asset. The asset itself is left intact. */
export function useDeleteEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assetId: string): Promise<void> => {
      const asset = await trpcClient.assets.get.query({ id: assetId });
      const nextMetadata: Record<string, unknown> = {
        ...(asset.metadata ?? {})
      };
      delete nextMetadata[ENTITY_METADATA_KEY];
      await trpcClient.assets.update.mutate({
        id: assetId,
        metadata: nextMetadata
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENTITIES_QUERY_KEY });
    }
  });
}
