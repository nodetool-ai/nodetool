/**
 * A run's workspace reports what it wrote.
 *
 * Workspace files are not database rows, so `ModelObserver` never sees them and
 * the Workspace Explorer had no way to learn that a chat turn wrote one. The
 * notifier registered here is what closes that gap, and the workspace row id it
 * carries — which the `Workspace` interface deliberately does not expose — is
 * known only where the row is read.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("@nodetool-ai/models", () => ({
  Workflow: { find: vi.fn() },
  Workspace: { find: vi.fn(), ensureDefault: vi.fn() },
  getSecret: vi.fn()
}));

import {
  setWorkspaceChangeNotifier,
  workspaceFromRow,
  type WorkspaceFileChange
} from "../src/service/workflow-workspace.js";

type WorkspaceRowLike = Parameters<typeof workspaceFromRow>[0];

function rowFor(dir: string): WorkspaceRowLike {
  return {
    id: "ws-1",
    user_id: "user-1",
    path: dir,
    isVirtual: () => false
  } as unknown as WorkspaceRowLike;
}

const dirs: string[] = [];

async function tempWorkspaceDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "workspace-notifier-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  setWorkspaceChangeNotifier(null);
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("workspace change notifier", () => {
  it("reports the workspace and user a write landed in", async () => {
    const changes: WorkspaceFileChange[] = [];
    setWorkspaceChangeNotifier((change) => changes.push(change));

    const workspace = workspaceFromRow(rowFor(await tempWorkspaceDir()));
    await workspace?.write("out/report.md", "done");

    expect(changes).toEqual([
      {
        kind: "write",
        path: "out/report.md",
        workspaceId: "ws-1",
        userId: "user-1"
      }
    ]);
  });

  it("says nothing when no host registered a notifier", async () => {
    const workspace = workspaceFromRow(rowFor(await tempWorkspaceDir()));
    await expect(workspace?.write("notes.md", "x")).resolves.toBeUndefined();
    expect(await workspace?.readText("notes.md")).toBe("x");
  });

  it("stays quiet on reads and listings", async () => {
    const changes: WorkspaceFileChange[] = [];
    setWorkspaceChangeNotifier((change) => changes.push(change));
    const workspace = workspaceFromRow(rowFor(await tempWorkspaceDir()));
    await workspace?.write("notes.md", "x");
    changes.length = 0;

    await workspace?.readText("notes.md");
    await workspace?.list(".");
    await workspace?.stat("notes.md");
    expect(changes).toEqual([]);
  });
});
