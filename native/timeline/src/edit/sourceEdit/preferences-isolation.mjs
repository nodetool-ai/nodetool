import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const [ctest, buildDirectory, configuration] = process.argv.slice(2);
assert.ok(ctest && buildDirectory, 'Expected ctest and build directory arguments');
const result = spawnSync(ctest, [
  '--test-dir', buildDirectory, '--show-only=json-v1',
  ...(configuration ? ['--build-config', configuration] : [])
], { encoding: 'utf8' });
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr);
const { tests } = JSON.parse(result.stdout);
assert.ok(tests.length > 1, 'The audit must inspect registered tests');

const fixture = 'timeline_preferences';
const variable = 'NODETOOL_TIMELINE_PREFERENCES';
const paths = new Map();
const failures = [];
let setups = 0;
function isWithin(parent, child) {
  const suffix = relative(resolve(parent), resolve(child));
  return suffix !== '' && suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
}

for (const test of tests) {
  const properties = Object.fromEntries(test.properties.map(({ name, value }) => [name, value]));
  const setup = (properties.FIXTURES_SETUP ?? []).includes(fixture);
  if (setup) {
    setups++;
  } else if (!(properties.FIXTURES_REQUIRED ?? []).includes(fixture)) {
    failures.push(`${test.name}: missing ${fixture} cleanup fixture`);
  }

  // Apply CTest's explicit environment in order, without accepting an inherited override.
  let path;
  for (const entry of properties.ENVIRONMENT ?? []) {
    if (entry.startsWith(`${variable}=`)) {
      path = entry.slice(variable.length + 1);
    }
  }
  for (const entry of properties.ENVIRONMENT_MODIFICATION ?? []) {
    if (entry.startsWith(`${variable}=`)) {
      const modification = entry.slice(variable.length + 1);
      if (modification.startsWith('set:')) {
        path = modification.slice(4);
      } else {
        failures.push(`${test.name}: unsupported preferences modification ${modification}`);
        path = undefined;
      }
    }
  }
  if (!path) {
    failures.push(`${test.name}: ${variable} is not set`);
    continue;
  }
  if (!isAbsolute(path) || !isWithin(resolve(buildDirectory, 'test-preferences'), path)
      || isWithin(resolve(homedir(), '.config'), path)) {
    failures.push(`${test.name}: preferences path is outside the isolated build directory: ${path}`);
  }
  const normalized = resolve(path);
  if (paths.has(normalized)) {
    failures.push(`${test.name}: shares preferences with ${paths.get(normalized)}`);
  }
  paths.set(normalized, test.name);
}
if (setups !== 1) {
  failures.push(`Expected one ${fixture} setup test, found ${setups}`);
}
assert.equal(failures.length, 0, failures.join('\n'));
const ownPath = [...paths].find(([, name]) => name === 'preferences_isolation')?.[0];
assert.equal(process.env[variable], ownPath, 'CTest must override inherited preferences');
assert.ok(!existsSync(ownPath), 'Preferences from an earlier CTest invocation survived setup');
writeFileSync(ownPath, 'previous invocation\n');
console.log(`Preferences isolation verified for all ${tests.length} registered tests`);
