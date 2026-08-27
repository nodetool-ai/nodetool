/**
 * The server's half of workspace-file live updates: turn the resolver's
 * per-write notifications into one `resource_change` per workspace, on the same
 * emitter every other non-DBModel resource broadcasts through.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let registered: ((change: unknown) => void) | null = null;

vi.mock("@nodetool-ai/execution/service", () => ({
  setWorkspaceChangeNotifier: (notify: ((change: unknown) => void) | null) => {
    registered = notify;
  },
  setWorkspaceCloudStorage: vi.fn(),
  usesCloudWorkspaces: () => false,
  resolveWorkflowWorkspace: vi.fn(),
  workspaceFromRow: vi.fn(),
  buildWorkspaceExecutionContext: vi.fn()
}));

vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: vi.fn()
}));

import { initWorkspaceChangeEvents } from "../src/lib/workflow-workspace.js";
import { resourceEvents } from "../src/resource-events.js";

const seen: unknown[] = [];
const record = (payload: unknown): void => {
  seen.push(payload);
};

beforeEach(() => {
  vi.useFakeTimers();
  registered = null;
  seen.length = 0;
  resourceEvents.on("change", record);
  initWorkspaceChangeEvents();
});

afterEach(() => {
  resourceEvents.off("change", record);
  vi.useRealTimers();
});

describe("initWorkspaceChangeEvents", () => {
  it("broadcasts one change per workspace no matter how many files landed", () => {
    expect(registered).toBeTypeOf("function");
    for (let i = 0; i < 50; i++) {
      registered?.({
        kind: "write",
        path: `out/${i}.md`,
        workspaceId: "ws-1",
        userId: "user-1"
      });
    }
    // Nothing until the window closes — an unpacked archive would otherwise be
    // fifty frames and fifty re-listings.
    expect(seen).toEqual([]);

    vi.runAllTimers();
    expect(seen).toEqual([
      {
        event: "updated",
        resource_type: "workspacefile",
        resource: { id: "ws-1" },
        userId: "user-1"
      }
    ]);
  });

  it("keeps two workspaces apart", () => {
    registered?.({ kind: "write", path: "a.md", workspaceId: "ws-1", userId: "u1" });
    registered?.({ kind: "write", path: "b.md", workspaceId: "ws-2", userId: "u2" });
    vi.runAllTimers();

    expect(seen).toHaveLength(2);
    expect(seen.map((s) => (s as { resource: { id: string } }).resource.id).sort()).toEqual([
      "ws-1",
      "ws-2"
    ]);
  });

  it("broadcasts again after the window has closed", () => {
    registered?.({ kind: "write", path: "a.md", workspaceId: "ws-1", userId: "u1" });
    vi.runAllTimers();
    registered?.({ kind: "write", path: "b.md", workspaceId: "ws-1", userId: "u1" });
    vi.runAllTimers();
    expect(seen).toHaveLength(2);
  });
});
