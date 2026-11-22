/**
 * Atomic multi-row Asset.applyBatch transactions on SQLite and PostgreSQL (PGlite).
 */
import { afterEach, describe, expect, it } from "vitest";
import { Asset } from "../src/asset.js";
import { ModelChangeEvent, ModelObserver } from "../src/base-model.js";
import { closeDb, getRawDb, initTestDb } from "../src/db.js";
import { initPgliteTestDb } from "./helpers/pglite-test-db.js";

const OWNER = "batch-owner";
const OTHER = "other-user";

const DIALECTS: [string, () => Promise<void>][] = [
  ["sqlite", async () => void initTestDb()],
  ["postgres", initPgliteTestDb]
];

describe.each(DIALECTS)("Asset.applyBatch on %s", { timeout: 60_000 }, (_name, init) => {
  afterEach(async () => {
    ModelObserver.clear();
    await closeDb();
  });

  it("commits updates and deletes together in one transaction and notifies after commit", async () => {
    await init();
    const marker = await Asset.create<Asset>({
      user_id: OWNER,
      name: "folder-drums.step-pattern.json",
      content_type: "application/x-nodetool-step-pattern",
      parent_id: "dir:drums",
      metadata: { step_pattern_folder: { kind: "pattern", name: "Drums", folder: "Step Patterns/Patterns/Drums" } }
    });
    const p1 = await Asset.create<Asset>({
      user_id: OWNER,
      name: "beat-a.step-pattern.json",
      content_type: "application/x-nodetool-step-pattern",
      parent_id: "dir:drums",
      metadata: { step_pattern: { name: "Beat A", kind: "pattern", folder: "Step Patterns/Patterns/Drums" } }
    });
    const p2 = await Asset.create<Asset>({
      user_id: OWNER,
      name: "beat-b.step-pattern.json",
      content_type: "application/x-nodetool-step-pattern",
      parent_id: "dir:drums",
      metadata: { step_pattern: { name: "Beat B", kind: "pattern", folder: "Step Patterns/Patterns/Drums" } }
    });

    const events: Array<{ id: string; event: ModelChangeEvent }> = [];
    ModelObserver.subscribe((inst, event) => {
      events.push({ id: String(inst.id), event });
    }, "Asset");

    const res = await Asset.applyBatch(OWNER, {
      updates: [
        {
          id: p1.id,
          parent_id: "dir:root",
          metadata: { step_pattern: { name: "Beat A", kind: "pattern", folder: "Step Patterns/Patterns" } }
        },
        {
          id: p2.id,
          parent_id: "dir:root",
          metadata: { step_pattern: { name: "Beat B", kind: "pattern", folder: "Step Patterns/Patterns" } }
        }
      ],
      deleteIds: [marker.id]
    });

    expect(res.updated.map((a) => a.id)).toEqual([p1.id, p2.id]);
    expect(res.deleted.map((a) => a.id)).toEqual([marker.id]);
    expect(await Asset.find(OWNER, marker.id)).toBeNull();
    expect((await Asset.find(OWNER, p1.id))?.parent_id).toBe("dir:root");
    expect((await Asset.find(OWNER, p2.id))?.parent_id).toBe("dir:root");
    expect(
      ((await Asset.find(OWNER, p1.id))?.metadata?.["step_pattern"] as Record<string, unknown>)["folder"]
    ).toBe("Step Patterns/Patterns");
    expect(events).toEqual([
      { id: p1.id, event: ModelChangeEvent.UPDATED },
      { id: p2.id, event: ModelChangeEvent.UPDATED },
      { id: marker.id, event: ModelChangeEvent.DELETED }
    ]);
  });

  it("rolls back all earlier updates when a later update or delete targets a missing or foreign row", async () => {
    await init();
    const p1 = await Asset.create<Asset>({
      user_id: OWNER,
      name: "beat-a.step-pattern.json",
      content_type: "application/x-nodetool-step-pattern",
      parent_id: "dir:drums",
      metadata: { step_pattern: { name: "Beat A", kind: "pattern", folder: "Step Patterns/Patterns/Drums" } }
    });
    const foreign = await Asset.create<Asset>({
      user_id: OTHER,
      name: "foreign.step-pattern.json",
      content_type: "application/x-nodetool-step-pattern",
      parent_id: "dir:other",
      metadata: { step_pattern: { name: "Foreign", kind: "pattern", folder: "Step Patterns/Patterns/Other" } }
    });
    const marker = await Asset.create<Asset>({
      user_id: OWNER,
      name: "folder-drums.step-pattern.json",
      content_type: "application/x-nodetool-step-pattern",
      parent_id: "dir:drums",
      metadata: { step_pattern_folder: { kind: "pattern", name: "Drums", folder: "Step Patterns/Patterns/Drums" } }
    });

    const events: ModelChangeEvent[] = [];
    ModelObserver.subscribe((_, event) => events.push(event), "Asset");

    // Fail halfway on a foreign update after p1 was updated inside the tx
    await expect(
      Asset.applyBatch(OWNER, {
        updates: [
          {
            id: p1.id,
            parent_id: "dir:perc",
            metadata: { step_pattern: { name: "Beat A", kind: "pattern", folder: "Step Patterns/Patterns/Perc" } }
          },
          {
            id: foreign.id,
            parent_id: "dir:perc",
            metadata: { step_pattern: { name: "Foreign", kind: "pattern", folder: "Step Patterns/Patterns/Perc" } }
          }
        ]
      })
    ).rejects.toThrow();

    // p1 must not have moved; foreign must be untouched; zero observer events
    const p1AfterUpdateFail = await Asset.find(OWNER, p1.id);
    expect(p1AfterUpdateFail?.parent_id).toBe("dir:drums");
    expect((p1AfterUpdateFail?.metadata?.["step_pattern"] as Record<string, unknown>)["folder"]).toBe(
      "Step Patterns/Patterns/Drums"
    );
    expect((await Asset.find(OTHER, foreign.id))?.parent_id).toBe("dir:other");
    expect(events).toEqual([]);

    // Fail halfway on a missing delete after p1 updated and marker deleted inside the tx
    await expect(
      Asset.applyBatch(OWNER, {
        updates: [
          {
            id: p1.id,
            parent_id: "dir:root",
            metadata: { step_pattern: { name: "Beat A", kind: "pattern", folder: "Step Patterns/Patterns" } }
          }
        ],
        deleteIds: [marker.id, "00000000000000000000000000000000"]
      })
    ).rejects.toThrow();

    expect((await Asset.find(OWNER, p1.id))?.parent_id).toBe("dir:drums");
    expect(await Asset.find(OWNER, marker.id)).not.toBeNull();
    expect(events).toEqual([]);
  });

  it("handles an empty batch as a no-op", async () => {
    await init();
    const res = await Asset.applyBatch(OWNER, { updates: [], deleteIds: [] });
    expect(res).toEqual({ updated: [], deleted: [] });
  });
});

describe("Asset.applyBatch mid-transaction database failure (SQLite trigger)", () => {
  afterEach(async () => {
    ModelObserver.clear();
    await closeDb();
  });

  it("leaves no partial move when the database aborts on the second row", async () => {
    initTestDb();
    const p1 = await Asset.create<Asset>({
      user_id: OWNER,
      name: "beat-a.step-pattern.json",
      content_type: "application/x-nodetool-step-pattern",
      parent_id: "dir:drums",
      metadata: { step_pattern: { name: "Beat A", kind: "pattern", folder: "Step Patterns/Patterns/Drums" } }
    });
    const p2 = await Asset.create<Asset>({
      user_id: OWNER,
      name: "beat-b.step-pattern.json",
      content_type: "application/x-nodetool-step-pattern",
      parent_id: "dir:drums",
      metadata: { step_pattern: { name: "Beat B", kind: "pattern", folder: "Step Patterns/Patterns/Drums" } }
    });

    getRawDb().exec(`
      CREATE TRIGGER fail_second_asset_update
      BEFORE UPDATE ON nodetool_assets
      WHEN NEW.id = '${p2.id}'
      BEGIN
        SELECT RAISE(ABORT, 'simulated halfway db failure');
      END;
    `);

    const events: ModelChangeEvent[] = [];
    ModelObserver.subscribe((_, event) => events.push(event), "Asset");

    await expect(
      Asset.applyBatch(OWNER, {
        updates: [
          {
            id: p1.id,
            parent_id: "dir:perc",
            metadata: { step_pattern: { name: "Beat A", kind: "pattern", folder: "Step Patterns/Patterns/Perc" } }
          },
          {
            id: p2.id,
            parent_id: "dir:perc",
            metadata: { step_pattern: { name: "Beat B", kind: "pattern", folder: "Step Patterns/Patterns/Perc" } }
          }
        ]
      })
    ).rejects.toThrow("simulated halfway db failure");

    const p1After = await Asset.find(OWNER, p1.id);
    const p2After = await Asset.find(OWNER, p2.id);
    expect(p1After?.parent_id).toBe("dir:drums");
    expect((p1After?.metadata?.["step_pattern"] as Record<string, unknown>)["folder"]).toBe(
      "Step Patterns/Patterns/Drums"
    );
    expect(p2After?.parent_id).toBe("dir:drums");
    expect(events).toEqual([]);
  });
});
