/**
 * Workspace dependency pinning for `node scripts/prepare-publish.mjs`.
 *
 * A caret range let `@nodetool-ai/cli@0.8.1` resolve to a half-published
 * 0.8.2 sibling, so an old release broke when a new one failed. Exact pins
 * keep each published version tied to the set it was built with.
 */
import { describe, expect, it } from "vitest";

import { resolveWorkspaceDeps } from "../prepare-publish.mjs";

describe("resolveWorkspaceDeps", () => {
  const versions = new Map([
    ["@nodetool-ai/agents", "0.8.2"],
    ["@nodetool-ai/protocol", "0.8.2"]
  ]);

  it("pins workspace dependencies to the exact version", () => {
    const pkg = {
      dependencies: { "@nodetool-ai/agents": "*", chalk: "^5.3.0" },
      peerDependencies: { "@nodetool-ai/protocol": "*" }
    };
    resolveWorkspaceDeps(pkg, versions);
    expect(pkg.dependencies).toEqual({
      "@nodetool-ai/agents": "0.8.2",
      chalk: "^5.3.0"
    });
    expect(pkg.peerDependencies).toEqual({ "@nodetool-ai/protocol": "0.8.2" });
  });

  it("leaves non-workspace and unknown dependencies alone", () => {
    const pkg = { dependencies: { "@nodetool-ai/unknown": "*", ws: "*" } };
    expect(resolveWorkspaceDeps(pkg, versions)).toEqual([]);
    expect(pkg.dependencies).toEqual({ "@nodetool-ai/unknown": "*", ws: "*" });
  });
});
