import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initTestDb,
  ModelObserver,
  TimelineSequence
} from "@nodetool-ai/models";
import { documentModelInterfaces } from "@nodetool-ai/websocket/documents";
import { localModelInterfaces } from "../src/local-model-interfaces.js";

beforeEach(() => initTestDb());
afterEach(() => ModelObserver.clear());

for (const [name, factory] of [
  ["shared", async () => documentModelInterfaces()],
  ["CLI", localModelInterfaces]
] as const) {
  describe(`${name} timeline persistence`, () => {
    it("refuses stale snapshots and increases the stored revision on fresh updates", async () => {
      const shared = documentModelInterfaces();
      const adapter = await factory();
      const row = await TimelineSequence.create({
        user_id: "owner",
        project_id: "default",
        name: "Timeline",
        revision: 9
      });
      const stale = row.toTimelineSequence();
      const markers = [{ id: "marker", timeMs: 100, label: "keep-me" }];
      const committed = await shared.updateTimelineSequence!({
        userId: "owner",
        id: row.id,
        sequence: { ...stale, markers }
      });
      expect(committed).not.toBeNull();
      const before = await TimelineSequence.findById(row.id);
      expect(
        await adapter.updateTimelineSequence!({
          userId: "owner",
          id: row.id,
          sequence: stale
        })
      ).toBeNull();
      const after = await TimelineSequence.findById(row.id);
      expect(after?.toDocument().markers).toEqual(markers);
      expect(after?.revision).toBe(before?.revision);
      expect(after?.updated_at).toBe(before?.updated_at);
      const updated = await adapter.updateTimelineSequence!({
        userId: "owner",
        id: row.id,
        sequence: { ...after!.toTimelineSequence(), name: "Fresh edit" }
      });
      expect(updated).not.toBeNull();
      const fresh = await TimelineSequence.findById(row.id);
      expect(fresh?.name).toBe("Fresh edit");
      expect(fresh!.revision).toBeGreaterThan(after!.revision);
    });

    it("refuses foreign-owned and missing rows", async () => {
      const adapter = await factory();
      const row = await TimelineSequence.create({
        user_id: "owner",
        project_id: "default",
        name: "Timeline"
      });
      const sequence = row.toTimelineSequence();
      for (const args of [
        { userId: "other", id: row.id },
        { userId: "owner", id: "missing" }
      ]) {
        expect(
          await adapter.updateTimelineSequence!({ ...args, sequence })
        ).toBeNull();
        expect(await adapter.getTimelineSequence!(args)).toBeNull();
      }
      expect((await TimelineSequence.findById(row.id))?.name).toBe("Timeline");
    });
  });
}
