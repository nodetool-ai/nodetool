import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { initTestDb, getDb } from "../src/db.js";
import { createBugReport } from "../src/bug-report.js";
import { bugReports } from "../src/schema/bug-reports.js";

describe("createBugReport", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("stores the report under its reporter", async () => {
    const row = await createBugReport({
      userId: "user-1",
      source: "manual",
      title: "[Bug]: Export hangs",
      description: "Export hangs",
      body: "### Describe the bug\n\nExport hangs",
      bundleKey: "user-1/bug-report-x.zip",
      bundleSize: 22
    });

    expect(row.id).toMatch(/^[0-9a-f]{32}$/);
    const stored = await getDb()
      .select()
      .from(bugReports)
      .where(eq(bugReports.id, row.id));
    expect(stored).toEqual([
      {
        ...row,
        user_id: "user-1",
        steps: null,
        expected: null,
        bundle_key: "user-1/bug-report-x.zip",
        bundle_size: 22
      }
    ]);
  });
});
