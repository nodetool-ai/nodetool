import '../guest/env/webassembly.mjs';
function assert(value, message) { if (!value) throw new Error(message); }
const module = new WebAssembly.Module(globalThis.__wasmFixture);
// 10000 calls of an exported function.
const live = new WebAssembly.Instance(module, { env: { callback(v) { return v; } } });
const read = live.exports.read;
const start = Date.now();
for (let i = 0; i < 10000; i++) read();
console.log('wasm 10000 calls ms: ' + (Date.now() - start));
// The scalar sandbox call: each call used to compile the module again.
{
  const sandboxStart = Date.now();
  for (let i = 0; i < 500; i++) {
    const out = JSON.parse(globalThis.__sandboxWasm.wasm(globalThis.__wasmFixtureScalar, 'add', '[1,2]', '{}'));
    assert(out === 3, 'sandbox wasm add');
  }
  console.log('sandbox wasm 500 calls ms: ' + (Date.now() - sandboxStart));
}
// Instances made and dropped in a loop must not reach the store limits.
for (let i = 0; i < 200; i++) {
  const instance = new WebAssembly.Instance(module, { env: { callback(v) { return v + 1; } } });
  assert(instance.exports.invoke(1) === 2, 'instance ' + i + ' works');
  new Uint8Array(instance.exports.memory.buffer)[0] = 1;
}
// A guest that does not end is still stopped.
let trapped = false;
try { live.exports.spin(); } catch { trapped = true; }
assert(trapped, 'Infinite WASM is interrupted');
assert(read() === 0, 'Store usable after trap');
globalThis.__wasmDone = true;
