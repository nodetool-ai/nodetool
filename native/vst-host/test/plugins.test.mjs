import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { dirname } from 'node:path';

const [executable, path] = process.argv.slice(2);
test('plugin RPCs match the Electron contract and persist changes', { timeout: 30000 }, async () => {
  const host = spawn(executable, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise(resolve => host.once('exit', resolve));
  const watchdog = setTimeout(() => host.kill('SIGKILL'), 25000);
  const pending = new Map();
  const events = [];
  let id = 0;
  const lines = createInterface({ input: host.stdout });
  lines.on('line', line => {
    const reply = JSON.parse(line);
    if (reply.event) events.push(reply);
    const waiter = pending.get(reply.id);
    if (waiter) { pending.delete(reply.id); reply.ok ? waiter.resolve(reply) : waiter.reject(new Error(reply.error)); }
  });
  host.on('error', error => { for (const waiter of pending.values()) waiter.reject(error); });
  host.on('exit', (code, signal) => { for (const waiter of pending.values()) waiter.reject(new Error(`host exited: ${code}, signal: ${signal}`)); });
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
    const defaultState = (await request('getState')).state;
    const parameter = before.parameters[0];
    assert.equal(typeof parameter.id, 'string');
    assert.equal(typeof parameter.displayValue, 'string');
    const changed = await request('setParameters', { changes: [{ id: parameter.id, value: 0.8 }] });
    assert.ok(Math.abs(changed.parameters[0].value - 0.8) < 0.001);
    assert.ok(changed.state.length);
    await request('setLiveState', { state: changed.state });
    await request('joinLiveState', { state: changed.state, generation: 6 });
    assert.equal((await request('getState')).state, changed.state, 'join must preserve the applied live state');
    await assert.rejects(
      request('setState', { state: preset.state, expectedState: defaultState, generation: 6 }),
      /Editor changed during plugin request/,
      'F36: restoring an assistant result must compare the captured editor state'
    );
    assert.equal((await request('getState')).state, changed.state, 'a later knob change must survive a rejected restore');
    await request('openEditor', { title: 'VST history regression' });
    await request('setState', { state: preset.state });
    assert.equal((await request('getState')).state, preset.state, 'undo must restore the live helper state');
    await request('setState', { state: changed.state });
    assert.equal((await request('getState')).state, changed.state, 'redo must restore the live helper state');
    await request('setState', { state: null });
    assert.equal((await request('getState')).state, defaultState, 'undo to default must reset the helper');
    await request('setState', { state: changed.state });
    const restored = await request('getParameters', { state: changed.state });
    assert.ok(Math.abs(restored.parameters[0].value - 0.8) < 0.001);
    const display = await request('setParameters', { state: changed.state, changes: [{ index: 0, displayValue: parameter.displayValue }] });
    assert.ok(Math.abs(display.parameters[0].value - parameter.value) < 0.01);
    await assert.rejects(request('setParameters', { changes: [{ index: 0, value: 2 }] }), /value/i);
    await assert.rejects(request('setParameters', { changes: [{ id: 'missing', value: 0.5 }] }), /parameter/i);
    await assert.rejects(request('setParameters', { changes: [{ index: 0, value: 0.5, displayValue: '0.5' }] }), /exactly one/i);
    await request('setState', { state: changed.state });
    const waitForEvent = async generation => {
      const deadline = Date.now() + 3000;
      while (!events.some(event => event.event === 'state' && event.generation === generation)) {
        assert.ok(Date.now() < deadline, `missing editor event for generation ${generation}`);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    await request('setState', { state: changed.state, generation: 7 });
    await request('setParameters', { changes: [{ index: 0, value: 0.2 }] });
    await waitForEvent(7);
    // Live sync skips an open editor. Joining must still restore the target
    // and adopt the new generation before subsequent editor events.
    await request('setLiveState', { state: changed.state });
    await request('joinLiveState', { state: changed.state, generation: 8 });
    assert.equal((await request('getState')).state, changed.state, 'restoration must finish on the document state');
    const countAfterRestore = events.length;
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(events.length, countAfterRestore, 'restoration must not echo as an editor edit');
    await request('setParameters', { changes: [{ index: 0, value: 0.3 }] });
    await waitForEvent(8);
    await request('setState', { state: changed.state, generation: 9 });
    let scanFinished = false;
    const scanning = request('scan', { dirs: [dirname(path)], includeEffects: true }).then(result => {
      scanFinished = true;
      return result;
    });
    await request('hello');
    assert.equal(scanFinished, false, 'scan must leave the helper message thread responsive');
    assert.ok((await scanning).plugins.some(plugin => plugin.path === path), 'scan must return the test plugin');
    assert.equal((await request('getState')).state, changed.state, 'scan must preserve existing live instances');
    await request('closeEditor');
  } finally {
    host.stdin.end(`${JSON.stringify({ cmd: 'quit' })}\n`);
    await exited;
    clearTimeout(watchdog);
    lines.close();
  }
});
