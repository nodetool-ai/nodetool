import { expect, it } from "vitest";
import * as graph from "../websocket-workspaces.mjs";

it("builds Electron's workspace dependencies before their consumers", () => {
  const workspaces = graph.electronWorkspaces ?? [];
  expect(workspaces).toContain("@nodetool-ai/runtime-install");
  expect(workspaces).toContain("@nodetool-ai/websocket");
  expect(workspaces).not.toContain("nodetool-electron");
  expect(new Set(workspaces).size).toBe(workspaces.length);
  for (const workspace of workspaces) {
    for (const dependency of graph.getWorkspaceDependencies(workspace)) {
      expect(workspaces.indexOf(dependency)).toBeGreaterThanOrEqual(0);
      expect(workspaces.indexOf(dependency)).toBeLessThan(workspaces.indexOf(workspace));
    }
  }
});
