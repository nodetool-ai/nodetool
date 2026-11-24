import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { test } from 'node:test';

const [executable, path] = process.argv.slice(2);
test('plugin RPCs match the Electron contract and persist changes', { timeout: 30000 }, async () => {
  const host = spawn(executable, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise(resolve => host.once('exit', resolve));
  const watchdog = setTimeout(() => host.kill('SIGKILL'), 25000);
  const pending = new Map();
  let id = 0;
  const lines = createInterface({ input: host.stdout });
  lines.on('line', line => {
    const reply = JSON.parse(line);
    const waiter = pending.get(reply.id);
    if (waiter) { pending.delete(reply.id); reply.ok ? waiter.resolve(reply) : waiter.reject(new Error(reply.error)); }
  });
  host.on('error', error => { for (const waiter of pending.values()) waiter.reject(error); });
  host.on('exit', () => { for (const waiter of pending.values()) waiter.reject(new Error('host exited')); });
  const request = (cmd, fields = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    host.stdin.write(`${JSON.stringify({ id, cmd, instance: 'plugin-test', path, state: '', ...fields })}\n`);
  });
  try {
    const listed = await request('listPresets');
    assert.ok(Array.isArray(listed.presets));
    assert.equal(typeof listed.currentPresetIndex, 'number');
    assert.equal(typeof listed.presets[0].name, 'string');
    const preset = await request('selectPreset', { presetName: 'Bright' });
    assert.equal(preset.preset.index, 1);
    assert.ok(preset.state.length);
    const restoredPreset = await request('listPresets', { state: preset.state });
    assert.equal(restoredPreset.currentPresetIndex, 1);
    await assert.rejects(request('selectPreset', { presetIndex: -1 }), /preset/i);
    const before = await request('getParameters');
    assert.ok(before.parameters.length);
    const parameter = before.parameters[0];
    assert.equal(typeof parameter.id, 'string');
    assert.equal(typeof parameter.displayValue, 'string');
    const changed = await request('setParameters', { changes: [{ id: parameter.id, value: 0.8 }] });
    assert.ok(Math.abs(changed.parameters[0].value - 0.8) < 0.001);
    assert.ok(changed.state.length);
    const restored = await request('getParameters', { state: changed.state });
    assert.ok(Math.abs(restored.parameters[0].value - 0.8) < 0.001);
    const display = await request('setParameters', { state: changed.state, changes: [{ index: 0, displayValue: parameter.displayValue }] });
    assert.ok(Math.abs(display.parameters[0].value - parameter.value) < 0.01);
    await assert.rejects(request('setParameters', { changes: [{ index: 0, value: 2 }] }), /value/i);
    await assert.rejects(request('setParameters', { changes: [{ id: 'missing', value: 0.5 }] }), /parameter/i);
    await assert.rejects(request('setParameters', { changes: [{ index: 0, value: 0.5, displayValue: '0.5' }] }), /exactly one/i);
  } finally {
    host.stdin.end(`${JSON.stringify({ cmd: 'quit' })}\n`);
    await exited;
    clearTimeout(watchdog);
    lines.close();
  }
});
