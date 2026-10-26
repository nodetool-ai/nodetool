#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
const kinds = {
  hardened: { dir: 'build-plants', target: 'oob', report: /Assertion.*(__n < this->size\(\)|__pos < size\(\))/ },
  sanitize: { dir: 'build-sanitize', target: 'uaf', report: /ERROR: AddressSanitizer: heap-use-after-free/ },
  tsan: { dir: 'build-tsan', target: 'race', report: /WARNING: ThreadSanitizer: data race/ },
  fuzz: { dir: 'build-fuzz', target: 'fuzz', report: /ERROR: libFuzzer: deadly signal/ }
};

function rejected(run, expected) {
  const output = (run.stdout ?? '') + (run.stderr ?? '');
  return !run.error && (run.signal !== null || (run.status !== null && run.status !== 0)) && expected.test(output);
}
async function command(program, args, options = {}) {
  const run = await runProcess(program, args, { cwd: root, encoding: 'utf8', ...options });
  if (run.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed:\n${run.stdout ?? ''}${run.stderr ?? ''}`);
  }
  return run;
}
async function expectFailure(program, args, expected, options = {}) {
  const run = await runProcess(program, args, { cwd: root, encoding: 'utf8', timeout: 60000, ...options });
  if (!rejected(run, expected)) {
    throw new Error(`Expected failing ${expected}, got status=${run.status}, signal=${run.signal}:\n${run.stdout ?? ''}${run.stderr ?? ''}`);
  }
  const output = run.stdout + run.stderr;
  console.log(output.split('\n').filter((line) => line.trim()).slice(0, 12).join('\n'));
  return output;
}

if (process.argv.includes('--self-test')) {
  const good = await runProcess('true', [], { encoding: 'utf8' });
  if (rejected(good, /data race/)) {
    throw new Error('A successful program was accepted as a failing plant');
  }
  let caught = false;
  try {
    await expectFailure('true', [], /data race/);
  } catch {
    caught = true;
  }
  if (!caught) {
    throw new Error('Plant checker unexpectedly passed a clean executable');
  }
  const scratch = mkdtempSync(path.join(tmpdir(), 'nt-ctest-plant-'));
  try {
    writeFileSync(path.join(scratch, 'CTestTestfile.cmake'),
      'add_test(swallowed "cmake" "-E" "echo" "runtime error: planted UB")\n' +
      'set_tests_properties(swallowed PROPERTIES FAIL_REGULAR_EXPRESSION "runtime error:")\n');
    await expectFailure('ctest', ['--test-dir', scratch, '--output-on-failure'], /Failed.*Error regular expression/);
    console.log('CTest rejects a sanitizer report even when the process exits zero.');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
} else {
  const mode = process.argv[2];
  if (!kinds[mode]) {
    throw new Error('Usage: check-plants.mjs --self-test | hardened | sanitize | tsan | fuzz');
  }
  const { dir, target, report } = kinds[mode];
  const build = path.join(root, dir);
  const prefix = process.env.QT_PREFIX ?? path.join(process.env.HOME, 'qt/6.12.0/gcc_64');
  const args = mode === 'hardened'
    ? ['-S', '.', '-B', dir, '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_CXX_COMPILER=/usr/bin/c++', '-DNT_HARDENING=ON', '-DNT_SANITIZE=', '-DNT_FUZZ=OFF']
    : ['--preset', mode];
  await command('cmake', [...args, `-DCMAKE_PREFIX_PATH=${prefix}`, '-DCMAKE_C_COMPILER_LAUNCHER=ccache',
    '-DCMAKE_CXX_COMPILER_LAUNCHER=ccache', '-DNT_SANITIZER_PLANTS=ON']);
  try {
    await command('nice', ['-n', '10', 'cmake', '--build', dir, '-j', '3', '--target', `nt_plant_${target}`,
      ...(mode === 'sanitize' ? ['nt_plant_ubsan', 'nt_plant_leak'] : [])]);
    // Read the same runtime options as the matching CTest preset.
    const presets = JSON.parse(readFileSync(path.join(root, 'CMakePresets.json'), 'utf8'));
    const environment = presets.testPresets.find((preset) => preset.name === mode)?.environment ?? {};
    const env = { ...process.env, QT_QPA_PLATFORM: 'offscreen' };
    for (const [key, value] of Object.entries(environment)) {
      env[key] = value.replaceAll('${sourceDir}', root);
    }
    const scratch = mkdtempSync(path.join(tmpdir(), 'nt-fuzz-plant-'));
    try {
      const fuzzArgs = [];
      if (mode === 'fuzz') {
        mkdirSync(path.join(scratch, 'corpus'));
        writeFileSync(path.join(scratch, 'corpus/seed'), 'NT?');
        writeFileSync(path.join(scratch, 'prefix.dict'), '"NT!"\n');
        fuzzArgs.push('-runs=10000', '-max_total_time=20', '-seed=1', `-dict=${scratch}/prefix.dict`,
          `-artifact_prefix=${scratch}/`, path.join(scratch, 'corpus'));
      }
      const output = await expectFailure(path.join(build, 'tools/sanitizers/plants', `nt_plant_${target}`), fuzzArgs, report, { env });
      writeFileSync(path.join(build, `plant-${target}.log`), output);
      if (mode === 'sanitize') {
        const ub = await expectFailure(path.join(build, 'tools/sanitizers/plants/nt_plant_ubsan'), [], /runtime error: signed integer overflow/, { env });
        writeFileSync(path.join(build, 'plant-ubsan.log'), ub);
        const leak = await expectFailure(path.join(build, 'tools/sanitizers/plants/nt_plant_leak'), [], /ERROR: LeakSanitizer: detected memory leaks/, { env });
        writeFileSync(path.join(build, 'plant-leak.log'), leak);
        const ctest = await expectFailure('ctest', ['--test-dir', build, '-R', '^nt_plant_uaf$', '--output-on-failure'], report, { env });
        writeFileSync(path.join(build, 'plant-ctest.log'), ctest);
        console.log('CTest returned non-zero for the ASan plant.');
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  } finally {
    await command('cmake', ['-S', '.', '-B', dir, '-DNT_SANITIZER_PLANTS=OFF']);
  }
  console.log(`${mode}: expected report observed. Plants disabled again.`);
}
