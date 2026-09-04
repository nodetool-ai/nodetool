/**
 * Selection rules for `npm run test:affected`. A mis-selection here is silent —
 * the run goes green without ever loading the changed code — so each rule is
 * pinned against a synthetic package graph, plus the real app names.
 */
import { describe, expect, it } from "vitest";

import { computeAffected } from "../../packages/cli/src/affected/affected.ts";
import { buildGateArgv, buildPlan, DOC_ONLY, MOBILE_DEPS } from "../test-affected.mjs";

/** web and electron are named after the product, not their directories. */
const PACKAGES = [
  { name: "@nodetool-ai/protocol", dir: "packages/protocol", internalDeps: [] },
  {
    name: "@nodetool-ai/kernel",
    dir: "packages/kernel",
    internalDeps: ["@nodetool-ai/protocol"]
  },
  { name: "@nodetool-ai/deploy", dir: "packages/deploy", internalDeps: [] },
  { name: "nodetool", dir: "web", internalDeps: ["@nodetool-ai/kernel"] },
  {
    name: "nodetool-electron",
    dir: "electron",
    internalDeps: ["@nodetool-ai/protocol"]
  },
  { name: "mobile", dir: "mobile", internalDeps: MOBILE_DEPS }
];

const plan = (files) => buildPlan(files, PACKAGES, computeAffected);
const labels = (files) => plan(files).steps.map((s) => s.label);

describe("buildPlan", () => {
  it("runs a changed package and its dependents, and no app it does not reach", () => {
    const { steps } = plan(["packages/kernel/src/runner.ts"]);
    expect(steps).toHaveLength(2);
    // web is an app, so it gets a jest step instead of a turbo filter.
    expect(steps[0].args).toEqual([
      "turbo",
      "run",
      "test",
      "--filter=@nodetool-ai/kernel"
    ]);
    expect(steps[1].label).toMatch(/^web: full suite \(depends on @nodetool-ai\/kernel\)/);
  });

  it("runs nothing at all for a leaf package no app depends on", () => {
    expect(labels(["packages/deploy/src/index.ts"])).toEqual([
      "packages (1): @nodetool-ai/deploy"
    ]);
  });

  it("runs only the related tests when an app's own files changed", () => {
    const { steps } = plan(["web/src/utils/ColorUtils.ts"]);
    expect(steps).toHaveLength(1);
    expect(steps[0].label).toBe("web: tests related to 1 changed file(s)");
    expect(steps[0].args).toContain("--findRelatedTests");
    expect(steps[0].args).toContain("--passWithNoTests");
    expect(steps[0].args.at(-2)).toMatch(/web\/src\/utils\/ColorUtils\.ts$/);
  });

  it("runs an app's whole suite when a package it depends on changed", () => {
    // --findRelatedTests would miss it: jest cannot see through node_modules.
    const web = labels(["web/src/index.tsx", "packages/kernel/src/runner.ts"]);
    expect(web).toContain("web: full suite (depends on @nodetool-ai/kernel)");
    expect(web.join()).not.toContain("related to");
  });

  it("covers mobile, which declares no NodeTool dependency of its own", () => {
    expect(labels(["packages/protocol/src/index.ts"])).toContain(
      "mobile: full suite (depends on @nodetool-ai/protocol)"
    );
    expect(labels(["mobile/src/App.tsx"])).toEqual([
      "mobile: tests related to 1 changed file(s)"
    ]);
  });

  it("falls back to everything when a changed file belongs to no workspace", () => {
    const { steps, globalFiles } = plan(["package.json"]);
    expect(globalFiles).toEqual(["package.json"]);
    expect(steps.map((s) => s.label)).toEqual([
      "packages",
      "web",
      "electron",
      "mobile"
    ]);
  });

  it("runs nothing for documentation", () => {
    const { steps, globalFiles } = plan(["docs/DESIGN.md", "AGENTS.md", ".github/x.yml"]);
    expect(globalFiles).toEqual([]);
    expect(steps).toEqual([]);
  });
});

describe("buildGateArgv", () => {
  it("asks the harness registry for a dry-run plan over the same files", () => {
    expect(buildGateArgv(["packages/kernel/src/runner.ts", "web/src/index.tsx"])).toEqual([
      "run",
      "dev:nodetool",
      "--",
      "harness",
      "gate",
      "--dry-run",
      "packages/kernel/src/runner.ts",
      "web/src/index.tsx"
    ]);
  });
});

describe("DOC_ONLY", () => {
  it("matches documentation and nothing that can change a run", () => {
    for (const doc of ["AGENTS.md", "docs/a/b.md", ".github/workflows/x.yml", "LICENSE"]) {
      expect(DOC_ONLY.test(doc), doc).toBe(true);
    }
    for (const code of ["package.json", "scripts/build.mjs", "turbo.json", "web/src/a.ts"]) {
      expect(DOC_ONLY.test(code), code).toBe(false);
    }
  });
});
