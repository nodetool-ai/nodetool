import { describe, expect, it, beforeEach } from "vitest";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalWorkspace } from "@nodetool-ai/runtime";
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

  it("GetDatabasePath refuses a database in the folder of another project", async () => {
    // A game's folder inside the run's workspace, named by the host.
    await mkdir(join(workspaceDir, "projects/game1"), { recursive: true });
    await mkdir(join(workspaceDir, "projects/abc/.nodetool"), { recursive: true });
    const context = {
      workspaceDir,
      workspace: createLocalWorkspace(workspaceDir, {
        nestedFolders: () => ["projects/game1"]
      })
    } as any;

    for (const name of [
      "projects/game1/save.db",
      "projects/abc/memory.db",
      "projects/../projects/game1/save.db",
      "../outside.db"
    ]) {
      await expect(
        new GetDatabasePathLibNode({ database_name: name }).process(context)
      ).rejects.toThrow(/folder of another project|outside the workspace/);
    }
    const own = await new GetDatabasePathLibNode({
      database_name: "projects/own.db"
    }).process(context);
    expect(own.output).toBe(join(workspaceDir, "projects", "own.db"));
  });
});
