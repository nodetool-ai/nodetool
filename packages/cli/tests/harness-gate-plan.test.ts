/**
 * Planner rules for `nodetool harness gate`: the `suiteOnly` flag, global
 * files, and dependency-aware routing. The planner runs on a synthetic
 * workspace graph so each rule is pinned without the real repo, except the
 * `suiteOnly` derivation, which must agree with the real workspace graph.
 */
import { describe, it, expect } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HARNESSES,
  SURFACES,
  planGate,
  type HarnessEntry,
  type SurfaceEntry
} from "../src/harness/registry.js";
import { isGlobalGateFile } from "../src/harness/changed-files.js";
import {
  computeAffected,
  readWorkspacePackages,
  type PackageInfo
} from "../src/affected/affected.js";
// @ts-expect-error plain .mjs without types
import { buildPlan } from "../../../scripts/test-affected.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const SUITE_SEGMENT =
  /^(?:npm (?:run )?test --workspace=(\S+)(?: -- .*)?|npx vitest run .* --root (\S+))$/;

/** Workspaces named by a command made only of workspace suite runs, else null. */
function suiteWorkspaces(command: string): string[] | null {
  const out: string[] = [];
  for (const segment of command.split(" && ")) {
    const m = SUITE_SEGMENT.exec(segment);
    if (!m) return null;
    out.push((m[1] ?? m[2])!);
  }
  return out;
}

/**
 * Whether `npm run test:affected` runs every suite workspace for every path of
 * every surface covering `harnessId`. Apps run related tests only, so `web` and
 * `electron` suites are never covered.
 */
function suitesCoveredByTestAffected(
  workspaces: string[],
  harnessId: string,
  packages: PackageInfo[]
): boolean {
  const wanted = workspaces.map((w) =>
    packages.find((p) => p.dir === w || p.name === w)
  );
  if (wanted.some((p) => !p || p.dir === "web" || p.dir === "electron")) {
    return false;
  }
  let inspected = 0;
  for (const s of SURFACES.filter((x) => x.harnesses.includes(harnessId))) {
    for (const path of s.paths) {
      inspected += 1;
      const file = path.endsWith("/") ? `${path}x.ts` : path;
      if (buildPlan([file], packages, computeAffected).globalFiles.length > 0) {
        continue;
      }
      const { affected } = computeAffected([file], packages);
      if (wanted.some((p) => !affected.includes(p!.name))) return false;
    }
  }
  return inspected > 0;
}

describe("selfcheck suiteOnly", () => {
  const packages = readWorkspacePackages(REPO_ROOT);
  const selfchecks = HARNESSES.filter((h) => h.selfcheck);

  it.each(selfchecks.map((h) => [h.id, h] as const))(
    "%s: suiteOnly matches what test:affected covers",
    (_id, h) => {
      const workspaces = suiteWorkspaces(h.selfcheck!.command);
      const expected =
        workspaces !== null &&
        suitesCoveredByTestAffected(workspaces, h.id, packages);
      expect(h.selfcheck!.suiteOnly === true).toBe(expected);
    }
  );

  it("marks at least one selfcheck suiteOnly and one not", () => {
    expect(selfchecks.some((h) => h.selfcheck!.suiteOnly)).toBe(true);
    expect(selfchecks.some((h) => !h.selfcheck!.suiteOnly)).toBe(true);
  });

  it("never marks a command with a non-suite segment", () => {
    for (const h of selfchecks) {
      if (h.selfcheck!.suiteOnly) {
        expect(suiteWorkspaces(h.selfcheck!.command)).not.toBeNull();
      }
    }
  });

  it("carries suiteOnly onto GateCheck, false when absent", () => {
    const plan = planGate([
      "packages/models/src/x.ts",
      "packages/cli/src/harness/registry.ts"
    ]);
    const models = plan.checks.find((c) => c.harnessId === "data-models");
    const audit = plan.checks.find((c) => c.harnessId === "harness-audit");
    expect(models?.suiteOnly).toBe(true);
    expect(audit?.suiteOnly).toBe(false);
  });
});

describe("planGate global files", () => {
  it.each([
    "package.json",
    "package-lock.json",
    "tsconfig.base.json",
    "turbo.json",
    ".nvmrc",
    "scripts/run-turbo.mjs"
  ])("%s is global", (file) => {
    expect(isGlobalGateFile(file)).toBe(true);
  });

  it.each([
    "packages/models/package.json",
    "web/package.json",
    "packages/cli/tsconfig.json",
    ".github/workflows/quality-checks.yml",
    "docs/cli.md"
  ])("%s is not global", (file) => {
    expect(isGlobalGateFile(file)).toBe(false);
  });

  it("selects every selfcheck for a root lockfile change", () => {
    const plan = planGate(["package-lock.json"]);
    const all = HARNESSES.filter((h) => h.selfcheck).map((h) => h.id);
    expect(plan.globalFiles).toEqual(["package-lock.json"]);
    expect(plan.unmappedFiles).toEqual([]);
    expect(plan.checks.map((c) => c.harnessId).sort()).toEqual(all.sort());
  });

  it("does not treat a nested workspace package.json as global", () => {
    const plan = planGate(["packages/models/package.json"]);
    expect(plan.globalFiles).toEqual([]);
    expect(plan.checks.map((c) => c.harnessId)).toContain("data-models");
    expect(plan.checks.length).toBeLessThan(
      HARNESSES.filter((h) => h.selfcheck).length
    );
  });

  it("keeps a global file's own surface and merges its checks", () => {
    const plan = planGate(["package.json", "packages/models/src/x.ts"]);
    expect(plan.surfaces.some((s) => s.files.length > 0)).toBe(true);
    const ids = plan.checks.map((c) => c.harnessId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("planGate dependency-aware routing", () => {
  const harnesses = [
    { id: "h-protocol", selfcheck: { command: "a", cost: "cheap" } },
    { id: "h-flow", selfcheck: { command: "b", cost: "cheap" } },
    { id: "h-leaf", selfcheck: { command: "c", cost: "cheap" } }
  ] as unknown as HarnessEntry[];
  const surfaces: SurfaceEntry[] = [
    { id: "protocol-s", title: "p", harnesses: ["h-protocol"], paths: ["packages/protocol/"] },
    { id: "flow-s", title: "f", harnesses: ["h-flow"], paths: ["packages/flow/src/game.ts"] },
    { id: "leaf-s", title: "l", harnesses: ["h-leaf"], paths: ["packages/leaf/"] }
  ];
  const packages: PackageInfo[] = [
    { name: "@nodetool-ai/protocol", dir: "packages/protocol", internalDeps: [] },
    {
      name: "@nodetool-ai/flow",
      dir: "./packages/flow/",
      internalDeps: ["@nodetool-ai/protocol"]
    },
    { name: "@nodetool-ai/leaf", dir: "packages/leaf", internalDeps: [] }
  ];

  it("keeps path-only behavior without packages", () => {
    const plan = planGate(["packages/protocol/src/index.ts"], harnesses, surfaces);
    expect(plan.surfaces.map((s) => s.id)).toEqual(["protocol-s"]);
    expect(plan.surfaces[0]).not.toHaveProperty("viaDependency");
  });

  it("touches a surface inside a downstream workspace", () => {
    const plan = planGate(
      ["packages/protocol/src/index.ts"],
      harnesses,
      surfaces,
      packages
    );
    expect(plan.surfaces).toEqual([
      { id: "protocol-s", files: ["packages/protocol/src/index.ts"] },
      { id: "flow-s", files: [], viaDependency: true }
    ]);
    expect(plan.checks.map((c) => c.harnessId)).toEqual(["h-protocol", "h-flow"]);
  });

  it("does not touch an unrelated workspace's surface", () => {
    const plan = planGate(
      ["packages/protocol/src/index.ts"],
      harnesses,
      surfaces,
      packages
    );
    expect(plan.checks.map((c) => c.harnessId)).not.toContain("h-leaf");
  });

  it("routes a protocol change to game and plan surfaces in the real registry", () => {
    const real = readWorkspacePackages(REPO_ROOT);
    const plan = planGate(
      ["packages/protocol/src/index.ts"],
      HARNESSES,
      SURFACES,
      real
    );
    const ids = plan.surfaces.map((s) => s.id);
    expect(ids).toContain("workflow-execution");
    expect(ids).toContain("game-creation-flow");
    expect(plan.checks.map((c) => c.harnessId)).toEqual(
      expect.arrayContaining(["game-flow", "workflow-plan"])
    );
  });
});

describe("readWorkspacePackages", () => {
  it("reads the real workspace graph", () => {
    const packages = readWorkspacePackages(REPO_ROOT);
    const protocol = packages.find((p) => p.name === "@nodetool-ai/protocol");
    const kernel = packages.find((p) => p.name === "@nodetool-ai/kernel");
    expect(protocol?.dir).toBe("packages/protocol");
    expect(kernel?.internalDeps).toContain("@nodetool-ai/protocol");
    expect(packages.some((p) => p.dir === "mobile")).toBe(true);
    expect(
      packages.find((p) => p.name === "@nodetool-ai/reliability-harness")
        ?.ownedPaths
    ).toEqual(["reliability/journeys"]);
  });
});
