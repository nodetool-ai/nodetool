export async function runBridgeConformance(module) {
  let sequence = 0;
  let assertions = 0;
  const check = (condition, message) => {
    assertions++;
    if (!condition) { throw new Error(message); }
  };
  const dispatch = (context, request) => {
    const bytes = new TextEncoder().encode(JSON.stringify(request));
    const pointer = module._malloc(bytes.length);
    check(pointer > 0, 'request allocation');
    try {
      module.HEAPU8.set(bytes, pointer);
      const code = module._ng_dispatch(context, pointer, bytes.length);
      check(code >= 0, 'live context');
      const responsePointer = module._ng_response_pointer(context);
      const responseLength = module._ng_response_length(context);
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(module.HEAPU8.slice(responsePointer, responsePointer + responseLength)));
    } finally { module._free(pointer); }
  };
  const a = module._ng_create();
  const b = module._ng_create();
  check(a > 0 && b > 0 && a !== b, 'isolated contexts');
  const additional = Array.from({ length: 6 }, () => module._ng_create());
  check(additional.every(handle => handle > 0) && module._ng_create() === 0, 'bounded context ownership');
  for (const handle of additional) { module._ng_destroy(handle); }
  const request = (operation, sessionId, fields = {}) => ({ protocolVersion: 1, requestId: `r${++sequence}`, operation, sessionId, ...fields });
  const ok = (context, value) => {
    const response = dispatch(context, value);
    check(response.status === 'ok', JSON.stringify(response));
    return response.result;
  };
  for (const dimension of ['2d', '3d']) {
    const document = { engine: 'native-cpp-1', schemaVersion: dimension === '2d' ? 5 : 4, id: dimension, title: dimension, initialSceneId: 'scene', scenes: [{ id: 'scene', entities: [{ id: 'box' }] }] };
    document.dimension = dimension;
    const open = request('open', dimension, { document });
    const opened = ok(a, open);
    check(JSON.stringify(ok(a, open)) === JSON.stringify(opened), 'retry unchanged');
    check(dispatch(a, { ...open, document: { ...document, title: 'changed' } }).error.code === 'conflict', 'retry conflict');
    const transaction = request('transaction', dimension, { expectedRevision: 0, operations: [{ kind: 'addEntity', sceneId: 'scene', entity: { id: 'added' } }] });
    check(ok(a, transaction).revision === 1, 'transaction revision');
    check(ok(a, request('inspect', dimension)).document.scenes[0].entities.length === 2, 'inspect edited document');
    ok(a, request('start', dimension));
    const snapshot = ok(a, request('snapshot', dimension));
    const stepped = ok(a, request('step', dimension));
    check(stepped.tick === 1, 'real Session tick');
    ok(a, request('restore', dimension, { snapshot }));
    const restored = ok(a, request('frame', dimension));
    check(restored.tick === 0, 'same live snapshot restore');
    ok(b, open);
    ok(b, request('start', dimension));
    check(dispatch(b, request('restore', dimension, { snapshot })).status === 'error', 'foreign snapshot denied');
    check(dispatch(a, request('restore', dimension, { snapshot: { ...snapshot, tick: 99 } })).status === 'error', 'tampered snapshot denied');
    ok(a, request('close', dimension));
    ok(b, request('close', dimension));
  }
  const cameraDocument = { engine: 'native-cpp-1', schemaVersion: 4, dimension: '3d', id: 'first-person', title: 'First person', initialSceneId: 'scene', camera: { kind: 'firstPerson', targetId: 'player' }, scenes: [{ id: 'scene', entities: [{ id: 'player', body: { type: 'kinematic', velocity: [1, 0, 0] }, collider: { shape: 'sphere', radius: .1 }, behaviors: [{ id: 'aim', scriptId: 'aim' }] }, { id: 'rifle', visual: { kind: 'model', assetId: 'rifle', cameraRelative: true }, transform: { position: [.3, -.2, -1] } }] }], scripts: [{ id: 'aim', source: 'i=>({state:{camera:i.camera}})' }], assets: [{ id: 'rifle', kind: 'model', path: 'rifle.glb', digest: '0'.repeat(64), size: 0 }] };
  ok(a, request('open', 'first-person', { document: cameraDocument }));
  ok(a, request('start', 'first-person'));
  const cameraSnapshot = ok(a, request('snapshot', 'first-person'));
  const cameraFrame = ok(a, request('step', 'first-person', { input: { look: { x: 100, y: -50 } } }));
  check(cameraFrame.camera.near === .03 && cameraFrame.camera.far === 160 && cameraFrame.camera.fov === 78, 'first-person projection');
  const cameraState = ok(a, request('snapshot', 'first-person'));
  check(cameraState.states['player/aim'].camera.yaw === -.2 && cameraState.states['player/aim'].camera.pitch === .1, 'current-tick script aim');
  check(!('cameraRelative' in cameraFrame.entities.find(entity => entity.id === 'rifle').visual), 'viewmodel pose baked into portable frame');
  ok(a, request('restore', 'first-person', { snapshot: cameraSnapshot }));
  const cameraReplay = ok(a, request('step', 'first-person', { input: { look: { x: 100, y: -50 } } }));
  check(JSON.stringify(cameraReplay.camera) === JSON.stringify(cameraFrame.camera), 'first-person snapshot replay');
  ok(a, request('close', 'first-person'));
  for (const [name, source] of [
    ['watchdog', '()=>{while(true){}}'],
    ['memory', '()=>{const values=[];while(true){values.push(new Array(100000).fill(1));}}'],
    ['error', '()=>{throw new Error("fixture");}'],
  ]) {
    const document = { engine: 'native-cpp-1', schemaVersion: 4, dimension: '3d', id: name, title: name, initialSceneId: 'scene', scenes: [{ id: 'scene', entities: [{ id: 'box', behaviors: [{ id: 'scripted', scriptId: 'script' }] }] }], scripts: [{ id: 'script', source }] };
    ok(a, request('open', name, { document }));
    ok(a, request('start', name));
    const started = performance.now();
    const failed = dispatch(a, request('step', name));
    check(failed.status === 'error' && ['SCRIPT_ERROR', 'SCRIPT_LIMIT'].includes(failed.error.code), `${name} structured failure`);
    check(performance.now() - started < 5000, `${name} bounded execution`);
    check(ok(a, request('frame', name)).tick === 0, `${name} tick rolled back`);
    ok(a, request('close', name));
  }
  const pointer = module._malloc(4);
  module.HEAPU8.set([0x22, 0xff, 0x22, 0], pointer);
  check(module._ng_dispatch(a, pointer, 3) === 1, 'invalid UTF8');
  check(module._ng_dispatch(a, pointer, 16777217) === 1, 'oversize before read');
  module._free(pointer);
  check(module._ng_dispatch(a, 0xfffffff0, 32) === 1, 'out-of-heap pointer rejected');
  module.FS.mkdir('/assets');
  const triangle = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const model = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ uri: 'triangle.bin', byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }] }));
  const entry = async (id, path, kind, bytes, dependencies = []) => ({ id, path, kind, size: bytes.length, dependencies, digest: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('') });
  const manifest = [await entry('model', 'triangle.gltf', 'model', model, ['vertices']), await entry('vertices', 'triangle.bin', 'buffer', triangle)];
  module.FS.writeFile('/assets/triangle.gltf', model);
  module.FS.writeFile('/assets/triangle.bin', triangle);
  const prepared = ok(a, request('prepareModel', undefined, { manifest, id: 'model' }));
  check(prepared.meshes[0][0].vertices.length === 3 && prepared.nodes[0].mesh === 0, 'native glTF preparation');
  module.FS.writeFile('/assets/triangle.bin', new Uint8Array(36));
  check(dispatch(a, request('prepareModel', undefined, { manifest, id: 'model' })).status === 'error', 'asset digest mismatch denied');
  module.FS.unlink('/assets/triangle.gltf');
  module.FS.unlink('/assets/triangle.bin');
  ok(a, request('open', 'entropy', { document: { engine: 'native-cpp-1', schemaVersion: 4, dimension: '3d', id: 'entropy', title: 'Entropy', initialSceneId: 'scene', scenes: [{ id: 'scene' }] } }));
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    check(dispatch(a, request('start', 'entropy')).error.code === 'unavailable_capability', 'missing secure entropy fails startup');
  } finally {
    if (cryptoDescriptor) { Object.defineProperty(globalThis, 'crypto', cryptoDescriptor); }
    else { delete globalThis.crypto; }
  }
  const originalCrypto = globalThis.crypto;
  let reentered = false;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    getRandomValues(destination) {
      reentered = true;
      check(module._ng_dispatch(b, 0, 0) === -2, 'nested dispatch rejected without mutating response');
      check(module._ng_create() === 0, 'context creation rejected during dispatch');
      module._ng_destroy(a);
      module._ng_destroy(b);
      return originalCrypto.getRandomValues(destination);
    },
  } });
  try { ok(a, request('start', 'entropy')); }
  finally {
    if (cryptoDescriptor) { Object.defineProperty(globalThis, 'crypto', cryptoDescriptor); }
    else { delete globalThis.crypto; }
  }
  check(reentered, 'controlled imported entropy callback exercised reentry');
  check(ok(a, request('frame', 'entropy')).tick === 0, 'active context survives nested destruction');
  check(ok(b, request('hello')).dimensions.length === 2, 'other context survives nested destruction');
  ok(a, request('close', 'entropy'));
  module._ng_destroy(a);
  check(module._ng_dispatch(a, 0, 0) === -1 && module._ng_response_pointer(a) === 0 && module._ng_response_length(a) === 0, 'stale handle');
  check(ok(b, request('hello')).dimensions.length === 2, 'second context survives');
  module._ng_destroy(b);
  return { assertions, dimensions: ['2d', '3d'], snapshots: 'same-session', contexts: 'isolated' };
}
