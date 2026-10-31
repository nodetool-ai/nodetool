import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { getPortableDb, initTestDb } from "../src/db.js";
import { Job } from "../src/job.js";
import { jobs } from "../src/schema/jobs.js";

describe("job history pagination", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("pages tied timestamps with full IDs, project scope, legacy cursors and deleted anchors", async () => {
    const ids = ["11111111111111111111111111111111", "22222222222222222222222222222222", "33333333333333333333333333333333"];
    for (const id of ids) {
      await Job.create<Job>({ id, user_id: "owner", workflow_id: "workflow", project_id: "project" });
    }
    await Job.create<Job>({ user_id: "other", workflow_id: "workflow", project_id: "project" });
    await Job.create<Job>({ user_id: "owner", workflow_id: "workflow", project_id: "other" });
    await getPortableDb().update(jobs).set({ updated_at: "2026-01-01T00:00:00.000Z" });
    const options = { projectId: "project", limit: 1 };
    const [first, cursor] = await Job.paginate("owner", options);
    expect(first.map((row) => row.id)).toEqual([ids[2]]);
    const [legacy] = await Job.paginate("owner", { ...options, startKey: ids[2] });
    expect(legacy.map((row) => row.id)).toEqual([ids[1]]);
    await first[0].delete();
    const [second, next] = await Job.paginate("owner", { ...options, startKey: cursor });
    expect(second.map((row) => row.id)).toEqual([ids[1]]);
    const [third, done] = await Job.paginate("owner", { ...options, startKey: next });
    expect(third.map((row) => row.id)).toEqual([ids[0]]);
    expect(done).toBe("");
    await expect(Job.paginate("owner", { startKey: "bad cursor" })).rejects.toThrow("Invalid job cursor");
  });
});
