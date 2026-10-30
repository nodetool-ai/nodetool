import { afterEach, beforeEach, expect, it } from "vitest";
import { Asset, initTestDb, ModelObserver, TimelineSequence } from "@nodetool-ai/models";
import { documentModelInterfaces } from "../src/index.js";

beforeEach(() => { initTestDb(); });
afterEach(() => { ModelObserver.clear(); });

it("keeps document ownership and compare-and-swap updates in the shared implementation", async () => {
  const services = documentModelInterfaces();
  const row = await TimelineSequence.create({ user_id: "owner", project_id: "default", name: "Original", revision: 3 });
  const snapshot = row.toTimelineSequence();
  expect(await services.getTimelineSequence!({ userId: "other", id: row.id })).toBeNull();
  expect(await services.updateTimelineSequence!({ userId: "other", id: row.id, sequence: snapshot })).toBeNull();
  expect(await services.updateTimelineSequence!({ userId: "owner", id: row.id, sequence: { ...snapshot, name: "Edited" } })).not.toBeNull();
  expect(await services.updateTimelineSequence!({ userId: "owner", id: row.id, sequence: { ...snapshot, name: "Stale" } })).toBeNull();
  expect((await TimelineSequence.findById(row.id))?.name).toBe("Edited");
});

it("refuses foreign image assets when upserting an entity", async () => {
  const services = documentModelInterfaces();
  const image = await Asset.create({ user_id: "other", name: "Foreign", content_type: "image/png" });
  await expect(services.upsertEntity!({ userId: "owner", kind: "prop", name: "Product", descriptor: "Fixture", imageAssetId: image.id })).rejects.toThrow();
  expect((await Asset.find("other", image.id))?.metadata).toBeNull();
});
