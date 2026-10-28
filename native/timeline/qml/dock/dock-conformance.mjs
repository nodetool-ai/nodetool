import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const root = new URL('../../../../', import.meta.url).pathname;
const bundled = await build({
  stdin: { contents: `export * from '${root}/web/src/stores/timeline/TimelineDockLayout.ts'; export * from '${root}/web/src/components/dock/dockTargets.ts';`, resolveDir: root },
  bundle: true, platform: 'node', format: 'esm', write: false
});
const { timelineDockLayoutModel: web, TIMELINE_WORKSPACES: workspaces, dockDropAction, dockMoveToRegion } =
  await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
let comparisons = 0;
function compare(method, args, expected, identity = false) {
  const run = spawnSync(process.argv[2], [], { input: JSON.stringify({ method, args, identity }) + '\n', encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.ok(!result.error, result.error);
  assert.deepEqual(result.value, expected, `${method} ${JSON.stringify(args)}`);
  comparisons++;
}
for (const name of workspaces) { compare('createLayout', [name], web.createLayout(name)); }
assert.ok(comparisons >= 4, 'Oracle must compare all workspaces');
console.log(`Dock oracle: ${comparisons} comparisons passed`);

let layout = web.createLayout();
const extensions = [
  { id: 'assets', title: 'Library', icon: null, defaultRegion: 'left' },
  { id: 'extra', title: 'Extra', icon: null, defaultRegion: 'bottom' }
];
compare('registerMissingPanels', [layout, extensions], web.registerMissingPanels(layout, extensions));
layout = web.registerMissingPanels(layout, extensions);
const actions = [
  { type: 'move', panelId: 'source', region: 'right', groupId: 'right-main', index: 1 },
  { type: 'activate', panelId: 'inspector' },
  { type: 'hide', panelId: 'inspector' },
  { type: 'hide', panelId: 'inspector' },
  { type: 'hide', panelId: 'program' },
  { type: 'hide', panelId: 'tracks' },
  { type: 'reveal', panelId: 'inspector' },
  { type: 'move', panelId: 'tracks', region: 'viewport', groupId: 'new-tracks', index: 0,
    anchor: { groupId: 'viewport-program', side: 'before' } },
  { type: 'move', panelId: 'program', region: 'viewport', groupId: 'viewport-program', index: 0 },
  { type: 'move', panelId: 'assets', region: 'bottom', groupId: 'assets-group', index: 0 },
  { type: 'hide', panelId: 'extra' },
  { type: 'resize', region: 'bottom', size: 1000 },
  { type: 'resize', region: 'left', size: 100 },
  { type: 'resizeGroups', region: 'viewport', weights: { 'new-tracks': 0.5, 'viewport-program': 2.5 } },
  ...workspaces.map(name => ({ type: 'preset', name }))
];
for (const action of actions) {
  const expected = web.transition(layout, action);
  compare('transition', [layout, action], expected);
  layout = expected;
}
for (const invalid of [null, {}, { ...layout, version: 2 }, { ...layout, hidden: ['program'] },
  { ...layout, hidden: ['inspector', 'inspector'] }, { ...layout, extra: true },
  { ...layout, sizes: { ...layout.sizes, left: 99 } },
  { ...layout, regions: { ...layout.regions, right: [{ id: 'bad', panels: ['inspector'], activePanelId: 'shot' }] } }]) {
  compare('hydrate', [invalid], web.hydrate(invalid));
}
compare('hydrate', [layout], web.hydrate(layout));
console.log(`Dock transitions and hydration: ${comparisons} comparisons passed`);

const available = ['program', 'source', 'tracks', 'inspector', 'assets'];
const dragLayout = web.registerMissingPanels(web.createLayout(), extensions);
for (const target of [
  { kind: 'region', region: 'left' },
  { kind: 'zone', region: 'viewport', groupId: 'viewport-program', zone: 'center' },
  { kind: 'zone', region: 'right', groupId: 'right-main', zone: 'bottom' },
  { kind: 'zone', region: 'right', groupId: 'right-main', zone: 'top' },
  { kind: 'tab', region: 'right', groupId: 'right-main', index: 0 },
  { kind: 'tab', region: 'right', groupId: 'right-main', index: 1 },
  { kind: 'zone', region: 'right', groupId: 'missing', zone: 'center' }
]) {
  compare('dockDropAction', [dragLayout, 'source', target, available],
    dockDropAction(dragLayout, 'source', target, id => available.includes(id)));
}
for (const region of ['left', 'right', 'bottom', 'viewport']) {
  compare('dockMoveToRegion', [dragLayout, 'source', region], dockMoveToRegion(dragLayout, 'source', region));
}
console.log(`Dock drag targets: ${comparisons} comparisons passed`);

for (const action of [
  { type: 'hide', panelId: 'program' },
  { type: 'hide', panelId: 'tracks' },
  { type: 'activate', panelId: 'program' },
  { type: 'resize', region: 'bottom', size: 300 },
  { type: 'resizeGroups', region: 'viewport', weights: {} }
]) {
  const initial = web.createLayout();
  compare('transition', [initial, action], web.transition(initial, action) === initial, true);
}
console.log(`Dock no-op identity: ${comparisons} comparisons passed`);

const large = { version: 1, regions: {}, hidden: [], sizes: { left: 100, right: 1600, bottom: 1000 } };
for (const region of ['left', 'right', 'bottom', 'viewport']) {
  large.regions[region] = Array.from({ length: 32 }, (_, group) => {
    const panels = Array.from({ length: 64 }, (_, panel) => `${region}-${group}-${panel}`);
    return { id: `${region}-${group}`, panels, activePanelId: panels[0] };
  });
}
large.regions.viewport[0].panels.push('program', 'tracks');
compare('hydrate', [large], web.hydrate(large));
for (const action of [
  { type: 'move', panelId: 'program', region: 'right', groupId: 'right-main', index: -1 },
  { type: 'move', panelId: 'program', region: 'left', groupId: 'right-main', index: 0 },
  { type: 'move', panelId: 'program', region: 'right', groupId: 'new', index: 1 },
  { type: 'move', panelId: 'missing', region: 'left', groupId: 'left-main', index: 0 },
  { type: 'resize', region: 'bottom', size: 1001 },
  { type: 'resizeGroups', region: 'viewport', weights: { 'viewport-program': 0.01 } }
]) {
  const initial = web.createLayout();
  assert.throws(() => web.transition(initial, action));
  const result = spawnSync(process.argv[2], [], {
    input: JSON.stringify({ method: 'transition', args: [initial, action] }) + '\n', encoding: 'utf8', timeout: 10000
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).error, `Native must reject ${JSON.stringify(action)}`);
  comparisons++;
}
console.log(`Dock validation and large layout: ${comparisons} comparisons passed`);
