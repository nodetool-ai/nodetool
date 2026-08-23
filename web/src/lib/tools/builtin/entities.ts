import { z } from "zod";
import { injectEntities, type Entity } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { trpcClient } from "../../../trpc/client";
import { assetToEntity } from "../../../serverState/useEntities";
import type { Asset } from "../../../stores/ApiTypes";

/**
 * Agent tools for the reusable-entity ("ingredients") library. Entities are
 * image assets tagged with `metadata.nodetool_entity`; these tools list them and
 * inject their descriptors + reference images into a generation prompt for
 * cross-shot consistency.
 */

async function fetchEntities(): Promise<Entity[]> {
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
}

FrontendToolRegistry.register({
  name: "ui_entity_list",
  description:
    "List the reusable production entities (characters, locations, styles, props) in the ingredients library. Returns each entity's id (asset id), name, kind, and descriptor so you can reference them when generating.",
  parameters: z.object({}),
  async execute() {
    const entities = await fetchEntities();
    return {
      ok: true,
      entities: entities.map((entity) => ({
        id: entity.id,
        asset_id: entity.id,
        name: entity.name,
        kind: entity.kind,
        descriptor: entity.descriptor
      }))
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_entity_apply",
  description:
    "Inject entity descriptors into a prompt for cross-shot consistency. Pass the base `text` and optionally `entityIds` to apply specific entities; without ids, entities whose name appears in the text are applied (all of them when the text is empty). Returns the augmented `prompt` and the `referenceAssetIds` of the entities' reference images.",
  parameters: z.object({
    text: z.string(),
    entityIds: z.array(z.string()).optional()
  }),
  async execute({ text, entityIds }) {
    const entities = await fetchEntities();
    const { prompt, referenceAssetIds } = injectEntities(
      text,
      entities,
      entityIds
    );
    return { ok: true, prompt, referenceAssetIds };
  }
});
