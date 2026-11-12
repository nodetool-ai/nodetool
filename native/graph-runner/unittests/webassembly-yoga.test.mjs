import '../guest/env/webassembly.mjs';
import { yogaLayoutFixture } from './webassembly-yoga-fixture.mjs';
const result = yogaLayoutFixture();
globalThis.__afterRunCleanup = () => {
  if (JSON.stringify(yogaLayoutFixture()) !== JSON.stringify(result)) throw new Error('Yoga changed across run cleanup');
};
globalThis.__wasmResult = JSON.stringify(result);
globalThis.__wasmDone = true;
console.log(globalThis.__wasmResult);
