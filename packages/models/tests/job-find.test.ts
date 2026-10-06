import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "../src/db.js";
import { Job } from "../src/job.js";

const PREFIX = "aabbccddeeff";
const OWNER_ID = `${PREFIX}${"1".repeat(20)}`;

describe("Job.find owner-scoped resource IDs", () => {
  beforeEach(() => { initTestDb(); });

  it("resolves a compact ID without counting another owner's matching job", async () => {
    await Job.create({ id: OWNER_ID, user_id: "owner", workflow_id: "workflow" });
    await Job.create({ id: `${PREFIX}${"2".repeat(20)}`, user_id: "foreign", workflow_id: "workflow" });
    expect((await Job.find("owner", PREFIX))?.id).toBe(OWNER_ID);
    expect(await Job.find("other", PREFIX)).toBeNull();
    expect(await Job.find("foreign", OWNER_ID)).toBeNull();
  });

  it("rejects a compact ID ambiguous within the owner's jobs", async () => {
    for (const suffix of ["1", "2"]) {
      await Job.create({ id: `${PREFIX}${suffix.repeat(20)}`, user_id: "owner", workflow_id: "workflow" });
    }
    await expect(Job.find("owner", PREFIX)).rejects.toThrow(/more than one row/);
    expect((await Job.find("owner", OWNER_ID))?.id).toBe(OWNER_ID);
    expect(await Job.find("owner", PREFIX.slice(0, 11))).toBeNull();
    expect(await Job.find("owner", `${PREFIX}1`)).toBeNull();
  });

  it("preserves exact named and legacy IDs", async () => {
    for (const id of ["personal:owner", PREFIX, OWNER_ID]) {
      await Job.create({ id, user_id: "owner", workflow_id: "workflow" });
    }
    expect((await Job.find("owner", "personal:owner"))?.id).toBe("personal:owner");
    expect((await Job.find("owner", PREFIX))?.id).toBe(PREFIX);
    expect(await Job.find("foreign", "personal:owner")).toBeNull();
  });
});
