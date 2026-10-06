/**
 * Leg selection for the quality gate. A leg left off here never runs in CI,
 * so each rule is pinned against a synthetic package graph.
 */
import { describe, expect, it } from "vitest";

import { computeAffected } from "../../packages/cli/src/affected/affected.ts";
import { buildCiPlan, fullCiPlan } from "../ci-plan.mjs";
import { MOBILE_DEPS } from "../test-affected.mjs";

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
      docker: false
    });
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

  it("runs everything except docker for a root config change", () => {
    expect(plan(["package-lock.json"])).toEqual({ ...fullCiPlan(), docker: false });
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
