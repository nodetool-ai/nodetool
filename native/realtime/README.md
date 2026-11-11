# Realtime M0 preparation

These standalone spikes prepare [RT M0](../../docs/plans/graph-runner-realtime-issues.md).
They do not implement the production engine or satisfy its measurement gate.

## Build and test

Build the repository packages first for the in-process media decoder. Use a
C++20 compiler, CMake and the repository Node version:

```sh
cmake -S native/realtime -B native/realtime/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/realtime/build --config Release
ctest --test-dir native/realtime/build -C Release --output-on-failure
npm run test:affected:native
```

On Windows, use a Visual Studio generator. Put CMake and CTest on `PATH`.
Run the [AudioWorklet comparison](spike/audio-worklet/README.md) separately.

## Buffered audio

`realtime-audio-spike` runs a 128-frame oscillator, biquad and gain chain on a
render thread. miniaudio's callback copies the SPSC PCM ring into the device
buffer. The lead is the larger of two converted device periods and eight
quanta. The default device is miniaudio's null backend.

```sh
native/realtime/build/realtime-audio-spike --seconds 10 --profile swap --rate 44100 --device null --wav swap.wav
native/realtime/build/realtime-audio-spike --seconds 10 --profile stall --rate 48000 --device null
```

For Visual Studio builds, use `native/realtime/build/Release/realtime-audio-spike.exe`.
`--device default` plays through the default hardware device. Supported profiles
are `idle`, `swap` and `stall`. `swap` publishes a plan each second. `stall`
sleeps an independent worker for 500 ms every five seconds. Duration is limited
to 600 seconds so recording and timing storage can be allocated before playback.

The session owns the ring, DSP state, plan arena and fixed recording buffers.
Joined workers hold the session alive. miniaudio borrows it until device teardown
has finished. The prepare thread publishes plan indices through an atomic mailbox
and receives retired indices through an SPSC queue. Bounded seqlock reads retain
the previous parameters if the writer stalls. DSP state stays on the audio thread
across swaps. Changed subgraphs receive a 256-sample sink correction that starts
at the previous output's extrapolated slope.

The JSON report includes every rendered quantum, timing percentiles, underruns,
buffer fill, applied parameter revision and stream frame. The allocation counter
checks C++ `new` on the render thread with a positive control. It does not audit
all C allocations or backend callback allocations. Allocation counting runs
only in the ordinary build. Sanitized reports set `render_new_allocations` to
`null` and require a separate allocation audit. The reused counter's sanitizer
hook accesses TLS during Windows thread teardown, so sanitized builds omit that
hook while keeping the audio driver instrumented. Windows uses MMCSS and a
high-resolution waitable timer. Those mechanisms do not qualify macOS behavior.

## Recording analysis

The [click/flash analyzer](spike/sync/README.md) decodes a supplied recording and
reports picture-minus-sound offsets. Its test creates and decodes a synthetic
recording with an intentional stream offset. No physical recording is included.

## Remaining M0 work

| Issue | Prepared here | Still required |
|---|---|---|
| [WP01](https://github.com/nodetool-ai/nodetool/issues/7392) | No surface spike yet | Qt/wgpu Metal surface, catalog shader chain, visual clock, same-device submit gate and second-device comparisons, pipeline timings |
| [WP02](https://github.com/nodetool-ai/nodetool/issues/7393) | Buffered driver, plan/state/parameter tests, null-device smoke | macOS realtime policy and device workgroup implementation, busy/GPU profiles, ten-minute hardware runs, 44.1/48 kHz conversion, complete allocation audit |
| [WP03](https://github.com/nodetool-ai/nodetool/issues/7394) | Native/Wasm/Chrome byte comparison and traced per-quantum offline timings | Required repository checks and any live-device qualification beyond the offline fixture |
| [WP04](https://github.com/nodetool-ai/nodetool/issues/7395) | Timestamp-preserving recording analyzer and synthetic fixture | Combined click/flash producer, calibrated physical recording, measured design budgets and R1/R2 decision |

AddressSanitizer, UndefinedBehaviorSanitizer and ThreadSanitizer qualification
must be recorded for supported toolchains. ThreadSanitizer is unavailable on
this Windows host. Missing macOS work is not a passing result. R1/R2 and the
sample-rate decision stay open until the corresponding hardware evidence exists.

Run Windows AddressSanitizer builds from a Visual Studio x64 developer command
prompt so `clang_rt.asan_dynamic-x86_64.dll` is on `PATH`:

```bat
cmake -S native/realtime -B native/realtime/build-asan -DCMAKE_CXX_FLAGS="/EHsc /fsanitize=address /Zi"
cmake --build native/realtime/build-asan --config RelWithDebInfo
ctest --test-dir native/realtime/build-asan -C RelWithDebInfo --output-on-failure
```
