# RT-Q8 browser executor comparison

WP10 is in progress. The adapted C++ candidate passes both Chrome frame
comparisons. The existing TypeScript Executor also matches both fixtures' pixels.
Q8 selects C++/Wasm. The measurements below support the decision in
[design section 14.5](../../../../docs/plans/graph-runner-realtime.md#145-browser).

The registry exposes `realtime-browser-comparison` as a manual harness. Prepare
the pinned SDK, browser candidate and native executable using the commands
below. The default gate reports these prerequisites rather than downloading a
toolchain. Dedicated native realtime CI runs the verification and benchmark guards.

## Pinned inputs

Use Emscripten **7.0.0**. Its remote WebGPU port pins Emdawnwebgpu
**v20260423.175430**. The native build uses wgpu-native **v29.0.1.1** from
[the native dependency definition](../../cmake/offline-gpu.cmake).
The SDK and downloaded port belong in an ignored build directory, not source
control. Installing or activating this SDK does not select a production browser
toolchain or change the native dependency pin.

[Emscripten's WebGPU documentation](https://emscripten.org/docs/porting/multimedia_and_graphics/WebGPU-support.html)
uses the Emdawnwebgpu port. The exact release and SHA-512 are recorded in
[Emscripten 7.0.0's port definition](https://github.com/emscripten-core/emscripten/blob/7.0.0/tools/ports/emdawnwebgpu.py).
Download its `EXTERNAL_PORT` archive, verify `SHA512`, and extract the port.
Do not substitute the retired `-sUSE_WEBGPU` binding.

```sh
git clone --depth 1 --branch 7.0.0 https://github.com/emscripten-core/emsdk.git native/realtime/build/wp10/emsdk
python native/realtime/build/wp10/emsdk/emsdk.py install 7.0.0
python native/realtime/build/wp10/emsdk/emsdk.py activate 7.0.0
```

On Windows, `py -3` can replace `python`. A configured native GPU build supplies
the pinned native header, nlohmann include tree and generated plan schema.
See [native build instructions](../../README.md#build-and-test).

## Header inventory

```sh
node --test native/realtime/spike/browser/headers.test.mjs
node native/realtime/spike/browser/headers.mjs native/realtime/build-gpu/_deps/rt_wgpu-src/include/webgpu/webgpu.h native/realtime/build/wp10/port/emdawnwebgpu_pkg/webgpu/include/webgpu/webgpu.h native/realtime/src/offline_gpu.cpp
```

The metric is added plus removed lines from `git diff --numstat`, ignoring CRLF
versus LF and including comments. The report records both header hashes and the
executor source hash. It inventories direct `wgpu...()` calls after removing
comments and ordinary string literals. It does not compare signatures, macros,
struct layouts, address-taken release functions or runtime implementations.
Missing/empty headers and a source with no inspected calls fail the command.

For the pinned headers, the result is **155 added + 4,044 removed = 4,199
differing lines**. Native header SHA-256:
`2516cf5a7bec4385bf76ecc550d45015c1e3df77962211f3cef3f57507b2f2c8`.
Browser header SHA-256:
`40e7ecd9647dc922e69d17d888d7038fbd5eb10277621eb414c8ffc278e353be`.
`wgpuDevicePoll` is the only inspected direct call absent from the browser header.
This is a source inventory, not a claim that the other APIs behave identically.

## Compiler and scheduling probe

```sh
python native/realtime/spike/browser/probe.py --sdk native/realtime/build/wp10/emsdk --native-build native/realtime/build-gpu --port native/realtime/build/wp10/port/emdawnwebgpu_pkg/emdawnwebgpu.port.py --out native/realtime/build/wp10/probe
```

The probe first compiles the unchanged GPU source against the browser port,
then a generated copy with only the native extension include removed. It builds the existing render-scheduling fixture as wasm32 and executes it in
Node. Each phase saves its log and exit status. Any compilation or execution
failure makes the probe exit nonzero. A scheduler-only module is not the browser
GPU candidate, so its file size is not reported as Q8's module-size measurement.

The native preparation loops currently wait for callbacks by polling and yielding
the native thread. The pinned browser port resolves adapter/device/map requests
through JavaScript promises, while `ProcessEvents` dispatches events already
marked ready. A browser host must yield to the event loop during preparation and
readback waits. This follows from the pinned
[release archive](https://github.com/google/dawn/releases/download/v20260423.175430/emdawnwebgpu_pkg-v20260423.175430.zip):
`webgpu/src/library_webgpu.js` and `webgpu/src/webgpu.cpp`.
Removing a native-only include or polling call alone does not establish a working
browser executor.

## Isolated browser candidate

```sh
python native/realtime/spike/browser/build_candidate.py --sdk native/realtime/build/wp10/emsdk --native-build native/realtime/build-gpu --port native/realtime/build/wp10/port/emdawnwebgpu_pkg/emdawnwebgpu.port.py --out native/realtime/build/wp10/candidate
node native/realtime/spike/browser/verify.mjs native/realtime/build/wp10/candidate native/realtime/build-gpu/Release/nodetool-realtime.exe
```

Use the platform's native executable path on Linux/macOS. The builder writes
adapted copies in the output directory and checks the exact number of each
replacement, rejecting source drift. Native production files remain unchanged.
The adaptations remove the native-only header and three `wgpuDevicePoll` calls,
replace three prepare-loop yields with `emscripten_sleep(0)`, and replace the
host readback sleep with `emscripten_sleep(1)`. `ProcessEvents` remains in place.
Asyncify preserves preparation-stack callback records across cooperative waits.
The existing private-device owner and teardown remain in the candidate.
No wait is added inside frame encoding or an audio quantum.

The builder links the whole offline command and preloads its catalog. The
verification script creates a separate module instance and temporary filesystem
for each fixture, then closes the browser and native temporary directory.
Chrome uses an isolated test profile and explicit SwiftShader selection. Browser
execution has a deadline outside the page as well as inside it. The comparator
rejects a deliberately corrupted PNG and an empty artifact set.

Observed with Emscripten 7.0.0 and Chrome **156.0.8078.80** on Windows:

| Check | Result |
|---|---|
| Unchanged GPU source | Compile failure: missing `webgpu/wgpu.h` |
| Copy with only that include removed | Compile failure at three `wgpuDevicePoll` calls |
| wasm32 render-scheduling fixture | Compile and Node execution pass |
| Adapted offline candidate | Compiles and runs in Chrome with SwiftShader |
| WP09 render-only and mixed fixtures | Three PNG frames and manifest per fixture match native bytes |
| Existing TypeScript Executor | Pixels match all three native frames for both fixtures |
| Audio outputs | WAV header and length match. Sample-byte parity is not claimed |

These are successful offline fixture runs, not a callback-teardown sanitizer
qualification. The candidate's complete offline app also includes audio,
filesystem and PNG code. Its size must not be presented as a minimal render-only
module or compared against a TypeScript renderer that omits those services.

## TypeScript fixture adapter

The same verification command bundles `typescript-candidate.mjs` with the public
`@nodetool-ai/gpu/pool` entry point. It uses the existing TypeScript Executor and
shader modules. The adapter reads the same IR constants, bindings and pass order,
then compares its readback with decoded native PNG pixels. It applies the same
integer unpremultiplication as the native PNG writer. Both fixtures are static,
so their three native frames are compared against one TypeScript evaluation.

This adapter supports only the fixtures' 4x4 solid/invert render subset. It
rejects unsupported shaders, render control operations and missing bindings,
with negative checks in the browser. Audio is not executed by this adapter.
The pool's encoded-sdr labels describe these shaders' channel operations.
The host now matches the native linear-to-sRGB presentation pass. A third,
mid-range color fixture fails against the previous adapter without that pass
and passes with it. The original two fixtures used endpoint colors that did
not expose the missing conversion.
This comparison does not establish a general color-management or IR adapter.
Each evaluation owns a private device, textures and readback buffer, destroyed
on success or failure. This spike does not ship the production browser runtime.

## 64-pass measurements

```sh
python native/realtime/spike/browser/build_candidate.py --sdk native/realtime/build/wp10/emsdk --native-build native/realtime/build-gpu --port native/realtime/build/wp10/port/emdawnwebgpu_pkg/emdawnwebgpu.port.py --out native/realtime/build/wp10/benchmark --benchmark
node native/realtime/spike/browser/benchmark.mjs native/realtime/build/wp10/benchmark native/realtime/build/wp10/benchmark-result.json
```

The [raw Windows SwiftShader result](results/windows-swiftshader.json) records
the plan, environment, source/artifact hashes, every sample and per-trial
summaries. Both candidates run the same 64 volatile 4x4 passes plus presentation
on private software devices in the same Chrome version. Each of three trials
uses 30 warm-up frames and 120 measured frames. Candidate order alternates.
Every trial checks the final pixels against the expected cyan result.

| CPU encode/submit time | C++/Wasm median / p95 | TypeScript median / p95 |
|---|---|---|
| Trial 1 | 0.95 / 1.71 ms | 2.62 / 3.83 ms |
| Trial 2 | 1.25 / 1.99 ms | 2.80 / 4.16 ms |
| Trial 3 | 1.31 / 2.11 ms | 3.10 / 4.36 ms |

The interval includes scheduling/encoding, presentation, copy and map request
setup. It excludes preparation, readback completion, pixel conversion and
reporting. Warm-up exercises lazy TypeScript pipeline creation. The 4x4 targets
emphasize CPU dispatch overhead, not realistic image workloads or GPU throughput.
C++ uses its existing texture reuse and cached bindings. The TypeScript host
prepares one texture per pass and uses the existing Executor's binding behavior.

Completion medians were 10.94–11.04 ms for C++ and 9.90–10.58 ms for TypeScript.
Both include mapped-row copying and unmapping. They also include the C++
host's cooperative polling sleep and the TypeScript map promise. They are
end-to-end host readback observations, not comparable GPU
timestamp measurements. Neither candidate establishes the hardware encode budget.

The benchmark C++ build removes audio, PNG and WAV services. Both candidates
retain the full 75-entry catalog. The harness verifies exact catalog-key equality
and checks that the C++ preloaded data matches its recorded catalog bytes. A
deliberately mismatched inventory fails the guard. Only two shaders execute.
The C++ build retains its loader/scheduler, while the TypeScript host remains
a limited fixture adapter.
The resulting sizes are experiment downloads, not qualified production builds.
Compression is measured per served file, then summed. The common plan is excluded.

| Candidate files | Uncompressed | gzip level 9 | Brotli |
|---|---|---|---|
| C++ JS + Wasm + catalog data | 1,344,420 bytes | 315,705 bytes | 231,117 bytes |
| Minified TypeScript bundle | 439,781 bytes | 109,546 bytes | 91,714 bytes |

Together with the 4,199-line header difference and fixture parity, these results
support the accepted Q8 choice of C++/Wasm to share scheduling behavior at a
larger download cost. The design and implementation plan record this decision. Callback
lifecycle qualification and production asynchronous preparation remain separate
work. No benchmark result enables live/shared-device use.

The Linux offline Release CI job installs the pinned Emscripten SDK, verifies
the Emdawn archive checksum, builds both Wasm hosts and runs fixture comparisons
and benchmark guards in Chromium. Its timing output is diagnostic and does not
replace the recorded Chrome measurements. The new toolchain CI result remains
pending until this revision runs.

The [offline-only preparation exception and M0 hardware gaps](../../M1_STATUS.md)
remain unchanged. This probe introduces no live/shared-device support.
