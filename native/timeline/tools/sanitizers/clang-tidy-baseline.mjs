#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function runProcess(program, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(program, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (status, signal) => { resolve({ status, signal, stdout, stderr }); });
  });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baselinePath = path.join(root, 'tools/sanitizers/clang-tidy-baseline.json');

function diagnostics(output, directory) {
  const result = new Set();
  for (const line of output.split('\n')) {
    const match = line.match(/^(.*?):\d+:\d+: (?:warning|error): (.*?) \[([^\]]+)\]$/);
    if (!match) {
      continue;
    }
    const file = path.relative(directory, match[1]).replaceAll(path.sep, '/');
    if (!file.startsWith('../') && !path.isAbsolute(file)) {
      result.add(`${file} | ${match[3]} | ${match[2]}`);
    }
  }
  return [...result].sort();
}

function compare(actual, baseline) {
  const known = new Set(baseline);
  return actual.filter((diagnostic) => !known.has(diagnostic));
}

async function selfTest() {
  const scratch = mkdtempSync(path.join(root, 'tests/fuzz/tidy-plant-'));
  const build = mkdtempSync(path.join(tmpdir(), 'nt-tidy-plant-'));
  try {
    const file = path.join(scratch, 'plant.cpp');
    writeFileSync(file, 'int main() { int* pointer = new int(1); delete pointer; }\n');
    writeFileSync(path.join(build, 'compile_commands.json'), JSON.stringify([
      { directory: root, file, arguments: ['clang++', '-std=c++20', '-c', file] }
    ]));
    // Run the real check path, including source selection, normalization and baseline comparison.
    const added = await check(build);
    if (process.exitCode !== 1 || !added.some((line) => line.includes('cppcoreguidelines-owning-memory'))) {
      throw new Error('The check mode unexpectedly accepted the owning-memory plant');
    }
    console.log('Plant rejected. This command deliberately exits 1. Scratch plant removed.');
    process.exitCode = 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(build, { recursive: true, force: true });
  }
}

async function check(build, writeBaseline = false) {
  const commands = JSON.parse(readFileSync(path.join(build, 'compile_commands.json'), 'utf8'));
  const sourceRoot = root;
  const own = (file) => /^(src|tests)\//.test(path.relative(root, file).replaceAll(path.sep, '/'));
  const sources = [...new Set(commands.map((entry) => entry.file).filter(own))];
  if (sources.length === 0) {
    throw new Error('No project sources in compile_commands.json');
  }
  if (commands.some((entry) => own(entry.file) && !/clang/.test(entry.command ?? entry.arguments.join(' ')))) {
    throw new Error('Use compile_commands.json from a Clang build');
  }
  const escaped = sourceRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const run = await runProcess('nice', ['-n', '10', '/usr/bin/run-clang-tidy', '-j', '3', '-quiet', '-p', build,
    `-config-file=${root}/.clang-tidy`, `-header-filter=^${escaped}/(src|tests)/`,
    `^${escaped}/(src|tests)/`],
  { encoding: 'utf8' });
  const output = (run.stdout ?? '') + (run.stderr ?? '');
  writeFileSync(path.join(build, 'clang-tidy.log'), output);
  if (run.status !== 0 || output.includes('[clang-diagnostic-error]')) {
    console.error(output);
    throw new Error(`clang-tidy failed (${run.status}); see ${build}/clang-tidy.log`);
  }
  const inspected = output.match(/for (\d+) files out of/);
  if (!inspected || Number(inspected[1]) !== sources.length) {
    throw new Error(`Expected ${sources.length} inspected sources, got ${inspected?.[1] ?? 'none'}`);
  }
  const actual = diagnostics(output, sourceRoot).filter((line) => /^(src|tests)\//.test(line));
  if (writeBaseline) {
    if (actual.length === 0) {
      throw new Error('Refusing an empty first baseline. Inspect clang-tidy.log');
    }
    writeFileSync(baselinePath, JSON.stringify(actual, null, 2) + '\n');
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const added = compare(actual, baseline);
  console.log(`Inspected ${sources.length} sources, ${actual.length} unique diagnostics, ${added.length} new.`);
  if (added.length > 0) {
    console.log(added.join('\n'));
    process.exitCode = 1;
  }
  return added;
}

if (process.argv.includes('--self-test')) {
  await selfTest();
} else {
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  await check(path.resolve(positional[0] ?? path.join(root, 'build-sanitize')), process.argv.includes('--write'));
}
