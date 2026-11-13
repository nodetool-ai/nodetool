# RT-Q8 browser executor comparison

WP10 is in progress. The adapted C++ candidate passes both Chrome frame
comparisons. No browser executor has been selected. The TypeScript comparison,
64-pass timings and complete candidate download-size measurements remain open in
[design section 14.5](../../../../docs/plans/graph-runner-realtime.md#145-browser).

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
| Audio outputs | WAV header and length match. Sample-byte parity is not claimed |

These are successful offline fixture runs, not a callback-teardown sanitizer
qualification. The candidate's complete offline app also includes audio,
filesystem and PNG code. Its size must not be presented as a minimal render-only
module or compared against a TypeScript renderer that omits those services.

## Remaining comparison

Drive the existing TypeScript `Executor` from the same IR and measure
both candidates on the same 64-pass plan, adapter and browser. Compare artifacts
with matching service scope. Record warm-up,
sampling method, submit/encode versus completion timing, and complete compressed
and uncompressed download sizes. Only then answer Q8 in the design and plan.

The [offline-only preparation exception and M0 hardware gaps](../../M1_STATUS.md)
remain unchanged. This probe introduces no live/shared-device support.
