import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
const here = dirname(fileURLToPath(import.meta.url));
const [driver, report] = process.argv.slice(2);
if (!driver || !report) throw new Error('Usage: timeline-process-verify.mjs <driver> <report-dir>');
mkdirSync(report, { recursive: true });
const results = {};
function run(name, executable, args) {
  const r = spawnSync(executable, args, { encoding: 'utf8', timeout: 120000, env: process.env });
  writeFileSync(join(report, `${name}.log`), `${r.stdout ?? ''}${r.stderr ?? ''}`);
  results[name] = { command: [executable, ...args], status: r.status, signal: r.signal };
  writeFileSync(join(report, 'checks.json'), JSON.stringify(results, null, 2));
  if (r.status !== 0 || r.error) throw new Error(`${name} failed: ${r.error ?? r.stderr}`);
  return r.stdout;
}
const bundle = resolve(report, 'test.js');
run('bundle', process.execPath, [join(here, 'timeline-process-build.mjs'), bundle]);
const native = run('native', resolve(driver), [bundle]);
const reference = run('reference', process.execPath, [join(here, 'timeline-process-reference.mjs')]);
function parse(output, prefix) {
  const lines = output.split('\n').filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) throw new Error(`Expected one ${prefix} output`);
  return JSON.parse(lines[0].slice(prefix.length));
}
const actual = parse(native, 'timeline-result: ');
const expected = parse(reference, 'timeline: ');
writeFileSync(join(report, 'comparison.json'), JSON.stringify({ actual, expected: expected.result }, null, 2));
if (!/timeline-checks: [1-9][0-9]* checks passed/.test(native)) throw new Error('Native fixture did not finish');
const comparisons = Object.fromEntries(Object.keys(expected.result).map((key) => [key, isDeepStrictEqual(actual[key], expected.result[key])]));
writeFileSync(join(report, 'comparisons.json'), JSON.stringify(comparisons, null, 2));
if (!Object.values(comparisons).every(Boolean)) throw new Error('Timeline process persisted state/output mismatch: ' + JSON.stringify(comparisons));
console.log('Timeline AddClips, FillTimelineText, RetargetTimeline and Transcript process parity passed');
