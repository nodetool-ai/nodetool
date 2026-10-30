import assert from "node:assert/strict";
import { test } from "vitest";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { assertNpmMatrixReport } from "../test-npm-matrix.mjs";

const assertions = Array.from({ length: 17 }, (_, index) => Array.from({ length: index === 7 ? 3 : index === 16 ? 2 : 1 }, () => ({
  fullName: `actual npm matrix M${String(index).padStart(2, "0")} scenario`, status: "passed"
}))).flat();
const report = entries => ({ testResults: [{ assertionResults: entries }] });

test("the complete npm matrix report inspects every enumerated assertion", () => {
  assert.doesNotThrow(() => assertNpmMatrixReport(report(assertions)));
});

test("the matrix gate rejects skipped, failed, absent, duplicate, and empty scenarios", () => {
  for (const status of ["pending", "failed"]) {
    assert.throws(() => assertNpmMatrixReport(report([{ ...assertions[0], status }, ...assertions.slice(1)])), /must pass/);
  }
  assert.throws(() => assertNpmMatrixReport(report(assertions.slice(1))), /M00/);
  assert.throws(() => assertNpmMatrixReport(report([...assertions, assertions[0]])), /M00/);
  assert.throws(() => assertNpmMatrixReport({ testResults: [] }), /no test results/);
});

test("the matrix gate rejects an unenumerated scenario", () => {
  assert.throws(() => assertNpmMatrixReport(report([...assertions, { fullName: "M99 extra", status: "passed" }])), /Unenumerated/);
});

test("the workflow schedules all six native platform and actual npm combinations with read-only permissions", () => {
  const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/node-pack-npm-matrix.yml", import.meta.url), "utf8"));
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.on.schedule.length, 1);
  const matrix = workflow.jobs["npm-matrix"].strategy.matrix;
  assert.deepEqual(matrix.os, ["ubuntu-24.04", "macos-15", "windows-2025"]);
  assert.deepEqual(matrix.node, ["22", "24"]);
  const combinations = matrix.os.flatMap(os => matrix.node.map(node => Object.assign({ os, node },
    ...matrix.include.filter(entry => (!entry.os || entry.os === os) && (!entry.node || entry.node === node)))));
  assert.equal(combinations.length, 6);
  for (const row of combinations) {
    assert.match(row.npm, row.node === "22" ? /^10\.9\./ : /^11\./);
    assert.equal(row.arch, row.os === "macos-15" ? "ARM64" : "X64");
  }
  assert.ok(workflow.on.pull_request.paths.includes("packages/pack-manager/src/npm-runner.ts"));
  assert.ok(workflow.on.pull_request.paths.includes("packages/pack-manager/src/packs/**"));
  assert.ok(workflow.on.pull_request.paths.includes("packages/pack-manager/tests/packs/global-bootstrap.test.ts"));
  const bootstrap = workflow.jobs["npm-matrix"].steps.find(step => step.name === "Verify initial global integrity bootstrap");
  assert.ok(bootstrap, "each native combination must exercise the initial global bootstrap");
  assert.equal(bootstrap["working-directory"], "packages/pack-manager");
  assert.equal(bootstrap.run, "node ../../scripts/run-vitest.mjs run tests/packs/global-bootstrap.test.ts");
});
