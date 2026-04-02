import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DBModel,
  ModelObserver,
  ModelChangeEvent,
  createTimeOrderedUuid,
  computeEtag
} from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Job } from "../src/job.js";

// ── Setup ────────────────────────────────────────────────────────────

describe("DBModel", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  // ── CRUD ───────────────────────────────────────────────────────────

  describe("CRUD", () => {
    it("create and retrieve a record", async () => {
      const job = await Job.create<Job>({
        user_id: "u1",
        workflow_id: "w1"
      });
      expect(job).toBeInstanceOf(Job);
      expect(job.user_id).toBe("u1");

      const loaded = await Job.get<Job>(job.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.workflow_id).toBe("w1");
    });

    it("get returns null for missing key", async () => {
      const loaded = await Job.get<Job>("nonexistent");
      expect(loaded).toBeNull();
    });

    it("update modifies fields and saves", async () => {
      const job = await Job.create<Job>({
        user_id: "u1",
        workflow_id: "w1"
      });
      await job.update({ error: "some error" });
      const loaded = await Job.get<Job>(job.id);
      expect(loaded!.error).toBe("some error");
    });

    it("delete removes the record", async () => {
      const job = await Job.create<Job>({
        user_id: "u1",
        workflow_id: "w1"
      });
      await job.delete();
      const loaded = await Job.get<Job>(job.id);
      expect(loaded).toBeNull();
    });

    it("reload refreshes from storage", async () => {
      const job = await Job.create<Job>({
        user_id: "u1",
        workflow_id: "w1"
      });

      // Create a second instance and modify it directly
      const other = await Job.get<Job>(job.id);
      other!.error = "updated-error";
      await other!.save();

      await job.reload();
      expect(job.error).toBe("updated-error");
    });
  });

  // ── Observer ───────────────────────────────────────────────────────

  describe("ModelObserver", () => {
    it("notifies on create", async () => {
      const events: ModelChangeEvent[] = [];
      ModelObserver.subscribe((_, evt) => events.push(evt), "Job");

      await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
      // create calls save (UPDATED) + then CREATED
      expect(events).toContain(ModelChangeEvent.CREATED);
    });

    it("notifies on delete", async () => {
      const events: ModelChangeEvent[] = [];
      ModelObserver.subscribe((_, evt) => events.push(evt), "Job");

      const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
      await job.delete();
      expect(events).toContain(ModelChangeEvent.DELETED);
    });

    it("global observer receives all events", async () => {
      const events: ModelChangeEvent[] = [];
      ModelObserver.subscribe((_, evt) => events.push(evt));

      await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
      expect(events.length).toBeGreaterThan(0);
    });

    it("unsubscribe stops notifications", async () => {
      const events: ModelChangeEvent[] = [];
      const cb = (_: any, evt: ModelChangeEvent) => events.push(evt);
      ModelObserver.subscribe(cb, "Job");
      ModelObserver.unsubscribe(cb, "Job");

      await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
      // Should not have received the class-specific notification
      expect(events.filter((e) => e === ModelChangeEvent.CREATED)).toHaveLength(
        0
      );
    });

    it("swallows errors from class-specific observers", async () => {
      const throwingCb = () => {
        throw new Error("observer error");
      };
      ModelObserver.subscribe(throwingCb, "Job");

      // Should not throw despite observer error
      const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
      expect(job).toBeInstanceOf(Job);
    });

    it("swallows errors from global observers", async () => {
      const throwingCb = () => {
        throw new Error("global observer error");
      };
      ModelObserver.subscribe(throwingCb); // no modelClass = global

      // Should not throw despite observer error
      const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
      expect(job).toBeInstanceOf(Job);
    });

    it("unsubscribe is a no-op for non-subscribed callback", () => {
      const cb = () => {};
      // Should not throw
      ModelObserver.unsubscribe(cb, "NonExistent");
    });

    it("unsubscribe global observer (no modelClass)", async () => {
      const events: ModelChangeEvent[] = [];
      const cb = (_: any, evt: ModelChangeEvent) => events.push(evt);
      ModelObserver.subscribe(cb); // global
      ModelObserver.unsubscribe(cb); // global unsubscribe, no modelClass

      await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
      expect(events).toHaveLength(0);
    });
  });

  // ── Helpers ────────────────────────────────────────────────────────

  describe("helpers", () => {
    it("createTimeOrderedUuid returns 32-char hex", () => {
      const uuid = createTimeOrderedUuid();
      expect(uuid).toMatch(/^[0-9a-f]{32}$/);
    });

    it("computeEtag is deterministic", () => {
      const data = { a: 1, b: "hello" };
      expect(computeEtag(data)).toBe(computeEtag(data));
    });

    it("computeEtag changes when data changes", () => {
      const a = computeEtag({ x: 1 });
      const b = computeEtag({ x: 2 });
      expect(a).not.toBe(b);
    });

    it("getEtag on instance works", async () => {
      const job = await Job.create<Job>({
        user_id: "u1",
        workflow_id: "w1"
      });
      const etag = job.getEtag();
      expect(typeof etag).toBe("string");
      expect(etag.length).toBe(32); // MD5 hex
    });
  });

  // ── Reload missing item ─────────────────────────────────────────────

  describe("reload", () => {
    it("throws when item no longer exists in storage", async () => {
      const job = await Job.create<Job>({ user_id: "u1", workflow_id: "w1" });
      // Delete from storage directly
      await job.delete();
      await expect(job.reload()).rejects.toThrow(/Item not found/);
    });
  });

  // ── partitionValue ──────────────────────────────────────────────────

  describe("partitionValue", () => {
    it("returns the primary key value", async () => {
      const job = await Job.create<Job>({
        user_id: "u1",
        workflow_id: "w1"
      });
      expect(job.partitionValue()).toBe(job.id);
    });
  });

  describe("toRow", () => {
    it("falls back to enumerable keys when drizzle column metadata is unavailable", () => {
      class LegacyLikeModel extends DBModel {
        static override table = {
          id: {},
          name: {},
          _internal: {}
        } as any;
      }

      const model = new LegacyLikeModel({
        id: "row-1",
        name: "legacy",
        _internal: "ignore"
      });
      expect(model.toRow()).toEqual({ id: "row-1", name: "legacy" });
    });
  });
});
