# @nodetool-ai/kernels

The typed TypeScript API of the [native kernel library](../../native/kernels/README.md):
the sample and pixel loops of the audio and image nodes, written in C++.

```ts
import { loadKernels } from "@nodetool-ai/kernels";

const kernels = await loadKernels();
const out = kernels.imageEqualize(rgba, width, height);
```

`loadKernels()` selects the host once for each process:

- Inside the graph runner, the native `kernels` capability runs the library
  as native code.
- Everywhere else (the Node server, the browser, workers), the package
  instantiates the WebAssembly build of the same sources. The module is
  embedded in `src/generated/kernels-wasm.ts`, so no asset loads at run time.

Both hosts give the same output. `loadWasmKernels()` always picks the
WebAssembly build, which the tests use.

## Conventions

- Image methods take straight-alpha RGBA8 and return a new buffer. They
  process RGB and copy alpha.
- Audio methods take interleaved float32 samples and return a new buffer.
- A streaming method takes a `state` array that the caller owns and passes
  again with the next chunk. `createBiquadState`, `createOscillatorState` and
  `STATE_LEN` give its size.
- A method checks that each buffer holds the elements the kernel reads, and
  throws a `RangeError` before the call when it does not.

## Tests

```bash
npm run test --workspace=packages/kernels
```

`tests/parity.test.ts` compares each kernel with a copy of the TypeScript
loop it replaced (`tests/reference.ts`). Image kernels must be byte-equal and
audio kernels sample-equal. `tests/biquad.test.ts` checks the filter
responses and that the filter state carries across chunks.
