import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

const [executable, plugin] = process.argv.slice(2);
test('host death during a scan leaves no IPC files', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vst-scan-lifetime-'));
  let host;
  try {
    // Enough real plug-ins to keep discovery running through the parent-death check.
    for (let i = 0; i < 40; ++i) await cp(plugin, join(directory, `Tone${i}.vst3`), { recursive: true });
    host = spawn(executable, [], { env: { ...process.env, TMPDIR: directory }, stdio: ['pipe', 'pipe', 'inherit'] });
    const exited = new Promise(resolve => host.once('exit', resolve));
    host.stdin.write(`${JSON.stringify({ id: 1, cmd: 'scan', dirs: [directory], includeEffects: true })}\n`);
    // The helper processes hello after launching its scanner, before scan completion.
    const hello = new Promise(resolve => {
      let buffer = '';
      host.stdout.on('data', data => {
        buffer += data;
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line && JSON.parse(line).id === 2) resolve();
        }
      });
    });
    host.stdin.write(`${JSON.stringify({ id: 2, cmd: 'hello' })}\n`);
    let deadline;
    try {
      await Promise.race([hello, new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error('host did not acknowledge scanner launch')), 5000);
      })]);
    } finally {
      clearTimeout(deadline);
    }
    host.kill('SIGKILL');
    await exited;
    await delay(500);
    assert.deepEqual((await readdir(directory)).filter(name => name.startsWith('nodetool-scan-')), [],
      'host death must leave no scanner request/result files');
  } finally {
    host?.kill('SIGKILL');
    await rm(directory, { recursive: true, force: true });
  }
});

test('scanner exits after its parent is killed', { timeout: 10000 }, async () => {
  const wrapper = spawn(process.execPath, ['-e', `
    const { spawn } = require('node:child_process');
    const child = spawn(process.argv[1], ['--scan', JSON.stringify({ dirs: [], includeEffects: true }), String(process.pid)],
      { stdio: 'ignore' });
    console.log(child.pid);
    setInterval(() => {}, 1000);
  `, executable], { stdio: ['ignore', 'pipe', 'inherit'] });
  let scanner;
  try {
    const [data] = await once(wrapper.stdout, 'data');
    scanner = Number(String(data).trim());
    assert.ok(scanner > 0);
    const exited = once(wrapper, 'exit');
    wrapper.kill('SIGKILL');
    await exited;
    const alive = () => {
      try { process.kill(scanner, 0); return true; } catch (error) {
        if (error.code === 'ESRCH') return false;
        throw error;
      }
    };
    for (let i = 0; i < 200 && alive(); ++i) await delay(10);
    assert.equal(alive(), false, 'orphan scanner must terminate without parent cleanup');
  } finally {
    wrapper.kill('SIGKILL');
    if (scanner) {
      try { process.kill(scanner, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
});
