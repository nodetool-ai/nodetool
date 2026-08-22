/**
 * The capability coverage table against reality.
 *
 * `harness-registry.test.ts` proves the rules bite on fixtures. This one runs
 * them over the checked-in table and the live capability registry, and then
 * makes the checks a pure audit cannot: the implementation file exists, every
 * suite it names is a real file that names the capability back, and every eval
 * case it claims is declared in the file it points at.
 *
 * Enumeration is the point — each walk asserts it found its targets, so a
 * broken glob or an empty table cannot pass by matching nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HARNESSES } from "../src/harness/registry.js";
import {
  auditCapabilityCoverage,
  extractCoverageBlocks
} from "../src/harness/capability-coverage.js";
import { CAPABILITY_COVERAGE } from "../src/harness/capability-table.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (repoPath: string): string =>
  readFileSync(join(ROOT, repoPath), "utf8");

/**
 * Constants a spec file binds to a wire name. A suite may drive a capability
 * through either, and `sandbox-package-listing.test.ts` drives it through the
 * constant.
 */
function specAliases(moduleName: string): string[] {
  const file = `packages/agents/src/capabilities/${moduleName}.specs.ts`;
  if (!existsSync(join(ROOT, file))) return [];
  return [...read(file).matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*"([a-z0-9_]+)"/g)].map(
    (m) => `${m[2]}:${m[1]}`
  );
}

/**
 * The live registry is not importable here — `vitest.config.ts` stubs
 * `@nodetool-ai/agents` for every CLI test, and un-stubbing it would change
 * what every other suite in this workspace resolves. So the comparison
 * against the live specs (a capability with no entry, an entry naming no
 * capability, contract drift) is `npm run capabilities:check`, which reads
 * dist; the `capability-suites` selfcheck runs it, and this file asserts that
 * wiring below. What is checked here is everything that needs no runtime.
 */
describe("capability coverage table", () => {
  const declared = CAPABILITY_COVERAGE.map((entry) => ({
    name: entry.name,
    module: entry.module,
    contract: entry.contract
  }));

  it("has capabilities to audit at all", () => {
    expect(CAPABILITY_COVERAGE.length).toBeGreaterThan(100);
  });

  it("names each capability once", () => {
    const result = auditCapabilityCoverage(
      declared,
      CAPABILITY_COVERAGE,
      HARNESSES
    );
    expect(result.duplicates).toEqual([]);
  });

  it("covers every capability with a suite, an eval case, or a gap note", () => {
    const result = auditCapabilityCoverage(
      declared,
      CAPABILITY_COVERAGE,
      HARNESSES
    );
    expect(result.undocumentedGaps).toEqual([]);
    expect(result.unknownSelfchecks).toEqual([]);
    expect(result.selfchecksWithoutSuites).toEqual([]);
    expect(result.coveredCount).toBeGreaterThan(0);
  });

  it("points at implementation files that exist", () => {
    const missing = CAPABILITY_COVERAGE.filter(
      (entry) => !existsSync(join(ROOT, entry.impl))
    ).map((entry) => `${entry.name} → ${entry.impl}`);
    expect(missing).toEqual([]);
  });

  it("names suites that exist and name the capability back", () => {
    const broken: string[] = [];
    let checked = 0;
    for (const entry of CAPABILITY_COVERAGE) {
      const aliases = specAliases(entry.module)
        .filter((pair) => pair.startsWith(`${entry.name}:`))
        .map((pair) => pair.split(":")[1]!);
      for (const suite of entry.suites ?? []) {
        checked += 1;
        if (!existsSync(join(ROOT, suite))) {
          broken.push(`${entry.name}: ${suite} does not exist`);
          continue;
        }
        const source = read(suite);
        const named = [entry.name, ...aliases].some((token) =>
          new RegExp(`\\b${token}\\b`).test(source)
        );
        if (!named) broken.push(`${entry.name}: ${suite} never names it`);
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(broken).toEqual([]);
  });

  it("names eval cases that the file it points at declares", () => {
    const broken: string[] = [];
    let checked = 0;
    for (const entry of CAPABILITY_COVERAGE) {
      for (const ref of entry.evals ?? []) {
        if (!existsSync(join(ROOT, ref.file))) {
          broken.push(`${entry.name}: ${ref.file} does not exist`);
          continue;
        }
        const source = read(ref.file);
        for (const caseId of ref.cases) {
          checked += 1;
          if (!new RegExp(`id:\\s*"${caseId}"`).test(source)) {
            broken.push(`${entry.name}: ${ref.file} declares no case ${caseId}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(broken).toEqual([]);
  });

  it("is readable by the gate that compares it across refs", () => {
    const blocks = extractCoverageBlocks(
      read("packages/cli/src/harness/capability-table.ts")
    );
    expect(blocks.size).toBe(CAPABILITY_COVERAGE.length);
    for (const entry of CAPABILITY_COVERAGE) {
      expect(blocks.get(entry.name), entry.name).toContain(
        `contract: "${entry.contract}"`
      );
    }
  });

  it("has the live check wired into the capability selfcheck", () => {
    const harness = HARNESSES.find((h) => h.id === "capability-suites");
    expect(harness?.selfcheck?.command).toContain("capabilities:check");
  });

  it("every suite the table names is one the selfcheck actually runs", () => {
    const harness = HARNESSES.find((h) => h.id === "capability-suites");
    const filters = (harness?.selfcheck?.command ?? "")
      .split("--")
      .pop()!
      .trim()
      .split(/\s+/);
    const uncovered = new Set<string>();
    for (const entry of CAPABILITY_COVERAGE) {
      for (const suite of entry.suites ?? []) {
        if (!filters.some((filter) => suite.includes(filter))) {
          uncovered.add(suite);
        }
      }
    }
    expect([...uncovered]).toEqual([]);
  });
});
