import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const binary = process.argv[2];
assert.ok(binary, 'Pass the native timeline executable');
const temporary = mkdtempSync(path.join(tmpdir(), 'nodetool-activity-smoke-'));
try {
  const model = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../../qml/dock/DockLayout.js', import.meta.url), 'utf8').replace('.pragma library', ''), model);
  const layout = model.createLayout('Review');
  layout.regions.bottom[0].panels.push('activity');
  layout.regions.bottom[0].activePanelId = 'activity';
  const settings = JSON.stringify({ workspace: 'Review', workspaces: { Review: layout } });
  const preferences = path.join(temporary, 'preferences.ini');
  writeFileSync(preferences, `[General]\nnodetool.timeline-layout.v1=${JSON.stringify(settings)}\n`);
  const image = path.join(temporary, 'editor.png');
  const args = [fileURLToPath(new URL('../../fixtures/three-tracks.json', import.meta.url)), '--audio', 'none', '--size', '1280x800', '--screenshot', image];
  const graphics = {
    linux: { platform: 'xcb', backend: 'vulkan' },
    darwin: { platform: 'cocoa', backend: 'metal' },
    win32: { platform: 'windows', backend: 'd3d11' }
  }[process.platform];
  assert.ok(graphics, `Unsupported screenshot platform: ${process.platform}`);
  const linux = process.platform === 'linux';
  const environment = {
    ...process.env,
    NODETOOL_TIMELINE_PREFERENCES: preferences,
    NODETOOL_TIMELINE_ACTIVITY_DIR: path.join(temporary, 'activity'),
    QT_QPA_PLATFORM: graphics.platform,
    QSG_RHI_BACKEND: graphics.backend,
    ...(process.platform === 'win32' ? { QSG_RHI_PREFER_SOFTWARE_RENDERER: '1' } : {})
  };
  delete environment.QT_QUICK_BACKEND;
  const result = spawnSync(linux ? 'xvfb-run' : binary, linux ? ['-a', binary, ...args] : args, {
    env: environment,
    encoding: 'utf8',
    timeout: 60000
  });
  assert.equal(result.status, 0, `Editor did not exit cleanly: ${result.error || result.stderr}`);
  const png = readFileSync(image);
  assert.ok(png.length > 8, 'Editor screenshot is empty');
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  console.log('Activity editor mounted, rendered, and closed cleanly');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
