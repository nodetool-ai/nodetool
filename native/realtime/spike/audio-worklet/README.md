# WP03 native and AudioWorklet parity spike

This standalone spike implements offline byte comparison and quantum timing for
[WP03](https://github.com/nodetool-ai/nodetool/issues/7394). It does not add a
production realtime engine.

`kernels.c` builds for native execution and WebAssembly. Each call processes
128 stereo frames through a biquad and mixes a second stereo input. The
caller owns the input, output and filter state. The native driver keeps them
on its stack. The AudioWorklet keeps them in one fixed WebAssembly memory,
using a 32-bit offset returned by `nt_context`. Only the render thread
accesses that memory. No kernel allocates or crosses a thread boundary.

## Run

Use the repository's Node version and install its npm dependencies. Install
Chrome and clang with the wasm32 target and `wasm-ld`. Run from the repository
root:

```sh
node native/realtime/spike/audio-worklet/build.mjs
node --test native/realtime/spike/audio-worklet/timing.test.mjs
node native/realtime/spike/audio-worklet/verify.mjs
```

`CC` selects the compiler executable. To use Zig's bundled clang, set `CC`
to the Zig executable and `ZIG_CC=1`. On Windows, this also supplies the native
C runtime without a Visual Studio developer shell. `SPIKE_BROWSER` selects
a Playwright browser channel and defaults to `chrome`.

Both builds disable fast math and FMA contraction (N6). No platform math
library supplies filter coefficients. The fixture contains seeded stereo
noise, a silence tail and separate channel impulses. The runner compares
every output byte from native, Node WebAssembly and Chrome's
`OfflineAudioContext` with an AudioWorklet. It checks native repeatability
and finite, nonempty output. Negative controls reject a truncated native
input, corrupted output and empty output.

Build outputs and `result.json` live in the ignored `build/` directory.
The result records the platform, browser, fixture dimensions and output hash.
Chrome DevTools tracing captures every `AudioWorkletProcessor::Process` event
and its author-script region. The report includes count, mean, standard
deviation, p99.9 and worst duration. Missing or partial traces fail verification.
The author-script region includes buffer copies and the Wasm call. Trace
overhead and the first quantum are included.

## Missing milestone evidence

Per-quantum timings come from an offline context. They do not establish
live-device deadlines or browser scheduling under load. WP03 remains open
until its required repository checks pass.

See the [M0 preparation status](../../README.md#remaining-m0-work) for the
unimplemented surface, remaining audio work and physical recording. None of
those results can be inferred from this spike. The M0 gate remains unmet and
design budgets remain targets.
