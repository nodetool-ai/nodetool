/**
 * The crash fuzzer's oracle.
 *
 * A validator is allowed to reject its input. It is not allowed to throw a
 * TypeError, blow the stack, or hang: those reach users as an unhandled
 * exception in the editor, the CLI, or the server. So the assertions here are
 * about the *shape* of the failure, never about whether the document passed.
 *
 * This suite is also the test oracle Stryker runs against
 * `graph-validation.ts`, `code-analysis.ts`, `code-node-validation.ts` and
 * `validation.ts` (see `stryker.crash.config.json`). A mutant of those files
 * that survives is a branch no fuzzed input distinguishes — a blind spot in
 * the corpus, which is what the crash-fuzzer workflow reports on.
 *
 * Seed and size come from `FUZZ_SEED` / `FUZZ_COUNT` so the nightly run can
 * sweep fresh inputs. Both default to fixed values, because Stryker needs the
 * same corpus every run for the score to mean anything.
 */

import { describe, expect, it } from "vitest";
import {
  validateGraph,
  validationHeadline,
  type GraphValidationNode,
  type GraphValidationOptions,
  type GraphValidationReport
} from "../../src/graph-validation.js";
import { formatValidationIssues } from "../../src/validation.js";
import {
  analyzeCodeBody,
  freeIdentifiers,
  inferredCodeInputNames,
  inferredCodeOutputNames,
  parseCodeBody
} from "../../src/code-analysis.js";
import { validateCodeNodeBody } from "../../src/code-node-validation.js";
import {
  AVAILABLE_SECRETS,
  codeCorpus,
  graphCorpus,
  seedJsScriptLookup,
  seedRegistry
} from "./corpus.js";

/** The corpus Stryker scores against, and the one the snapshots pin. */
const PINNED_SEED = 20260817;
const PINNED_COUNT = 12;

const SEED = Number(process.env.FUZZ_SEED ?? PINNED_SEED);
const COUNT = Number(process.env.FUZZ_COUNT ?? PINNED_COUNT);

/**
 * The issue-code signatures are pinned to one corpus. A sweep at another seed
 * still runs every crash assertion — it just has nothing to compare against.
 */
const pinned = SEED === PINNED_SEED && COUNT === PINNED_COUNT;

/** No single document may take longer than this to validate. */
const BUDGET_MS = 2000;

const SEVERITIES = new Set(["error", "warning", "info"]);

const registry = seedRegistry();
const graphMutants = graphCorpus(SEED, COUNT);
const codeMutants = codeCorpus(SEED, COUNT);

/**
 * The optional catalogs, all switched on. Left off, `missing_secret`,
 * `missing_required_model_input` and the whole linked-script branch are not
 * merely unreported — they never run, so no mutant of them is observable.
 */
const OPTIONS: GraphValidationOptions = {
  sandboxModuleCatalog: null,
  availableSecrets: AVAILABLE_SECRETS,
  jsScriptLookup: seedJsScriptLookup()
};

function assertWellFormed(report: GraphValidationReport): void {
  expect(Number.isInteger(report.nodeCount)).toBe(true);
  expect(Number.isInteger(report.edgeCount)).toBe(true);
  expect(report.nodeCount).toBeGreaterThanOrEqual(0);
  expect(report.edgeCount).toBeGreaterThanOrEqual(0);

  const counted = { errors: 0, warnings: 0, info: 0 };
  for (const issue of report.issues) {
    expect(SEVERITIES.has(issue.severity)).toBe(true);
    expect(typeof issue.code).toBe("string");
    expect(issue.code.length).toBeGreaterThan(0);
    expect(typeof issue.message).toBe("string");
    expect(issue.message.length).toBeGreaterThan(0);
    if (issue.severity === "error") {
      counted.errors += 1;
    } else if (issue.severity === "warning") {
      counted.warnings += 1;
    } else {
      counted.info += 1;
    }
  }
  expect(report.counts).toEqual(counted);
  expect(report.ok).toBe(counted.errors === 0);
  // What the CLI prints instead of the issue list, so it has to read whatever
  // the report holds.
  expect(validationHeadline(report).length).toBeGreaterThan(0);
}

function codesOf(issues: readonly { code: string }[]): string[] {
  return [...new Set(issues.map((issue) => issue.code))].sort();
}

describe(`crash oracle: validateGraph (seed ${SEED})`, () => {
  it("generates a non-empty corpus", () => {
    expect(graphMutants.length).toBe(COUNT * 4);
  });

  it.each(graphMutants.map((m) => [m.id, m.mutation, m] as const))(
    "%s (%s) is rejected, not thrown on",
    (_id, _mutation, mutant) => {
      const started = performance.now();
      const report = validateGraph(mutant.graph, registry, OPTIONS);
      expect(performance.now() - started).toBeLessThan(BUDGET_MS);
      assertWellFormed(report);
    }
  );

  it("is deterministic for a given document", () => {
    for (const mutant of graphMutants) {
      const first = validateGraph(mutant.graph, registry, OPTIONS);
      const second = validateGraph(mutant.graph, registry, OPTIONS);
      expect(second).toEqual(first);
    }
  });

  it.runIf(pinned)(
    "reports a stable set of issue codes across the corpus",
    () => {
      const signature = graphMutants.map((mutant) => {
        const report = validateGraph(mutant.graph, registry, OPTIONS);
        return `${mutant.id} ${mutant.mutation} ok=${report.ok} ${codesOf(report.issues).join(",")}`;
      });
      expect(signature).toMatchSnapshot();
    }
  );

  it("is well-formed with every optional catalog absent", () => {
    // The catalogs fail toward silence, and a host with none — a browser
    // client — is the common case. It is also the only way to reach
    // `js_script_unverified`: with a lookup, an unresolvable link is
    // `js_script_missing` instead.
    for (const mutant of graphMutants) {
      assertWellFormed(
        validateGraph(mutant.graph, registry, { sandboxModuleCatalog: null })
      );
    }
  });

  it("formats every mutant's property issues", () => {
    // `formatValidationIssues` is what GraphValidationError puts in front of a
    // user, and nothing else in this suite reaches it — `validateGraph` keeps
    // the property issues and re-codes them.
    for (const mutant of graphMutants) {
      const nodes = Array.isArray(mutant.graph.nodes) ? mutant.graph.nodes : [];
      for (const raw of nodes) {
        if (raw === null || typeof raw !== "object") continue;
        const node = raw as GraphValidationNode;
        const issues = registry.validateNode({
          id: String(node.id ?? ""),
          type: String(node.type ?? ""),
          properties: node.properties ?? node.data ?? {},
          dynamic_inputs: node.dynamic_inputs,
          dynamic_properties: node.dynamic_properties
        });
        const formatted = formatValidationIssues(issues);
        expect(formatted === "").toBe(issues.length === 0);
      }
    }
  });

  it("survives a graph whose halves are not arrays", () => {
    const report = validateGraph(
      { nodes: "nope", edges: 7 } as never,
      registry,
      OPTIONS
    );
    assertWellFormed(report);
    expect(codesOf(report.issues)).toContain("invalid_graph");
  });

  it("scales to a wide graph without a quadratic blowup", () => {
    // 4000 nodes in one chain: an `edges.some()` inside the node loop is
    // O(n·m) and only shows up at this size.
    const nodes = Array.from({ length: 4000 }, (_, i) => ({
      id: `n${i}`,
      type: "nodetool.text.Concat",
      properties: { a: "", b: "" }
    }));
    const edges = nodes.slice(1).map((node, i) => ({
      id: `e${i}`,
      source: `n${i}`,
      sourceHandle: "output",
      target: node.id,
      targetHandle: "a"
    }));
    const started = performance.now();
    const report = validateGraph({ nodes, edges }, registry, OPTIONS);
    expect(performance.now() - started).toBeLessThan(10_000);
    assertWellFormed(report);
  });
});

describe(`crash oracle: Code node analysis (seed ${SEED})`, () => {
  it("generates a non-empty corpus", () => {
    expect(codeMutants.length).toBe(COUNT * 5);
  });

  it.each(codeMutants.map((m) => [m.id, m.mutation, m] as const))(
    "%s (%s) parses or reports, never throws",
    (_id, _mutation, mutant) => {
      const started = performance.now();
      const parsed = parseCodeBody(mutant.code);
      if (!("error" in parsed)) {
        analyzeCodeBody(parsed.statements);
        freeIdentifiers(parsed.statements);
      }
      inferredCodeInputNames(mutant.code);
      inferredCodeOutputNames(mutant.code);

      const issues = validateCodeNodeBody({
        code: mutant.code,
        availableInputs: ["a", "text", "flag", "items"],
        connectedInputs: ["items"],
        declaredOutputs: ["n", "out", "doc"],
        sandboxModuleCatalog: null
      });
      expect(performance.now() - started).toBeLessThan(BUDGET_MS);
      for (const issue of issues) {
        expect(["error", "warning"]).toContain(issue.severity);
        expect(issue.code.length).toBeGreaterThan(0);
        expect(issue.message.length).toBeGreaterThan(0);
      }
    }
  );

  it.runIf(pinned)(
    "reports a stable set of issue codes across the corpus",
    () => {
      const signature = codeMutants.map((mutant) => {
        const issues = validateCodeNodeBody({
          code: mutant.code,
          availableInputs: ["a", "text", "flag", "items"],
          connectedInputs: ["items"],
          declaredOutputs: ["n", "out", "doc"],
          sandboxModuleCatalog: null
        });
        return `${mutant.id} ${mutant.mutation} ${codesOf(issues).join(",")}`;
      });
      expect(signature).toMatchSnapshot();
    }
  );

  it.each([null, undefined, 42, [], {}, true])(
    "accepts a non-string code property (%s)",
    (code) => {
      const issues = validateCodeNodeBody({
        code,
        availableInputs: [],
        declaredOutputs: ["n"],
        sandboxModuleCatalog: null
      });
      expect(Array.isArray(issues)).toBe(true);
    }
  );
});
