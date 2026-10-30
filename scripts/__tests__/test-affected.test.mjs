/**
 * Selection rules for `npm run test:affected`. A mis-selection here is silent —
 * the run goes green without ever loading the changed code — so each rule is
 * pinned against a synthetic package graph, plus the real app names.
 */
import { describe, expect, it } from "vitest";

import { computeAffected } from "../../packages/cli-full/src/affected/affected.ts";
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
  describe("shared pack catalog inputs", () => {
    const graph = [
      { name: "@nodetool-ai/pack-core", dir: "packages/pack-core", internalDeps: [] },
      { name: "@nodetool-ai/node-sdk", dir: "packages/node-sdk", internalDeps: ["@nodetool-ai/pack-core"] },
      { name: "@nodetool-ai/pack-manager", dir: "packages/pack-manager", internalDeps: ["@nodetool-ai/pack-core"] },
      { name: "@nodetool-ai/cli", dir: "packages/cli", internalDeps: ["@nodetool-ai/pack-manager"] },
      { name: "@nodetool-ai/node-catalog", dir: "packages/node-catalog", internalDeps: ["@nodetool-ai/node-sdk"] },
      { name: "@nodetool-ai/unrelated", dir: "packages/unrelated", internalDeps: [] }
    ];
    const filters = (file) => buildPlan([file], graph, computeAffected).steps.flatMap((step) => step.args.filter((arg) => arg.startsWith("--filter=")));

    it.each(["index.json", "nodes.ndjson"])("selects pack-core and its consumers for shared %s changes", (name) => {
      const selected = filters(`packages/node-catalog/data/${name}`);
      expect(selected.length).toBeGreaterThan(0);
      expect(selected).toEqual(expect.arrayContaining([
        "--filter=@nodetool-ai/pack-core", "--filter=@nodetool-ai/node-sdk",
        "--filter=@nodetool-ai/pack-manager", "--filter=@nodetool-ai/cli",
        "--filter=@nodetool-ai/node-catalog"
      ]));
      expect(selected).not.toContain("--filter=@nodetool-ai/unrelated");
    });

    it("keeps ordinary catalog source changes scoped to their existing downstream closure", () => {
      expect(filters("packages/node-catalog/src/catalog-data.ts")).toEqual(["--filter=@nodetool-ai/node-catalog"]);
      expect(filters("packages/node-catalog/data/unrelated.json")).toEqual(["--filter=@nodetool-ai/node-catalog"]);
    });

    it("uses the existing visited-set closure when consumers contain a cycle", () => {
      const cyclic = graph.map((pkg) => pkg.name === "@nodetool-ai/pack-manager" ? { ...pkg, internalDeps: [...pkg.internalDeps, "@nodetool-ai/cli"] } : pkg);
      const selected = buildPlan(["packages/node-catalog/data/index.json"], cyclic, computeAffected).steps.flatMap((step) => step.args.filter((arg) => arg.startsWith("--filter=")));
      expect(selected).toHaveLength(5);
      expect(new Set(selected).size).toBe(selected.length);
    });
  });

  it.each([
    "scripts/test-affected.mjs",
    "scripts/__tests__/test-affected.test.mjs",
    "scripts/__tests__/desktop-release-recovery.test.mjs",
    "scripts/__tests__/smoke-backend-bundle.test.mjs"
  ])("selects script regressions for %s", (file) => {
    expect(plan([file]).globalFiles).toEqual([]);
    expect(plan([file]).steps).toEqual([
      { label: "script regressions", command: "npm", args: ["run", "test:scripts"] }
    ]);
  });

  it.each(["scripts/ci-plan.mjs", "scripts/__tests__/ci-plan.test.mjs"])("selects CI planning regressions for %s", (file) => {
    expect(plan([file]).globalFiles).toEqual([]);
    expect(plan([file]).steps).toEqual([
      { label: "CI planning regressions", command: "node", args: ["scripts/run-vitest.mjs", "run", "--config", "vitest.config.ts", "scripts/__tests__/ci-plan.test.mjs"] }
    ]);
  });

  it("checks smoke behavior and the real bundle when the backend smoke changes", () => {
    expect(plan(["scripts/smoke-backend-bundle.mjs"]).globalFiles).toEqual([]);
    expect(labels([
      "scripts/smoke-backend-bundle.mjs",
      "scripts/__tests__/smoke-backend-bundle.test.mjs",
      "scripts/__tests__/desktop-release-recovery.test.mjs"
    ])).toEqual(["script regressions", "backend:smoke"]);
    expect(labels(["scripts/unknown-release-utility.mjs"])).toEqual([
      "packages", "web", "electron", "mobile"
    ]);
  });

  it.each(["scripts/bump-version.mjs", "scripts/__tests__/bump-version.test.mjs"])("selects the catalog version fixture for %s", (file) => {
    expect(labels([file])).toEqual(["catalog version bump"]);
    expect(plan([file]).globalFiles).toEqual([]);
  });

  it.each([
    "scripts/node-catalog/packs.mjs",
    "scripts/node-catalog/tiers.mjs",
    "scripts/node-catalog/generate.mjs",
    "scripts/generate-node-catalog.mjs",
    "scripts/__tests__/node-catalog.test.mjs"
  ])("selects generator fixtures and catalog drift for %s", (file) => {
    expect(labels([file])).toEqual(["node catalog generator", "node catalog drift"]);
    expect(plan([file]).globalFiles).toEqual([]);
  });

  it("selects the browser tracing shim regression for its standalone test", () => {
    const { steps, globalFiles } = plan(["scripts/__tests__/browser-tracing-stub.test.mjs"]);
    expect(globalFiles).toEqual([]);
    expect(steps).toEqual([{ label: "browser tracing shim", command: "node", args: ["scripts/run-vitest.mjs", "run", "--config", "vitest.config.ts", "scripts/__tests__/browser-tracing-stub.test.mjs"] }]);
  });
  it("runs a changed package and its dependents, and no app it does not reach", () => {
    const { steps } = plan(["packages/kernel/src/runner.ts"]);
    expect(steps).toHaveLength(2);
    // web is an app, so it gets a jest step instead of a turbo filter.
    expect(steps[0].args).toEqual([
      "scripts/run-turbo.mjs",
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

  it("runs the example checks, not everything, for an example timeline script", () => {
    const { steps, globalFiles } = plan(["scripts/example-timelines/voltra.mjs"]);
    expect(globalFiles).toEqual([]);
    expect(steps.map((s) => [s.command, ...s.args])).toEqual([
      ["node", "scripts/validate-examples.mjs"],
      [
        "npm",
        "run",
        "test",
        "--workspace=packages/websocket",
        "--",
        "tests/example-timelines.test.ts"
      ]
    ]);
    expect(labels(["scripts/render-example-timeline.mjs"])).toEqual(
      labels(["scripts/example-timelines/kite.mjs"])
    );
  });

  it("runs the storyboard drift check for the storyboard generator", () => {
    const steps = plan(["scripts/example-storyboards/boards.mjs"]).steps;
    expect(steps.map((s) => s.args.join(" "))).toEqual([
      "scripts/build-example-storyboards.mjs --check",
      "scripts/validate-examples.mjs",
      "run test --workspace=packages/websocket -- tests/example-storyboards.test.ts"
    ]);
    expect(labels(["scripts/build-example-storyboards.mjs"])).toEqual(
      steps.map((s) => s.label)
    );
  });

  it("runs validate-examples alone when only it changed", () => {
    expect(labels(["scripts/validate-examples.mjs"])).toEqual(["validate-examples"]);
  });

  it("runs the backend bundle smoke for the bundle scripts", () => {
    for (const file of ["scripts/bundle-backend.mjs", "scripts/backend-server-build-options.mjs"]) {
      expect(labels([file])).toEqual(["backend:smoke", "backend bundle class names"]);
    }
    expect(labels(["scripts/__tests__/backend-server-build-options.test.mjs"])).toEqual(["backend bundle class names"]);
    const steps = plan(["scripts/verify-backend-bundle.mjs"]).steps;
    expect(steps.map((s) => [s.command, ...s.args])).toEqual([
      ["npm", "run", "backend:smoke"],
      ["npm", "test", "--workspace=electron", "--", "src/__tests__/verifyBackendBundle.test.ts"]
    ]);
  });

  it("builds and tests the VST host when its native source changes", () => {
    const steps = plan(["native/vst-host/source/VstHost.cpp"]).steps;
    expect(steps.map((s) => [s.command, ...s.args])).toEqual([
      ["node", "electron/scripts/build-vst-host.mjs", "--test"]
    ]);
  });

  it("runs each check once and still runs the owning workspaces", () => {
    expect(
      labels([
        "scripts/example-timelines/kite.mjs",
        "scripts/validate-examples.mjs",
        "packages/deploy/src/index.ts"
      ])
    ).toEqual([
      "packages (1): @nodetool-ai/deploy",
      "validate-examples",
      "websocket: tests/example-timelines.test.ts"
    ]);
  });

  it("still runs everything when an unmapped file rides along", () => {
    const { steps, globalFiles } = plan([
      "scripts/example-timelines/kite.mjs",
      "turbo.json"
    ]);
    expect(globalFiles).toEqual(["turbo.json"]);
    expect(steps.map((s) => s.label)).toEqual(["packages", "web", "electron", "mobile"]);
  });

  it("runs nothing from the root for the marketing site, which has its own CI", () => {
    const { steps, globalFiles } = plan(["marketing/src/app/page.tsx"]);
    expect(globalFiles).toEqual([]);
    expect(steps).toEqual([]);
  });

  it("runs nothing for documentation", () => {
    const { steps, globalFiles } = plan(["docs/DESIGN.md", "AGENTS.md", ".github/x.yml"]);
    expect(globalFiles).toEqual([]);
    expect(steps).toEqual([]);
  });

  it("runs the sync's own suites for the model-rankings scripts, not every suite", () => {
    const expected = [
      ["npm", "run", "test", "--workspace=packages/model-pricing"],
      [
        "npm",
        "run",
        "test",
        "--workspace=packages/runtime",
        "--",
        "tests/providers/rankings-route-universe.test.ts"
      ]
    ];
    for (const file of [
      "scripts/sync-model-rankings.mjs",
      "scripts/rankings/match.mjs",
      "scripts/rankings/model-keys.mjs",
      "scripts/rankings/routes.mjs",
      "scripts/rankings/aliases.json",
      "scripts/genspend/normalize.mjs"
    ]) {
      const { steps, globalFiles } = plan([file]);
      expect(globalFiles, file).toEqual([]);
      expect(steps.map((s) => [s.command, ...s.args]), file).toEqual(expected);
    }
  });

  it("runs only the event-parsing unit for the motion-craft eval script, not a live model", () => {
    const { steps, globalFiles } = plan(["scripts/motion-craft-eval.mjs"]);
    expect(globalFiles).toEqual([]);
    expect(steps.map((s) => [s.command, ...s.args])).toEqual([
      [
        "node",
        "scripts/run-vitest.mjs",
        "run",
        "--config",
        "vitest.config.ts",
        "scripts/__tests__/motion-craft-eval.test.mjs"
      ]
    ]);
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
    for (const code of [
      "package.json",
      "scripts/build.mjs",
      "turbo.json",
      "web/src/a.ts",
      "packages/system-skills/api-agents/SKILL.md"
    ]) {
      expect(DOC_ONLY.test(code), code).toBe(false);
    }
  });
});
