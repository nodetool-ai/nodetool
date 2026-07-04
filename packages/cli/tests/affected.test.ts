import { describe, it, expect } from "vitest";
import {
  computeAffected,
  DECORATOR_PACKAGES,
  type PackageInfo
} from "../src/affected/affected.js";

const PKGS: PackageInfo[] = [
  { name: "@nodetool-ai/protocol", dir: "packages/protocol", internalDeps: [] },
  {
    name: "@nodetool-ai/runtime",
    dir: "packages/runtime",
    internalDeps: ["@nodetool-ai/protocol"]
  },
  {
    name: "@nodetool-ai/node-sdk",
    dir: "packages/node-sdk",
    internalDeps: ["@nodetool-ai/runtime", "@nodetool-ai/protocol"]
  },
  {
    name: "@nodetool-ai/base-nodes",
    dir: "packages/base-nodes",
    internalDeps: ["@nodetool-ai/node-sdk"]
  },
  {
    name: "@nodetool-ai/cli",
    dir: "packages/cli",
    internalDeps: ["@nodetool-ai/base-nodes", "@nodetool-ai/node-sdk"]
  }
];

describe("computeAffected", () => {
  it("maps a changed file to its owning package", () => {
    const r = computeAffected(["packages/cli/src/nodetool.ts"], PKGS);
    expect(r.changed).toEqual(["@nodetool-ai/cli"]);
  });

  it("includes the downstream closure of dependents", () => {
    const r = computeAffected(["packages/protocol/src/index.ts"], PKGS);
    // Everything depends on protocol transitively.
    expect(r.affected).toEqual(
      [
        "@nodetool-ai/base-nodes",
        "@nodetool-ai/cli",
        "@nodetool-ai/node-sdk",
        "@nodetool-ai/protocol",
        "@nodetool-ai/runtime"
      ].sort()
    );
  });

  it("flags decorator packages as needing a rebuild", () => {
    const r = computeAffected(["packages/node-sdk/src/registry.ts"], PKGS);
    expect(r.needsBuild).toContain("@nodetool-ai/node-sdk");
    expect(r.needsBuild).toContain("@nodetool-ai/base-nodes");
    expect(r.commands[0]).toBe("npm run build:packages");
  });

  it("does not require a build for leaf, non-decorator packages", () => {
    const r = computeAffected(["packages/cli/src/commands/debug.ts"], PKGS);
    expect(r.needsBuild).toEqual([]);
    expect(r.commands).not.toContain("npm run build:packages");
    expect(r.commands).toContain("npm run test --workspace=packages/cli");
  });

  it("maps top-level workspaces (web/electron) to themselves", () => {
    const r = computeAffected(["web/src/App.tsx"], PKGS);
    expect(r.affected).toEqual(["web"]);
    expect(r.commands).toContain("cd web && npm run typecheck && npm test");
  });

  it("collects files outside any workspace", () => {
    const r = computeAffected(["README.md", "scripts/foo.mjs"], PKGS);
    expect(r.unmatched).toEqual(["README.md", "scripts/foo.mjs"]);
    expect(r.affected).toEqual([]);
  });

  it("picks the most specific package dir", () => {
    const pkgs: PackageInfo[] = [
      { name: "@x/foo", dir: "packages/foo", internalDeps: [] },
      { name: "@x/foo-bar", dir: "packages/foo-bar", internalDeps: [] }
    ];
    const r = computeAffected(["packages/foo-bar/src/x.ts"], pkgs);
    expect(r.changed).toEqual(["@x/foo-bar"]);
  });

  it("exposes the documented decorator package set", () => {
    expect(DECORATOR_PACKAGES.has("@nodetool-ai/base-nodes")).toBe(true);
    expect(DECORATOR_PACKAGES.has("@nodetool-ai/cli")).toBe(false);
  });
});
