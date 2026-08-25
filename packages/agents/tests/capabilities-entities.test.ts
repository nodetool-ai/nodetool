/**
 * The `entities` capability module — the ingredients library without a browser.
 *
 * The behaviour checks are the two things the marker convention makes easy to
 * get wrong: an asset without a marker (or with an unknown kind) is not an
 * entity, and a prompt is seasoned by the same rule the browser tool uses.
 */

import { describe, expect, it, beforeEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { injectEntities } from "@nodetool-ai/protocol";
import { Asset, initTestDb } from "@nodetool-ai/models";
import {
  ENTITY_CAPABILITIES,
  entityFromAsset,
  module as entitiesModule
} from "../src/capabilities/entities.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import {
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";

const USER = "user-entities";

const context = { userId: USER } as unknown as ProcessingContext;
const run = () => createCapabilityRun({ context, gate: UNGATED });

async function makeEntity(
  name: string,
  kind: string,
  descriptor: string,
  extra: Record<string, unknown> = {}
): Promise<Asset> {
  return (await Asset.create({
    user_id: USER,
    name: `${name}.png`,
    content_type: "image/png",
    metadata: {
      nodetool_entity: { kind, name, descriptor, ...extra }
    }
  })) as Asset;
}

beforeEach(() => {
  initTestDb();
});

describe("entities capability module", () => {
  it("is registered and drift-clean", async () => {
    const loaded = await loadCapabilityModule("entities");
    expect(loaded).toBe(entitiesModule);
    expect(capabilityModuleIssues("entities", loaded)).toEqual([]);
  });

  it("carries the six wire names and the gate's categories", () => {
    expect(ENTITY_CAPABILITIES.map((e) => e.spec.name)).toEqual([
      "list_entities",
      "get_entity",
      "apply_entities",
      "create_entity",
      "update_entity",
      "delete_entity"
    ]);
    for (const entry of ENTITY_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("renders as a Tool, spec for spec", () => {
    for (const entry of ENTITY_CAPABILITIES) {
      const tool = toolForCapabilityName(entry.spec.name);
      expect(tool.description).toBe(entry.spec.description);
      expect(tool.inputSchema).toEqual(entry.spec.inputSchema);
    }
  });
});

describe("the marker convention", () => {
  it("reads an entity off a tagged asset, and nothing off an untagged one", () => {
    const tagged = {
      id: "a1",
      content_type: "image/png",
      created_at: "2026-01-01T00:00:00.000Z",
      metadata: {
        nodetool_entity: {
          kind: "character",
          name: "Mara",
          descriptor: "a tall woman with red hair",
          voice_id: "v1",
          tags: ["lead", 7]
        }
      }
    };
    expect(entityFromAsset(tagged)).toMatchObject({
      type: "entity",
      id: "a1",
      kind: "character",
      name: "Mara",
      voice_id: "v1",
      tags: ["lead"],
      reference_images: [
        { type: "image", asset_id: "a1", uri: "asset://a1.png" }
      ]
    });

    const base = { id: "a2", content_type: "image/png", created_at: "" };
    expect(entityFromAsset({ ...base, metadata: null })).toBeNull();
    expect(
      entityFromAsset({ ...base, metadata: { nodetool_entity: { kind: "vehicle" } } })
    ).toBeNull();
  });
});

describe("entities capabilities against the database", () => {
  it("lists the library, filtered by kind and by text", async () => {
    await makeEntity("Mara", "character", "a tall woman with red hair");
    await makeEntity("Rain City", "location", "wet neon streets at night");
    await Asset.create({
      user_id: USER,
      name: "plain.png",
      content_type: "image/png"
    });
    await makeEntity("Theirs", "character", "not yours");
    const foreign = (await Asset.create({
      user_id: "someone-else",
      name: "foreign.png",
      content_type: "image/png",
      metadata: {
        nodetool_entity: { kind: "prop", name: "Sword", descriptor: "a blade" }
      }
    })) as Asset;

    const all = (await run().invoke("list_entities", {})) as {
      entities: Array<{ id: string; name: string; kind: string }>;
      total: number;
    };
    expect(all.entities.map((e) => e.name).sort()).toEqual([
      "Mara",
      "Rain City",
      "Theirs"
    ]);
    expect(all.entities.some((e) => e.id === foreign.id)).toBe(false);

    const locations = (await run().invoke("list_entities", {
      kind: "location"
    })) as { entities: Array<{ name: string }> };
    expect(locations.entities.map((e) => e.name)).toEqual(["Rain City"]);

    const searched = (await run().invoke("list_entities", {
      query: "red hair"
    })) as { entities: Array<{ name: string }> };
    expect(searched.entities.map((e) => e.name)).toEqual(["Mara"]);
  });

  it("reads one entity, and reports an untagged or foreign asset as missing", async () => {
    const mara = await makeEntity("Mara", "character", "red hair", {
      palette: [{ hex: "#ff0000" }]
    });
    const read = (await run().invoke("get_entity", { entity_id: mara.id })) as {
      entity: { name: string; palette: Array<{ hex: string }> };
    };
    expect(read.entity).toMatchObject({
      name: "Mara",
      palette: [{ hex: "#ff0000" }]
    });

    const plain = (await Asset.create({
      user_id: USER,
      name: "plain.png",
      content_type: "image/png"
    })) as Asset;
    expect(
      await run().invoke("get_entity", { entity_id: plain.id })
    ).toMatchObject({ error: expect.stringMatching(/was not found/) });
    expect(await run().invoke("get_entity", {})).toMatchObject({
      error: expect.stringMatching(/entity_id is required/)
    });
  });

  it("seasons a prompt by name, by explicit id, and reports ids that resolve to nothing", async () => {
    const mara = await makeEntity("Mara", "character", "a tall woman with red hair");
    await makeEntity("Rex", "character", "a golden retriever");

    const byName = (await run().invoke("apply_entities", {
      text: "Mara walks into the room"
    })) as {
      prompt: string;
      referenceAssetIds: string[];
      applied: Array<{ name: string }>;
    };
    expect(byName.prompt).toContain("a tall woman with red hair");
    expect(byName.prompt).not.toContain("golden retriever");
    expect(byName.referenceAssetIds).toEqual([mara.id]);
    expect(byName.applied.map((e) => e.name)).toEqual(["Mara"]);

    const byId = (await run().invoke("apply_entities", {
      text: "A quiet street",
      entity_ids: [mara.id, "gone"]
    })) as { prompt: string; missing_entity_ids: string[] };
    expect(byId.prompt).toContain("a tall woman with red hair");
    expect(byId.missing_entity_ids).toEqual(["gone"]);

    const untouched = (await run().invoke("apply_entities", {
      text: "A quiet street"
    })) as { prompt: string; missing_entity_ids?: string[] };
    expect(untouched.prompt).toBe("A quiet street");
    expect(untouched.missing_entity_ids).toBeUndefined();
  });

  it("seasons exactly the way the shared rule does", async () => {
    const mara = await makeEntity("Mara", "character", "red hair");
    const listed = (await run().invoke("get_entity", {
      entity_id: mara.id
    })) as { entity: Parameters<typeof injectEntities>[1][number] };
    const applied = (await run().invoke("apply_entities", {
      text: "Mara waits"
    })) as { prompt: string };
    expect(applied.prompt).toBe(
      injectEntities("Mara waits", [listed.entity]).prompt
    );
  });
});

describe("create_entity and update_entity", () => {
  it("tags an image asset, keeps its other metadata, and lists it", async () => {
    const asset = (await Asset.create({
      user_id: USER,
      name: "mara.png",
      content_type: "image/png",
      metadata: { prompt: "portrait of Mara" }
    })) as Asset;

    const created = (await run().invoke("create_entity", {
      asset_id: asset.id,
      kind: "character",
      name: "Mara",
      descriptor: "a tall woman with red hair",
      voice_id: "v1"
    })) as {
      entity: {
        id: string;
        kind: string;
        name: string;
        descriptor: string;
        voice_id: string | null;
        reference_images: Array<{ asset_id: string }>;
      };
    };
    expect(created.entity).toMatchObject({
      id: asset.id,
      kind: "character",
      name: "Mara",
      descriptor: "a tall woman with red hair",
      voice_id: "v1"
    });
    expect(created.entity.reference_images[0].asset_id).toBe(asset.id);

    // The write touches only the marker; the rest of the metadata survives.
    const stored = await Asset.find(USER, asset.id);
    expect(stored?.metadata).toMatchObject({
      prompt: "portrait of Mara",
      nodetool_entity: { kind: "character", name: "Mara" }
    });

    const listed = (await run().invoke("list_entities", {})) as {
      entities: Array<{ id: string }>;
    };
    expect(listed.entities.map((e) => e.id)).toContain(asset.id);
  });

  it("refuses non-image assets and assets that are already entities", async () => {
    const doc = (await Asset.create({
      user_id: USER,
      name: "notes.pdf",
      content_type: "application/pdf"
    })) as Asset;
    expect(
      await run().invoke("create_entity", {
        asset_id: doc.id,
        kind: "prop",
        name: "Notes",
        descriptor: "some pages"
      })
    ).toMatchObject({ error: expect.stringMatching(/entities are image assets/) });

    const mara = await makeEntity("Mara", "character", "red hair");
    expect(
      await run().invoke("create_entity", {
        asset_id: mara.id,
        kind: "character",
        name: "Mara II",
        descriptor: "another look"
      })
    ).toMatchObject({ error: expect.stringMatching(/use update_entity/) });
  });

  it("changes only the fields passed, clears optionals on null, and validates input", async () => {
    const mara = await makeEntity("Mara", "character", "red hair", {
      voice_id: "v1",
      tags: ["lead"]
    });

    const updated = (await run().invoke("update_entity", {
      entity_id: mara.id,
      descriptor: "a tall woman with cropped red hair",
      tags: ["lead", "season-2"],
      voice_id: null
    })) as {
      entity: { name: string; kind: string; descriptor: string; tags?: string[]; voice_id: string | null };
    };
    expect(updated.entity).toEqual(
      expect.objectContaining({
        name: "Mara",
        kind: "character",
        descriptor: "a tall woman with cropped red hair",
        tags: ["lead", "season-2"],
        voice_id: null
      })
    );

    expect(
      await run().invoke("update_entity", {
        entity_id: mara.id,
        kind: "vehicle"
      })
    ).toMatchObject({ error: expect.stringMatching(/kind must be one of/) });
    expect(
      await run().invoke("update_entity", {
        entity_id: mara.id,
        name: "  "
      })
    ).toMatchObject({ error: expect.stringMatching(/non-empty/) });
    expect(await run().invoke("update_entity", {})).toMatchObject({
      error: expect.stringMatching(/entity_id is required/)
    });
    expect(
      await run().invoke("update_entity", { entity_id: mara.id })
    ).toMatchObject({ error: expect.stringMatching(/Nothing to update/) });
  });

  it("reports an untagged or foreign asset as not an entity", async () => {
    const plain = (await Asset.create({
      user_id: USER,
      name: "plain.png",
      content_type: "image/png"
    })) as Asset;
    expect(
      await run().invoke("update_entity", { entity_id: plain.id })
    ).toMatchObject({
      error: expect.stringMatching(/use create_entity to tag it/)
    });
    expect(
      await run().invoke("create_entity", {
        asset_id: "gone",
        kind: "style",
        name: "Noir",
        descriptor: "high contrast"
      })
    ).toMatchObject({ error: expect.stringMatching(/was not found/) });
  });

  it("moves an entity to a new image asset when asset_id is passed", async () => {
    const mara = await makeEntity("Mara", "character", "red hair", {
      voice_id: "v1"
    });
    const target = (await Asset.create({
      user_id: USER,
      name: "mara2.png",
      content_type: "image/png"
    })) as Asset;

    const moved = (await run().invoke("update_entity", {
      entity_id: mara.id,
      asset_id: target.id,
      descriptor: "a tall woman with cropped red hair"
    })) as {
      entity: { id: string; descriptor: string; voice_id: string | null };
      moved_from: string;
      moved_to: string;
    };
    expect(moved.entity.id).toBe(target.id);
    expect(moved.entity.descriptor).toBe("a tall woman with cropped red hair");
    expect(moved.moved_from).toBe(mara.id);
    expect(moved.moved_to).toBe(target.id);

    // Source no longer lists, target does; source asset keeps bytes.
    const listed = (await run().invoke("list_entities", {})) as {
      entities: Array<{ id: string }>;
    };
    expect(listed.entities.map((e) => e.id)).not.toContain(mara.id);
    expect(listed.entities.map((e) => e.id)).toContain(target.id);
    const sourceStill = await Asset.find(USER, mara.id);
    expect(sourceStill?.metadata?.["nodetool_entity"]).toBeUndefined();

    // Refuses a target that is already an entity or not an image.
    const other = await makeEntity("Rex", "character", "a dog");
    expect(
      await run().invoke("update_entity", {
        entity_id: target.id,
        asset_id: other.id
      })
    ).toMatchObject({ error: expect.stringMatching(/already an entity/) });
    const doc = (await Asset.create({
      user_id: USER,
      name: "notes.pdf",
      content_type: "application/pdf"
    })) as Asset;
    expect(
      await run().invoke("update_entity", {
        entity_id: target.id,
        asset_id: doc.id
      })
    ).toMatchObject({ error: expect.stringMatching(/entities are image assets/) });
  });

  it("removes the marker but keeps the asset, and reports missing ids", async () => {
    const mara = await makeEntity("Mara", "character", "red hair");
    const plain = (await Asset.create({
      user_id: USER,
      name: "plain.png",
      content_type: "image/png"
    })) as Asset;

    const removed = (await run().invoke("delete_entity", {
      entity_id: mara.id
    })) as { ok: boolean; entity_id: string };
    expect(removed).toMatchObject({ ok: true, entity_id: mara.id });

    const listed = (await run().invoke("list_entities", {})) as {
      entities: Array<{ id: string }>;
    };
    expect(listed.entities.map((e) => e.id)).not.toContain(mara.id);

    expect(
      await run().invoke("get_entity", { entity_id: mara.id })
    ).toMatchObject({ error: expect.stringMatching(/was not found/) });

    const asset = await Asset.find(USER, mara.id);
    expect(asset).not.toBeNull();
    expect(asset?.metadata?.["nodetool_entity"]).toBeUndefined();

    expect(
      await run().invoke("delete_entity", { entity_id: plain.id })
    ).toMatchObject({ error: expect.stringMatching(/was not found/) });
    expect(
      await run().invoke("delete_entity", {})
    ).toMatchObject({ error: expect.stringMatching(/entity_id is required/) });
  });
});
