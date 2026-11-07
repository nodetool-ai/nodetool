// Focused native persistence checks and one real-node parity case. No baseline writes.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
const here = dirname(fileURLToPath(import.meta.url));
const driver = process.argv[2];
const reportDir = process.argv[3];
if (!driver || !reportDir) throw new Error('Usage: node models-verify.mjs <native-model-driver> <report-directory>');
mkdirSync(reportDir, { recursive: true });
const bundle = resolve(reportDir, 'G5-models-test.js');
const results = {};
function run(name, executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8', env: process.env, timeout: 120000 });
  writeFileSync(join(reportDir, `G5-models-${name}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  writeFileSync(join(reportDir, `G5-models-${name}.exit`), `${result.status}\n`);
  results[name] = { command: [executable, ...args], status: result.status, signal: result.signal };
  writeFileSync(join(reportDir, 'G5-models-checks.json'), JSON.stringify(results, null, 2));
  if (result.status !== 0 || result.error) throw new Error(`${name} failed: ${result.error ?? result.stderr}`);
  return result.stdout;
}
const importBundle = resolve(reportDir, 'G5-models-import.js');
run('import-build', process.execPath, [join(here, 'models-build.mjs'), importBundle, join(here, 'models-import.test.mjs')]);
run('import-no-sqlite', resolve(driver), [importBundle, '--no-sqlite']);
run('build', process.execPath, [join(here, 'models-build.mjs'), bundle]);
const native = run('native', resolve(driver), [bundle]);
const reference = run('reference', process.execPath, [join(here, 'models-node-reference.mjs')]);
function fixture(output, prefix = 'parity: ') {
  const lines = output.split('\n').filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) throw new Error(`Expected exactly one fixture output, got ${lines.length}`);
  return JSON.parse(lines[0].slice(prefix.length));
}
if (!/models: [1-9][0-9]* checks passed/.test(native)) throw new Error('Native model checks did not finish');
if (!isDeepStrictEqual(fixture(native), fixture(reference))) throw new Error('Real SaveImage persistence parity mismatch');
if (!isDeepStrictEqual(fixture(native, 'documents: '), fixture(reference, 'documents: '))) {
  writeFileSync(join(reportDir, 'G5-models-document-mismatch.json'), JSON.stringify({native: fixture(native, 'documents: '), reference: fixture(reference, 'documents: ')}, null, 2));
  throw new Error('Real document/entity persistence parity mismatch');
}
results.documents = { status: 0, native: fixture(native, 'documents: '), reference: fixture(reference, 'documents: ') };
results.parity = { status: 0, native: fixture(native), reference: fixture(reference) };
writeFileSync(join(reportDir, 'G5-models-checks.json'), JSON.stringify(results, null, 2));
console.log('Native model checks, SaveImage parity and stateful document/entity node parity passed');
