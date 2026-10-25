import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compare } from './compare-ctest.mjs';
import { loadSuites, checkSuiteReport } from '../../scripts/op-conformance.mjs';

test('ctest contract comparison detects missing tests and changed properties', () => {
  const before = { tests: [{ name: 'existing', command: ['/build/test', '--arg'], properties: [
    { name: 'ENVIRONMENT', value: ['QT_QPA_PLATFORM=offscreen'] },
    { name: 'FIXTURES_REQUIRED', value: ['media'] }, { name: 'LABELS', value: ['render'] },
    { name: 'PASS_REGULAR_EXPRESSION', value: ['pass'] } ] }] };
  const after = { tests: [...structuredClone(before.tests), ...['s1_contracts', 'tst_inspectorprimitives', 'tst_seamexample'].map(name => ({ name }))] };
  compare(before, after);
  assert.throws(() => compare(before, { tests: [] }), /dropped test/);
  for (const property of before.tests[0].properties) {
    const broken = structuredClone(after);
    broken.tests[0].properties.find(p => p.name === property.name).value = ['broken'];
    assert.throws(() => compare(before, broken), /changed test/);
  }
  const broken = structuredClone(after);
  broken.tests[0].command.push('--broken');
  assert.throws(() => compare(before, broken), /changed test/);
  assert.throws(() => compare({ tests: [] }, after), /inspected no tests/);
});

test('suite discovery rejects load errors, empty suites and invalid configs', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 's1-suites-'));
  try {
    writeFileSync(path.join(directory, 'a.mjs'), 'throw new Error("planted load error")');
    writeFileSync(path.join(directory, 'b.mjs'), 'export default {config:"vitest.config.mts", tests:[]}');
    writeFileSync(path.join(directory, 'c.mjs'), 'export default {config:"missing.mts", tests:["test.ts"]}');
    const result = await loadSuites(directory, { bin: '/tmp/timeline-ops' });
    assert.equal(result.problems.length, 3);
    assert.equal(result.runs.length, 0);
    writeFileSync(path.join(directory, 'd.mjs'), 'export default {config:"vitest.config.mts", tests:["/test.ts"]}');
    const next = await loadSuites(directory, { bin: '/tmp/timeline-ops' });
    assert.equal(next.runs.length, 1);
    assert.equal(next.problems.length, 3);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('suite report fails closed on missing, empty, failed and uncollected suites', () => {
  const requested = '/comparison.test.ts';
  const report = { exitCode: 0, tests: [requested], testResults: [] };
  assert.match(checkSuiteReport(report).problems.join(), /suite missing/);
  report.testResults.push({ name: requested, status: 'passed', assertionResults: [] });
  assert.match(checkSuiteReport(report).problems.join(), /no passing comparison/);
  report.testResults[0].status = 'failed';
  report.testResults[0].message = 'planted collection error';
  assert.match(checkSuiteReport(report).problems.join(), /suite error/);
  report.testResults[0] = { name: requested, status: 'passed', assertionResults: [{ status: 'passed', title: 'comparison', ancestorTitles: [] }] };
  assert.equal(checkSuiteReport(report).passed, 1);
  assert.equal(checkSuiteReport(report).problems.length, 0);
  report.exitCode = 1;
  assert.match(checkSuiteReport(report).problems.join(), /vitest exited 1/);
});
