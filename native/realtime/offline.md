# Offline execution preparation

WP09 is in progress. The standalone driver exports float WAV tracks and,
in GPU-enabled builds, PNG frames from the private-device backend. External
slots, the graph-runner command and registry gate remain pending. Broad test
runs are deferred until the larger offline-driver task is ready. Runtime GPU
export and its pixel references have not been exercised locally.

## Prepared audio command

Build the default core targets using the [build instructions](README.md#build-and-test).
The command below prepares a one-second oscillator export when testing resumes:

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
These fixtures compile but have not run. The default core CI build excludes
the optional GPU backend and cannot qualify these exports.

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
`realtime-offline-clock` in CTest and have not been executed locally.

The driver and its fixture executable compile and link with MSVC Release.
Prepared `realtime-offline-driver` cases cover WAV chunks and sample values,
partial-quantum trimming, silence, multiple sinks, repeat bytes, low-frame-rate
stateful controls, invalid clocks, unsupported slots and existing-output
preservation. Binding cases cover sparse IDs, stateful endpoint samples,
cadence independence, wrong-domain/missing producers, vector values and float
overflow. Source inspection corrected an earlier fixture's nonexistent
`constant` kernel to an oscillator with an independent sine reference.
These fixtures remain unrun. CLI runtime behavior, sanitizer
checks and aggregate checks are also unverified.

The [private-device GPU exception](render.md#native-pipeline-api-limitation)
and [milestone verification gaps](M1_STATUS.md) still apply. This clock does not
establish repeatable GPU output, live timing, native/Wasm parity or M0 hardware
qualification.
