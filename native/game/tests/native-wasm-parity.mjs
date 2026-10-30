import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encode, decode } from '@msgpack/msgpack';

const [workerPath, moduleArgument] = process.argv.slice(2);
const modulePath = resolve(moduleArgument);
const factory = (await import(pathToFileURL(modulePath).href)).default;
const module = await factory({ wasmBinary: await readFile(resolve(dirname(modulePath), 'native-game.wasm')) });
const worker = spawn(resolve(workerPath), [], { stdio: ['pipe', 'pipe', 'inherit'] });
let pending = [], received = Buffer.alloc(0), sequence = 0, compared = 0, numeric = 0, particleNumeric = 0, particleMaxDifference = 0;
worker.stdout.on('data', data => {
  received = Buffer.concat([received, data]);
  while (received.length >= 4 && received.length >= received.readUInt32BE(0) + 4) {
    const length = received.readUInt32BE(0);
    const value = decode(received.subarray(4, length + 4));
    received = received.subarray(length + 4);
    pending.shift()(value);
  }
});
const nativeDispatch = request => new Promise(resolveResponse => {
  pending.push(resolveResponse);
  const bytes = encode(request), header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  worker.stdin.write(Buffer.concat([header, bytes]));
});
const wasmDispatch = (context, request) => {
  const bytes = new TextEncoder().encode(JSON.stringify(request)), pointer = module._malloc(bytes.length);
  if (!pointer) { throw new Error('Parity request allocation failed'); }
  try {
    module.HEAPU8.set(bytes, pointer);
    if (module._ng_dispatch(context, pointer, bytes.length) < 0) { throw new Error('Parity context unavailable'); }
    return JSON.parse(new TextDecoder().decode(module.HEAPU8.slice(module._ng_response_pointer(context), module._ng_response_pointer(context) + module._ng_response_length(context))));
  } finally { module._free(pointer); }
};
function compare(a, b, path = '') {
  compared++;
  if (typeof a === 'number' && typeof b === 'number') {
    numeric++;
    if (path.includes('/particles/')) { particleNumeric++; particleMaxDifference = Math.max(particleMaxDifference, Math.abs(a-b)); }
    if (Math.abs(a - b) > 1e-5 + 1e-6 * Math.max(Math.abs(a), Math.abs(b))) { throw new Error(`Numeric parity mismatch ${path}: ${a} / ${b}`); }
    return;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (a !== b) { throw new Error(`Discrete parity mismatch ${path}: ${JSON.stringify(a)} / ${JSON.stringify(b)}`); }
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b) || JSON.stringify(Object.keys(a).sort()) !== JSON.stringify(Object.keys(b).sort())) { throw new Error(`Shape parity mismatch ${path}`); }
  for (const key of Object.keys(a)) { compare(a[key], b[key], `${path}/${key}`); }
}
const request = (operation, sessionId, fields = {}) => ({ protocolVersion: 1, requestId: `parity-${++sequence}`, operation, sessionId, ...fields });
const course = JSON.parse(await readFile(new URL('../benchmarks/course.json', import.meta.url), 'utf8'));
course.camera = { kind: 'firstPerson', targetId: 'player' };
course.scenes[0].environment = { postProcessing: { toneMapping: 'agx', antialias: 'smaa' } };
course.scripts = [{ id: 'script', source: "i=>({state:{loaded:i.input.loaded||i.state.loaded||[],count:(i.state.count||0)+1},commands:[{kind:'query',queryId:'ray',origin:[0,3,0],direction:[0,-1,0],maxDistance:10},...(i.tick===0?[{kind:'save',scope:'progress',slot:'slot',data:{level:2}},{kind:'load',scope:'settings',slot:'slot'}]:[])]})" }];
course.scenes[0].entities.push({ id: 'scripted', behaviors: [{ id: 'update', scriptId: 'script' }] });
const blacksite = JSON.parse(await readFile(new URL('../../../packages/game-runtime/samples/blacksite/game.json', import.meta.url), 'utf8'));
const muzzle = blacksite.scenes[0].entities.find(entity => entity.id === 'muzzle');
if (!muzzle) { throw new Error('BLACKSITE muzzle fixture missing'); }
const sparks = muzzle.particles.emitters.find(emitter => emitter.id === 'sparks');
if (!sparks) { throw new Error('BLACKSITE sparks fixture missing'); }
course.scenes[0].entities.push({ id: 'portable-sparks', particles: { emitters: [{ ...sparks, playOnStart: true, rate: 30, loop: true, maxParticles: 16, bursts: [{ time: 0, count: 2 }] }] } });
const platform = { engine: 'native-cpp-1', schemaVersion: 5, dimension: '2d', id: 'platform', title: 'Platform parity', initialSceneId: 'scene', gravity: { x: 0, y: -9.81 }, scenes: [{ id: 'scene', entities: [
  { id: 'platform', transform: { x: 0, y: -0.5 }, body2d: { type: 'kinematic', velocity: { x: 0.5, y: 0 } }, collider2d: { width: 8, height: 1 } },
  { id: 'rider', transform: { x: 0, y: 0.5 }, body2d: { type: 'kinematic', gravityScale: 1 }, collider2d: { width: 0.5, height: 0.5 }, behaviors: [{ id: 'update', scriptId: 'script' }] },
  { id: 'sensor', collider2d: { width: 20, height: 20, sensor: true } },
] }], scripts: [{ id: 'script', source: "i=>({state:{loaded:i.input.loaded||i.state.loaded||[],count:(i.state.count||0)+1},commands:i.tick===0?[{kind:'save',scope:'progress',slot:'slot',data:{level:2}},{kind:'load',scope:'settings',slot:'slot'}]:[]})" }] };
const context = module._ng_create();
const timings = [];
const coverage = {};
const both = async value => {
  const started = performance.now();
  const wasm = wasmDispatch(context, value);
  timings.push(performance.now() - started);
  const native = await nativeDispatch(value);
  compare(native, wasm);
  if (native.status !== 'ok') { throw new Error(JSON.stringify(native)); }
  return native.result;
};
try {
  for (const document of [platform, course]) {
    const id = document.dimension;
    const open = request('open', id, { document });
    await both(open);
    await both(open);
    const conflicting = { ...open, document: { ...document, title: 'Conflicting retry' } };
    const nativeConflict = await nativeDispatch(conflicting), wasmConflict = wasmDispatch(context, conflicting);
    compare(nativeConflict, wasmConflict);
    if (nativeConflict.error?.code !== 'conflict') { throw new Error('Retry conflict was not rejected'); }
    await both(request('transaction', id, { expectedRevision: 0, operations: [{ kind: 'addEntity', sceneId: document.initialSceneId, entity: { id: 'edited' } }] }));
    await both(request('undo', id, { expectedRevision: 1 }));
    await both(request('redo', id, { expectedRevision: 2 }));
    await both(request('start', id, { seed: 42 }));
    const wrongInput = request('step', id, { input: { move: id === '2d' ? [1, 0] : { x: 1, y: 0 } } });
    const nativeInputError = await nativeDispatch(wrongInput), wasmInputError = wasmDispatch(context, wrongInput);
    compare(nativeInputError, wasmInputError);
    if (nativeInputError.error?.code !== 'validation_error' || nativeInputError.error?.path !== 'input.move') { throw new Error('Dimension-specific input boundary was not enforced'); }
    let events = 0, queries = 0, hostRequests = 0, particleSamples = 0, finalFrame;
    for (let tick = 0; tick < 90; tick++) {
      const input = { move: id === '2d' ? { x: tick < 30 ? 0.25 : 0, y: 0 } : [tick < 30 ? 0.25 : 0, 0, 0], ...(id === '3d' ? { look: { x: tick < 45 ? 1 : -1, y: tick < 30 ? .5 : 0 } } : {}), ...(tick === 1 ? { loaded: [{ scope: 'settings', slot: 'slot', data: { volume: 0.5 } }] } : {}) };
      finalFrame = await both(request('step', id, { input }));
      events += finalFrame.events.length;
      queries += finalFrame.queryResults.length;
      hostRequests += finalFrame.hostRequests.length;
      particleSamples += finalFrame.particles?.length ?? 0;
    }
    const nativeSnapshot = (await nativeDispatch(request('snapshot', id))).result;
    const wasmSnapshot = wasmDispatch(context, request('snapshot', id)).result;
    compare(nativeSnapshot.states, wasmSnapshot.states, '/snapshot/states');
    if (events === 0 || hostRequests !== 2 || (id === '3d' && queries === 0)) { throw new Error(`Empty semantic coverage ${id}`); }
    const loaded = Object.values(nativeSnapshot.states).some(state => state.loaded?.[0]?.data?.volume === 0.5);
    if (!loaded) { throw new Error(`Recorded loaded value was not retained in guest state ${id}`); }
    if (id === '2d' && finalFrame.entities.find(entity => entity.id === 'rider').transform.x <= 0.05) { throw new Error('Moving platform did not carry rider'); }
    if (id === '3d' && particleSamples === 0) { throw new Error('Particle parity fixture inspected no samples'); }
    coverage[id] = { events, queries, hostRequests, particleSamples, loadedReplay: loaded };
    await both(request('close', id));
  }
  const extents = [];
  for (let cycle = 0; cycle < 25; cycle++) {
    for (const document of [platform, course]) {
      const id = `stress-${document.dimension}`;
      await both(request('open', id, { document }));
      await both(request('start', id, { seed: 42 }));
      await both(request('step', id));
      await both(request('reload', id, { document }));
      const nativeSnapshot = (await nativeDispatch(request('snapshot', id))).result;
      const wasmSnapshot = wasmDispatch(context, request('snapshot', id)).result;
      const restore = request('restore', id, { snapshot: nativeSnapshot });
      const native = await nativeDispatch(restore);
      const wasm = wasmDispatch(context, { ...restore, snapshot: wasmSnapshot });
      compare(native, wasm);
      await both(request('step', id));
      await both(request('close', id));
    }
    extents.push(module.HEAPU8.buffer.byteLength);
  }
  const steady = extents.slice(5);
  if (new Set(steady).size !== 1) { throw new Error(`Heap extent failed to plateau ${JSON.stringify(extents)}`); }
  module._ng_destroy(context);
  if (module._ng_response_length(context) !== 0) { throw new Error('Stress context survived destruction'); }
  timings.sort((a, b) => a - b);
  console.log(JSON.stringify({ hosts: ['native-worker', 'node-wasm'], dimensions: ['2d', '3d'], compared, numeric, particleNumeric, particleMaxDifference, numericTolerance: { absolute: 1e-5, relative: 1e-6 }, coverage, stepsPerDimension: 90, lifetimeCycles: 25, heapExtents: extents, wasmDispatchP95Ms: timings[Math.floor(timings.length * 0.95)], scriptOnlyLatency: 'not instrumented', activeContextsAfter: 0 }));
} finally { worker.stdin.end(); }
const exit = await new Promise(resolveExit => worker.on('exit', resolveExit));
if (exit !== 0) { throw new Error(`Native worker exited ${exit}`); }
