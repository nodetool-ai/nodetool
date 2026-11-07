// Run with: node editor-state.test.mjs <host> <test.vst3> <nondefault-state.txt>
// The core vst_host_test writes the state fixture when given its path as argv[2].
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';

const [hostPath, pluginPath, statePath] = process.argv.slice(2);

test('rendering with an open editor preserves its nondefault state', { timeout: 30000 }, async () => {
  assert.ok(hostPath && pluginPath && statePath, 'provide host, test plug-in, and state fixture paths');
  const state = (await readFile(statePath, 'utf8')).trim();
  assert.ok(state.length > 0);
  const scratch = await mkdtemp(join(tmpdir(), 'nodetool-vst-editor-'));
  const host = spawn(hostPath, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise(resolve => host.once('exit', resolve));
  const watchdog = setTimeout(() => host.kill('SIGKILL'), 25000);
  const pending = new Map();
  let nextId = 0;
  const lines = createInterface({ input: host.stdout });
  lines.on('line', line => {
    const response = JSON.parse(line);
    const waiter = pending.get(response.id);
    if (waiter) {
      pending.delete(response.id);
      if (response.ok) waiter.resolve(response);
      else waiter.reject(new Error(response.error));
    }
  });
  host.on('error', error => {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });
  host.on('exit', (code, signal) => {
    for (const waiter of pending.values()) waiter.reject(new Error(`host exited: ${code}, signal: ${signal}`));
    pending.clear();
  });
  const request = (cmd, props = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    host.stdin.write(`${JSON.stringify({ id, cmd, instance: 'editor-test', ...props })}\n`);
  });
  try {
    await request('openEditor', { path: pluginPath, state, title: 'VST editor state regression' });
    assert.equal((await request('getState')).state, state);
    await request('render', {
      path: pluginPath, state: null, sampleRate: 48000, frames: 4800,
      events: [{ pitch: 60, velocity: 110, startFrame: 0, gateOffFrame: 2400 }],
      out: join(scratch, 'editor.f32'),
    });
    assert.equal((await request('getState')).state, state, 'render reset the open editor sound');
    await request('closeEditor');
    await request('render', {
      path: pluginPath, state: null, sampleRate: 48000, frames: 4800, events: [],
      out: join(scratch, 'default.f32'),
    });
    assert.notEqual((await request('getState')).state, state, 'closed editor should accept the default state');
  } finally {
    if (host.exitCode === null) {
      host.stdin.end(`${JSON.stringify({ cmd: 'quit' })}\n`);
      await exited;
    }
    clearTimeout(watchdog);
    lines.close();
    await rm(scratch, { recursive: true, force: true });
  }
});
