import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Entity, Shot } from "@nodetool-ai/protocol";
import { trpcClient, type RouterOutputs } from "../trpc/client";
import { assetToEntity } from "./useEntities";

type OwnedAsset = RouterOutputs["assets"]["get"];
export interface StoryboardDesignSources {
  readonly assetsByReference: Readonly<Record<string, OwnedAsset>>;
  readonly entitiesByReference: Readonly<Record<string, Entity>>;
  /** Pixel size of each image asset, so the design frame fits it the way finishing does. */
  readonly imageSizes: Readonly<Record<string, { width: number; height: number }>>;
}

function measureImage(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    // An unmeasured image keeps its default slot.
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** Read explicit references through the owned-asset boundary, independent of catalogs. */
export function useStoryboardDesignSources(
  shots: readonly Shot[]
): UseQueryResult<StoryboardDesignSources, Error> {
  const entityIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const shot of shots) {
    for (const element of shot.graphics?.elements ?? []) {
      const protection = shot.production?.protected_inputs?.find(
        (input) => input.id === element.protected_input_id
      );
      const entityId = element.entity_id ?? protection?.entity_id;
      if (!entityId) {
        continue;
      }
      entityIds.add(entityId);
      if (protection?.entity_id) {
        entityIds.add(protection.entity_id);
      }
      if (element.asset_id) {
        assetIds.add(element.asset_id);
      }
      if (protection?.asset_id) {
        assetIds.add(protection.asset_id);
      }
    }
  }
  const references = [...new Set([...entityIds, ...assetIds])].sort();
  return useQuery({
    queryKey: ["assets", "storyboard-design-sources", [...entityIds].sort(), references],
    enabled: entityIds.size > 0,
    queryFn: async (): Promise<StoryboardDesignSources> => {
      const requested = new Map<string, Promise<OwnedAsset>>();
      const load = (id: string): Promise<OwnedAsset> => {
        let pending = requested.get(id);
        if (!pending) {
          pending = trpcClient.assets.get.query({id});
          requested.set(id, pending);
        }
        return pending;
      };
      await Promise.all(references.map(load));
      const entitiesByReference: Record<string, Entity> = {};
      await Promise.all([...entityIds].map(async id => {
        const asset = await load(id);
        const entity = assetToEntity(asset);
        if (!entity) {
          throw new Error(`Entity ${id} is unavailable or is not an entity.`);
        }
        const referenceId = entity.reference_images?.[0]?.asset_id;
        if (!referenceId) {
          throw new Error(`Entity ${id} needs a reference image before its design frame can be reviewed.`);
        }
        const reference = await load(referenceId);
        if (!reference.content_type.startsWith("image/")) {
          throw new Error(`Entity ${id} needs an image reference.`);
        }
        entitiesByReference[id] = {
          ...entity,
          reference_images: [{type: "image", asset_id: reference.id}]
        };
      }));
      const assetsByReference: Record<string, OwnedAsset> = {};
      for (const [id, pending] of requested) {
        assetsByReference[id] = await pending;
      }
      const imageSizes: Record<string, { width: number; height: number }> = {};
      await Promise.all(Object.values(assetsByReference).map(async (asset) => {
        if (!asset.content_type.startsWith("image/") || !asset.get_url || imageSizes[asset.id]) {
          return;
        }
        const size = await measureImage(asset.get_url);
        if (size && size.width > 0 && size.height > 0) {
          imageSizes[asset.id] = size;
        }
      }));
      return {assetsByReference, entitiesByReference, imageSizes};
    }
  });
}
