import { describe, expect, it, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetDatabasePathLibNode } from "../src/index.js";

// ---------------------------------------------------------------------------
// SQLite nodes
// ---------------------------------------------------------------------------
describe("lib.sqlite", () => {
  let workspaceDir: string;
  const ctx = () => ({ workspaceDir }) as any;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "nt-sqlite-"));
  });

  it("GetDatabasePath returns correct path", async () => {
    const result = await new GetDatabasePathLibNode({
      database_name: "my.db"
    }).process(ctx());
    expect(result.output).toBe(join(workspaceDir, "my.db"));
  });
});
