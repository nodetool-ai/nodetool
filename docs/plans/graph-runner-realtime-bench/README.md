# Kernel benchmark

A micro-benchmark of two audio kernels in five engines. It gives the numbers in
section 3.4 of the [realtime design](../graph-runner-realtime.md). It is
evidence for that document. It is not part of the build or the tests.

| File | Content |
|---|---|
| `common.h` | Input noise, filter coefficients, timer and report |
| `native.c` | The biquad chain and the mix in C |
| `biquad.wat` | The same kernels as WebAssembly text, with a SIMD128 mix |
| `wasmtime_host.c` | Runs the module through the Wasmtime C API and writes the binary module |
| `kernel.js` | The same kernels in JavaScript, for V8 and QuickJS-ng |
| `node_bench.mjs` | Runs `kernel.js` and the binary module in Node |
| `run.sh` | Builds and runs every row |

## Run

Requirements: macOS, clang, Node, a Wasmtime C API release and a `qjs` binary
of QuickJS-ng. `common.h` reads the time with `clock_gettime_nsec_np`, which
exists on macOS only.

```bash
WASMTIME_DIR=/path/to/wasmtime-c-api QJS=/path/to/qjs ./run.sh
```

`run.sh` builds into a temporary directory. It prints one line for each row:
the mean, median, 99th percentile and maximum of the block time, the time for
each sample, and a checksum of the output.

The design used Wasmtime 29.0.1 and QuickJS-ng 0.18.0, the versions that the
graph runner pins. To build `qjs` from the source tree of a configured runner
build, run this from the repository root:

```bash
cmake -S native/graph-runner/build/_deps/quickjs-src -B /tmp/qjs-build -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/qjs-build --target qjs_exe
```

## Limits

- The numbers are for one machine at normal thread priority.
- Equal checksums show agreement for these two kernels on this input only.
- The timed region of each biquad row includes one copy of the input block.

## WP03 offline spike

The [AudioWorklet spike](../../../native/realtime/spike/audio-worklet/README.md)
builds one C source for native and WebAssembly execution and compares the
output bytes through Chrome's AudioWorklet. The
[Windows offline result](wp03-windows-offline.json) records that fixture's
agreement. It does not establish live-device deadlines or complete WP03.
The result also records Chrome trace durations for each offline worklet quantum,
including startup and trace overhead.

## WP02 Windows null-device smoke

The [buffered audio spike](../../../native/realtime/README.md#buffered-audio)
exercises the PCM ring, persistent DSP state, plan swaps and an independent
worker stall. The [Windows null-device result](wp02-windows-null.json) covers
idle, swap and stall profiles at both session rates. Repository checks were
running concurrently. These short runs do not measure hardware conversion,
macOS scheduling, sound-to-picture latency or the ten-minute load profiles.

## WP02 offline conversion

The [conversion benchmark](../../../native/realtime/README.md#offline-sample-rate-conversion)
compares miniaudio linear conversion from 44.1 to 48 kHz with matching-rate
baselines. The [Windows result](wp02-windows-conversion.json) records CPU call
timings and signal checks. It includes startup calls and host scheduling noise.
No device runs during this measurement. Hardware conversion cost and Q3 remain
unqualified.
