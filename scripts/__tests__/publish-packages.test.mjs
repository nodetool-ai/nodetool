/**
 * Publish-result classification for `node scripts/publish-packages.mjs`.
 *
 * The whole point of the script is that a release can be re-run after a partial
 * failure. That only holds if "this version is already on the registry" is read
 * as success and a genuine error is not — misreading either direction is silent:
 * one aborts a recoverable release, the other reports a broken release as green.
 */
import { describe, expect, it } from "vitest";

import {
  classifyPublishResult,
  publishOrder,
  unmetDeps,
  workspaceDeps
} from "../publish-packages.mjs";

/** The 404 that killed every release from 0.7.0-rc.38 onward. */
const UNAUTHORIZED_404 = [
  "npm error code E404",
  "npm error 404 Not Found - PUT https://registry.npmjs.org/@nodetool-ai%2fprotocol - Not found",
  "npm error 404  '@nodetool-ai/protocol@0.7.0-rc.40' is not in this registry.",
].join("\n");

describe("classifyPublishResult", () => {
  it("counts a clean exit as published", () => {
    expect(classifyPublishResult(0, "+ @nodetool-ai/cli@0.7.0-rc.40")).toBe(
      "published"
    );
  });

  it("counts an already-published version as skipped, not failed", () => {
    const output =
      "npm error code EPUBLISHCONFLICT\n" +
      "npm error You cannot publish over the previously published versions: 0.7.0-rc.40.";
    expect(classifyPublishResult(1, output)).toBe("skipped");
  });

  it("counts the unauthorized 404 as a real failure", () => {
    expect(classifyPublishResult(1, UNAUTHORIZED_404)).toBe("failed");
  });

  it("counts an arbitrary non-zero exit as a real failure", () => {
    expect(classifyPublishResult(1, "npm error code ENEEDAUTH")).toBe("failed");
  });

  it("does not mistake a 404 mentioning a version for a conflict", () => {
    // Guards the substring match: "cannot publish over" must not be inferred
    // from unrelated text that merely names a version.
    expect(classifyPublishResult(1, "npm error 404 version 1.2.3 not found")).toBe(
      "failed"
    );
  });
});

describe("workspaceDeps", () => {
  it("collects workspace names from every dependency field", () => {
    const names = new Set(["@nodetool-ai/a", "@nodetool-ai/b", "@nodetool-ai/c"]);
    const pkg = {
      name: "@nodetool-ai/c",
      dependencies: { "@nodetool-ai/a": "*", chalk: "^5.0.0" },
      peerDependencies: { "@nodetool-ai/b": "*" },
      devDependencies: { "@nodetool-ai/c": "*" }
    };
    expect(workspaceDeps(pkg, names).sort()).toEqual([
      "@nodetool-ai/a",
      "@nodetool-ai/b"
    ]);
  });
});

describe("publishOrder", () => {
  it("puts each package after its workspace dependencies", () => {
    const order = publishOrder([
      { name: "cli", deps: ["agents", "app-runtime"] },
      { name: "agents", deps: ["app-runtime"] },
      { name: "app-runtime", deps: [] },
      { name: "protocol", deps: [] }
    ]).map((p) => p.name);
    expect(order).toEqual(["app-runtime", "protocol", "agents", "cli"]);
  });

  it("throws on a dependency cycle instead of looping", () => {
    expect(() =>
      publishOrder([
        { name: "a", deps: ["b"] },
        { name: "b", deps: ["a"] }
      ])
    ).toThrow(/cycle among: a, b/);
  });
});

describe("unmetDeps", () => {
  // The 0.8.2 release: app-runtime's PUT returned 404, then agents and cli
  // published anyway and pointed at an app-runtime@0.8.2 that never existed.
  it("blocks a package whose dependency failed to publish", () => {
    const available = new Set(["protocol"]);
    expect(unmetDeps({ name: "agents", deps: ["app-runtime", "protocol"] }, available)).toEqual([
      "app-runtime"
    ]);
  });

  it("lets a package through once every dependency is available", () => {
    const available = new Set(["app-runtime", "protocol"]);
    expect(unmetDeps({ name: "agents", deps: ["app-runtime", "protocol"] }, available)).toEqual([]);
  });
});
