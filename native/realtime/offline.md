# Offline execution preparation

WP09 is in progress. The standalone driver exports float WAV tracks and,
in GPU-enabled builds, PNG frames from the private-device backend. Local slot
files, graph-runner command dispatch and the registered verification script
are implemented. Verification status and hardware gaps are recorded in
[M1_STATUS.md](M1_STATUS.md).

## Prepared audio command

Build the default core targets using the [build instructions](README.md#build-and-test).
The command below creates a one-second oscillator export:

```sh
native/realtime/build/nodetool-realtime live native/realtime/tests/fixtures/offline-audio.json --duration 1 --fps 30000/1001 --out tone-export --null-audio
```

Visual Studio builds place the binary at
`native/realtime/build/Release/nodetool-realtime.exe`. Windows uses wide command
arguments to preserve non-ASCII paths. This standalone command does not depend
on Qt, QuickJS, a GPU adapter or an audio device. `--null-audio` is optional:
all execution here is offline, with no playback or device callback.

The output directory must not exist, and its parent must exist. The driver
validates the plan and prepares executors before creating it. Each declared
audio sink produces an interleaved IEEE float32 WAV at session rate and layout.
Files are `audio.wav`, `audio-1.wav` and so on, in sink declaration order.
Control-only plans write a silent `audio.wav`. Audio parameters use their plan
values unless `audioControl` names a scalar audio-domain register. The driver
resolves bindings during preparation into a preallocated dense snapshot,
including sparse parameter slot IDs. Each quantum samples its endpoint value
after audio control advances, then applies existing audio smoothing from the
parameter's initial value. Unbound parameters keep their plan values.
Audio-domain `time.frame` counts quantum endpoints starting at one, including
the final drain. It does not use the video frame index.

Missing or wrong-domain producers and vector bindings fail preparation before
output creation. A bound non-finite value or value outside float32 range aborts
the export without publishing a success manifest. This synchronous binding
does not implement WP13's live cross-thread synchronization.

The driver closes every WAV before writing a temporary manifest and renaming
it to `manifest.json`. The manifest records sample, quantum and control-frame
counts, sink files, image-frame counts and sanitized sample counts.
Failures preserve partial files for inspection without a success manifest.
Existing output directories are rejected, including empty directories.

## Prepared render command

Configure with `NT_REALTIME_OFFLINE_GPU=ON` as described in the
[build instructions](README.md#build-and-test). The CLI build generates the
existing format-1 shader catalog and uses it by default. `--catalog FILE`
selects an explicit local catalog. Audio-only exports do not load a catalog
or create a GPU device.

```sh
native/realtime/build-gpu/nodetool-realtime live native/realtime/tests/fixtures/offline-render.json --duration 1 --fps 60 --out render-export
```

This path requests a software adapter on a private device and prepares all
pipelines synchronously under the approved offline exception. No external GPU
handles or live/shared device can be attached. A present output tagged `srgb`
is required. Fragment and compute modules are supported after graph lowering.
Catalog recipes must already be lowered to passes. Optional catalog inputs may
be omitted and use the backend's prepared defaults.

Each submitted frame is read back before the next is submitted. The offline
host polls and may sleep while waiting, with a 60-second deadline per readback.
These waits occur outside executor calls and are not realtime operations.
The driver converts premultiplied RGBA8 readback to straight-alpha PNG pixels
and writes `frame-000000.png`, `frame-000001.png` and subsequent files. Pixel
conversion and encoding use host-owned storage, destroyed on return.

The render export fixture prepares render-only and mixed audio/render runs,
checks decoded PNG pixels against a translucent red reference and compares
repeat PNG/WAV/manifest bytes. A `time.dt` reference checks video-frame duration
independently of intervening audio quanta. Its first video frame has zero dt.
The default core CI build excludes the optional GPU backend. A separate
software-adapter job runs the export checks with lavapipe. Neither job supplies
M0's hardware measurements.

## Local slot files

Bind each consumed external input explicitly with `--slot ID=FILE`. Bindings
resolve against the command's working directory and do not reinterpret the
plan's opaque `source` field. The offline host does not fetch asset URIs or
network URLs. CLI slot IDs cannot contain `=`. The C++ API accepts slot IDs
and paths separately through `OfflineOptions::slots`.

Buffer files contain finite IEEE float32 little-endian samples in planar
channel order: the complete first channel, then the second for stereo. They
must already match the session sample rate and declared layout. The driver
does no decoding, resampling or channel conversion. The sample-player kernel
reads these immutable samples and produces silence after their end.

Texture files contain tightly packed RGBA8 or IEEE half RGBA bytes according
to the slot's prepared format and dimensions. Pixels must already match the
declared color-space and alpha convention. Texture uploads happen once during
preparation and have a fixed version during the export.

Consumed files must be regular, nonempty files with a combined payload of at
most 256 MiB. PCM payloads transfer to the audio executor. Host texture bytes
are released after synchronous uploads to the private GPU. Executors and
streams remain owned by the offline host thread until return.

Missing, duplicate and unknown bindings fail before output creation. Bindings
for unused inputs are rejected. Unused buffer and texture declarations need
no binding and cause no file read. Control, event and latched external slots
are not yet supported. No live file is reread during an export.

## Graph-runner integration

The full graph runner can expose the same command by configuring its existing
build with `-DNODETOOL_GRAPH_RUNNER_REALTIME=ON`. The option defaults off, so
ordinary graph execution and embedding do not acquire this dependency.

```sh
nodetool-graph-runner live plan.json --duration 1 --fps 60 --out new-export --slot pcm=audio.f32
```

The dispatch runs before guest-host initialization and calls the same
`offlineMain` implementation as the standalone CLI. It needs no guest bundle.
The graph-runner CI configuration enables the option and checks actual command
dispatch. The standalone CLI retains Windows wide-argument handling. Full
graph-runner portability remains subject to that host's existing platform
requirements.

## Verification entry point

```sh
node native/realtime/scripts/check.mjs
```

The `realtime-offline` registry entry selects this check for core, driver,
schema, fixture and command-dispatch changes. It is an expensive selfcheck
because a fresh run configures and builds native dependencies. Include
`--expensive` when asking the root harness gate to execute it.

Set `NODETOOL_REALTIME_BUILD_DIR` to reuse another build directory. Build the
protocol and GPU packages first, and put CMake and CTest on `PATH`. Linux needs
a software adapter such as lavapipe. The check fails on a missing adapter and
does not skip GPU coverage. It verifies the required CTest inventory before
running tests, then checks the real CLI with Unicode paths and planar PCM.
Negative controls prove missing inventory and invalid arguments are rejected.

[offline.json](budgets/offline.json) records command/test timeouts and required
test names. These are verification limits, not realtime deadline claims.

## Clock contract

`OfflineClock::prepare(duration, fps, sampleRate)` accepts positive integers,
decimals with at most six fractional digits, and integer fractions such as
`30000/1001`. It rejects signs, whitespace, exponent notation, non-finite values
and zero denominators. Fraction denominators cannot exceed 1,000,000 before
reduction. Duration is limited to 600 seconds and frame rate to 240 frames per
second. Sample rate is 44,100 or 48,000 Hz, matching plan v1.

The export interval is `[0, duration)`. Frame zero is at zero. Frame count is
`ceil(duration * fps)`. Each indexed frame supplies its timestamp and the number
of complete 128-sample quanta ending at or before that timestamp. All scheduling
decisions use bounded integer fractions. Only the timestamp passed to an
executor becomes a `double`.

Audio output contains `floor(duration * sampleRate)` samples per channel. The
driver must drain the remaining quanta after the final video frame and trim
the final quantum to `exportedSamples(quantum)`. A duration shorter than one
sample produces one video frame and zero audio samples. Out-of-range frame
indices return no frame, and out-of-range quantum indices export zero samples.

The clock is an immutable value owned by the offline host thread. It owns no
buffers, callbacks or operating-system resources. Preparation and indexed
queries allocate no storage.

## Executor orchestration

The driver advances audio control at each quantum endpoint before processing
that quantum. It advances render control at intervening quantum boundaries
before evaluating each frame timestamp. This avoids the interactive executor's
bounded catch-up policy skipping state during low-frame-rate offline exports.
WAV writes happen after executor calls. All executors, streams and scratch
storage belong to one offline host thread and are destroyed on return. There
are no worker threads or asynchronous callbacks in the driver.

Prepared clock fixtures cover fractional rates, exact quantum boundaries,
partial final quanta, a maximum-duration schedule, equivalent decimal/fraction
inputs, large integer products and rejected inputs. They are registered as
`realtime-offline-clock` in CTest. The Windows offline harness passes them.

The driver and its fixture executable compile and link with MSVC Release.
Prepared `realtime-offline-driver` cases cover WAV chunks and sample values,
partial-quantum trimming, silence, multiple sinks, repeat bytes, low-frame-rate
stateful controls, invalid clocks, unsupported slots and existing-output
preservation. Binding cases cover sparse IDs, stateful endpoint samples,
cadence independence, wrong-domain/missing producers, vector values and float
overflow. Source inspection corrected an earlier fixture's nonexistent
`constant` kernel to an oscillator with an independent sine reference.
These fixtures and the standalone CLI checks pass in the Windows Release and
ASan offline harnesses and the Linux lavapipe job. Full graph-runner Release
dispatch passes in CI. Standalone Linux GPU ASan/UBSan checks pass with lavapipe
and leak detection enabled. Full-host Linux Release, ASan/UBSan and TSan pass
at `d1656fead3`.
See [verification details](M1_STATUS.md#verification-of-the-offline-integration)
for repository-wide check results.

The [damper fixture](tests/fixtures/offline-damper.json) drives oscillator
amplitude and a solid frame's red channel with independent audio/render-domain
dampers. Export tests cover 44.1 and 48 kHz at 60, 120 and 2 video frames per
second. PCM samples use the closed-form exponential at quantum endpoints as
their reference. PNG references use the completed quantum count at each frame
timestamp. Common-timestamp frames and complete WAV tracks must match across
cadences. Repeated 60 Hz exports must match every file. Negative controls reject
a corrupted PCM sample and a frame reference stuck at time zero.
This verifies offline state advancement, not WP13 synchronized parameter handoffs.

The [private-device GPU exception](render.md#native-pipeline-api-limitation)
and [milestone verification gaps](M1_STATUS.md) still apply. This clock does not
establish repeatable GPU output, live timing, native/Wasm parity or M0 hardware
qualification.
