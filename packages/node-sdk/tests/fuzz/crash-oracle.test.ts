/**
 * The crash fuzzer's oracle.
 *
 * A validator is allowed to reject its input. It is not allowed to throw a
 * TypeError, blow the stack, or hang: those reach users as an unhandled
 * exception in the editor, the CLI, or the server. So the assertions here are
 * about the *shape* of the failure, never about whether the document passed.
 *
 * This suite is also the test oracle nodetool-mutator runs against
 * `graph-validation.ts`, `code-analysis.ts`, `code-node-validation.ts` and
 * `validation.ts` (see `test:mutation:crash`). A mutant of those files
 * that survives is a branch no fuzzed input distinguishes — a blind spot in
 * the corpus, which is what the crash-fuzzer workflow reports on.
 *
 * Seed and size come from `FUZZ_SEED` / `FUZZ_COUNT` so the nightly run can
 * sweep fresh inputs. Both default to fixed values, because the mutation run
 * needs the same corpus every time for the score to mean anything.
 */

import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  validateGraph,
  type GraphValidationReport
} from "../../src/graph-validation.js";
import {
  analyzeCodeBody,
  collectBoundNames,
  dynamicModuleAccess,
  exportedNames,
  freeIdentifiers,
  inferredCodeInputNames,
  inferredCodeOutputNames,
  inputsMemberReads,
  migrateCodeBodyToInputs,
  moduleDeclarationKinds,
  outputCallNames,
  parseCodeBody,
  plannedCodeStepProblems,
  returnShapes,
  staticImportBindings,
  staticImportSpecifiers,
  streamCallNames,
  typeofGuardedNames
} from "../../src/code-analysis.js";
import {
  formatValidationIssues,
  validateNodeProperties
} from "../../src/validation.js";
import { validateCodeNodeBody } from "../../src/code-node-validation.js";
import {
  codeCorpus,
  graphCorpus,
  seedCatalog,
  seedRegistry
} from "./corpus.js";
import {
  SEED_ANALYZER_BODIES,
  SEED_CODE_BODIES,
  SEED_GRAPHS,
  SEED_MIGRATION_BODIES,
  SEED_MODULE_SOURCES,
  SEED_PROPERTY_CASES,
  SEED_PLANNED_STEPS
} from "./seeds.js";

/** The corpus the mutation run scores against, and the one the snapshots pin. */
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

// Flat test names, no `describe`: Stryker's Vitest runner filters a mutant's
// covering tests by joining suite names with a space, while Vitest 5 matches
// the filter against names joined with " > ". A nested test never matches, so
// every mutant would survive without running anything.
const GRAPH = `validateGraph (seed ${SEED}):`;
const CODE = `Code node analysis (seed ${SEED}):`;

const registry = seedRegistry();
const graphMutants = graphCorpus(SEED, COUNT);
const codeMutants = codeCorpus(SEED, COUNT);

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
}

/**
 * Compare `text` to a file under `__snapshots__/`. `-u` rewrites the file.
 * Under Stryker `toMatchFileSnapshot` records a mismatch without failing the
 * test, so the explicit comparison is what kills a mutant that changes output.
 */
async function expectPinned(text: string, name: string): Promise<void> {
  const path = `__snapshots__/${name}`;
  await expect(text).toMatchFileSnapshot(path);
  expect(text).toBe(readFileSync(new URL(path, import.meta.url), "utf8"));
}

function codesOf(issues: readonly { code: string }[]): string[] {
  return [...new Set(issues.map((issue) => issue.code))].sort();
}

it(`${GRAPH} generates a non-empty corpus`, () => {
  expect(graphMutants.length).toBe(COUNT * SEED_GRAPHS.length);
});

it.each(graphMutants.map((m) => [m.id, m.mutation, m] as const))(
  `${GRAPH} %s (%s) is rejected, not thrown on`,
  (_id, _mutation, mutant) => {
    const started = performance.now();
    const report = validateGraph(mutant.graph, registry, {
      sandboxModuleCatalog: null
    });
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
    assertWellFormed(report);
  }
);

it(`${GRAPH} is deterministic for a given document`, () => {
  for (const mutant of graphMutants) {
    const options = { sandboxModuleCatalog: null } as const;
    const first = validateGraph(mutant.graph, registry, options);
    const second = validateGraph(mutant.graph, registry, options);
    expect(second).toEqual(first);
  }
});

it.runIf(pinned)(
  `${GRAPH} reports a stable set of issue codes across the corpus`,
  async () => {
    const signature = graphMutants.map((mutant) => {
      const report = validateGraph(mutant.graph, registry, {
        sandboxModuleCatalog: null
      });
      return `${mutant.id} ${mutant.mutation} ok=${report.ok} ${codesOf(report.issues).join(",")}`;
    });
    await expectPinned(signature.join("\n"), "graph-issue-codes.txt");
  }
);

it(`${GRAPH} reports the same issues, messages included, for every seed graph`, async () => {
  const lines = SEED_GRAPHS.flatMap((seed) =>
    validateGraph(seed.graph, registry, {
      sandboxModuleCatalog: null
    }).issues.map(
      (issue) =>
        `${seed.id} ${issue.nodeId ?? "-"} ${issue.severity} ${issue.code} ${issue.message}`
    )
  );
  expect(lines.length).toBeGreaterThan(0);
  await expectPinned(lines.join("\n"), "graph-seed-issues.txt");
});

it(`${GRAPH} survives a graph whose halves are not arrays`, () => {
  const report = validateGraph({ nodes: "nope", edges: 7 } as never, registry, {
    sandboxModuleCatalog: null
  });
  assertWellFormed(report);
  expect(codesOf(report.issues)).toContain("invalid_graph");
});

it(`${GRAPH} scales to a wide graph without a quadratic blowup`, () => {
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
  const report = validateGraph({ nodes, edges }, registry, {
    sandboxModuleCatalog: null
  });
  expect(performance.now() - started).toBeLessThan(10_000);
  assertWellFormed(report);
});

it(`${CODE} generates a non-empty corpus`, () => {
  expect(codeMutants.length).toBe(COUNT * SEED_CODE_BODIES.length);
});

it.each(codeMutants.map((m) => [m.id, m.mutation, m] as const))(
  `${CODE} %s (%s) parses or reports, never throws`,
  (_id, _mutation, mutant) => {
    const started = performance.now();
    const parsed = parseCodeBody(mutant.code);
    if (!("error" in parsed)) {
      analyzeCodeBody(parsed.statements);
      freeIdentifiers(parsed.statements);
    }
    inferredCodeInputNames(mutant.code);
    inferredCodeOutputNames(mutant.code);
    plannedCodeStepProblems(mutant.code, { inputs: ["text"], output: "n" });
    migrateCodeBodyToInputs(mutant.code, ["a", "text", "flag", "items"]);

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
  `${CODE} reports a stable set of issue codes across the corpus`,
  async () => {
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
    await expectPinned(signature.join("\n"), "code-issue-codes.txt");
  },
  // Validates every corpus mutant; takes 5-7 s on loaded CI runners.
  30_000
);

it(`${CODE} reports the same issues, messages included, for every seed body`, async () => {
  const lines = SEED_CODE_BODIES.flatMap((seed) =>
    validateCodeNodeBody({
      code: seed.code,
      availableInputs: seed.availableInputs ?? ["a", "text", "flag", "items"],
      connectedInputs: seed.connectedInputs ?? ["items"],
      declaredOutputs: seed.declaredOutputs ?? ["n", "out", "doc"],
      connectedOutputs: seed.connectedOutputs,
      sandboxModuleCatalog: seed.catalog ? seedCatalog() : null
    }).map(
      (issue) => `${seed.id} ${issue.severity} ${issue.code} ${issue.message}`
    )
  );
  expect(lines.length).toBeGreaterThan(0);
  await expectPinned(lines.join("\n"), "code-seed-issues.txt");
});

it(`${CODE} reports the same planner problems for every planned step`, async () => {
  const lines = SEED_PLANNED_STEPS.flatMap((seed) => {
    const problems = plannedCodeStepProblems(seed.code, {
      inputs: seed.inputs,
      output: seed.output
    });
    return problems.length === 0
      ? [`${seed.id} ok`]
      : problems.map((problem) => `${seed.id} ${problem}`);
  });
  await expectPinned(lines.join("\n"), "planned-step-problems.txt");
});

it(`${CODE} rewrites input reads the same way for every seed body`, async () => {
  const names = ["a", "text", "flag", "items"];
  const lines = [
    ...SEED_CODE_BODIES,
    ...SEED_MIGRATION_BODIES,
    ...SEED_ANALYZER_BODIES
  ].map((seed) => {
    const result = migrateCodeBodyToInputs(seed.code, names);
    return `${seed.id} changed=${result.changed} [${result.rewritten.join(",")}] ${JSON.stringify(result.code)}`;
  });
  const single = migrateCodeBodyToInputs("return { n: a + text };", ["a"]);
  lines.push(
    `single-name changed=${single.changed} [${single.rewritten.join(",")}] ${JSON.stringify(single.code)}`
  );
  await expectPinned(lines.join("\n"), "migrate-inputs.txt");
});

it.each([null, undefined, 42, [], {}, true])(
  `${CODE} accepts a non-string code property (%s)`,
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

/** Every analyzer's direct answer for one body, as one line of JSON. */
function analyzerFacts(code: string): string {
  const parsed = parseCodeBody(code);
  if ("error" in parsed) {
    return JSON.stringify({
      parse: parsed,
      inputs: inferredCodeInputNames(code),
      outputs: inferredCodeOutputNames(code),
      bound: collectBoundNames(code)
    });
  }
  const { statements } = parsed;
  const { returns, fallsThrough } = analyzeCodeBody(statements);
  return JSON.stringify({
    statements: statements.map((statement) => statement.type),
    kinds: moduleDeclarationKinds(statements),
    specifiers: staticImportSpecifiers(statements),
    bindings: staticImportBindings(statements),
    dynamic: dynamicModuleAccess(statements),
    returns: returns.map((statement) => statement.start),
    fallsThrough,
    shapes: returns.map((statement) =>
      returnShapes(statement.argument).map((shape) => ({
        keys: [...shape.keys],
        opaque: shape.opaque,
        notAnObject: shape.notAnObject
      }))
    ),
    emitted: outputCallNames(statements),
    streamed: streamCallNames(statements),
    guarded: [...typeofGuardedNames(statements)],
    inputReads: inputsMemberReads(statements),
    free: freeIdentifiers(statements),
    bound: collectBoundNames(code),
    inputs: inferredCodeInputNames(code),
    outputs: inferredCodeOutputNames(code)
  });
}

it(`${CODE} reports the same analyzer facts for every seed body`, async () => {
  const lines = [
    ...SEED_CODE_BODIES,
    ...SEED_MIGRATION_BODIES,
    ...SEED_ANALYZER_BODIES
  ].map((seed) => `${seed.id} ${analyzerFacts(seed.code)}`);
  await expectPinned(lines.join("\n"), "analyzer-facts.txt");
});

it(`${CODE} lists the same exported names for every module source`, async () => {
  const lines = SEED_MODULE_SOURCES.map(
    (seed) => `${seed.id} ${JSON.stringify(exportedNames(seed.source))}`
  );
  await expectPinned(lines.join("\n"), "exported-names.txt");
});

it(`${GRAPH} reports the same property issues for every property case`, async () => {
  const lines = SEED_PROPERTY_CASES.map((seed) => {
    const issues = validateNodeProperties(
      seed.declared.map(({ name, type, required }) => ({
        name,
        options: { type, required }
      })) as never,
      seed.properties,
      {
        connectedHandles: seed.connected,
        dynamicSlots: seed.dynamicSlots as never,
        dynamicValues: seed.dynamicValues
      }
    );
    return `${seed.id} ${issues.map((issue) => `${issue.code}:${issue.property}`).join(",") || "ok"}`;
  });
  await expectPinned(lines.join("\n"), "property-issues.txt");
});

it(`${GRAPH} formats validation issues with and without node context`, async () => {
  const issue = { code: "required", message: "Missing p" };
  const lines = [
    formatValidationIssues([]),
    formatValidationIssues([issue]),
    formatValidationIssues([{ ...issue, nodeType: "t.T" }]),
    formatValidationIssues([{ ...issue, nodeId: "n1" }]),
    formatValidationIssues([{ ...issue, nodeId: "n1", nodeType: "t.T" }, issue])
  ];
  await expectPinned(JSON.stringify(lines, null, 1), "format-issues.json");
});
