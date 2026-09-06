/**
 * `nodetool.entity.*` against an in-memory entity library.
 *
 * The fake `listEntities`/`getEntity`/`upsertEntity` mirror the rules the
 * websocket host implements: a read is owner-scoped and filtered, and an upsert
 * finds its row by `source.key` first and by (kind, name) second. The identity
 * rule is the point of these nodes — a catalog batch that runs monthly must
 * update the entities it made last month, not add a second copy of each.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type {
  Entity,
  EntityKind,
  ProcessingContextModelInterfaces
} from "@nodetool-ai/runtime";

import {
  CreateEntityNode,
  ListEntitiesNode,
  LoadEntityNode
} from "../src/nodes/entity.js";

type UpsertArgs = Parameters<
  NonNullable<ProcessingContextModelInterfaces["upsertEntity"]>
>[0];

function makeEntity(
  id: string,
  kind: EntityKind,
  name: string,
  descriptor: string,
  extra: Partial<Entity> = {}
): Entity {
  return {
    type: "entity",
    id,
    kind,
    name,
    descriptor,
    reference_images: [
      { type: "image", asset_id: id, uri: `asset://${id}.png` }
    ],
    ...extra
  };
}

/** An entity library held in a Map, wired as model interfaces. */
function library(seed: Entity[] = []) {
  const rows = new Map<string, Entity>(seed.map((row) => [row.id, row]));

  const find = (args: UpsertArgs): Entity | undefined => {
    const key = args.source?.key?.trim();
    if (key) {
      const byKey = [...rows.values()].find(
        (row) => row.source?.key === key
      );
      if (byKey) return byKey;
    }
    const name = args.name.trim().toLowerCase();
    return [...rows.values()].find(
      (row) => row.kind === args.kind && row.name.trim().toLowerCase() === name
    );
  };

  const interfaces: ProcessingContextModelInterfaces = {
    listEntities: async ({ kind, tags, nameContains, projectId }) =>
      [...rows.values()].filter((row) => {
        if (kind && row.kind !== kind) return false;
        if (projectId && row.project_id !== projectId) return false;
        if (
          nameContains &&
          !row.name.toLowerCase().includes(nameContains.toLowerCase())
        ) {
          return false;
        }
        if (tags && tags.length > 0) {
          const own = row.tags ?? [];
          if (!tags.every((tag) => own.includes(tag))) return false;
        }
        return true;
      }),
    getEntity: async ({ id }) => rows.get(id) ?? null,
    upsertEntity: async (args) => {
      const existing = find(args);
      const id = existing?.id ?? args.imageAssetId;
      const row: Entity = {
        ...(existing ?? {}),
        type: "entity",
        id,
        kind: args.kind,
        name: args.name,
        descriptor: args.descriptor,
        reference_images: [
          {
            type: "image",
            asset_id: args.imageAssetId,
            uri: `asset://${args.imageAssetId}.png`
          }
        ],
        ...(args.description !== undefined
          ? { description: args.description }
          : {}),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.voiceId !== undefined ? { voice_id: args.voiceId } : {}),
        ...(args.source !== undefined ? { source: args.source } : {})
      };
      rows.set(id, row);
      return { entity: row, created: existing === undefined };
    }
  };

  return { rows, interfaces };
}

function contextWith(interfaces?: ProcessingContextModelInterfaces) {
  const context = new ProcessingContext({ jobId: "job-1", userId: "user-1" });
  if (interfaces) context.setModelInterfaces(interfaces);
  return context;
}

const FOX = makeEntity("e-fox", "character", "Fox", "a red fox in a blue coat", {
  voice_id: "voice-7",
  tags: ["cast"]
});
const ALLEY = makeEntity("e-alley", "location", "Alley", "a wet neon alley");

describe("LoadEntityNode", () => {
  it("reads the library row for a picked entity whose fields are stale", async () => {
    const lib = library([FOX]);
    const node = new LoadEntityNode();
    // What the picker stores: the id plus a cache that has gone stale.
    node.assign({
      entity: {
        type: "entity",
        id: "e-fox",
        kind: "character",
        name: "Fox",
        descriptor: ""
      }
    });

    const out = await node.process(contextWith(lib.interfaces));

    expect(out.entity.id).toBe("e-fox");
    expect(out.descriptor).toBe("a red fox in a blue coat");
    expect(out.name).toBe("Fox");
    expect(out.kind).toBe("character");
    expect(out.voice_id).toBe("voice-7");
    expect(out.reference_image.uri).toBe("asset://e-fox.png");
  });

  it("looks an entity up by name, narrowed by kind", async () => {
    const lib = library([FOX, ALLEY, makeEntity("e-fox-prop", "prop", "Fox", "a fox plush")]);
    const node = new LoadEntityNode();
    node.assign({ name: "fox", kind: "prop" });

    const out = await node.process(contextWith(lib.interfaces));

    expect(out.entity.id).toBe("e-fox-prop");
    expect(out.descriptor).toBe("a fox plush");
  });

  it("keeps an inline entity when no library is wired", async () => {
    const node = new LoadEntityNode();
    node.assign({
      entity: {
        type: "entity",
        id: "inline",
        kind: "style",
        name: "Noir",
        descriptor: "high-contrast black and white"
      }
    });

    const out = await node.process(contextWith());

    expect(out.descriptor).toBe("high-contrast black and white");
    expect(out.reference_image.uri).toBe("");
  });

  it("fails with the name it could not find", async () => {
    const lib = library([FOX]);
    const node = new LoadEntityNode();
    node.assign({ name: "Badger" });

    await expect(node.process(contextWith(lib.interfaces))).rejects.toThrow(
      /no entity named "Badger"/
    );
  });

  it("fails when neither an entity nor a name is given", async () => {
    const node = new LoadEntityNode();

    await expect(node.process(contextWith())).rejects.toThrow(
      /pick an entity or give a name/
    );
  });
});

describe("ListEntitiesNode", () => {
  it("filters by kind, tags and name", async () => {
    const lib = library([FOX, ALLEY]);
    const node = new ListEntitiesNode();
    node.assign({ kind: "character", tags: ["cast"], name_contains: "fo" });

    const out = await node.process(contextWith(lib.interfaces));

    expect(out.entities.map((entity) => entity.id)).toEqual(["e-fox"]);
  });

  it("streams one entity per row, then the whole list", async () => {
    const lib = library([FOX, ALLEY]);
    const node = new ListEntitiesNode();

    const yielded: Array<Partial<{ entity: Entity; entities: Entity[] }>> = [];
    for await (const chunk of node.genProcess(contextWith(lib.interfaces))) {
      yielded.push(chunk);
    }

    expect(yielded).toHaveLength(3);
    expect(yielded[0].entity?.id).toBe("e-fox");
    expect(yielded[1].entity?.id).toBe("e-alley");
    expect(yielded[2].entities?.map((entity) => entity.id)).toEqual([
      "e-fox",
      "e-alley"
    ]);
  });

  it("declares every streamed key as an output slot", () => {
    const declared = Object.keys(ListEntitiesNode.metadataOutputTypes);
    expect(declared.sort()).toEqual(["entities", "entity"]);
  });
});

describe("CreateEntityNode", () => {
  let lib: ReturnType<typeof library>;

  beforeEach(() => {
    lib = library();
  });

  const node = (props: Record<string, unknown>) => {
    const created = new CreateEntityNode();
    created.assign(props);
    return created;
  };

  it("upserts on key, so a re-run keeps the same entity id", async () => {
    const context = contextWith(lib.interfaces);
    const props = {
      image: { type: "image", asset_id: "asset-sku-9", uri: "asset://asset-sku-9.png" },
      kind: "prop",
      name: "Trail Runner",
      descriptor: "a grey trail shoe with an orange sole",
      key: "SKU-9"
    };

    const first = await node(props).process(context);
    // The second run renames the product; the key still finds its own row.
    const second = await node({ ...props, name: "Trail Runner v2" }).process(
      context
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entity.id).toBe(first.entity.id);
    expect(second.entity.name).toBe("Trail Runner v2");
    expect(lib.rows.size).toBe(1);
  });

  it("falls back to (kind, name) when no key is given", async () => {
    const context = contextWith(lib.interfaces);
    const props = {
      image: { type: "image", asset_id: "asset-fox" },
      kind: "character",
      name: "Fox",
      descriptor: "a red fox in a blue coat",
      tags: ["cast"],
      voice_id: "voice-7"
    };

    const first = await node(props).process(context);
    const second = await node(props).process(context);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entity.id).toBe(first.entity.id);
    expect(second.entity.tags).toEqual(["cast"]);
    expect(second.entity.voice_id).toBe("voice-7");
    expect(lib.rows.size).toBe(1);
  });

  it("stamps the upsert key on the entity's source marker", async () => {
    const context = contextWith(lib.interfaces);
    const out = await node({
      image: { type: "image", asset_id: "asset-sku-9" },
      kind: "prop",
      name: "Trail Runner",
      descriptor: "a grey trail shoe",
      key: "SKU-9"
    }).process(context);

    expect(out.entity.source?.key).toBe("SKU-9");
  });

  it("takes the asset id out of an asset:// uri when the ref carries no id", async () => {
    const context = contextWith(lib.interfaces);
    const out = await node({
      image: { type: "image", uri: "asset://asset-from-uri.png" },
      kind: "prop",
      name: "Mug",
      descriptor: "a chipped enamel mug"
    }).process(context);

    expect(out.entity.id).toBe("asset-from-uri");
  });

  it("saves loose image bytes as an asset and tags that row", async () => {
    const createAsset = vi.fn(async () => ({ id: "asset-new" }));
    const context = contextWith({ ...lib.interfaces, createAsset });
    const out = await node({
      image: { type: "image", data: new Uint8Array([1, 2, 3]) },
      kind: "prop",
      name: "Mug",
      descriptor: "a chipped enamel mug"
    }).process(context);

    expect(createAsset).toHaveBeenCalledTimes(1);
    expect(out.entity.id).toBe("asset-new");
  });

  it("refuses an image with neither an asset id nor bytes", async () => {
    const context = contextWith(lib.interfaces);

    await expect(
      node({
        image: { type: "image", uri: "" },
        kind: "prop",
        name: "Mug",
        descriptor: "a chipped enamel mug"
      }).process(context)
    ).rejects.toThrow(/neither an asset id nor bytes/);
  });

  it("refuses a nameless entity before touching the library", async () => {
    const context = contextWith(lib.interfaces);

    await expect(
      node({
        image: { type: "image", asset_id: "asset-1" },
        kind: "prop",
        descriptor: "a chipped enamel mug"
      }).process(context)
    ).rejects.toThrow(/name is required/);
    expect(lib.rows.size).toBe(0);
  });
});
