/**
 * The validation split is only a measurement if no training record comes
 * from it and it stays the same between runs. These tests pin both: the
 * split matches the checked-in manifest, training tasks never share an id or
 * a request with it, and export rejects runs of held-out tasks.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import { exportSft, type ChatTrace } from "../src/finetune/sft-export.js";
import { runnableSplit } from "../src/finetune/task-sets.js";
import {
  VALIDATION_PER_FAMILY,
  isHeldOut,
  manifestDrift,
  normalizeObjective,
  validationManifest,
  type ValidationEntry
} from "../src/finetune/validation.js";

const MANIFEST = JSON.parse(
  readFileSync(new URL("../scripts/finetune-validation-set.json", import.meta.url), "utf8")
) as ValidationEntry[];

beforeAll(() => {
  initTestDb();
});

describe("validation split", () => {
  it("matches the frozen manifest", async () => {
    const { validation } = await runnableSplit(0);
    expect(manifestDrift(MANIFEST, validationManifest(validation))).toEqual([]);
    expect(MANIFEST.filter((e) => e.id.startsWith("val/")).length % VALIDATION_PER_FAMILY).toBe(0);
    expect(MANIFEST.some((e) => !e.id.startsWith("val/"))).toBe(true);
  });

  it("shares no id or request with the training tasks", async () => {
    const { train, validation } = await runnableSplit(30);
    expect(train.length).toBeGreaterThan(validation.length);
    const heldIds = new Set(validation.map((job) => job.id));
    const heldRequests = new Set(validation.map((job) => normalizeObjective(job.objective)));
    expect(train.filter((job) => heldIds.has(job.id)).map((job) => job.id)).toEqual([]);
    expect(train.filter((job) => heldRequests.has(normalizeObjective(job.objective))).map((job) => job.id)).toEqual([]);
  });

  it("holds out about a third of eval-suite tasks, the same ones every time", () => {
    const ids = Array.from({ length: 300 }, (_, i) => `suite/case-${i}`);
    const held = ids.filter(isHeldOut);
    expect(held.length).toBeGreaterThan(70);
    expect(held.length).toBeLessThan(130);
    expect(ids.filter(isHeldOut)).toEqual(held);
  });

  it("reports drift in either direction", () => {
    const frozen = [{ id: "val/a/000", objective: "Do A." }, { id: "val/b/000", objective: "Do B." }];
    const current = [{ id: "val/a/000", objective: "Do A twice." }, { id: "val/c/000", objective: "Do C." }];
    expect(manifestDrift(frozen, current)).toEqual(["changed val/a/000", "missing val/b/000", "added val/c/000"]);
  });
});

describe("export", () => {
  it("rejects runs of held-out tasks before converting them", () => {
    const trace = { taskId: "val/svg-edit/000", objective: "x" } as ChatTrace;
    const { records, summary } = exportSft([trace], { heldOut: (t) => t.taskId.startsWith("val/") });
    expect(records).toEqual([]);
    expect(summary.rejected).toEqual({ validation: 1 });
  });
});
