import '../guest/env/webassembly.mjs';
function assert(value, message) { if (!value) throw new Error(message); }
let callbackCount = 0;
let instance;
const module = new WebAssembly.Module(globalThis.__wasmFixture);
instance = new WebAssembly.Instance(module, { env: { callback(value) {
  callbackCount++;
  new Uint32Array(instance.exports.memory.buffer)[1] = value + 1;
  return value + 2;
} } });
const { memory, write, read, invoke, grow, spin } = instance.exports;
assert(memory instanceof WebAssembly.Memory, 'Memory type');
let buffer = memory.buffer;
const view = new Uint32Array(buffer);
view[0] = 123;
assert(read() === 123, 'JS to WASM memory');
write(456);
assert(view[0] === 456, 'WASM to JS memory');
assert(invoke(10) === 12 && view[1] === 11 && callbackCount === 1, 'Reentrant callback');
for (const name of ['transfer', 'transferToFixedLength', 'transferToImmutable']) {
  if (!ArrayBuffer.prototype[name]) continue;
  let rejected = false;
  try { ArrayBuffer.prototype[name].call(buffer); } catch { rejected = true; }
  assert(rejected, 'Native memory transfer must fail: ' + name);
}
assert(memory.grow(1) === 1, 'Host memory growth');
assert(buffer.byteLength === 0 && view.length === 0, 'Old views detached');
assert(new Uint32Array(memory.buffer)[0] === 456, 'Growth preserves contents');
buffer = memory.buffer;
assert(grow(1) === 2, 'WASM memory growth');
assert(buffer.byteLength === 0, 'WASM growth detaches');
buffer = memory.buffer;
let limited = false;
try { memory.grow(10); } catch { limited = true; }
assert(limited && buffer.byteLength === 3 * 65536, 'Failed growth preserves views');
let trapped = false;
try { spin(); } catch { trapped = true; }
assert(trapped, 'Infinite WASM is interrupted');
assert(read() === 456, 'Store usable after trap');
const isolated = new WebAssembly.Instance(module, { env: { callback() { throw new Error('callback sentinel'); } } });
assert(isolated.exports.read() === 0 && read() === 456, 'Instance memory isolation');
let callbackError = false;
try { isolated.exports.invoke(1); } catch (error) { callbackError = error.message.includes('callback sentinel'); }
assert(callbackError && read() === 456, 'Callback exceptions trap without corrupting another instance');
assert(!WebAssembly.validate(new Uint8Array([0, 1, 2])), 'Invalid module rejected');
let missingImport = false;
try { new WebAssembly.Instance(module); } catch { missingImport = true; }
assert(missingImport, 'Missing imports rejected');
globalThis.__retainedBuffer = memory.buffer;
globalThis.__cancelSoon();
let cancelled = false;
try { spin(); } catch { cancelled = true; }
assert(cancelled, 'Cancellation interrupts execution');
let stillCancelled = false;
try { read(); } catch { stillCancelled = true; }
assert(stillCancelled, 'Cancelled context rejects new calls');
globalThis.__afterRunCleanup = () => {
  assert(memory.buffer === globalThis.__retainedBuffer, 'Run cleanup retains the same live buffer');
  assert(read() === 456, 'Run cleanup preserves memory and cancellation can recover');
  const before = callbackCount;
  assert(invoke(20) === 22 && callbackCount === before + 1, 'Run cleanup preserves imports');
  assert(new Uint32Array(memory.buffer)[1] === 21, 'Preserved callback writes memory');
};
globalThis.__afterContextCleanup = () => {
  assert(globalThis.__retainedBuffer.byteLength === 0, 'Context cleanup detaches retained buffer');
  for (const operation of [read, () => invoke(1), () => memory.buffer, () => memory.grow(0), () => new WebAssembly.Instance(module)]) {
    let rejected = false;
    try { operation(); } catch (error) { rejected = error.message.includes('context is closed'); }
    assert(rejected, 'Context cleanup rejects subsequent native access');
  }
};
globalThis.__wasmDone = true;
console.log('memory/callback/growth/limits setup passed');
