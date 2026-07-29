import { z } from "zod";
import type { Entity } from "@nodetool-ai/protocol";
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

/**
 * Inject entity descriptors into a prompt. An entity contributes when its id is
 * in `entityIds` (explicit selection), or — when no ids are given — when its
 * name appears in the text (or the text is empty, meaning all apply). Mirrors
 * the server-side `injectEntities` shape in the Director node.
 */
export function injectEntities(
  text: string,
  entities: Entity[],
  entityIds?: string[]
): { prompt: string; referenceAssetIds: string[] } {
  const base = text ?? "";
  const lower = base.toLowerCase();
  const empty = base.trim().length === 0;
  const explicit =
    entityIds && entityIds.length > 0 ? new Set(entityIds) : null;

  const lines: string[] = [];
  const referenceAssetIds: string[] = [];
  const seen = new Set<string>();

  for (const entity of entities) {
    const descriptor = (entity.descriptor ?? "").trim();
    if (!descriptor) {
      continue;
    }
    const name = (entity.name ?? "").trim();
    const matches = explicit
      ? explicit.has(entity.id)
      : empty || (name.length > 0 && lower.includes(name.toLowerCase()));
    if (!matches) {
      continue;
    }

    const key = `${name}: ${descriptor}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    lines.push(name ? `- ${name}: ${descriptor}` : `- ${descriptor}`);
    for (const image of entity.reference_images ?? []) {
      if (image.asset_id) {
        referenceAssetIds.push(image.asset_id);
      }
    }
  }

  const prompt =
    lines.length > 0
      ? `${base}\n\nConsistency references:\n${lines.join("\n")}`
      : base;
  return { prompt, referenceAssetIds };
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
