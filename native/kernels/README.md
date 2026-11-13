# Native kernel library

The per-sample and per-pixel loops of the batch and streaming nodes, as one
C++ library with a C interface (decision D17 of the
[realtime plan](../../docs/plans/graph-runner-realtime.md)). The node classes
stay in TypeScript and keep their type, properties and validation. They call
these functions for the loop.

The same sources build two ways:

| Host | Build | Reached through |
|---|---|---|
| Graph runner | Static library `nodetool_kernels`, linked into `gr_kernel` | The `kernels` capability ([`src/host/kernels.cpp`](../graph-runner/src/host/kernels.cpp)) |
| Node server and browser | One standalone WebAssembly module, embedded as base64 | [`@nodetool-ai/kernels`](../../packages/kernels/README.md) |
| Native timeline | Static library `nodetool_kernels`, linked into `timeline_audio` | The mixer's filter and EQ inserts call `nt_biquad_design_webaudio` ([`Effects.cpp`](../timeline/src/audio/effects/Effects.cpp)) |

[`include/nodetool/kernels.h`](include/nodetool/kernels.h) declares every
function and its conventions. The library depends on the C++20 standard
library only. No function allocates memory that outlives the call or keeps
state between calls, so every function is thread-safe for distinct buffers.
Streaming kernels keep their state in a caller-owned array of doubles.

## Kernels

| Area | Functions | Nodes |
|---|---|---|
| Image enhance | `nt_image_auto_contrast`, `_equalize`, `_adaptive_contrast`, `_rank_filter` | `lib.image.enhance.*` |
| Audio effects | `nt_audio_bitcrush`, `_compress`, `_distortion`, `_limiter`, `_reverb`, `_noise_gate`, `_phaser`, `_delay` | `lib.audio.*` |
| Stateful audio | `nt_audio_<effect>_state_len`, `_init`, `_block` for bitcrush, compress, limiter, noise gate, phaser, reverb and delay | Clip effects and `nodetool.audio.realtime.Streaming*` |
| Resampling | `nt_resample_output_frames`, `nt_resample` | Audio To Chunks |
| Biquad filters | `nt_biquad_design_rbj`, `nt_biquad_design_webaudio`, `nt_biquad_process`, `nt_vcf_process` | `lib.audio` filters, streaming filters, the VCF |
| Synthesis | `nt_osc_process`, `nt_lfo_process`, `nt_adsr_process`, `nt_gate_process`, `nt_vca_process`, `nt_sample_hold_process` | `nodetool.audio.synth.*` |
| Sampler | `nt_sampler_state_len`, `nt_sampler_process` | `nodetool.audio.synth.Sampler` |
| Signal utilities | `nt_signal_scale_offset`, `nt_signal_mix_add`, `nt_signal_extract_channel` | Gain, Mixer, channel splits |

## Output parity

Each kernel gives the samples or bytes of the TypeScript loop it replaced.
The rules that keep it so:

- The library compiles with `-ffp-contract=off` and without fast math.
- [`src/js_math.h`](src/js_math.h) holds `jsRound` (ECMAScript `Math.round`)
  and the float32 stores where the TypeScript loop wrote a `Float32Array`.
- `nt_biquad_design_webaudio` is the Web Audio `BiquadFilterNode` design. Its
  output equals the `OfflineAudioContext` of `node-web-audio-api`.

[`packages/kernels/tests/parity.test.ts`](../../packages/kernels/tests/parity.test.ts)
compares the WebAssembly build with copies of the replaced loops.

Every double argument and every double in a state array is safe. NaN,
infinities and out-of-range values give defined results, never a cast with
undefined behavior. `testHostileDoubles` in the native tests holds this under
UBSan.

## Build and test

```bash
cmake -S native/kernels -B native/kernels/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/kernels/build -j
ctest --test-dir native/kernels/build --output-on-failure
```

For the sanitizer builds, configure with
`-DCMAKE_CXX_FLAGS="-fsanitize=address,undefined"` or
`-DCMAKE_CXX_FLAGS=-fsanitize=thread`.

After a change to the sources or the header, rebuild the WebAssembly module
with Emscripten (`em++` on the `PATH`) and commit the generated file:

```bash
node native/kernels/scripts/build-wasm.mjs          # writes packages/kernels/src/generated/kernels-wasm.ts
node native/kernels/scripts/build-wasm.mjs --check  # fails when the generated file is stale
```

A new function needs an entry in three places: the header, an adapter in the
runner's [`kernels` capability](../graph-runner/src/host/kernels.cpp), and a
typed method in [`packages/kernels/src/index.ts`](../../packages/kernels/src/index.ts).
