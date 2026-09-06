/**
 * Registry invariants for harness-first engineering (docs/HARNESS_FIRST.md).
 *
 * This test is the CI teeth behind `nodetool harness audit`: an undocumented
 * surface gap, a dangling harness reference, or a duplicate id fails the
 * build, not just a CLI run someone has to remember to make.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HARNESSES,
  SURFACES,
  UNCLAIMED_PATHS,
  auditHarnessCoverage,
  auditPathClaims,
  planGate
} from "../src/harness/registry.js";
import {
  auditCapabilityCoverage,
  extractCoverageBlocks,
  planCapabilityMappingGate,
  type CapabilityCoverageEntry,
  type DeclaredCapability
} from "../src/harness/capability-coverage.js";

describe("harness registry", () => {
  it("has unique harness and surface ids", () => {
    const hIds = HARNESSES.map((h) => h.id);
    const sIds = SURFACES.map((s) => s.id);
    expect(new Set(hIds).size).toBe(hIds.length);
    expect(new Set(sIds).size).toBe(sIds.length);
  });

  it("every harness has a command and a docs pointer", () => {
    // Emptying the registry would satisfy the loop below by iterating nothing.
    expect(HARNESSES.length).toBeGreaterThan(0);
    for (const h of HARNESSES) {
      expect(h.command, h.id).toBeTruthy();
      expect(h.docs, h.id).toBeTruthy();
    }
  });

  it("every surface reference resolves to a registered harness", () => {
    const result = auditHarnessCoverage();
    expect(result.unknownHarnessRefs).toEqual([]);
  });

  it("every uncovered surface documents its gap", () => {
    const result = auditHarnessCoverage();
    expect(result.undocumentedGaps).toEqual([]);
  });

  it("audit catches an undocumented gap", () => {
    const result = auditHarnessCoverage(HARNESSES, [
      ...SURFACES,
      { id: "new-surface", title: "New surface", harnesses: [] }
    ]);
    expect(result.undocumentedGaps).toEqual(["new-surface"]);
  });

  it("audit catches a dangling harness reference", () => {
    const result = auditHarnessCoverage(HARNESSES, [
      { id: "s", title: "S", harnesses: ["does-not-exist"], paths: [] }
    ]);
    expect(result.unknownHarnessRefs).toEqual(["s → does-not-exist"]);
  });

  it("every surface declares owning paths", () => {
    for (const s of SURFACES) {
      expect(s.paths.length, s.id).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Path claims: every packages/* dir (plus web/, electron/, mobile/) is
// referenced by a surface's paths or documented in UNCLAIMED_PATHS. Without
// this, a diff under an unreferenced package selects nothing in
// `nodetool harness gate` and nobody is told.
// ---------------------------------------------------------------------------

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

/** Repo-relative top-level directories under `packages/`, plus the apps. */
function realRootDirs(): string[] {
  const packagesDir = join(repoRoot, "packages");
  const pkgDirs = readdirSync(packagesDir)
    .filter((d) => statSync(join(packagesDir, d)).isDirectory())
    .map((d) => `packages/${d}`);
  return [...pkgDirs, "web", "electron", "mobile"];
}

describe("path claims", () => {
  it("claims every real packages/* directory (plus web/, electron/, mobile/)", () => {
    const unclaimed = auditPathClaims(realRootDirs(), SURFACES, UNCLAIMED_PATHS);
    expect(unclaimed).toEqual([]);
  });

  it("every UNCLAIMED_PATHS entry is a real, still-unclaimed directory", () => {
    // A stale entry — the directory was deleted, or a surface grew a path
    // that now claims it too — should fail so the map does not silently
    // paper over drift.
    for (const key of Object.keys(UNCLAIMED_PATHS)) {
      const dirPath = join(repoRoot, key.replace(/\/$/, ""));
      const exists = statSync(dirPath, { throwIfNoEntry: false })?.isDirectory();
      expect(exists, `${key} no longer exists`).toBe(true);

      const claimedBySurface = SURFACES.some((s) =>
        s.paths.some((p) => p.startsWith(key) || key.startsWith(p))
      );
      expect(
        claimedBySurface,
        `${key} is in UNCLAIMED_PATHS but a surface already claims it`
      ).toBe(false);

      expect(UNCLAIMED_PATHS[key], key).toBeTruthy();
    }
  });

  it("audit catches a directory no surface or UNCLAIMED_PATHS entry claims", () => {
    const unclaimed = auditPathClaims(
      ["packages/models", "packages/totally-not-a-real-package"],
      SURFACES,
      UNCLAIMED_PATHS
    );
    expect(unclaimed).toEqual(["packages/totally-not-a-real-package"]);
  });
});

// ---------------------------------------------------------------------------
// gated:pr / gated:nightly: every harness tagged with either must be findable
// in the workflow that is claimed to gate it, by a substring of its own
// selfcheck (or command, when it has no selfcheck).
// ---------------------------------------------------------------------------

describe("gated capability matches a real CI trigger", () => {
  const workflowsDir = join(repoRoot, ".github", "workflows");
  const workflowFiles = readdirSync(workflowsDir).filter(
    (f) => f.endsWith(".yml") || f.endsWith(".yaml")
  );
  const workflowText = workflowFiles
    .map((f) => readFileSync(join(workflowsDir, f), "utf-8"))
    .join("\n");

  /**
   * One hand-verified, distinctive substring per gated harness — chosen by
   * reading .github/workflows/*.yml, not derived from the command string, so
   * a harness that changes its selfcheck wording does not silently pass on a
   * coincidental match. `reliability-ring0` and `app-build` no longer appear
   * as literal, hand-written commands: quality-checks.yml's `harness-gate`
   * leg (docs/HARNESS_FIRST.md § The gate) runs `nodetool harness gate` on
   * every pull request and picks up any harness with a cheap selfcheck whose
   * surface the diff touches, so their evidence is that invocation plus the
   * harness's own selfcheck being cheap enough for the gate to run it.
   */
  const GATED_EVIDENCE: Record<string, string> = {
    validate: "npm run validate:examples",
    debug: "npm run examples:smoke",
    "reliability-ring0": "dev:nodetool -- harness gate",
    "app-build": "dev:nodetool -- harness gate",
    "backend-smoke": "npm run backend:smoke",
    "docker-smoke": "docker-smoke.mjs http://localhost:7777",
    "provider-contract": "provider-contract-probes",
    "provider-codegen": "npm run generate:fal:check -- --strict",
    recipes: "dev:nodetool -- harness gate",
    "node-pack-parity": "parity example-workflows"
  };

  const gated = HARNESSES.filter((h) =>
    h.capabilities.some((c) => c === "gated:pr" || c === "gated:nightly")
  );

  it("found at least one gated harness", () => {
    expect(gated.length).toBeGreaterThan(0);
  });

  it("every gated harness has a hand-verified evidence entry", () => {
    // Catches a harness that picked up `gated:*` without anyone checking —
    // and a stale evidence entry left behind for a harness that dropped it.
    const gatedIds = gated.map((h) => h.id).sort();
    expect(Object.keys(GATED_EVIDENCE).sort()).toEqual(gatedIds);
  });

  for (const h of gated) {
    it(`${h.id} (${h.capabilities.find((c) => c.startsWith("gated"))}) appears in a workflow`, () => {
      const needle = GATED_EVIDENCE[h.id];
      expect(needle, `${h.id} has no GATED_EVIDENCE entry`).toBeTruthy();
      expect(
        workflowText,
        `expected to find "${needle}" for ${h.id}`
      ).toContain(needle);
      if (needle === "dev:nodetool -- harness gate") {
        // The generic gate only reaches a harness through its selfcheck.
        expect(h.selfcheck?.cost, h.id).toBe("cheap");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Docs pointers: `docs: "<file>"` or `docs: "<file> § <heading prefix>"`.
// Every one must resolve — the file must exist, and a heading fragment must
// be a case-insensitive prefix of some markdown heading line in that file.
// ---------------------------------------------------------------------------

describe("docs pointers resolve", () => {
  function resolveDocsPointer(pointer: string): { file: string; heading?: string } {
    const [file, heading] = pointer.split(" § ").map((s) => s.trim());
    return { file: file!, heading };
  }

  const headingCache = new Map<string, string[]>();
  function headingsOf(file: string): string[] {
    const cached = headingCache.get(file);
    if (cached) return cached;
    const text = readFileSync(join(repoRoot, file), "utf-8");
    const headings = text
      .split("\n")
      .filter((line) => /^#{1,6}\s/.test(line))
      .map((line) => line.replace(/^#{1,6}\s+/, "").trim());
    headingCache.set(file, headings);
    return headings;
  }

  for (const h of HARNESSES) {
    it(`${h.id}: docs pointer "${h.docs}" resolves`, () => {
      const { file, heading } = resolveDocsPointer(h.docs);
      const filePath = join(repoRoot, file);
      expect(
        statSync(filePath, { throwIfNoEntry: false })?.isFile(),
        `${h.id}: ${file} does not exist`
      ).toBe(true);
      if (heading) {
        const headings = headingsOf(file);
        const needle = heading.toLowerCase();
        const hit = headings.some((line) => line.toLowerCase().startsWith(needle));
        expect(
          hit,
          `${h.id}: no heading in ${file} starts with "${heading}"`
        ).toBe(true);
      }
    });
  }
});

describe("harness gate", () => {
  it("maps a kernel change to workflow-execution selfchecks", () => {
    const plan = planGate(["packages/kernel/src/runner.ts"]);
    expect(plan.surfaces.map((s) => s.id)).toEqual(["workflow-execution"]);
    const ids = plan.checks.map((c) => c.harnessId).sort();
    expect(ids).toContain("validate");
    expect(ids).toContain("reliability-ring0");
    expect(ids).toContain("node-run");
    // debug's selfcheck (`examples:smoke`) is expensive, so it lands in
    // checks (as an expensive one) rather than manual — it still runs, just
    // not in the default `harness gate` without `--expensive`.
    expect(ids).toContain("debug");
    const debugCheck = plan.checks.find((c) => c.harnessId === "debug");
    expect(debugCheck?.cost).toBe("expensive");
  });

  it("dedupes a selfcheck shared by several touched surfaces", () => {
    const plan = planGate([
      "packages/kernel/src/runner.ts",
      "packages/agents/src/planner.ts"
    ]);
    const validate = plan.checks.filter((c) => c.harnessId === "validate");
    expect(validate).toHaveLength(1);
    expect(validate[0]!.surfaces.sort()).toEqual([
      "workflow-authoring",
      "workflow-execution"
    ]);
  });

  it("maps a timeline version-history change onto the timeline surface", () => {
    const plan = planGate([
      "packages/models/src/timeline-sequence-version.ts",
      "packages/cli/src/commands/timeline-versions.ts"
    ]);
    expect(plan.surfaces.map((s) => s.id)).toContain("timeline");
    expect(plan.manual.map((m) => m.harnessId)).toContain("timeline-versions");
    expect(plan.unmappedFiles).toEqual([]);
  });

  it("maps a sketch version-history change onto the sketch surface", () => {
    const plan = planGate([
      "packages/models/src/image-document-version.ts",
      "packages/cli/src/commands/sketch-versions.ts"
    ]);
    expect(plan.surfaces.map((s) => s.id)).toContain("sketch");
    expect(plan.manual.map((m) => m.harnessId)).toContain("sketch-versions");
    expect(plan.unmappedFiles).toEqual([]);
  });

  it("maps a JS-script change onto the jsscript surface and its cheap selfcheck", () => {
    const plan = planGate([
      "packages/agents/src/capabilities/js-scripts.ts",
      "packages/cli/src/commands/js-script.ts"
    ]);
    expect(plan.surfaces.map((s) => s.id)).toContain("jsscript");
    expect(plan.checks.map((c) => c.harnessId)).toContain("jsscript-test");
    // validate/run/debug/versions need a target, so they land in manual.
    expect(plan.manual.map((m) => m.harnessId)).toContain("jsscript-validate");
    expect(plan.unmappedFiles).toEqual([]);
  });

  it("maps a script↔storyboard link change onto both surfaces and their selfcheck", () => {
    const plan = planGate([
      "packages/protocol/src/script-link.ts",
      "packages/timeline/src/linked.ts",
      "packages/agents/src/capabilities/storyboards.ts",
      "web/src/lib/tools/builtin/script.ts"
    ]);
    const surfaces = plan.surfaces.map((s) => s.id);
    expect(surfaces).toContain("storyboard");
    expect(surfaces).toContain("script");
    const check = plan.checks.find(
      (c) => c.harnessId === "script-storyboard-link"
    );
    expect(check).toBeDefined();
    expect(check!.surfaces.sort()).toEqual(["script", "storyboard"]);
    // timeline-validate and eval need a target or a model, so they are manual.
    expect(plan.manual.map((m) => m.harnessId)).toContain("timeline-validate");
    expect(plan.unmappedFiles).toEqual([]);
  });

  it("claims every packages/timeline file for the timeline surface", () => {
    const plan = planGate([
      "packages/timeline/src/script-link.ts",
      "packages/timeline/src/render/sceneModel.ts"
    ]);
    expect(plan.surfaces.map((s) => s.id)).toContain("timeline");
    expect(plan.unmappedFiles).toEqual([]);
  });

  it("reports files no surface claims", () => {
    const plan = planGate(["README.md"]);
    expect(plan.unmappedFiles).toEqual(["README.md"]);
    expect(plan.checks).toEqual([]);
  });

  it("reports a touched gap surface as uncovered", () => {
    const plan = planGate(["mobile/App.tsx"]);
    expect(plan.uncoveredSurfaces).toEqual(["mobile"]);
    expect(plan.checks).toEqual([]);
  });

  it("selfchecks are keyless npm/node commands from the repo root", () => {
    for (const h of HARNESSES) {
      if (!h.selfcheck) continue;
      expect(h.selfcheck.command, h.id).toMatch(/^(npm|node) /);
    }
  });
});

// ---------------------------------------------------------------------------
// Capability coverage: the rung below surface coverage.
// ---------------------------------------------------------------------------

/** A capability the fixtures can hand the audit, with a stable fingerprint. */
function declare(
  name: string,
  module = "demo",
  contract = "aaaaaaaaaaaa"
): DeclaredCapability {
  return { name, module, contract };
}

function entry(
  over: Partial<CapabilityCoverageEntry> & { name: string }
): CapabilityCoverageEntry {
  return {
    module: "demo",
    impl: "packages/agents/src/capabilities/demo.ts",
    contract: "aaaaaaaaaaaa",
    ...over
  };
}

describe("capability coverage audit", () => {
  it("fails on a new exported capability with no mapping", () => {
    const result = auditCapabilityCoverage(
      [declare("list_demo"), declare("brand_new_capability")],
      [entry({ name: "list_demo", gap: "nothing covers it yet" })],
      HARNESSES
    );
    expect(result.unmapped).toEqual(["brand_new_capability"]);
  });

  it("fails a capability with no selfcheck, no eval case, and no gap note", () => {
    const result = auditCapabilityCoverage(
      [declare("list_demo")],
      [entry({ name: "list_demo" })],
      HARNESSES
    );
    expect(result.undocumentedGaps).toEqual(["list_demo"]);
    expect(result.coveredCount).toBe(0);
  });

  it("passes a capability that names an eval case", () => {
    const result = auditCapabilityCoverage(
      [declare("list_demo")],
      [
        entry({
          name: "list_demo",
          evals: [
            {
              file: "packages/agents/src/evals/codeact-api-core.ts",
              cases: ["api-demo"]
            }
          ]
        })
      ],
      HARNESSES
    );
    expect(result.undocumentedGaps).toEqual([]);
    expect(result.coveredCount).toBe(1);
    expect(result.rows[0]!.evalCases).toBe(1);
  });

  it("rejects a selfcheck no harness offers, and one that names no suite", () => {
    const result = auditCapabilityCoverage(
      [declare("a"), declare("b")],
      [
        entry({ name: "a", selfcheck: "no-such-harness", suites: ["x.test.ts"] }),
        entry({ name: "b", selfcheck: "capability-suites" })
      ],
      HARNESSES
    );
    expect(result.unknownSelfchecks).toEqual(["a → no-such-harness"]);
    expect(result.selfchecksWithoutSuites).toEqual(["b"]);
  });

  it("reports a stale entry, a moved module, and contract drift", () => {
    const result = auditCapabilityCoverage(
      [declare("kept", "demo", "bbbbbbbbbbbb")],
      [
        entry({ name: "kept", module: "elsewhere", gap: "n/a" }),
        entry({ name: "retired", gap: "n/a" })
      ],
      HARNESSES
    );
    expect(result.stale).toEqual(["retired"]);
    expect(result.moduleMismatches).toHaveLength(1);
    expect(result.contractDrift).toHaveLength(1);
  });

  it("catches the same name entered twice", () => {
    const result = auditCapabilityCoverage(
      [declare("twice")],
      [entry({ name: "twice", gap: "n/a" }), entry({ name: "twice", gap: "n/a" })],
      HARNESSES
    );
    expect(result.duplicates).toEqual(["twice"]);
  });
});

describe("capability mapping gate", () => {
  const table = (entries: string[]): string =>
    `export const CAPABILITY_COVERAGE: readonly CapabilityCoverageEntry[] = [\n${entries.join(
      "\n"
    )}\n];\n`;

  const block = (
    name: string,
    contract: string,
    coverage = '    gap: "nothing covers it yet",'
  ): string =>
    [
      "  {",
      `    name: "${name}",`,
      '    module: "demo",',
      '    impl: "packages/agents/src/capabilities/demo.ts",',
      `    contract: "${contract}",`,
      coverage,
      "  },"
    ].join("\n");

  it("reads one block per capability out of the table source", () => {
    const blocks = extractCoverageBlocks(
      table([block("a", "1111"), block("b", "2222")])
    );
    expect([...blocks.keys()]).toEqual(["a", "b"]);
    expect(blocks.get("a")).toContain('contract: "1111"');
  });

  it("fails a contract change that left the mapping untouched", () => {
    const base = table([block("a", "1111")]);
    const head = table([block("a", "2222")]);
    const result = planCapabilityMappingGate(base, head);
    expect(result.contractChanged).toEqual(["a"]);
    expect(result.violations.map((v) => v.name)).toEqual(["a"]);
    expect(result.violations[0]!.detail).toContain("coverage mapping");
  });

  it("passes a contract change that moved its mapping with it", () => {
    const base = table([block("a", "1111")]);
    const head = table([
      block(
        "a",
        "2222",
        '    evals: [{ file: "packages/agents/src/evals/x.ts", cases: ["new-case"] }],'
      )
    ]);
    const result = planCapabilityMappingGate(base, head);
    expect(result.contractChanged).toEqual(["a"]);
    expect(result.violations).toEqual([]);
  });

  /**
   * `suites` are file paths, and they do not move when a case is *added* to a
   * file already listed — which is what covering a new contract usually looks
   * like. Without reading the diff, improving a description demanded a
   * contrived change to a generated field, and writing the test could not
   * satisfy the gate.
   */
  it("passes a contract change whose own covering suite is in the diff", () => {
    const suite = "packages/agents/tests/capabilities-nodes.test.ts";
    const coverage = `    suites: ["${suite}"],`;
    const base = table([block("a", "1111", coverage)]);
    const head = table([block("a", "2222", coverage)]);

    expect(planCapabilityMappingGate(base, head, []).violations).toHaveLength(
      1
    );
    expect(
      planCapabilityMappingGate(base, head, [suite]).violations
    ).toEqual([]);
    // A path spelled the way `git status --porcelain` and Windows spell it.
    expect(
      planCapabilityMappingGate(base, head, [
        "./packages\\agents\\tests\\capabilities-nodes.test.ts"
      ]).violations
    ).toEqual([]);
    // Some other file changing is not an answer.
    expect(
      planCapabilityMappingGate(base, head, ["packages/agents/src/x.ts"])
        .violations
    ).toHaveLength(1);
  });

  it("passes a new capability — its mapping is new by construction", () => {
    const result = planCapabilityMappingGate(
      table([block("a", "1111")]),
      table([block("a", "1111"), block("b", "3333")])
    );
    expect(result.added).toEqual(["b"]);
    expect(result.violations).toEqual([]);
  });

  it("says nothing about an ordinary refactor", () => {
    const same = table([block("a", "1111"), block("b", "2222")]);
    const result = planCapabilityMappingGate(same, same);
    expect(result).toEqual({
      added: [],
      contractChanged: [],
      removed: [],
      violations: []
    });
  });

  it("reports a removed capability without failing the gate", () => {
    const result = planCapabilityMappingGate(
      table([block("a", "1111"), block("b", "2222")]),
      table([block("a", "1111")])
    );
    expect(result.removed).toEqual(["b"]);
    expect(result.violations).toEqual([]);
  });

  it("treats a table absent at the base ref as all-new", () => {
    const result = planCapabilityMappingGate(null, table([block("a", "1111")]));
    expect(result.added).toEqual(["a"]);
    expect(result.violations).toEqual([]);
  });

  it("demands no eval from a non-agent surface", () => {
    // A deploy-image change touches a surface with its own harness and no
    // capability at all: the table is untouched, so the gate is silent.
    const plan = planGate(["Dockerfile", "scripts/docker-smoke.mjs"]);
    // scripts/ is also claimed by repo-scripts; the point is that no
    // agent surface is.
    expect(plan.surfaces.map((s) => s.id)).toContain("deploy-image");
    expect(plan.surfaces.map((s) => s.id)).not.toContain("agent-capabilities");
    const same = table([block("a", "1111")]);
    expect(planCapabilityMappingGate(same, same).violations).toEqual([]);
  });

  it("maps a capability change onto the agent-capabilities surface", () => {
    const plan = planGate([
      "packages/agents/src/capabilities/workflows.ts",
      "packages/cli/src/harness/capability-table.ts"
    ]);
    expect(plan.surfaces.map((s) => s.id)).toContain("agent-capabilities");
    expect(plan.checks.map((c) => c.harnessId)).toContain("capability-suites");
    expect(plan.unmappedFiles).toEqual([]);
  });

  it("reports an unregistered capability-adjacent file", () => {
    // A file no surface claims still lands in unmappedFiles — the gate cannot
    // select a check for code it does not know who owns.
    const plan = planGate(["notes/capability-plans.md"]);
    expect(plan.unmappedFiles).toEqual(["notes/capability-plans.md"]);
    expect(plan.checks).toEqual([]);
  });
});
