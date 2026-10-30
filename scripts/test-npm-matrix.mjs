#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cases = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [
  `M${String(index).padStart(2, "0")}`, index === 7 ? 3 : index === 16 ? 2 : 1
]));

/** A green process that skipped or omitted a required scenario does not satisfy the matrix. */
export function assertNpmMatrixReport(report) {
  assert.ok(Array.isArray(report.testResults) && report.testResults.length > 0, "npm matrix inspected no test results");
  const inspected = new Map(Object.keys(cases).map(id => [id, []]));
  for (const file of report.testResults) {
    for (const result of file.assertionResults ?? []) {
      const id = /\b(M\d{2})\b/.exec(result.fullName ?? result.title ?? "")?.[1];
      assert.ok(id && inspected.has(id), `Unenumerated npm matrix assertion: ${result.fullName}`);
      inspected.get(id).push(result.status);
    }
  }
  for (const [id, count] of Object.entries(cases)) {
    assert.equal(inspected.get(id).length, count, `${id}: expected ${count} enumerated assertion(s)`);
    assert.ok(inspected.get(id).every(status => status === "passed"), `${id}: every assertion must pass without skips`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = mkdtempSync(join(tmpdir(), "npm-matrix-report-"));
  try {
    assert.equal(process.env.NODETOOL_NPM_MATRIX, "1", "Set NODETOOL_NPM_MATRIX=1 to exercise the installer");
    assert.equal(process.env.GITHUB_ACTIONS, "true", "The complete npm matrix runs only on disposable GitHub runners");
    assert.equal(process.env.NODETOOL_NPM_MATRIX_DEFAULT_PREFIX, "1", "The complete matrix requires a disposable runner's default prefix");
    const reportFile = join(directory, "report.json");
    const child = spawnSync(process.execPath, [join(repo, "scripts/run-vitest.mjs"), "run", "tests/packs/npm-matrix.test.ts",
      "--reporter=default", "--reporter=json", `--outputFile=${reportFile}`], {
      cwd: join(repo, "packages/pack-manager"), env: process.env, stdio: "inherit", timeout: 30 * 60 * 1000
    });
    if (child.error) { throw child.error; }
    assert.equal(child.status, 0, `npm matrix process failed: ${child.status ?? child.signal}`);
    assertNpmMatrixReport(JSON.parse(readFileSync(reportFile, "utf8")));
    console.log(`Verified ${Object.keys(cases).length} npm matrix scenarios with every assertion executed.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
