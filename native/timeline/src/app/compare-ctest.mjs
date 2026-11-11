import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function compare(before, after) {
  assert.ok(before.tests.length > 0, 'baseline inspected no tests');
  const normalize = test => ({
    command: [path.basename(test.command[0]), ...test.command.slice(1)],
    properties: test.properties.filter(p => /^(LABELS|ENVIRONMENT|FIXTURES_.*|.*REGULAR_EXPRESSION)$/.test(p.name))
      .sort((a, b) => a.name.localeCompare(b.name))
  });
  for (const test of before.tests) {
    const next = after.tests.find(t => t.name === test.name);
    assert.ok(next, `dropped test: ${test.name}`);
    assert.deepEqual(normalize(next), normalize(test), `changed test: ${test.name}`);
  }
  const added = after.tests.filter(t => !before.tests.some(b => b.name === t.name));
  assert.deepEqual(added.map(t => t.name).sort(), ['s1_contracts', 'tst_inspectorprimitives', 'tst_seamexample']);
  console.log(`PASS: ${before.tests.length} baseline test contracts unchanged, ${added.length} S1 tests added`);
}
if (process.argv[2]) compare(...process.argv.slice(2).map(p => JSON.parse(readFileSync(p, 'utf8'))));
