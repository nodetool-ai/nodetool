/**
 * Leg selection for the quality gate. A leg left off here never runs in CI,
 * so each rule is pinned against a synthetic package graph.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { computeAffected } from "../../packages/cli/src/affected/affected.ts";
import { buildCiPlan, fullCiPlan } from "../ci-plan.mjs";
import { MOBILE_DEPS } from "../test-affected.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const PACKAGES = [
  { name: "@nodetool-ai/protocol", dir: "packages/protocol", internalDeps: [] },
  { name: "@nodetool-ai/storage", dir: "packages/storage", internalDeps: [] },
  {
    name: "@nodetool-ai/base-nodes",
    dir: "packages/base-nodes",
    internalDeps: ["@nodetool-ai/protocol"]
  },
  {
    name: "@nodetool-ai/image-nodes",
    dir: "packages/image-nodes",
    internalDeps: ["@nodetool-ai/protocol"]
  },
  {
    name: "@nodetool-ai/workflow-runner",
    dir: "packages/workflow-runner",
    internalDeps: ["@nodetool-ai/base-nodes"]
  },
  {
    name: "@nodetool-ai/websocket",
    dir: "packages/websocket",
    internalDeps: ["@nodetool-ai/storage"]
  },
  {
    name: "@nodetool-ai/agents",
    dir: "packages/agents",
    internalDeps: ["@nodetool-ai/protocol"]
  },
  {
    name: "nodetool",
    dir: "web",
    internalDeps: ["@nodetool-ai/protocol", "@nodetool-ai/workflow-runner"]
  },
  {
    name: "nodetool-electron",
    dir: "electron",
    internalDeps: ["@nodetool-ai/websocket"]
  },
  { name: "mobile", dir: "mobile", internalDeps: MOBILE_DEPS }
];

const plan = (files) => buildCiPlan(files, PACKAGES, computeAffected);

describe("buildCiPlan", () => {
  it("runs only web's related tests for a web/src-only change", () => {
    expect(plan(["web/src/components/Foo.tsx"])).toEqual({
      ...fullCiPlan(),
      full: false,
      web: "related",
      electron: false,
      mobile: false,
      packages_websocket: false,
      packages_agents: false,
      packages_nodes: false,
      packages_core: false,
      integration: false,
      workflow_runner_e2e: false,
      tsc6: false,
      docker: false,
      blender: false
    });
  });

  it("runs the Blender render suites only when blender-nodes itself changes", () => {
    expect(plan(["packages/blender-nodes/src/run-job.ts"]).blender).toBe(true);
    expect(plan(["packages/blender-nodes/blender_ops/render.py"]).blender).toBe(true);
    expect(plan(["packages/image-nodes/src/index.ts"]).blender).toBe(false);
    expect(plan(["packages/protocol/src/index.ts"]).blender).toBe(false);
    expect(fullCiPlan().blender).toBe(true);
  });

  it("runs web's whole suite when its test setup changes", () => {
    expect(plan(["web/src/setupTests.ts"]).web).toBe("full");
    expect(plan(["web/src/__mocks__/emptyModule.ts"]).web).toBe("full");
    expect(plan(["web/jest.config.ts"]).web).toBe("full");
  });

  it("runs electron alone for an electron-only change", () => {
    const p = plan(["electron/src/main.ts"]);
    expect(p.electron).toBe(true);
    expect(p.web).toBe("none");
    expect(p.mobile).toBe(false);
    expect(p.packages_core || p.packages_nodes || p.integration).toBe(false);
  });

  it("selects the backend shard and dependents of a changed package", () => {
    const p = plan(["packages/storage/src/index.ts"]);
    expect(p.packages_core).toBe(true);
    expect(p.packages_websocket).toBe(true);
    expect(p.electron).toBe(true);
    expect(p.web).toBe("none");
    expect(p.packages_nodes).toBe(false);
  });

  it("puts *-nodes and workflow-runner in the nodes shard", () => {
    const p = plan(["packages/base-nodes/src/index.ts"]);
    expect(p.packages_nodes).toBe(true);
    expect(p.packages_core).toBe(false);
    expect(p.integration).toBe(true);
    expect(p.workflow_runner_e2e).toBe(true);
    expect(p.web).toBe("full");

    const leaf = plan(["packages/image-nodes/src/index.ts"]);
    expect(leaf.packages_nodes).toBe(true);
    expect(leaf.integration).toBe(false);
    expect(leaf.web).toBe("none");
  });

  it("runs mobile when a package it compiles from source changes", () => {
    expect(plan(["packages/protocol/src/index.ts"]).mobile).toBe(true);
  });

  it("runs the TypeScript 6 build only for manifest and tsconfig changes", () => {
    expect(plan(["packages/storage/src/index.ts"]).tsc6).toBe(false);
    expect(plan(["packages/storage/package.json"]).tsc6).toBe(true);
    expect(plan(["packages/storage/tsconfig.build.json"]).tsc6).toBe(true);
  });

  it("runs the docker leg only when the image's own inputs change", () => {
    expect(plan(["packages/image-nodes/src/index.ts"]).docker).toBe(false);
    expect(plan(["Dockerfile"])).toEqual(fullCiPlan());
    expect(plan(["scripts/docker-smoke.mjs"]).docker).toBe(true);
  });

  it("runs the docker leg for the manifests and build scripts the Dockerfile copies", () => {
    for (const file of [
      "package.json",
      "package-lock.json",
      "packages/storage/package.json",
      "reliability/harness/package.json",
      "web/package.json",
      "electron/scripts/rebuild-native.mjs",
      "tsconfig.build.json",
      "turbo.json",
      "scripts/bundle-backend.mjs",
      "scripts/verify-backend-bundle.mjs"
    ]) {
      expect(plan([file]).docker).toBe(true);
    }
    expect(plan(["packages/storage/src/package.json"]).docker).toBe(false);
  });

  it("runs everything for a root config change", () => {
    expect(plan(["package-lock.json"])).toEqual(fullCiPlan());
    expect(plan(["turbo.json"]).full).toBe(true);
  });

  it("runs everything when the gate's own definition changes", () => {
    for (const file of [
      ".github/workflows/quality-checks.yml",
      ".github/workflows/test.yml",
      ".github/actions/setup-build/action.yml",
      "scripts/ci-plan.mjs"
    ]) {
      expect(plan([file]).full).toBe(true);
    }
  });

  it("selects nothing for documentation outside every workspace", () => {
    const p = plan(["docs/index.md", "AGENTS.md"]);
    expect(Object.values(p).filter((v) => v === true || v === "full" || v === "related")).toEqual([]);
  });
});

describe("ci-plan run", () => {
  it.each([
    {
      name: "runs both full app suites for a global change with a supplied base",
      files: ["scripts/graph-resource-fixtures.mjs"],
      expectedArgs: [
        ["test", "--workspace=electron"],
        ["--prefix", "mobile", "test"]
      ]
    },
    {
      name: "runs only related electron tests for an electron-only change",
      files: ["electron/src/main.ts"],
      expectedArgs: [
        [
          "test", "--workspace=electron", "--", "--findRelatedTests",
          resolve(REPO_ROOT, "electron/src/main.ts"), "--passWithNoTests"
        ]
      ]
    },
    {
      name: "runs only related mobile tests for a mobile-only change",
      files: ["mobile/src/App.tsx"],
      expectedArgs: [
        [
          "--prefix", "mobile", "test", "--", "--findRelatedTests",
          resolve(REPO_ROOT, "mobile/src/App.tsx"), "--passWithNoTests"
        ]
      ]
    },
    {
      name: "skips both apps for a web-only change",
      files: ["web/src/components/Foo.tsx"],
      expectedArgs: []
    }
  ])("$name", async ({ files, expectedArgs }) => {
    const originalArgv = process.argv;
    const base = "515bd2803fd393127783ba356c6c69b4c956febe";
    const execFileSync = vi.fn((_command, args) =>
      args[0] === "diff" ? `${files.join("\n")}\n` : ""
    );
    const spawnSync = vi.fn(() => ({ status: 0 }));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.doMock("node:child_process", () => ({ execFileSync, spawnSync }));
    vi.resetModules();
    process.argv = [
      process.execPath,
      fileURLToPath(new URL("../ci-plan.mjs", import.meta.url)),
      "run", "electron", "mobile", "--base", base
    ];
    try {
      await import("../ci-plan.mjs");
      expect(execFileSync).toHaveBeenCalledWith(
        "git", ["diff", "--name-only", "--no-renames", base, "HEAD"], expect.any(Object)
      );
      expect(spawnSync.mock.calls.map(([command, args]) => [command, args])).toEqual(
        expectedArgs.map((args) => ["npm", args])
      );
      expect(exit).toHaveBeenCalledWith(0);
    } finally {
      process.argv = originalArgv;
      vi.doUnmock("node:child_process");
      vi.restoreAllMocks();
      vi.resetModules();
    }
  });
});
